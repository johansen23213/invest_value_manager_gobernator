/**
 * ocupacion-forecast.ts — Lógica pura de forecast de ocupación y máquina de
 * estados de admisión. Sin BD, testeable de forma exhaustiva.
 *
 * Dos responsabilidades:
 *   1. occupancyForecast(): proyecta plazas libres / tasa de ocupación día a día
 *      en un horizonte dado, a partir de la ocupación actual, bajas previstas y
 *      admisiones previstas.
 *   2. admissionTransitions: define las transiciones válidas de la máquina de
 *      estados AdmissionStatus y la función canTransition() que las valida.
 */

// ---------------------------------------------------------------------------
// 1. Máquina de estados de admisión
// ---------------------------------------------------------------------------

/**
 * Estados posibles de una solicitud de admisión.
 * Sincronizado con el enum AdmissionStatus del schema Prisma.
 */
export type AdmissionStatus =
  | 'LEAD'
  | 'WAITLIST'
  | 'EVALUATION'
  | 'OFFERED'
  | 'ADMITTED'
  | 'REJECTED'
  | 'WITHDRAWN';

/**
 * Grafo de transiciones válidas: de cada estado, a cuáles se puede ir.
 *
 * Reglas:
 *   - ADMITTED, REJECTED y WITHDRAWN son estados terminales (sin salida).
 *   - Desde cualquier estado activo (LEAD → OFFERED) se puede retirar (WITHDRAWN)
 *     o rechazar (REJECTED).
 *   - El avance normal es: LEAD → WAITLIST → EVALUATION → OFFERED → ADMITTED.
 *   - Se permite retroceder (p. ej. EVALUATION → WAITLIST) para reflejar que
 *     la evaluación no ha terminado o que la plaza ofrecida se ha caído.
 */
