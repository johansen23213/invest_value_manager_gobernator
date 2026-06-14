/**
 * Módulo SERVER-ONLY de envío de notificaciones push Web Push / VAPID.
 * (RF-NOT-001..005)
 *
 * IMPORTANTE: Este fichero importa `web-push` (que usa Node.js crypto).
 * NO debe ser importado desde:
 *   - auth.ts ni ningún módulo alcanzable desde él
 *   - Componentes de React (client o server) que generen bundle cliente
 *   - Ningún módulo bajo /src/lib/ que se use en el cliente
 *
 * Solo se importa desde:
 *   - Routers tRPC (ejecutan server-side en Node.js)
 *   - Otros módulos bajo /src/server/
 *
 * Configuración VAPID (variables de entorno):
 *   VAPID_PUBLIC_KEY   — clave pública VAPID (base64url)
 *   VAPID_PRIVATE_KEY  — clave privada VAPID (base64url) ← secreto, nunca en logs
 *   VAPID_SUBJECT      — identificador del remitente (mailto: o https://)
 *
 * Si faltan, el envío hace no-op con warning (nunca rompe la operación principal).
 * Igual que el patrón fail-safe del módulo de email.
 *
 * Generación de claves VAPID (una vez, en local):
 *   node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k);"
 */

import webpush from 'web-push';
import type { TenantPrisma } from '@vetlla/db';
import { logger } from '@/server/logger';
import type { PushPayload } from './payload';

// ---------------------------------------------------------------------------
// Configuración VAPID — cargada una vez, lazy
// ---------------------------------------------------------------------------

let configured = false;

function ensureVapidConfigured(): boolean {
  if (configured) return true;

  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT;

  if (!pub || !priv || !subj) {
    logger.warn('push.vapid_not_configured', {
      hasPub:  Boolean(pub),
      hasPriv: Boolean(priv),
      hasSubj: Boolean(subj),
    });
    return false;
  }

  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
  return true;
}

// ---------------------------------------------------------------------------
// Tipo de suscripción (alineado con los campos de push_subscriptions)
// ---------------------------------------------------------------------------

interface PushSubscriptionRecord {
  id:       string;
  endpoint: string;
  p256dh:   string;
  auth:     string;
}

// ---------------------------------------------------------------------------
// Envío a un usuario: busca sus suscripciones y envía a todas
// ---------------------------------------------------------------------------

/**
 * Envía un push a todas las suscripciones activas del usuario.
 * - Si VAPID no está configurado: no-op con warning (degradación segura).
 * - Por cada suscripción caducada (410/404): marca expiredAt en BD.
 * - Errores de red o del push service: se loguean y se continúa con la siguiente.
 * - Esta función NUNCA lanza excepción: el caller la usa en fire-and-forget.
 *
 * @param db     Cliente Prisma con RLS del tenant ya configurado (forTenant)
 * @param userId ID del usuario destinatario
 * @param payload Payload de la notificación (ver PushPayload)
 */
export async function sendPushToUser(
  db: TenantPrisma,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapidConfigured()) {
    // No-op: VAPID no configurado en este entorno. Sin error, sin ruptura.
    return;
  }

  let subs: PushSubscriptionRecord[];
  try {
    subs = await db.pushSubscription.findMany({
      where:  { userId, expiredAt: null },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
  } catch (err) {
    logger.error('push.fetch_subscriptions_failed', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (subs.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map((sub) => sendToSubscription(db, sub, body)),
  );
}

// ---------------------------------------------------------------------------
// Envío a una suscripción concreta
// ---------------------------------------------------------------------------

async function sendToSubscription(
  db: TenantPrisma,
  sub: PushSubscriptionRecord,
  body: string,
): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth:   sub.auth,
        },
      },
      body,
      {
        // TTL en segundos: 24 h. Si el dispositivo está offline, el push service
        // lo entregará cuando vuelva (hasta 24 h). Ajustar si se necesita urgencia.
        TTL: 86400,
      },
    );
  } catch (err: unknown) {
    const status = getWebPushStatusCode(err);

    if (status === 410 || status === 404) {
      // El endpoint ya no existe: marcar como caducado (no borrar, para trazabilidad).
      try {
        await db.pushSubscription.update({
          where: { id: sub.id },
          data:  { expiredAt: new Date() },
        });
        logger.info('push.subscription_expired', { subId: sub.id, status });
      } catch (updateErr) {
        logger.error('push.subscription_expire_failed', {
          subId: sub.id,
          updateErr: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
      }
    } else {
      // Otro error (red, payload demasiado grande, etc.): loguear y continuar.
      logger.error('push.send_failed', {
        subId: sub.id,
        status,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: extrae el status HTTP de un error de web-push
// ---------------------------------------------------------------------------

function getWebPushStatusCode(err: unknown): number | undefined {
  if (
    err !== null &&
    typeof err === 'object' &&
    'statusCode' in err &&
    typeof (err as { statusCode: unknown }).statusCode === 'number'
  ) {
    return (err as { statusCode: number }).statusCode;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Clave pública VAPID (para el cliente)
// ---------------------------------------------------------------------------

/**
 * Devuelve la clave pública VAPID para que el cliente pueda crear la suscripción.
 * Devuelve null si VAPID no está configurado (el cliente debe manejar este caso).
 */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
