import { describe, expect, it } from 'vitest';
import {
  computeAlerts,
  computePrn,
  computeSchedule,
  currentShift,
  doseAt,
  groupByShift,
  shiftOf,
  type MedForSchedule,
} from './mar';

const med: MedForSchedule = {
  id: 'm1',
  name: 'Paracetamol',
  dose: '1g',
  times: ['08:00', '20:00'],
  startDate: new Date('2026-06-01T00:00:00Z'),
  endDate: null,
};

const DATE = new Date('2026-06-07T00:00:00');

describe('computeSchedule', () => {
  it('genera una dosis por hora pautada', () => {
    const noon = new Date('2026-06-07T12:00:00');
    const doses = computeSchedule([med], [], DATE, noon);
    expect(doses).toHaveLength(2);
  });

  it('marca PENDIENTE las dosis aún no vencidas', () => {
    const earlyMorning = new Date('2026-06-07T07:00:00');
    const doses = computeSchedule([med], [], DATE, earlyMorning);
    expect(doses.every((d) => d.status === 'PENDIENTE')).toBe(true);
  });

  it('marca NO_ADMINISTRADO una dosis vencida sin registro (alerta)', () => {
    const afternoon = new Date('2026-06-07T12:00:00');
    const doses = computeSchedule([med], [], DATE, afternoon);
    const morning = doses.find((d) => d.scheduledAt.includes('T08:00'));
    expect(morning?.status).toBe('NO_ADMINISTRADO');
    expect(morning?.overdue).toBe(true);
  });

  it('respeta el registro de administración existente', () => {
    const afternoon = new Date('2026-06-07T12:00:00');
    const scheduledAt = new Date('2026-06-07T08:00:00');
    const doses = computeSchedule(
      [med],
      [{ medicationId: 'm1', scheduledAt, status: 'ADMINISTRADO' }],
      DATE,
      afternoon,
    );
    const morning = doses.find((d) => d.scheduledAt === scheduledAt.toISOString());
    expect(morning?.status).toBe('ADMINISTRADO');
    expect(morning?.overdue).toBe(false);
  });

  it('propaga el motivo (notes) de una dosis no administrada', () => {
    const afternoon = new Date('2026-06-07T12:00:00');
    const scheduledAt = new Date('2026-06-07T08:00:00');
    const doses = computeSchedule(
      [med],
      [{ medicationId: 'm1', scheduledAt, status: 'NO_ADMINISTRADO', notes: 'en ayunas para analítica' }],
      DATE,
      afternoon,
    );
    const morning = doses.find((d) => d.scheduledAt === scheduledAt.toISOString());
    expect(morning?.status).toBe('NO_ADMINISTRADO');
    expect(morning?.notes).toBe('en ayunas para analítica');
    expect(morning?.overdue).toBe(false); // hay registro: no es alerta
  });

  it('excluye medicaciones fuera de su periodo', () => {
    const ended: MedForSchedule = { ...med, endDate: new Date('2026-06-05T23:59:59Z') };
    expect(computeSchedule([ended], [], DATE, new Date('2026-06-07T12:00:00'))).toHaveLength(0);
  });
});

describe('computeAlerts', () => {
  it('devuelve solo las dosis no administradas', () => {
    const afternoon = new Date('2026-06-07T12:00:00');
    const alerts = computeAlerts([med], [], DATE, afternoon);
    expect(alerts).toHaveLength(1); // la de las 08:00; la de las 20:00 aún no vence
    expect(alerts[0]?.status).toBe('NO_ADMINISTRADO');
  });
});

describe('shiftOf', () => {
  it('clasifica por turno: mañana 06–14, tarde 14–22, noche resto', () => {
    expect(shiftOf(new Date('2026-06-07T08:00:00'))).toBe('MANANA');
    expect(shiftOf(new Date('2026-06-07T06:00:00'))).toBe('MANANA');
    expect(shiftOf(new Date('2026-06-07T14:00:00'))).toBe('TARDE');
    expect(shiftOf(new Date('2026-06-07T20:00:00'))).toBe('TARDE');
    expect(shiftOf(new Date('2026-06-07T22:00:00'))).toBe('NOCHE');
    expect(shiftOf(new Date('2026-06-07T03:00:00'))).toBe('NOCHE');
  });
});

