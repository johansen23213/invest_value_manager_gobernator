/**
 * Lógica pura de turnos del personal (Épica D — RF-PRO-003/004).
 *
 * Funciones sin BD, testables de forma exhaustiva.
 * Reutiliza el concepto de turno de lib/mar.ts: MANANA/TARDE/NOCHE.
 *
 * Alerta de infra-cobertura (RF-PRO-004):
 *   coverageFor recibe las plantillas (que definen minStaff) y las asignaciones
 *   del día/turno/unidad. Devuelve cuántos están asignados vs el mínimo requerido
 *   y si hay infra-cobertura (understaffed:true). El router usa esta función para
 *   el endpoint shifts.coverage y para mostrar la alerta en el cuadrante mensual.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/**
 * Turno de personal. Mismos literales que NursingNoteShift para coherencia.
 * Se alinea con lib/mar.ts (type Shift) y NursingNoteShift del schema.
 * Franjas: MANANA 06:00-13:59 · TARDE 14:00-21:59 · NOCHE 22:00-05:59
 */
export type StaffShift = 'MANANA' | 'TARDE' | 'NOCHE';

/** Estado de una asignación al cuadrante. */
export type AssignmentStatus = 'PLANIFICADO' | 'CONFIRMADO' | 'AUSENTE' | 'SUSTITUIDO';

/**
 * Plantilla de turno (snapshot del dato que necesita coverageFor).
 * Solo los campos relevantes para el cálculo de cobertura.
 */
export interface ShiftTemplateForCoverage {
  unitId: string | null; // null = aplica a todo el centro
  shift: StaffShift;
  minStaff: number;
  active: boolean;
}

/**
 * Asignación de turno (snapshot del dato que necesita coverageFor).
 * Solo los campos relevantes para el cálculo de cobertura.
 */
export interface ShiftAssignmentForCoverage {
  shift: StaffShift;
  unitId: string | null;
  status: AssignmentStatus;
  substituteUserId: string | null;
}

/** Resultado del cálculo de cobertura para un turno/unidad. */
export interface CoverageResult {
  /** Número de trabajadores asignados y presentes (PLANIFICADO/CONFIRMADO, o AUSENTE con sustituto). */
  assigned: number;
  /** Mínimo requerido según la plantilla activa. 0 si no hay plantilla activa para el turno/unidad. */
  required: number;
  /** true si assigned < required (alerta de infra-cobertura RF-PRO-004). */
  understaffed: boolean;
  /** true si no se encontró ninguna plantilla activa para el turno/unidad indicados. */
  noTemplate: boolean;
}

// ---------------------------------------------------------------------------
// Función principal: coverageFor
// ---------------------------------------------------------------------------

/**
 * Calcula el estado de cobertura de personal para un turno, unidad y fecha.
 *
 * RF-PRO-004 — alerta de infra-cobertura:
 *   Cuenta asignaciones EFECTIVAS (excluyendo AUSENTE sin sustituto) y compara
 *   con minStaff de la plantilla aplicable.
 *
 * Búsqueda de plantilla (prioridad):
 *   1. Plantilla activa para el unitId específico y el shift dado.
 *   2. Si no existe, plantilla activa para el mismo centro (unitId=null) y shift.
 *   Si no hay plantilla, `required=0, noTemplate=true` (no se puede calcular la alerta).
 *
 * Asignaciones efectivas (se cuenta la presencia real):
 *   - PLANIFICADO: cuenta (asistencia prevista).
 *   - CONFIRMADO: cuenta (asistencia confirmada).
 *   - SUSTITUIDO: cuenta (el sustituto está presente; el original está ausente
 *     pero sustituido, así que la plaza está cubierta).
 *   - AUSENTE: cuenta SOLO si tiene substituteUserId (el sustituto cubre la plaza).
 *     AUSENTE sin sustituto = plaza vacía = no cuenta.
 *
 * @param templates  Plantillas activas del centro (ya filtradas por el llamante).
 * @param assignments Asignaciones del día para el tenant/centro (ya filtradas por fecha).
 * @param shift       Turno a evaluar.
 * @param unitId      Unidad a evaluar (null = sin filtro de unidad; aplica plantilla de centro).
 */
export function coverageFor(
  templates: ShiftTemplateForCoverage[],
  assignments: ShiftAssignmentForCoverage[],
  shift: StaffShift,
  unitId: string | null,
): CoverageResult {
  // Buscar plantilla aplicable (prioridad: unidad específica > centro completo)
  const unitTemplate = unitId
    ? templates.find((t) => t.active && t.shift === shift && t.unitId === unitId)
    : undefined;

  const centerTemplate = templates.find(
    (t) => t.active && t.shift === shift && t.unitId === null,
  );

  const template = unitTemplate ?? centerTemplate ?? null;

  if (!template) {
    return { assigned: 0, required: 0, understaffed: false, noTemplate: true };
  }

  // Filtrar asignaciones del turno solicitado
  const forShift = assignments.filter((a) => a.shift === shift);

  // Filtrar por unidad si se especifica
  const forUnit = unitId !== null
    ? forShift.filter((a) => a.unitId === unitId)
    : forShift;

  // Contar presencias efectivas
  const assigned = forUnit.filter((a) => isPresent(a)).length;
  const required = template.minStaff;

  return {
    assigned,
    required,
    understaffed: assigned < required,
    noTemplate: false,
  };
}

/**
 * Determina si una asignación cuenta como presencia efectiva en el turno.
 *
 * - PLANIFICADO o CONFIRMADO: sí (el trabajador está previsto/confirmado).
 * - SUSTITUIDO: sí (el sustituto ocupa la plaza).
 * - AUSENTE con substituteUserId: sí (hay alguien que cubre).
 * - AUSENTE sin substituteUserId: no (plaza vacía).
 */
export function isPresent(a: ShiftAssignmentForCoverage): boolean {
  if (a.status === 'PLANIFICADO' || a.status === 'CONFIRMADO') return true;
  if (a.status === 'SUSTITUIDO') return true;
  if (a.status === 'AUSENTE') return a.substituteUserId !== null;
  return false;
}

// ---------------------------------------------------------------------------
// Utilidades de turno (reutiliza el concepto de lib/mar.ts)
// ---------------------------------------------------------------------------

/**
 * Devuelve el turno activo para una hora dada (HH: 0-23).
 * Mismas franjas que lib/mar.ts: MANANA 06-14, TARDE 14-22, NOCHE 22-06.
 */
export function shiftForHour(hour: number): StaffShift {
  if (hour >= 6 && hour < 14) return 'MANANA';
  if (hour >= 14 && hour < 22) return 'TARDE';
  return 'NOCHE';
}

/**
 * Devuelve el turno activo para una fecha/hora dada.
 * Conveniente para pre-seleccionar el chip de turno en el cuadrante.
 */
export function currentStaffShift(date: Date): StaffShift {
  return shiftForHour(date.getHours());
}

/**
 * Normaliza una fecha a medianoche UTC (para comparar días sin hora).
 * Útil para filtrar asignaciones de un día concreto.
 */
export function dayStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function dayEnd(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}
