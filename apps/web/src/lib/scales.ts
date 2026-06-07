// Escalas de valoración geriátrica. Rangos e interpretación según uso clínico
// habitual en España. La interpretación es informativa; la decisión es del sanitario.

export const SCALE_RANGES = {
  BARTHEL: { min: 0, max: 100 }, // ABVD
  TINETTI: { min: 0, max: 28 }, // marcha (12) + equilibrio (16)
} as const;

export type ScaleType = keyof typeof SCALE_RANGES;

export function isValidScore(type: ScaleType, score: number): boolean {
  const { min, max } = SCALE_RANGES[type];
  return Number.isInteger(score) && score >= min && score <= max;
}

/** Índice de Barthel (0–100): grado de dependencia para las ABVD. */
export function interpretBarthel(score: number): string {
  if (score >= 100) return 'Independiente';
  if (score >= 60) return 'Dependencia leve';
  if (score >= 40) return 'Dependencia moderada';
  if (score >= 20) return 'Dependencia grave';
  return 'Dependencia total';
}

/** Escala de Tinetti (0–28): riesgo de caídas. */
export function interpretTinetti(score: number): string {
  if (score >= 24) return 'Riesgo de caída bajo';
  if (score >= 19) return 'Riesgo de caída moderado';
  return 'Riesgo de caída alto';
}

export function interpretScale(type: ScaleType, score: number): string {
  return type === 'BARTHEL' ? interpretBarthel(score) : interpretTinetti(score);
}
