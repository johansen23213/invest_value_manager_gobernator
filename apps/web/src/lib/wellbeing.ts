/**
 * Lógica pura de bienestar ACP (sin dependencias de BD).
 *
 * Testeable en aislamiento con Vitest (apps/web/src/lib/wellbeing.test.ts).
 *
 * RF-SOC-007: alerta de revisión del perfil de bienestar vencida.
 * La regla de negocio es simple y configurable:
 *   - Si nextReviewDate es null, la revisión no está planificada → no vencida.
 *   - Si nextReviewDate <= now, la revisión ha vencido (incluye hoy mismo).
 *
 * Nota: "hoy mismo vence" (gte, no gt) porque en atención sociosanitaria la
 * revisión debe realizarse en o antes de la fecha prevista, no al día siguiente.
 */

/**
 * Devuelve true si la revisión del perfil ACP ha vencido (o vence hoy).
 *
 * @param nextReviewDate — fecha de próxima revisión del perfil; null si no planificada.
 * @param now — fecha actual (inyectada para testabilidad; por defecto new Date()).
 */
export function isReviewOverdue(
  nextReviewDate: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!nextReviewDate) return false;
  return nextReviewDate <= now;
}

/**
 * Calcula los días de diferencia entre la fecha de revisión y ahora.
 * - Negativo: días que lleva vencida.
 * - Positivo: días que faltan para vencer.
 * - 0: vence hoy.
 * - null: sin fecha de revisión planificada.
 *
 * Útil para ordenar el panel de revisiones ACP por urgencia.
 */
export function daysUntilReview(
  nextReviewDate: Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!nextReviewDate) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  // Comparar al nivel de día (truncar horas) para que el "vence hoy" sea 0.
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const reviewMs = Date.UTC(
    nextReviewDate.getFullYear(),
    nextReviewDate.getMonth(),
    nextReviewDate.getDate(),
  );
  return Math.round((reviewMs - todayMs) / msPerDay);
}

/**
 * Clasifica el estado de la revisión para la UI del panel.
 *
 * - 'OVERDUE'  → vencida (days < 0 o days === 0 sin completar)
 * - 'DUE_SOON' → vence en los próximos `warningDays` días (default: 30)
 * - 'OK'       → en plazo
 * - 'NOT_SET'  → sin fecha planificada
 */
export type ReviewStatus = 'OVERDUE' | 'DUE_SOON' | 'OK' | 'NOT_SET';

export function getReviewStatus(
  nextReviewDate: Date | null | undefined,
  now: Date = new Date(),
  warningDays = 30,
): ReviewStatus {
  const days = daysUntilReview(nextReviewDate, now);
  if (days === null) return 'NOT_SET';
  if (days <= 0) return 'OVERDUE';
  if (days <= warningDays) return 'DUE_SOON';
  return 'OK';
}