describe('groupByShift', () => {
  it('agrupa la pauta por turno en orden y omite turnos vacíos', () => {
    // med pauta 08:00 (mañana) y 20:00 (tarde); ninguna de noche.
    const noon = new Date('2026-06-07T12:00:00');
    const doses = computeSchedule([med], [], DATE, noon);
    const groups = groupByShift(doses);
    expect(groups.map((g) => g.shift)).toEqual(['MANANA', 'TARDE']);
    expect(groups[0]?.doses).toHaveLength(1);
    expect(groups[1]?.doses).toHaveLength(1);
  });

  it('devuelve vacío si no hay dosis', () => {
    expect(groupByShift([])).toEqual([]);
  });
});

// ── Nuevos casos Sprint M ─────────────────────────────────────────────────────

describe('computeSchedule — daysOfWeek', () => {
  // DATE = 2026-06-07 = domingo (day 0).
  const medLMX: MedForSchedule = {
    ...med,
    id: 'm-lmx',
    daysOfWeek: [1, 3, 5], // lunes, miércoles, viernes
  };

  it('no genera dosis cuando el día no está en daysOfWeek', () => {
    // 2026-06-07 = domingo (0), no está en [1,3,5]
    const doses = computeSchedule([medLMX], [], DATE, new Date('2026-06-07T12:00:00'));
    expect(doses).toHaveLength(0);
  });

  it('genera dosis cuando el día sí está en daysOfWeek', () => {
    // 2026-06-08 = lunes (1), sí está en [1,3,5]
    const monday = new Date('2026-06-08T00:00:00');
    const doses = computeSchedule([medLMX], [], monday, new Date('2026-06-08T12:00:00'));
    expect(doses).toHaveLength(2);
  });

  it('trata null como todos los días', () => {
    const medAllDays: MedForSchedule = { ...med, id: 'm-all', daysOfWeek: null };
    const doses = computeSchedule([medAllDays], [], DATE, new Date('2026-06-07T12:00:00'));
    expect(doses).toHaveLength(2);
  });

  it('trata undefined como todos los días', () => {
    const medNoDow: MedForSchedule = { ...med, id: 'm-undef' };
    const doses = computeSchedule([medNoDow], [], DATE, new Date('2026-06-07T12:00:00'));
    expect(doses).toHaveLength(2);
  });
});

describe('computeSchedule — PRN', () => {
  const medPrn: MedForSchedule = {
    ...med,
    id: 'm-prn',
    type: 'PRN',
    times: ['08:00'],
  };

  it('excluye de la agenda fija las medicaciones PRN', () => {
    const doses = computeSchedule([medPrn], [], DATE, new Date('2026-06-07T12:00:00'));
    expect(doses).toHaveLength(0);
  });

  it('las medicaciones no-PRN siguen apareciendo junto a las PRN', () => {
    const doses = computeSchedule([med, medPrn], [], DATE, new Date('2026-06-07T12:00:00'));
    // Solo las dosis del medicamento no-PRN
    expect(doses).toHaveLength(2);
    expect(doses.every((d) => d.medicationId !== medPrn.id)).toBe(true);
  });
});

describe('computePrn', () => {
  const medPrn: MedForSchedule = {
    ...med,
    id: 'm-prn',
    type: 'PRN',
    times: [],
  };
  const medCronico: MedForSchedule = { ...med, id: 'm-cron', type: 'CRONICO' };

  it('devuelve solo las medicaciones PRN activas', () => {
    const prn = computePrn([med, medPrn, medCronico], DATE);
    expect(prn).toHaveLength(1);
    expect(prn[0]?.id).toBe('m-prn');
  });

  it('excluye PRN fuera de periodo', () => {
    const ended: MedForSchedule = { ...medPrn, id: 'm-prn-ended', endDate: new Date('2026-06-05T23:59:59Z') };
    const prn = computePrn([ended], DATE);
    expect(prn).toHaveLength(0);
  });
});

// ── currentShift — función pura para el filtro de turno activo ───────────────
// UX-17: al abrir el MAR se pre-selecciona el turno activo según la hora del
// dispositivo. currentShift(date) delega en shiftOf, que ya tiene sus propios
// tests. Aquí verificamos los límites exactos (hora en punto y adyacentes).

