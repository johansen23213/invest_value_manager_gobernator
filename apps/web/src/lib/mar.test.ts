import { describe, expect, it } from 'vitest';
import { computeAlerts, computeSchedule, type MedForSchedule } from './mar';

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
