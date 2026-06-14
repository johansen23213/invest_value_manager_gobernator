/**
 * valoracion-alertas.ts — Lógica pura de cadencia y detección de vencimiento
 * de valoraciones de escalas geriátricas. Sin dependencias de BD.
 *
 * Cadencias clínicas por escala (días entre re-evaluaciones):
 *
 *  - BARTHEL      : 180 días (~6 meses).
 *    Fuente: Valoración Funcional del Anciano — SEGG 2013; revisión semestral en
 *    centros sin cambio clínico significativo. Centros con alta dependencia
 *    pueden hacerlo trimestral.
 *
 *  - TINETTI      : 180 días (~6 meses).
 *    Fuente: igual que Barthel; revisión conjunta de marcha/equilibrio.
 *
 *  - PFEIFFER     : 365 días (anual) en pacientes estables; trimestral si hay
 *    sospecha de deterioro. Default conservador: 90 días.
 *    Fuente: Consenso SEGG-SEMES-semFYC (2012).
 *
 *  - MEC_LOBO     : 90 días en seguimiento de deterioro cognitivo.
 *    Fuente: Guía práctica de detección y diagnóstico demencias, SEN (2009).
 *
 *  - GDS_REISBERG : 180 días — estadiaje de demencia, revisión semestral.
 *    Fuente: consenso de práctica clínica (no normativa por CCAA).
 *
 *  - NORTON       : 30 días en pacientes con riesgo detectado; de entrada,
 *    al ingreso y mensual. Fuente: Guía GNEAUPP 2014 (úlceras y heridas crónicas).
 *
 *  - BRADEN       : 30 días (igual que Norton; aplicación alternativa según
 *    protocolo de centro). Fuente: GNEAUPP 2014.
 *
 *  - MNA          : 90 días en seguimiento nutricional.
 *    Fuente: Protocolo SENPE-SEGG de evaluación nutricional (2012).
 *
 *  - PAINAD       : 30 días en pacientes con demencia avanzada y dolor activo.
 *    Fuente: Warden V, et al. J Am Med Dir Assoc. 2003;4(1):9-15.
 *    Revisión más frecuente si hay cambio clínico.
 *
 *  - DOWNTON      : 90 días en seguimiento de riesgo de caídas.
 *    Fuente: Protocolo de prevención de caídas SEMI (2011).
 *
 *  - LAWTON_BRODY : 180 días (semestral) en seguimiento de AIVD.
 *    Fuente: consenso de práctica clínica — SEGG.
 *
 * NOTA: Estos son defaults clínicamente razonables basados en consensos
 * nacionales, NO normativa de CCAA. Cada centro puede tener protocolos
 * distintos. El diseño es extensible: la función `getScaleCadenceDays`
 * admite un override por residente/escala (RF-VAL-004).
 */

/** Tipos de escala (espejo del enum Prisma AssessmentType). */
export type ScaleType =
  | 'BARTHEL'
  | 'TINETTI'
  | 'PFEIFFER'
  | 'MEC_LOBO'
  | 'GDS_REISBERG'
  | 'NORTON'
  | 'BRADEN'
  | 'MNA'
  | 'PAINAD'
  | 'DOWNTON'
  | 'LAWTON_BRODY';

/** Cadencia recomendada por escala (días). */
export const SCALE_CADENCE_DAYS: Record<ScaleType, number> = {
  BARTHEL:      180,
  TINETTI:      180,
  PFEIFFER:     90,
  MEC_LOBO:     90,
  GDS_REISBERG: 180,
  NORTON:       30,
  BRADEN:       30,
  MNA:          90,
  PAINAD:       30,
  DOWNTON:      90,
  LAWTON_BRODY: 180,
} as const;

/**
 * Días de antelación para alertar "próxima a vencer".
 * Si quedan ≤ ALERT_AHEAD_DAYS para el vencimiento, el estado pasa a PROXIMA.
 */
export const ALERT_AHEAD_DAYS = 15;

/** Estado de la valoración respecto a su cadencia. */
export type AssessmentStatus = 'al_dia' | 'proxima' | 'vencida';

