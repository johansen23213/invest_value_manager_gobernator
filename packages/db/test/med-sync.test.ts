import { describe, expect, it } from 'vitest';
import { mergeAdministration, type AdminEvent } from '../src/med-sync';

// Lógica pura del LWW por EVENTO del MAR (ADR-0012): sin BD.
// Una administración es un hecho atómico: gana el evento completo más reciente.

function event(overrides: Partial<AdminEvent> = {}): AdminEvent {
  return {
    status: 'ADMINISTRADO',
    notes: null,
    administeredAt: new Date('2026-06-11T08:05:00Z'),
    administeredById: 'user-a',
    recordedAt: new Date('2026-06-11T08:05:00Z'),
    ...overrides,
  };
}

describe('mergeAdministration — LWW por evento', () => {
  it('gana el cliente si su recordedAt es más reciente', () => {
    const server = event({ status: 'NO_ADMINISTRADO', recordedAt: new Date('2026-06-11T08:00:00Z') });
    const client = event({ status: 'ADMINISTRADO', recordedAt: new Date('2026-06-11T08:10:00Z') });
    const res = mergeAdministration(server, client);
    expect(res.winner).toBe('CLIENT');
    expect(res.event.status).toBe('ADMINISTRADO');
    expect(res.conflict).toBe(true); // divergen en status
  });

  it('gana el servidor si el cliente es más antiguo', () => {
    const server = event({ status: 'ADMINISTRADO', recordedAt: new Date('2026-06-11T09:00:00Z') });
    const client = event({ status: 'RECHAZADO', notes: 'No quiso', recordedAt: new Date('2026-06-11T08:30:00Z') });
    const res = mergeAdministration(server, client);
    expect(res.winner).toBe('SERVER');
    expect(res.event.status).toBe('ADMINISTRADO');
    expect(res.conflict).toBe(true);
  });

  it('empate de recordedAt -> gana el servidor (determinista, conservador)', () => {
    const at = new Date('2026-06-11T08:00:00Z');
    const server = event({ status: 'ADMINISTRADO', recordedAt: at });
    const client = event({ status: 'RECHAZADO', recordedAt: at });
    const res = mergeAdministration(server, client);
    expect(res.winner).toBe('SERVER');
    expect(res.event.status).toBe('ADMINISTRADO');
  });

  it('reenvío del mismo evento (retry de red) NO es conflicto', () => {
    const server = event({ recordedAt: new Date('2026-06-11T08:00:00Z') });
    const retry = event({ recordedAt: new Date('2026-06-11T08:00:00Z') });
    const res = mergeAdministration(server, retry);
    expect(res.conflict).toBe(false);
    expect(res.winner).toBe('SERVER'); // empate, sin cambios
  });

  it('mismo status con notas distintas SÍ es divergencia clínica', () => {
    const server = event({ status: 'NO_ADMINISTRADO', notes: 'Dormido' });
    const client = event({
      status: 'NO_ADMINISTRADO',
      notes: 'En el hospital',
      recordedAt: new Date('2026-06-11T08:10:00Z'),
    });
    const res = mergeAdministration(server, client);
    expect(res.conflict).toBe(true);
    expect(res.winner).toBe('CLIENT');
    expect(res.event.notes).toBe('En el hospital');
  });

  it('el evento ganador se conserva COMPLETO (no se mezclan campos)', () => {
    const server = event({
      status: 'NO_ADMINISTRADO',
      notes: 'Motivo servidor',
      administeredAt: null,
      administeredById: 'user-server',
      recordedAt: new Date('2026-06-11T08:00:00Z'),
    });
    const client = event({
      status: 'ADMINISTRADO',
      notes: null,
      administeredAt: new Date('2026-06-11T08:07:00Z'),
      administeredById: 'user-client',
      recordedAt: new Date('2026-06-11T08:09:00Z'),
    });
    const res = mergeAdministration(server, client);
    // Todo del cliente, nada del servidor (atómico).
    expect(res.event).toEqual(client);
  });

  it('notes undefined y null se tratan como equivalentes (sin conflicto espurio)', () => {
    const server = event({ notes: null });
    const client = event({ notes: null, recordedAt: new Date('2026-06-11T09:00:00Z') });
    const res = mergeAdministration(server, client);
    expect(res.conflict).toBe(false);
  });
});
