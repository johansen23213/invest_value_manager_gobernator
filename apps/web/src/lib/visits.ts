// Lógica pura del módulo de visitas (VIS-001..VIS-010).
// Sin dependencias de BD: testeable de forma aislada.

// ---------------------------------------------------------------------------
// Tipos locales (espejo de los de Prisma; sin importar @vetlla/db aquí para
// mantener las funciones puras sin dependencias pesadas en tests unitarios).
// ---------------------------------------------------------------------------

export type VisitStatus =
  | 'SOLICITADA'
  | 'CONFIRMADA'
  | 'RECHAZADA'
  | 'CANCELADA'
  | 'EN_CURSO'
  | 'COMPLETADA'
  | 'NO_SHOW';

/** Mínimo de una VisitSlotConfig necesario para calcular disponibilidad. */
export interface SlotConfig {
  id: string;
  dayOfWeek: number;    // 0=domingo … 6=sábado
  startTime: string;    // "HH:MM"
  endTime: string;      // "HH:MM"
  capacity: number;
  autoApprove: boolean;
  active: boolean;
}

/** Franja con disponibilidad calculada para un día concreto. */
export interface SlotAvailability {
  slotConfigId: string;
  startTime: string;  // "HH:MM"
  endTime: string;    // "HH:MM"
  capacity: number;
  occupied: number;   // visitas confirmadas/solicitadas en esa franja
  available: number;  // capacity - occupied (puede ser 0)
  autoApprove: boolean;
}

/** Mínimo de una Visit necesario para calcular disponibilidad. */
export interface VisitForSlot {
  scheduledAt: Date;
  status: VisitStatus;
}

// ---------------------------------------------------------------------------
// slotsForDate — disponibilidad de franjas en una fecha concreta (VIS-002/RSV-005)
// ---------------------------------------------------------------------------

/**
 * Dado el array de VisitSlotConfig de un centro, una fecha y las visitas
 * existentes de ese día (ya filtradas por el llamador), devuelve las franjas
 * activas del dayOfWeek correspondiente con su disponibilidad restante.
 *
 * "Ocupada" = visita en estado SOLICITADA, CONFIRMADA o EN_CURSO que cae en
 * esa franja. CANCELADA, RECHAZADA, NO_SHOW y COMPLETADA no consumen capacidad.
 */
export function slotsForDate(
  configs: SlotConfig[],
  date: Date,
  existingVisits: VisitForSlot[],
): SlotAvailability[] {
  const dayOfWeek = date.getDay(); // 0=domingo … 6=sábado

  // Solo franjas activas del día de la semana correspondiente
  const activeSlots = configs.filter(
    (c) => c.active && c.dayOfWeek === dayOfWeek,
  );

  // Estados que consumen capacidad
  const CONSUMING_STATUSES: VisitStatus[] = ['SOLICITADA', 'CONFIRMADA', 'EN_CURSO'];

  return activeSlots.map((slot) => {
    // Contar visitas que empiezan en esa franja exacta (misma hora HH:MM del día)
    const occupied = existingVisits.filter((v) => {
      if (!CONSUMING_STATUSES.includes(v.status)) return false;
      // Comparar la hora de la visita con startTime del slot
      const visitHour = v.scheduledAt.getUTCHours().toString().padStart(2, '0');
      const visitMin  = v.scheduledAt.getUTCMinutes().toString().padStart(2, '0');
      const visitTime = `${visitHour}:${visitMin}`;
      return visitTime === slot.startTime;
    }).length;

    return {
      slotConfigId: slot.id,
      startTime:    slot.startTime,
      endTime:      slot.endTime,
      capacity:     slot.capacity,
      occupied,
      available:    Math.max(0, slot.capacity - occupied),
      autoApprove:  slot.autoApprove,
    };
  });
}

// ---------------------------------------------------------------------------
// generateVisitCode — código BASE32 legible de 8 caracteres (VIS QR)
//
// Alfabeto BASE32 sin caracteres ambiguos (sin 0/O/1/I).
// Usa crypto.getRandomValues (Web Crypto, isomórfico).
// 32^8 ≈ 10^12 combinaciones; caducidad operativa diaria reduce riesgo.
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars; sin 0,O,1,I

/**
 * Genera un código BASE32 de 8 caracteres para el QR de confirmación de visita.
 * Isomórfico (Web Crypto; sin node:crypto para no romper el bundle de Next.js).
 */
export function generateVisitCode(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => BASE32_ALPHABET[b % 32]!)
    .join('');
}

// ---------------------------------------------------------------------------
// canCancel — ¿puede cancelarse una visita?
// ---------------------------------------------------------------------------

/** Tipo mínimo de una visita para evaluar si puede cancelarse. */
export interface VisitForCancel {
  status: VisitStatus;
  scheduledAt: Date;
}

/**
 * Una visita puede cancelarse si está en SOLICITADA o CONFIRMADA
 * y la franja (scheduledAt) está en el futuro.
 */
export function canCancel(visit: VisitForCancel, now: Date): boolean {
  if (!['SOLICITADA', 'CONFIRMADA'].includes(visit.status)) return false;
  return visit.scheduledAt > now;
}

// ---------------------------------------------------------------------------
// visitTransitions — máquina de estados de la visita
// ---------------------------------------------------------------------------

/**
 * Transiciones válidas del ciclo de vida de una visita.
 *
 * Diagrama:
 *   SOLICITADA  → CONFIRMADA | RECHAZADA | CANCELADA
 *   CONFIRMADA  → CANCELADA | EN_CURSO | NO_SHOW
 *   EN_CURSO    → COMPLETADA
 *
 * Estados terminales: RECHAZADA, CANCELADA, COMPLETADA, NO_SHOW.
 */
export const VISIT_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  SOLICITADA: ['CONFIRMADA', 'RECHAZADA', 'CANCELADA'],
  CONFIRMADA: ['CANCELADA', 'EN_CURSO', 'NO_SHOW'],
  EN_CURSO:   ['COMPLETADA'],
  // Terminales — sin transiciones salientes
  RECHAZADA:  [],
  CANCELADA:  [],
  COMPLETADA: [],
  NO_SHOW:    [],
};

/**
 * Devuelve true si la transición `from` → `to` es válida según la máquina
 * de estados del módulo de visitas.
 */
export function canVisitTransition(from: VisitStatus, to: VisitStatus): boolean {
  return VISIT_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// isSlotForDate — helper: ¿un scheduledAt cae en una franja determinada?
// ---------------------------------------------------------------------------

/**
 * Verifica que un scheduledAt (Date UTC) cae dentro del rango horario de
 * una franja activa del día correcto.
 *
 * - date: la fecha a comprobar (scheduledAt propuesto por el familiar).
 * - slot: la franja candidata.
 * - Devuelve true si el día de la semana coincide y la hora HH:MM de la Date
 *   coincide con el startTime de la franja.
 *   (La convención del módulo es que scheduledAt = inicio de la franja.)
 */
export function isVisitInSlot(date: Date, slot: SlotConfig): boolean {
  if (!slot.active) return false;
  if (date.getDay() !== slot.dayOfWeek) return false;
  const hour = date.getUTCHours().toString().padStart(2, '0');
  const min  = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hour}:${min}` === slot.startTime;
}