export interface AssessmentStatusResult {
  status: AssessmentStatus;
  /** Días restantes hasta el vencimiento (positivo = aún tiene margen). */
  daysUntilDue: number;
  /** Días vencidos (positivo = ya ha vencido; negativo = aún tiene margen). */
  daysOverdue: number;
  /** Fecha en que vence (o venció) esta valoración. */
  dueDate: Date;
}

/**
 * Devuelve la cadencia en días para una escala, con posibilidad de override.
 *
 * @param scaleType  - Tipo de escala.
 * @param overrideDays - Cadencia personalizada en días (opcional).
 *                       Si se provee y es un entero positivo, sobreescribe el default.
 */
export function getScaleCadenceDays(scaleType: ScaleType, overrideDays?: number): number {
  if (overrideDays !== undefined && Number.isInteger(overrideDays) && overrideDays > 0) {
    return overrideDays;
  }
  return SCALE_CADENCE_DAYS[scaleType];
}

/**
 * Comprueba si una valoración está vencida dado su estado en `now`.
 *
 * @param lastDate   - Fecha de la última valoración.
 * @param cadenceDays - Cadencia en días entre valoraciones.
 * @param now        - Fecha de referencia (inyectada para testabilidad).
 * @returns true si la valoración ha superado la cadencia.
 */
export function isAssessmentOverdue(lastDate: Date, cadenceDays: number, now: Date): boolean {
  const dueDate = new Date(lastDate);
  dueDate.setDate(dueDate.getDate() + cadenceDays);
  return now > dueDate;
}

/**
 * Calcula el estado detallado de una valoración.
 *
 * @param lastDate   - Fecha de la última valoración.
 * @param cadenceDays - Cadencia en días entre valoraciones.
 * @param now        - Fecha de referencia (inyectada para testabilidad).
 * @returns Estado con días restantes, días vencidos y fecha de vencimiento.
 */
export function getAssessmentStatus(
  lastDate: Date,
  cadenceDays: number,
  now: Date,
): AssessmentStatusResult {
  const dueDate = new Date(lastDate);
  dueDate.setDate(dueDate.getDate() + cadenceDays);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / msPerDay);
  const daysOverdue = -daysUntilDue; // positivo cuando ya ha vencido

  let status: AssessmentStatus;
  if (daysUntilDue < 0) {
    status = 'vencida';
  } else if (daysUntilDue <= ALERT_AHEAD_DAYS) {
    status = 'proxima';
  } else {
    status = 'al_dia';
  }

  return { status, daysUntilDue, daysOverdue, dueDate };
}

/**
 * Dado un conjunto de valoraciones por tipo de escala (la última para cada una),
 * devuelve las que están vencidas o próximas a vencer ordenadas por urgencia
 * (primero las más vencidas, luego las más próximas).
 *
 * @param assessments - Mapa scaleType → { lastDate, cadenceDays? (override) }.
 * @param now         - Fecha de referencia (inyectada para testabilidad).
 */
export interface AssessmentEntry {
  scaleType: ScaleType;
  lastDate: Date;
  overrideDays?: number;
}

export interface AssessmentAlert extends AssessmentEntry {
  status: AssessmentStatus;
  daysUntilDue: number;
  daysOverdue: number;
  dueDate: Date;
  cadenceDays: number;
}

export function computeOverdueAlerts(
  assessments: AssessmentEntry[],
  now: Date,
): AssessmentAlert[] {
  const alerts: AssessmentAlert[] = [];

  for (const entry of assessments) {
    const cadenceDays = getScaleCadenceDays(entry.scaleType, entry.overrideDays);
    const result = getAssessmentStatus(entry.lastDate, cadenceDays, now);

    if (result.status === 'vencida' || result.status === 'proxima') {
      alerts.push({ ...entry, ...result, cadenceDays });
    }
  }

  // Ordenar: primero las más vencidas (daysOverdue más alto), luego las próximas
  return alerts.sort((a, b) => b.daysOverdue - a.daysOverdue);
}
