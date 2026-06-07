import { describe, expect, it } from 'vitest';
import {
  computeAlerts,
  computeSchedule,
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
