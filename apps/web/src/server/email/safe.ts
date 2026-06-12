/**
 * sendEmailSafe — wrapper no-throw sobre sendEmail.
 *
 * El email de notificación nunca debe bloquear una operación exitosa: si falla
 * el proveedor de email (red, cuota, misconfiguration), la mutación ya completó
 * y el error del email solo se loguea como warning.
 *
 * Antes existían ~6 bloques try/catch idénticos (10-14 líneas cada uno) en
 * requests.ts, comms.ts y visits.ts. Centralizado aquí para que cualquier
 * mejora (reintentos, métricas, dead-letter) se aplique en un solo lugar
 * (hallazgo H-4 de la revisión de arquitectura 2026-06-12).
 */

import { sendEmail, type EmailMessage } from '@/server/email/index';
import { logger } from '@/server/logger';

/**
 * Envía un email de forma no-throw.
 * Si el envío falla, registra un warning con `logContext` y continúa.
 *
 * @param message    El mensaje a enviar (to, subject, text, html).
 * @param logContext Identificadores para el log de warning (p. ej. { visitId, requestId }).
 */
export async function sendEmailSafe(
  message: EmailMessage,
  logContext: Record<string, unknown>,
): Promise<void> {
  try {
    await sendEmail(message);
  } catch (err) {
    logger.warn('email.send_failed', {
      ...logContext,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
