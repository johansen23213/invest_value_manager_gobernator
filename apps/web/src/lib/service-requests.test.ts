import { describe, expect, it } from 'vitest';
import {
  slaHoursFor,
  slaDueAt,
  isOverdue,
  canTransition,
  type SRCategory,
  type SRPriority,
  type SRStatus,
} from './service-requests';

// ---------------------------------------------------------------------------
// slaHoursFor
// ---------------------------------------------------------------------------

describe('slaHoursFor', () => {
  it('URGENTE → 4h independientemente de la categoría', () => {
    const cats: SRCategory[] = [
      'ADMINISTRACION', 'DOCUMENTACION', 'VISITAS', 'ACTIVIDADES',
      'MANTENIMIENTO', 'ALIMENTACION', 'COMUNICACION', 'OBJETOS_PERSONALES',
      'INCIDENCIA_APP', 'OTRA',
    ];
    for (const cat of cats) {
      expect(slaHoursFor(cat, 'URGENTE')).toBe(4);
    }
  });

  it('ALTA → 24h', () => {
    expect(slaHoursFor('MANTENIMIENTO', 'ALTA')).toBe(24);
  });

  it('NORMAL → 72h', () => {
    expect(slaHoursFor('ADMINISTRACION', 'NORMAL')).toBe(72);
  });

  it('BAJA → 120h', () => {
    expect(slaHoursFor('DOCUMENTACION', 'BAJA')).toBe(120);
  });

  it('cada prioridad tiene un SLA distinto y creciente', () => {
    const priorities: SRPriority[] = ['URGENTE', 'ALTA', 'NORMAL', 'BAJA'];
    const hours = priorities.map((p) => slaHoursFor('OTRA', p));
    // Verificar orden estrictamente creciente
    for (let i = 0; i < hours.length - 1; i++) {
      expect(hours[i]!).toBeLessThan(hours[i + 1]!);
    }
  });
});

// ---------------------------------------------------------------------------
// slaDueAt
// ---------------------------------------------------------------------------

describe('slaDueAt', () => {
  it('devuelve createdAt + horas de SLA exactos', () => {
    const base = new Date('2026-06-12T10:00:00.000Z');
    const due = slaDueAt(base, 'ADMINISTRACION', 'URGENTE');
    expect(due.getTime()).toBe(base.getTime() + 4 * 60 * 60 * 1000);
  });

  it('BAJA con createdAt en medianoche → 5 días después', () => {
    const base = new Date('2026-06-12T00:00:00.000Z');
    const due = slaDueAt(base, 'VISITAS', 'BAJA');
    const expected = new Date('2026-06-17T00:00:00.000Z');
    expect(due.getTime()).toBe(expected.getTime());
  });

  it('es una función pura: misma entrada, misma salida', () => {
    const base = new Date('2026-06-12T08:30:00.000Z');
    const due1 = slaDueAt(base, 'MANTENIMIENTO', 'ALTA');
    const due2 = slaDueAt(base, 'MANTENIMIENTO', 'ALTA');
    expect(due1.getTime()).toBe(due2.getTime());
  });
});

// ---------------------------------------------------------------------------
// isOverdue
// ---------------------------------------------------------------------------

