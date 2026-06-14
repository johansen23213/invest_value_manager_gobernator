/**
 * Router tRPC de notificaciones push Web Push / VAPID (RF-NOT-001..005).
 *
 * Todos los endpoints son del propio usuario (protectedProcedure / tenantProcedure):
 * un usuario solo gestiona SUS propias suscripciones. No hay permiso especial
 * más allá de la sesión iniciada porque el canal de notificaciones pertenece
 * exclusivamente al dispositivo del usuario autenticado.
 *
 * Endpoints:
 *   push.getPublicKey  — devuelve VAPID_PUBLIC_KEY para crear la suscripción en el cliente
 *   push.subscribe     — registra (upsert) la suscripción del dispositivo actual
 *   push.unsubscribe   — elimina la suscripción por endpoint
 *   push.listMine      — lista las suscripciones activas del usuario (UI de gestión)
 *
 * RLS: ctx.db (forTenant) garantiza aislamiento a nivel de BD.
 * El código además filtra siempre por userId = ctx.session.user.id para
 * que un usuario no pueda ver/borrar suscripciones de otro usuario del
 * mismo tenant (doble aislamiento: RLS por tenant + filtro por userId).
 *
 * Contrato para el cliente (Dani):
 *   1. Llamar a push.getPublicKey para obtener la applicationServerKey.
 *   2. Crear la suscripción del navegador:
 *        const reg = await navigator.serviceWorker.ready;
 *        const sub = await reg.pushManager.subscribe({
 *          userVisibleOnly: true,
 *          applicationServerKey: urlBase64ToUint8Array(publicKey),
 *        });
 *   3. Llamar a push.subscribe con el objeto PushSubscription serializado:
 *        trpc.push.subscribe.mutate({
 *          endpoint: sub.endpoint,
 *          p256dh:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!))),
 *          auth:     btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')!))),
 *          userAgent: navigator.userAgent,
 *        });
 *   4. Al desuscribirse: llamar a push.unsubscribe({ endpoint: sub.endpoint }).
 *
 * El service worker escucha el evento `push` y parsea el JSON del payload
 * (ver apps/web/src/server/push/payload.ts para la forma exacta del objeto).
 */

import { z } from 'zod';
import { createTRPCRouter, tenantProcedure } from '@/server/trpc';
import { getVapidPublicKey } from '@/server/push';

// ---------------------------------------------------------------------------
// Esquemas Zod — exportados para que el cliente pueda reutilizarlos
// ---------------------------------------------------------------------------

/** Datos de la suscripción que envía el navegador tras pushManager.subscribe(). */
export const PushSubscribeInput = z.object({
  endpoint:  z.string().url(),
  p256dh:    z.string().min(1),
  auth:      z.string().min(1),
  userAgent: z.string().max(500).optional(),
});

export const PushUnsubscribeInput = z.object({
  endpoint: z.string().url(),
});

export type PushSubscribeInputType   = z.infer<typeof PushSubscribeInput>;
export type PushUnsubscribeInputType = z.infer<typeof PushUnsubscribeInput>;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const pushRouter = createTRPCRouter({

  /**
   * Devuelve la clave pública VAPID.
   * El cliente necesita esta clave para llamar a pushManager.subscribe().
   * Devuelve null si VAPID no está configurado en el servidor (degradación segura).
   */
  getPublicKey: tenantProcedure.query((): { publicKey: string | null } => {
    return { publicKey: getVapidPublicKey() };
  }),

  /**
   * Registra (upsert) la suscripción del dispositivo actual.
   * Idempotente: si el endpoint ya existe, actualiza p256dh/auth/lastSeenAt
   * y borra expiredAt (el usuario re-suscribió un endpoint que estaba marcado
   * como caducado — puede ocurrir si el usuario limpió el estado del SW).
   */
  subscribe: tenantProcedure
    .input(PushSubscribeInput)
    .mutation(async ({ ctx, input }) => {
      const userId   = ctx.session.user.id;
      const tenantId = ctx.tenantId;
      const now      = new Date();

      const sub = await ctx.db.pushSubscription.upsert({
        where:  { endpoint: input.endpoint },
        update: {
          p256dh:    input.p256dh,
          auth:      input.auth,
          userAgent: input.userAgent,
          lastSeenAt: now,
          expiredAt: null, // limpiar si estaba marcada como caducada
        },
        create: {
          tenantId,
          userId,
          endpoint:  input.endpoint,
          p256dh:    input.p256dh,
          auth:      input.auth,
          userAgent: input.userAgent,
          lastSeenAt: now,
        },
      });

      return { id: sub.id };
    }),

  /**
   * Elimina la suscripción del dispositivo actual por endpoint.
   * Solo borra suscripciones del usuario autenticado (doble aislamiento:
   * RLS por tenant + WHERE userId asegura que nadie borra la suscripción ajena).
   */
  unsubscribe: tenantProcedure
    .input(PushUnsubscribeInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await ctx.db.pushSubscription.deleteMany({
        where: {
          endpoint: input.endpoint,
          userId,   // garantía extra: solo borra las propias
        },
      });

      return { ok: true };
    }),

  /**
   * Lista las suscripciones activas del usuario (para UI de gestión de dispositivos).
   * Solo devuelve las no caducadas (expiredAt = null).
   * No expone p256dh/auth al cliente (datos de cifrado innecesarios en la UI).
   */
  listMine: tenantProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const subs = await ctx.db.pushSubscription.findMany({
      where: {
        userId,
        expiredAt: null,
      },
      select: {
        id:         true,
        endpoint:   true,
        userAgent:  true,
        createdAt:  true,
        lastSeenAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return subs;
  }),
});
