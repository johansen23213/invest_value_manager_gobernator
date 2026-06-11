// Escalas de valoración geriátrica. Rangos e interpretación según uso clínico
// habitual en España. La interpretación es informativa; la decisión es del sanitario.

export const SCALE_RANGES = {
  BARTHEL:      { min: 0,  max: 100 }, // ABVD
  TINETTI:      { min: 0,  max: 28  }, // marcha (12) + equilibrio (16)
  // Fase 1 — escalas geriátricas adicionales
  PFEIFFER:     { min: 0,  max: 10  }, // errores cognitivos (0 = normal, 10 = deterioro grave)
  MEC_LOBO:     { min: 0,  max: 35  }, // ≤23 = deterioro cognitivo
  GDS_REISBERG: { min: 1,  max: 7   }, // estadios de demencia
  NORTON:       { min: 5,  max: 20  }, // ≤14 = riesgo alto de UPP
  BRADEN:       { min: 6,  max: 23  }, // ≤18 = riesgo de UPP
  MNA:          { min: 0,  max: 30  }, // <17 = desnutrición; 17-23,5 = riesgo
  PAINAD:       { min: 0,  max: 10  }, // dolor en demencia avanzada
  DOWNTON:      { min: 0,  max: 12  }, // ≥3 = riesgo alto de caídas
  LAWTON_BRODY: { min: 0,  max: 8   }, // actividades instrumentales de la vida diaria
} as const;

export type ScaleType = keyof typeof SCALE_RANGES;

export function isValidScore(type: ScaleType, score: number): boolean {
  const { min, max } = SCALE_RANGES[type];
  return Number.isInteger(score) && score >= min && score <= max;
}

/** Índice de Barthel (0–100): grado de dependencia para las ABVD. */
export function interpretBarthel(score: number): string {
  if (score >= 100) return 'Independiente';
  if (score >= 60)  return 'Dependencia leve';
  if (score >= 40)  return 'Dependencia moderada';
  if (score >= 20)  return 'Dependencia grave';
  return 'Dependencia total';
}

/** Escala de Tinetti (0–28): riesgo de caídas. */
export function interpretTinetti(score: number): string {
  if (score >= 24) return 'Riesgo de caída bajo';
  if (score >= 19) return 'Riesgo de caída moderado';
  return 'Riesgo de caída alto';
}

/** Pfeiffer SPMSQ (0–10 errores): estado cognitivo. */
export function interpretPfeiffer(score: number): string {
  if (score <= 2) return 'Sin deterioro cognitivo';
  if (score <= 4) return 'Deterioro leve';
  if (score <= 7) return 'Deterioro moderado';
  return 'Deterioro grave';
}

/** Mini-Examen Cognoscitivo Lobo (0–35): deterioro cognitivo. */
export function interpretMecLobo(score: number): string {
  if (score >= 24) return 'Sin deterioro cognitivo';
  if (score >= 18) return 'Deterioro leve-moderado';
  return 'Deterioro grave';
}

/** GDS-Reisberg (1–7): estadio de demencia. */
export function interpretGdsReisberg(score: number): string {
  const labels: Record<number, string> = {
    1: 'Sin deterioro (normal)',
    2: 'Deterioro muy leve (olvidos)',
    3: 'Deterioro leve (confusión temprana)',
    4: 'Deterioro moderado (demencia leve)',
    5: 'Deterioro moderado-grave (demencia moderada)',
    6: 'Deterioro grave (demencia moderada-grave)',
    7: 'Deterioro muy grave (demencia grave)',
  };
  return labels[score] ?? 'Valor no válido';
}

/**
 * Norton (5–20): riesgo de úlceras por presión.
 * Umbral clínico establecido: ≤14 = riesgo alto → activa protocolo de prevención.
 * Fuente: Norton D, McLaren R, Exton-Smith AN (1962). Usado por inspecciones en España.
 */
export function interpretNorton(score: number): string {
  if (score <= 14) return 'Riesgo alto de UPP';
  if (score <= 17) return 'Riesgo medio de UPP';
  return 'Riesgo bajo de UPP';
}

/**
 * Devuelve true si una puntuación Norton indica riesgo alto (≤14).
 * Función pura usada por el router para disparar la alerta de protocolo UPP.
 */
export function isNortonHighRisk(score: number): boolean {
  return score <= 14;
}

/**
 * Braden (6–23): riesgo de úlceras por presión.
 * Umbral: ≤18 = riesgo (inverso a Norton: a menos puntuación, más riesgo).
 */
export function interpretBraden(score: number): string {
  if (score <= 9)  return 'Riesgo muy alto de UPP';
  if (score <= 12) return 'Riesgo alto de UPP';
  if (score <= 14) return 'Riesgo moderado de UPP';
  if (score <= 18) return 'Riesgo leve de UPP';
  return 'Sin riesgo significativo de UPP';
}

/** Devuelve true si una puntuación Braden indica riesgo (≤18). */
export function isBradenRisk(score: number): boolean {
  return score <= 18;
}

/** MNA (0–30): estado nutricional. */
export function interpretMna(score: number): string {
  if (score >= 24)   return 'Estado nutricional normal';
  if (score >= 17)   return 'Riesgo de desnutrición';
  return 'Desnutrición';
}

/** PAINAD (0–10): intensidad del dolor en demencia avanzada. */
export function interpretPainad(score: number): string {
  if (score <= 3)  return 'Dolor leve o ausente';
  if (score <= 6)  return 'Dolor moderado';
  return 'Dolor intenso';
}

/** Downton (0–12): riesgo de caídas. Umbral: ≥3 = riesgo alto. */
export function interpretDownton(score: number): string {
  if (score >= 3) return 'Riesgo alto de caídas';
  return 'Riesgo bajo de caídas';
}

/** Lawton-Brody AIVD (0–8): actividades instrumentales. */
export function interpretLawtonBrody(score: number): string {
  if (score >= 6) return 'Independencia alta en AIVD';
  if (score >= 3) return 'Independencia parcial en AIVD';
  return 'Dependencia en AIVD';
}

export function interpretScale(type: ScaleType, score: number): string {
  switch (type) {
    case 'BARTHEL':      return interpretBarthel(score);
    case 'TINETTI':      return interpretTinetti(score);
    case 'PFEIFFER':     return interpretPfeiffer(score);
    case 'MEC_LOBO':     return interpretMecLobo(score);
    case 'GDS_REISBERG': return interpretGdsReisberg(score);
    case 'NORTON':       return interpretNorton(score);
    case 'BRADEN':       return interpretBraden(score);
    case 'MNA':          return interpretMna(score);
    case 'PAINAD':       return interpretPainad(score);
    case 'DOWNTON':      return interpretDownton(score);
    case 'LAWTON_BRODY': return interpretLawtonBrody(score);
  }
}

/**
 * Calcula el BMI a partir de peso y altura.
 * Función pura testeable, usada por el router de WeightRecord.
 */
export function calculateBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}
