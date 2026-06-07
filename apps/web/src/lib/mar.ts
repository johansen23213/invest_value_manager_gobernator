// MAR — Medication Administration Record.
// Cálculo de la pauta del día y de las alertas de no-administrado.
// Función pura (sin BD) para poder testearla de forma exhaustiva.

export type DoseStatus = 'PENDIENTE' | 'ADMINISTRADO' | 'NO_ADMINISTRADO' | 'RECHAZADO';

export interface MedForSchedule {
  id: string;
  name: string;
  dose: string;
  times: string[]; // "HH:MM"
  startDate: Date;
  endDate: Date | null;
  residentId?: string;
  residentName?: string;
}

export interface AdminForSchedule {
  medicationId: string;
  scheduledAt: Date;
  status: 'ADMINISTRADO' | 'NO_ADMINISTRADO' | 'RECHAZADO';
}

export interface DueDose {
  medicationId: string;
  medicationName: string;
  dose: string;
  scheduledAt: string; // ISO
  status: DoseStatus;
  overdue: boolean; // pendiente y pasada la hora + gracia (alerta)
  residentId?: string;
  residentName?: string;
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
    for (const time of med.times) {
      const scheduledAt = atTime(date, time);
      if (!scheduledAt) continue;

      const admin = admins.find(
        (a) => a.medicationId === med.id && sameDay(a.scheduledAt, scheduledAt) && a.scheduledAt.getTime() === scheduledAt.getTime(),
      );

      let status: DoseStatus;
      let overdue = false;
      if (admin) {
        status = admin.status;
      } else if (now.getTime() > scheduledAt.getTime() + GRACE_MINUTES * 60_000) {
        status = 'NO_ADMINISTRADO';
        overdue = true;
      } else {
        status = 'PENDIENTE';
      }

      doses.push({
        medicationId: med.id,
        medicationName: med.name,
        dose: med.dose,
        scheduledAt: scheduledAt.toISOString(),
        status,
        overdue,
        residentId: med.residentId,
        residentName: med.residentName,
      });
    }
  }

  return doses.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
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
