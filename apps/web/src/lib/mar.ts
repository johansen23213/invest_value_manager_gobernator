// MAR — Medication Administration Record.
// Cálculo de la pauta del día y de las alertas de no-administrado.
// Función pura (sin BD) para poder testearla de forma exhaustiva.

export type DoseStatus = 'PENDIENTE' | 'ADMINISTRADO' | 'NO_ADMINISTRADO' | 'RECHAZADO';

export interface MedForSchedule {
  id: string;
  name: string;
  dose: string; // dosis base
  times: string[]; // "HH:MM"
  /** M-11: dosis distinta por hora. Si una hora figura aquí, su dosis prevalece. */
  momentDoses?: { time: string; dose: string }[] | null;
  startDate: Date;
  endDate: Date | null;
  /** Array [0–6] (0=domingo). null o undefined = todos los días. */
  daysOfWeek?: number[] | null;
  /** CRONICO | AGUDO | PRN. PRN se excluye de la agenda fija. */
  type?: string | null;
  residentId?: string;
  residentName?: string;
}

/** Dosis efectiva de una medicación a una hora dada (M-11: por franja si existe). */
export function doseAt(med: MedForSchedule, time: string): string {
  const moment = med.momentDoses?.find((m) => m.time === time);
  return moment?.dose ?? med.dose;
}

export interface AdminForSchedule {
  medicationId: string;
  scheduledAt: Date;
  status: 'ADMINISTRADO' | 'NO_ADMINISTRADO' | 'RECHAZADO';
  notes?: string | null;
}

export interface DueDose {
  medicationId: string;
  medicationName: string;
  dose: string;
  scheduledAt: string; // ISO
  status: DoseStatus;
  overdue: boolean; // pendiente y pasada la hora + gracia (alerta)
  notes?: string; // motivo registrado (no administrado / rechazado)
  residentId?: string;
  residentName?: string;
  /** ADR-0012: registrada en el dispositivo y aún sin sincronizar con el servidor. */
  pendingSync?: boolean;
}

// Pase de medicación por turno (UX-17): el MAR se agrupa como lo trabaja
// el personal, por turno, no como una lista plana de horas.
export type Shift = 'MANANA' | 'TARDE' | 'NOCHE';

/** Turno de una hora pautada. Mañana 06–14, Tarde 14–22, Noche 22–06. */
export function shiftOf(scheduledAt: Date): Shift {
  const h = scheduledAt.getHours();
  if (h >= 6 && h < 14) return 'MANANA';
  if (h >= 14 && h < 22) return 'TARDE';
  return 'NOCHE';
}

/**
 * Devuelve el turno activo para una fecha/hora dada (típicamente `new Date()`).
 * Se usa para pre-seleccionar el chip de turno al abrir el MAR.
 *
 * Límites: Mañana 06:00–13:59 · Tarde 14:00–21:59 · Noche 22:00–05:59
 * La función es pura para poder testarla exhaustivamente.
 */
export function currentShift(date: Date): Shift {
  return shiftOf(date);
}

const SHIFT_ORDER: Shift[] = ['MANANA', 'TARDE', 'NOCHE'];

export interface ShiftGroup {
  shift: Shift;
  doses: DueDose[];
}

/**
 * Agrupa las dosis por turno, en orden Mañana → Tarde → Noche.
 * Solo devuelve los turnos que tienen dosis.
 */
export function groupByShift(doses: DueDose[]): ShiftGroup[] {
  return SHIFT_ORDER.map((shift) => ({
    shift,
    doses: doses.filter((d) => shiftOf(new Date(d.scheduledAt)) === shift),
  })).filter((g) => g.doses.length > 0);
}

const GRACE_MINUTES = 60;

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function activeOn(med: MedForSchedule, date: Date): boolean {
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  if (med.startDate > dayEnd) return false;
  if (med.endDate && med.endDate < dayStart) return false;
  return true;
}

function atTime(date: Date, hhmm: string): Date | null {
  const parts = hhmm.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Devuelve las dosis pautadas para `date`, con su estado a fecha `now`.
 * Una dosis sin registro y pasada la hora + gracia se marca NO_ADMINISTRADO (alerta).
 */
export function computeSchedule(
  meds: MedForSchedule[],
  admins: AdminForSchedule[],
  date: Date,
  now: Date,
): DueDose[] {
  const doses: DueDose[] = [];

  for (const med of meds) {
    if (!activeOn(med, date)) continue;
    // PRN (a demanda) no tiene agenda fija: se excluye del schedule estándar.
    if (med.type === 'PRN') continue;
    // daysOfWeek: si está definido, solo incluir si el día de la semana de `date` está en el array.
    if (Array.isArray(med.daysOfWeek) && !med.daysOfWeek.includes(date.getDay())) continue;
    for (const time of med.times) {
      const scheduledAt = atTime(date, time);
      if (!scheduledAt) continue;

      const admin = admins.find(
        (a) => a.medicationId === med.id && sameDay(a.scheduledAt, scheduledAt) && a.scheduledAt.getTime() === scheduledAt.getTime(),
      );

      let status: DoseStatus;
      let overdue = false;
      let notes: string | undefined;
      if (admin) {
        status = admin.status;
        notes = admin.notes ?? undefined;
      } else if (now.getTime() > scheduledAt.getTime() + GRACE_MINUTES * 60_000) {
        status = 'NO_ADMINISTRADO';
        overdue = true;
      } else {
        status = 'PENDIENTE';
      }

      doses.push({
        medicationId: med.id,
        medicationName: med.name,
        dose: doseAt(med, time),
        scheduledAt: scheduledAt.toISOString(),
        status,
        overdue,
        notes,
        residentId: med.residentId,
        residentName: med.residentName,
      });
    }
  }

  return doses.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/**
 * Devuelve las medicaciones PRN (a demanda) activas para `date`.
 * No generan dosis pautadas; se registran cuando ocurren.
 */
export function computePrn(meds: MedForSchedule[], date: Date): MedForSchedule[] {
  return meds.filter((m) => m.type === 'PRN' && activeOn(m, date));
}

/** Dosis no administradas (alertas). */
export function computeAlerts(
  meds: MedForSchedule[],
  admins: AdminForSchedule[],
  date: Date,
  now: Date,
): DueDose[] {
  return computeSchedule(meds, admins, date, now).filter((d) => d.status === 'NO_ADMINISTRADO');
}