describe('isOverdue', () => {
  it('devuelve false si slaDueAt es null', () => {
    expect(isOverdue({ slaDueAt: null, status: 'RECIBIDA' }, new Date())).toBe(false);
  });

  it('devuelve false si now < slaDueAt (dentro de SLA)', () => {
    const due = new Date('2026-06-12T20:00:00.000Z');
    const now = new Date('2026-06-12T10:00:00.000Z');
    expect(isOverdue({ slaDueAt: due, status: 'EN_CURSO' }, now)).toBe(false);
  });

  it('devuelve true si now > slaDueAt y status activo', () => {
    const due = new Date('2026-06-12T08:00:00.000Z');
    const now = new Date('2026-06-12T20:00:00.000Z');
    expect(isOverdue({ slaDueAt: due, status: 'EN_CURSO' }, now)).toBe(true);
  });

  it('devuelve false si status RESUELTA aunque esté fuera de SLA', () => {
    const due = new Date('2026-06-01T00:00:00.000Z');
    const now = new Date('2026-06-12T00:00:00.000Z');
    expect(isOverdue({ slaDueAt: due, status: 'RESUELTA' }, now)).toBe(false);
  });

  it('devuelve false si status CERRADA aunque esté fuera de SLA', () => {
    const due = new Date('2026-06-01T00:00:00.000Z');
    const now = new Date('2026-06-12T00:00:00.000Z');
    expect(isOverdue({ slaDueAt: due, status: 'CERRADA' }, now)).toBe(false);
  });

  it('devuelve true para PENDIENTE_INFO fuera de SLA', () => {
    const due = new Date('2026-06-01T00:00:00.000Z');
    const now = new Date('2026-06-12T00:00:00.000Z');
    expect(isOverdue({ slaDueAt: due, status: 'PENDIENTE_INFO' }, now)).toBe(true);
  });

  it('exactamente en la fecha límite: no está vencido (now === due → false)', () => {
    const due = new Date('2026-06-12T12:00:00.000Z');
    const now = new Date('2026-06-12T12:00:00.000Z');
    // now > due es falso cuando son iguales
    expect(isOverdue({ slaDueAt: due, status: 'RECIBIDA' }, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canTransition — tests exhaustivos de la máquina de estados
// ---------------------------------------------------------------------------

describe('canTransition', () => {

  // --- Transiciones VÁLIDAS ---

  it.each([
    // desde RECIBIDA
    ['RECIBIDA', 'ASIGNADA'],
    ['RECIBIDA', 'EN_CURSO'],
    ['RECIBIDA', 'CERRADA'],
    // desde ASIGNADA
    ['ASIGNADA', 'EN_CURSO'],
    ['ASIGNADA', 'PENDIENTE_INFO'],
    ['ASIGNADA', 'RESUELTA'],
    ['ASIGNADA', 'CERRADA'],
    // desde EN_CURSO
    ['EN_CURSO', 'PENDIENTE_INFO'],
    ['EN_CURSO', 'RESUELTA'],
    ['EN_CURSO', 'CERRADA'],
    // desde PENDIENTE_INFO
    ['PENDIENTE_INFO', 'EN_CURSO'],
    ['PENDIENTE_INFO', 'RESUELTA'],
    ['PENDIENTE_INFO', 'CERRADA'],
    // desde RESUELTA
    ['RESUELTA', 'CERRADA'],
    ['RESUELTA', 'REABIERTA'],
    // desde CERRADA
    ['CERRADA', 'REABIERTA'],
    // desde REABIERTA
    ['REABIERTA', 'ASIGNADA'],
    ['REABIERTA', 'EN_CURSO'],
    ['REABIERTA', 'CERRADA'],
  ] as [SRStatus, SRStatus][])('válida: %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  // --- Transiciones INVÁLIDAS ---

  it.each([
    // autoloop
    ['RECIBIDA', 'RECIBIDA'],
    ['EN_CURSO', 'EN_CURSO'],
    // hacia atrás sin REABIERTA
    ['ASIGNADA', 'RECIBIDA'],
    ['EN_CURSO', 'RECIBIDA'],
    ['EN_CURSO', 'ASIGNADA'],
    ['RESUELTA', 'EN_CURSO'],
    ['RESUELTA', 'RECIBIDA'],
    ['CERRADA', 'EN_CURSO'],
    ['CERRADA', 'RESUELTA'],
    // saltos no admitidos
    ['RECIBIDA', 'RESUELTA'],
    ['RECIBIDA', 'PENDIENTE_INFO'],
    ['RECIBIDA', 'REABIERTA'],
    ['ASIGNADA', 'RECIBIDA'],
    ['REABIERTA', 'RECIBIDA'],
    ['REABIERTA', 'PENDIENTE_INFO'],
    ['REABIERTA', 'RESUELTA'],
    // desde terminal sin REABIERTA
    ['CERRADA', 'ASIGNADA'],
    ['CERRADA', 'PENDIENTE_INFO'],
  ] as [SRStatus, SRStatus][])('inválida: %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('cubre todas las transiciones válidas documentadas (regresión)', () => {
    // Verificamos que el número total de transiciones válidas es 19
    const allStatuses: SRStatus[] = [
      'RECIBIDA', 'ASIGNADA', 'EN_CURSO', 'PENDIENTE_INFO',
      'RESUELTA', 'CERRADA', 'REABIERTA',
    ];
    let count = 0;
    for (const from of allStatuses) {
      for (const to of allStatuses) {
        if (canTransition(from, to)) count++;
      }
    }
    expect(count).toBe(19);
  });
});
