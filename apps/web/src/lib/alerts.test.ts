import { describe, expect, it } from 'vitest';
import { buildAlertFeed, countBySeverity, isHighSeverityIncident } from './alerts';

describe('isHighSeverityIncident', () => {
  it('marca alta una caída o lesión', () => {
    expect(isHighSeverityIncident('Se ha caído en el baño')).toBe(true);
    expect(isHighSeverityIncident('Herida en el brazo')).toBe(true);
    expect(isHighSeverityIncident('Ha sangrado por la nariz')).toBe(true);
    expect(isHighSeverityIncident('Posible fractura de cadera')).toBe(true);
  });

  it('marca media una incidencia sin señales de gravedad', () => {
    expect(isHighSeverityIncident('Cambio de humor durante la tarde')).toBe(false);
    expect(isHighSeverityIncident('Rechazó la actividad de grupo')).toBe(false);
  });
});

describe('buildAlertFeed', () => {
  const medAlert = {
    medicationId: 'm1',
    medicationName: 'Sintrom',
    dose: '4 mg',
    scheduledAt: '2026-06-10T08:00:00.000Z',
    residentId: 'p1',
    residentName: 'María García',
  };

  it('convierte la medicación no administrada en alerta de severidad alta', () => {
    const feed = buildAlertFeed({ medicationAlerts: [medAlert], incidents: [] });
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({
      kind: 'MEDICATION',
      severity: 'high',
      residentName: 'María García',
      detail: 'Sintrom · 4 mg',
      at: medAlert.scheduledAt,
    });
  });

  it('prioriza las severidades altas y, dentro de cada una, lo más reciente primero', () => {
    const feed = buildAlertFeed({
      medicationAlerts: [{ ...medAlert, scheduledAt: '2026-06-10T08:00:00.000Z' }],
      incidents: [
        { id: 'i-fall', description: 'Se ha caído', recordedAt: '2026-06-10T07:00:00.000Z', residentId: 'p2', residentName: 'Joan' },
        { id: 'i-mood', description: 'Cambio de ánimo', recordedAt: '2026-06-10T12:00:00.000Z', residentId: 'p3', residentName: 'Pere' },
      ],
    });
    // Dos altas (med 08:00, caída 07:00) antes que la media (ánimo 12:00).
    expect(feed.map((a) => a.id)).toEqual(['med:m1:2026-06-10T08:00:00.000Z', 'inc:i-fall', 'inc:i-mood']);
    expect(feed.map((a) => a.severity)).toEqual(['high', 'high', 'medium']);
  });

  it('devuelve un feed vacío sin señales', () => {
    expect(buildAlertFeed({ medicationAlerts: [], incidents: [] })).toEqual([]);
  });
});

describe('countBySeverity', () => {
  it('cuenta altas, medias y total', () => {
    const feed = buildAlertFeed({
      medicationAlerts: [
        { medicationId: 'm1', medicationName: 'A', dose: '1', scheduledAt: '2026-06-10T08:00:00.000Z' },
        { medicationId: 'm2', medicationName: 'B', dose: '1', scheduledAt: '2026-06-10T09:00:00.000Z' },
      ],
      incidents: [{ id: 'i1', description: 'Rechazó la cena', recordedAt: '2026-06-10T20:00:00.000Z' }],
    });
    expect(countBySeverity(feed)).toEqual({ high: 2, medium: 1, total: 3 });
  });
});
