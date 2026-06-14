/**
 * actividades.ts — Lógica de dominio pura para el módulo de actividades.
 *
 * Animación sociocultural / terapia ocupacional (RF-ACT-001..012).
 *
 * Funciones puras (sin BD) para:
 *   - Control de aforo: hasCapacity, promoverPrimeroEnEspera
 *   - Validación de solape de horario: seSolapan, sesionesConSolape
 *   - Comprobación de estado de sesión: canEnroll, canRecord
 *
 * Todas las funciones son testeables de forma exhaustiva con Vitest.
 */

// ---------------------------------------------------------------------------
// Tipos de entrada (mínimos; sin importar el cliente Prisma)
// ---------------------------------------------------------------------------

export interface SesionInfo {
  id: string;
  startsAt: Date;
  endsAt: Date;
  /** Estado de la sesión: PROGRAMADA | REALIZADA | CANCELADA */
  status: string;
  /** Aforo máximo de la actividad asociada. */
  maxCapacity: number;
}

export interface InscripcionInfo {
  id: string;
  residentId: string;
  /** Estado: INSCRITO | LISTA_ESPERA | CANCELADO */
  status: string;
  enrolledAt: Date;
}

// ---------------------------------------------------------------------------
// Control de aforo
// ---------------------------------------------------------------------------

/**
 * Devuelve true si la sesión tiene plazas libres para nuevas inscripciones.
 *
 * Solo cuentan las inscripciones con estado INSCRITO (no LISTA_ESPERA ni CANCELADO).
 */
export function hasCapacity(
  sesion: Pick<SesionInfo, 'maxCapacity'>,
  inscripciones: InscripcionInfo[],
): boolean {
  const inscritos = inscripciones.filter((i) => i.status === 'INSCRITO').length;
  return inscritos < sesion.maxCapacity;
}

/**
 * Número de plazas libres en una sesión.
 * Puede ser negativo si el aforo se redujo después de inscribir residentes.
 */
export function plazasLibres(
  sesion: Pick<SesionInfo, 'maxCapacity'>,
  inscripciones: InscripcionInfo[],
): number {
  const inscritos = inscripciones.filter((i) => i.status === 'INSCRITO').length;
  return sesion.maxCapacity - inscritos;
}

/**
 * Devuelve el residentId del primer inscrito en lista de espera (el más antiguo),
 * o null si la lista de espera está vacía.
 *
 * Se usa al cancelar una inscripción INSCRITO para promover automáticamente al
 * siguiente en cola.
 */
export function primeroEnEspera(inscripciones: InscripcionInfo[]): string | null {
  const espera = inscripciones
    .filter((i) => i.status === 'LISTA_ESPERA')
    .sort((a, b) => a.enrolledAt.getTime() - b.enrolledAt.getTime());

  return espera[0]?.residentId ?? null;
}

// ---------------------------------------------------------------------------
// Validación de solape de horario
// ---------------------------------------------------------------------------

/**
 * Comprueba si dos sesiones se solapan en el tiempo.
 *
 * Dos sesiones se solapan si el inicio de una es anterior al fin de la otra
 * y viceversa (intersección no vacía, extremos exclusivos).
 *
 * Caso límite: si una sesión termina exactamente cuando empieza la otra,
 * NO se consideran solapadas (p. ej. 10:00-11:00 y 11:00-12:00 son contiguas).
 */
export function seSolapan(a: Pick<SesionInfo, 'startsAt' | 'endsAt'>, b: Pick<SesionInfo, 'startsAt' | 'endsAt'>): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/**
 * Dado un residente inscrito en varias sesiones (INSCRITO, no LISTA_ESPERA ni CANCELADO)
 * y una sesión candidata, devuelve las sesiones con las que habría solape.
 *
 * Uso: antes de inscribir a un residente, llamar con sus sesiones actuales + la nueva.
 * Si el array resultante no está vacío, la inscripción causaría un conflicto de horario.
 */
export function sesionesConSolape(
  candidata: Pick<SesionInfo, 'startsAt' | 'endsAt'>,
  sesionesActuales: Array<Pick<SesionInfo, 'id' | 'startsAt' | 'endsAt'>>,
): Array<Pick<SesionInfo, 'id' | 'startsAt' | 'endsAt'>> {
  return sesionesActuales.filter((s) => seSolapan(candidata, s));
}

// ---------------------------------------------------------------------------
// Validación de estado de sesión
// ---------------------------------------------------------------------------

/**
 * Comprueba si se puede inscribir a un residente en la sesión.
 *
 * No se puede inscribir si la sesión está REALIZADA o CANCELADA.
 */
export function canEnroll(sesion: Pick<SesionInfo, 'status'>): boolean {
  return sesion.status === 'PROGRAMADA';
}

/**
 * Comprueba si se puede registrar la asistencia en la sesión.
 *
 * La asistencia se registra cuando la sesión está PROGRAMADA (durante / justo antes)
 * o REALIZADA. No se registra en sesiones CANCELADAS.
 */
export function canRecord(sesion: Pick<SesionInfo, 'status'>): boolean {
  return sesion.status === 'PROGRAMADA' || sesion.status === 'REALIZADA';
}

/**
 * Determina el estado de inscripción apropiado al añadir un residente:
 *   - Si hay plazas: INSCRITO
 *   - Si el aforo está lleno: LISTA_ESPERA
 */
export function estadoInscripcion(
  sesion: Pick<SesionInfo, 'maxCapacity'>,
  inscripcionesActuales: InscripcionInfo[],
): 'INSCRITO' | 'LISTA_ESPERA' {
  return hasCapacity(sesion, inscripcionesActuales) ? 'INSCRITO' : 'LISTA_ESPERA';
}