describe('currentShift', () => {
  // Límites del turno de Mañana: [06:00, 14:00)
  it('devuelve MANANA a las 06:00 (inicio exacto del turno)', () => {
    expect(currentShift(new Date('2026-06-11T06:00:00'))).toBe('MANANA');
  });

  it('devuelve MANANA a las 08:30 (mitad del turno)', () => {
    expect(currentShift(new Date('2026-06-11T08:30:00'))).toBe('MANANA');
  });

  it('devuelve MANANA a las 13:59 (último minuto del turno)', () => {
    expect(currentShift(new Date('2026-06-11T13:59:00'))).toBe('MANANA');
  });

  // Límites del turno de Tarde: [14:00, 22:00)
  it('devuelve TARDE a las 14:00 (inicio exacto del turno)', () => {
    expect(currentShift(new Date('2026-06-11T14:00:00'))).toBe('TARDE');
  });

  it('devuelve TARDE a las 18:00 (mitad del turno)', () => {
    expect(currentShift(new Date('2026-06-11T18:00:00'))).toBe('TARDE');
  });

  it('devuelve TARDE a las 21:59 (último minuto del turno)', () => {
    expect(currentShift(new Date('2026-06-11T21:59:00'))).toBe('TARDE');
  });

  // Límites del turno de Noche: [22:00, 06:00)
  it('devuelve NOCHE a las 22:00 (inicio exacto del turno)', () => {
    expect(currentShift(new Date('2026-06-11T22:00:00'))).toBe('NOCHE');
  });

  it('devuelve NOCHE a las 00:00 (medianoche)', () => {
    expect(currentShift(new Date('2026-06-11T00:00:00'))).toBe('NOCHE');
  });

  it('devuelve NOCHE a las 03:30 (madrugada)', () => {
    expect(currentShift(new Date('2026-06-11T03:30:00'))).toBe('NOCHE');
  });

  it('devuelve NOCHE a las 05:59 (último minuto del turno nocturno)', () => {
    expect(currentShift(new Date('2026-06-11T05:59:00'))).toBe('NOCHE');
  });

  // Comprobación: el cambio de MANANA → TARDE es preciso en el límite
  it('cambia de MANANA a TARDE exactamente a las 14:00 (no antes)', () => {
    expect(currentShift(new Date('2026-06-11T13:59:59'))).toBe('MANANA');
    expect(currentShift(new Date('2026-06-11T14:00:00'))).toBe('TARDE');
  });

  // Comprobación: el cambio de TARDE → NOCHE es preciso en el límite
  it('cambia de TARDE a NOCHE exactamente a las 22:00 (no antes)', () => {
    expect(currentShift(new Date('2026-06-11T21:59:59'))).toBe('TARDE');
    expect(currentShift(new Date('2026-06-11T22:00:00'))).toBe('NOCHE');
  });
});

describe('doseAt / momentDoses (M-11)', () => {
  const medMoment: MedForSchedule = {
    ...med,
    momentDoses: [
      { time: '08:00', dose: '1 comp' },
      { time: '20:00', dose: '2 comp' },
    ],
  };

  it('doseAt usa la dosis de la franja si existe y cae a la base si no', () => {
    expect(doseAt(medMoment, '08:00')).toBe('1 comp');
    expect(doseAt(medMoment, '20:00')).toBe('2 comp');
    // Hora sin override en momentDoses → dosis base.
    expect(doseAt({ ...medMoment, times: ['08:00', '14:00', '20:00'] }, '14:00')).toBe('1g');
    // Sin momentDoses → siempre la base.
    expect(doseAt(med, '08:00')).toBe('1g');
  });

  it('computeSchedule refleja la dosis por franja en cada dosis', () => {
    const noon = new Date('2026-06-07T23:00:00');
    const doses = computeSchedule([medMoment], [], DATE, noon);
    const byTime = Object.fromEntries(doses.map((d) => [new Date(d.scheduledAt).getHours(), d.dose]));
    expect(byTime[8]).toBe('1 comp');
    expect(byTime[20]).toBe('2 comp');
  });
});
