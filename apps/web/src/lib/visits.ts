// Lógica pura del módulo de visitas (VIS-001..VIS-010).
// Sin dependencias de BD: testeable de forma aislada.

// ---------------------------------------------------------------------------
// Zona horaria del centro.
//
// El MVP se dirige a centros en España; la TZ del centro es Europe/Madrid para
// todos. Cuando Angel decida añadir campo `timezone` en Center (multi-país),
// esta constante se sustituye por el valor del registro — cambio de una línea
// por call-site. Escalado a marc-arquitecto / cio-vetlla según el informe de
// revisión 2026-06-12 (H-1).
// ---------------------------------------------------------------------------

export const CENTER_TIMEZONE = 'Europe/Madrid';

// ---------------------------------------------------------------------------
// Helpers puros de zona horaria (sin dependencias externas).
//
// Toda la conversión usa Intl.DateTimeFormat con timeZone, que es isomórfica
// (disponible en Node.js y en el navegador) y determinista: el resultado NO
// depende de la TZ del proceso donde se ejecute.
// ---------------------------------------------------------------------------

export interface ZonedParts {
  year:    number;
  month:   number; // 1-12
  day:     number; // 1-31
  weekday: number; // 0=domingo … 6=sábado (convención del módulo)
  hour:    number; // 0-23
  minute:  number; // 0-59
  /** Fecha como "YYYY-MM-DD" en la TZ indicada. */
  dateISO: string;
  /** Hora como "HH:MM" en la TZ indicada. */
  timeHHMM: string;
}

/**
 * Extrae las partes de una Date en la zona horaria `tz`.
 * Resultado determinista: no depende de la TZ del entorno de ejecución.
 */
export function zonedParts(date: Date, tz: string): ZonedParts {
  // Usamos un formateador con todas las partes que necesitamos.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year:    'numeric',
    month:   '2-digit',
    day:     '2-digit',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  false,
    weekday: 'short', // 'Mon', 'Tue'… o el equivalente en en-CA
  });

  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

  // en-CA garantiza formato YYYY-MM-DD para date. Para evitar depender de eso,
  // extraemos year/month/day individualmente.
  const year    = parseInt(get('year'),  10);
  const month   = parseInt(get('month'), 10); // 1-12
  const day     = parseInt(get('day'),   10);
  // hour12:false → '24' cuando es medianoche en algunos entornos; normalizamos.
  let hour      = parseInt(get('hour'),  10);
  if (hour === 24) hour = 0;
  const minute  = parseInt(get('minute'), 10);

  // día de la semana: Intl nos da un string como "Mon" en en-CA.
  // Mapeamos a 0=Dom…6=Sab de forma explícita para no depender del locale.
  const weekdayStr = get('weekday'); // 'Sun','Mon','Tue','Wed','Thu','Fri','Sat' en en-CA
  const WEEKDAY_MAP: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = WEEKDAY_MAP[weekdayStr] ?? new Date(date).getDay(); // fallback defensivo

  const mm     = String(month).padStart(2, '0');
  const dd     = String(day).padStart(2, '0');
  const hh     = String(hour).padStart(2, '0');
  const mn     = String(minute).padStart(2, '0');

  return {
    year, month, day, weekday, hour, minute,
    dateISO:  `${year}-${mm}-${dd}`,
    timeHHMM: `${hh}:${mn}`,
  };
}

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
 *
 * Toda la comparación de hora/día-de-semana se hace en CENTER_TIMEZONE
 * (Europe/Madrid) para evitar errores a medianoche con servidor en UTC.
 */
export function slotsForDate(
  configs: SlotConfig[],
  date: Date,
  existingVisits: VisitForSlot[],
): SlotAvailability[] {
  const { weekday: dayOfWeek } = zonedParts(date, CENTER_TIMEZONE);

  // Solo franjas activas del día de la semana correspondiente
  const activeSlots = configs.filter(
    (c) => c.active && c.dayOfWeek === dayOfWeek,
  );

  // Estados que consumen capacidad
  const CONSUMING_STATUSES: VisitStatus[] = ['SOLICITADA', 'CONFIRMADA', 'EN_CURSO'];

  return activeSlots.map((slot) => {
    // Contar visitas que empiezan en esa franja exacta (misma hora HH:MM en la TZ del centro)
    const occupied = existingVisits.filter((v) => {
      if (!CONSUMING_STATUSES.includes(v.status)) return false;
      const { timeHHMM } = zonedParts(v.scheduledAt, CENTER_TIMEZONE);
      return timeHHMM === slot.startTime;
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
 *   coincide con el startTime de la franja, ambos evaluados en CENTER_TIMEZONE
 *   (Europe/Madrid).
 *   (La convención del módulo es que scheduledAt = inicio de la franja.)
 */
export function isVisitInSlot(date: Date, slot: SlotConfig): boolean {
  if (!slot.active) return false;
  const { weekday, timeHHMM } = zonedParts(date, CENTER_TIMEZONE);
  if (weekday !== slot.dayOfWeek) return false;
  return timeHHMM === slot.startTime;
}

// ---------------------------------------------------------------------------
// isSameLocalDate — helper para checkInByCode: ¿dos dates son el mismo día
// en la TZ del centro? Evita el bug de medianoche donde la fecha UTC cambia
// antes que la fecha local del centro.
// ---------------------------------------------------------------------------

/**
 * Devuelve true si `a` y `b` caen en la misma fecha calendario
 * en CENTER_TIMEZONE (Europe/Madrid).
 */
export function isSameLocalDate(a: Date, b: Date, tz: string = CENTER_TIMEZONE): boolean {
  return zonedParts(a, tz).dateISO === zonedParts(b, tz).dateISO;
}