export const ADMISSION_TRANSITIONS: Record<AdmissionStatus, AdmissionStatus[]> = {
  LEAD:       ['WAITLIST', 'EVALUATION', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  WAITLIST:   ['EVALUATION', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  EVALUATION: ['WAITLIST', 'OFFERED', 'REJECTED', 'WITHDRAWN'],
  OFFERED:    ['EVALUATION', 'ADMITTED', 'REJECTED', 'WITHDRAWN'],
  ADMITTED:   [], // terminal
  REJECTED:   [], // terminal
  WITHDRAWN:  [], // terminal
};

/**
 * Devuelve true si la transición from → to es válida según la máquina de estados.
 * Función pura: no tiene efectos secundarios.
 */
export function canTransition(from: AdmissionStatus, to: AdmissionStatus): boolean {
  return ADMISSION_TRANSITIONS[from].includes(to);
}

/**
 * Devuelve los estados a los que se puede avanzar desde `from`.
 */
export function allowedTransitions(from: AdmissionStatus): AdmissionStatus[] {
  return ADMISSION_TRANSITIONS[from];
}

/** True si el estado es terminal (no hay más transiciones posibles). */
export function isTerminalStatus(status: AdmissionStatus): boolean {
  return ADMISSION_TRANSITIONS[status].length === 0;
}

// ---------------------------------------------------------------------------
// 2. Forecast de ocupación
// ---------------------------------------------------------------------------

/**
 * Baja prevista: un residente con fecha de alta programada.
 * El residente libera la plaza a partir de `dischargeDate` (inclusive).
 */
export interface PendingDischarge {
  residentId: string;
  dischargeDate: Date; // fecha prevista de alta/baja
}

/**
 * Admisión prevista: una solicitud en estado OFFERED con `expectedDate`.
 * El candidato ocupa una plaza a partir de `expectedDate` (inclusive).
 */
export interface PendingAdmission {
  requestId: string;
  expectedDate: Date; // fecha prevista de ingreso
  centerId: string;
  unitId?: string | null;
}

/**
 * Parámetros de entrada para el forecast de ocupación.
 *
 * @param totalBeds       Número total de plazas operativas en el ámbito (centro/unidad).
 *                        Excluye las camas FUERA_SERVICIO sin residente (coherente con
 *                        la definición de `capacity` en lib/occupancy.ts).
 * @param currentOccupied Número de plazas actualmente ocupadas (con residente activo).
 * @param pendingDischarges Bajas/altas previstas con fecha estimada.
 * @param pendingAdmissions Admisiones previstas (solicitudes OFFERED con fecha de ingreso).
 * @param horizonDays     Número de días a proyectar desde `referenceDate` (inclusive).
 * @param referenceDate   Fecha de referencia (base del cálculo). Por defecto: hoy.
 */
export interface OccupancyForecastParams {
  totalBeds: number;
  currentOccupied: number;
  pendingDischarges: PendingDischarge[];
  pendingAdmissions: PendingAdmission[];
  horizonDays: number;
  referenceDate?: Date;
}

/** Proyección de ocupación para un día concreto. */
export interface ForecastDay {
  /** Fecha del día proyectado (medianoche UTC). */
  date: Date;
  /** Plazas ocupadas proyectadas en ese día. */
  occupied: number;
  /** Plazas libres proyectadas en ese día. */
  free: number;
  /** Tasa de ocupación proyectada (0–1). */
  occupancyRate: number;
  /** Altas/bajas previstas que afectan a este día. */
  discharges: number;
  /** Ingresos previstos que afectan a este día. */
  admissions: number;
}

/** Resultado del forecast: serie diaria de proyección. */
export interface OccupancyForecastResult {
  totalBeds: number;
  referenceDate: Date;
  horizonDays: number;
  days: ForecastDay[];
}

/**
 * Normaliza una fecha a medianoche UTC (ignorando la parte horaria).
 */
function toUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Proyecta la ocupación día a día en un horizonte dado.
 *
 * Algoritmo:
 *   - Parte de `currentOccupied` como ocupación en el día de referencia.
 *   - Cada día suma ingresos previstos (pendingAdmissions con expectedDate ese día).
 *   - Cada día resta bajas previstas (pendingDischarges con dischargeDate ese día).
 *   - La ocupación nunca baja de 0 ni sube de totalBeds (pinza defensiva).
 *   - Bajas/ingresos del mismo día se aplican simultáneamente (primero se libera,
 *     luego se ocupa — neto positivo si hay más ingresos que bajas).
 *
 * Función pura: idénticas entradas → idéntico resultado. Sin efectos secundarios.
 */
export function occupancyForecast(params: OccupancyForecastParams): OccupancyForecastResult {
  const {
    totalBeds,
    currentOccupied,
    pendingDischarges,
    pendingAdmissions,
    horizonDays,
    referenceDate = new Date(),
  } = params;

  const refDay = toUTCDay(referenceDate);

  // Preprocesar: agrupar por fecha (en milisegundos UTC del día)
  const dischargesByDay = new Map<number, number>();
  for (const d of pendingDischarges) {
    const key = toUTCDay(d.dischargeDate).getTime();
    dischargesByDay.set(key, (dischargesByDay.get(key) ?? 0) + 1);
  }

  const admissionsByDay = new Map<number, number>();
  for (const a of pendingAdmissions) {
    const key = toUTCDay(a.expectedDate).getTime();
    admissionsByDay.set(key, (admissionsByDay.get(key) ?? 0) + 1);
  }

  const days: ForecastDay[] = [];
  // La ocupación del día de referencia es la actual (antes de aplicar eventos).
  let occupied = Math.max(0, Math.min(currentOccupied, totalBeds));

  for (let i = 0; i < horizonDays; i++) {
    const dayTs = refDay.getTime() + i * 86_400_000;
    const date = new Date(dayTs);

    const discharges = dischargesByDay.get(dayTs) ?? 0;
    const admissions = admissionsByDay.get(dayTs) ?? 0;

    // Si es el día de referencia (i=0), los eventos del día de referencia ya se
    // están produciendo hoy — los aplicamos igual.
    occupied = Math.max(0, Math.min(totalBeds, occupied - discharges + admissions));

    const free = totalBeds - occupied;
    const occupancyRate = totalBeds > 0 ? occupied / totalBeds : 0;

    days.push({ date, occupied, free, occupancyRate, discharges, admissions });
  }

  return {
    totalBeds,
    referenceDate: refDay,
    horizonDays,
    days,
  };
}
