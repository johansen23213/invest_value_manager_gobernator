import { describe, expect, it } from 'vitest';
import {
  slotsForDate,
  generateVisitCode,
  canCancel,
  canVisitTransition,
  isVisitInSlot,
  VISIT_TRANSITIONS,
  type SlotConfig,
  type VisitForSlot,
  type VisitStatus,
} from './visits';

// ---------------------------------------------------------------------------
// Helpers para construir fixtures
// ---------------------------------------------------------------------------

function makeSlot(overrides: Partial<SlotConfig> = {}): SlotConfig {
  return {
    id:          'slot-1',
    dayOfWeek:   6, // sábado
    startTime:   '11:00',
    endTime:     '12:00',
    capacity:    3,
    autoApprove: true,
    active:      true,
    ...overrides,
  };
}

/** Date con día de la semana y hora UTC fijados. */
function makeDate(dayOfWeek: number, hour = 11, min = 0): Date {
  // 2026-06-13 = sábado (dayOfWeek=6), 2026-06-14 = domingo, ...
  // Usar una fecha conocida: 2026-06-13 (sábado)
  const SAT_2026_06_13 = new Date('2026-06-13T00:00:00Z');
  // Ajustar al día de la semana deseado (sábado es base)
  const offset = (dayOfWeek - 6 + 7) % 7;
  const d = new Date(SAT_2026_06_13.getTime() + offset * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour, min, 0, 0);
  return d;
}

function makeVisit(status: VisitStatus, hour = 11, min = 0): VisitForSlot {
  return { scheduledAt: makeDate(6, hour, min), status };
}

// ---------------------------------------------------------------------------
// slotsForDate
// ---------------------------------------------------------------------------

describe('slotsForDate', () => {
  it('devuelve franja vacía cuando no hay visitas', () => {
    const slots = slotsForDate([makeSlot()], makeDate(6), []);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.available).toBe(3);
    expect(slots[0]!.occupied).toBe(0);
  });

  it('no incluye franjas inactivas', () => {
    const slots = slotsForDate([makeSlot({ active: false })], makeDate(6), []);
    expect(slots).toHaveLength(0);
  });

  it('no incluye franjas de otro día de la semana', () => {
    // slot es sábado (6), pedimos domingo (0)
    const slots = slotsForDate([makeSlot()], makeDate(0), []);
    expect(slots).toHaveLength(0);
  });

  it('cuenta visitas SOLICITADA/CONFIRMADA/EN_CURSO como ocupadas', () => {
    const consuming: VisitStatus[] = ['SOLICITADA', 'CONFIRMADA', 'EN_CURSO'];
    for (const status of consuming) {
      const slots = slotsForDate([makeSlot()], makeDate(6), [makeVisit(status)]);
      expect(slots[0]!.occupied, `status ${status} debe contar`).toBe(1);
    }
  });

  it('NO cuenta visitas CANCELADA/RECHAZADA/COMPLETADA/NO_SHOW', () => {
    const nonConsuming: VisitStatus[] = ['CANCELADA', 'RECHAZADA', 'COMPLETADA', 'NO_SHOW'];
    for (const status of nonConsuming) {
      const slots = slotsForDate([makeSlot()], makeDate(6), [makeVisit(status)]);
      expect(slots[0]!.occupied, `status ${status} NO debe contar`).toBe(0);
    }
  });

  it('disponibilidad = capacity - occupied', () => {
    const visits = [makeVisit('CONFIRMADA'), makeVisit('SOLICITADA')];
    const slots = slotsForDate([makeSlot({ capacity: 3 })], makeDate(6), visits);
    expect(slots[0]!.occupied).toBe(2);
    expect(slots[0]!.available).toBe(1);
  });

  it('disponibilidad mínima 0 aunque haya sobreocupación', () => {
    const visits = [makeVisit('CONFIRMADA'), makeVisit('CONFIRMADA'), makeVisit('CONFIRMADA'), makeVisit('CONFIRMADA')];
    const slots = slotsForDate([makeSlot({ capacity: 3 })], makeDate(6), visits);
    expect(slots[0]!.available).toBe(0);
  });

  it('no mezcla franjas de distinta hora', () => {
    const slot11 = makeSlot({ id: 'slot-11', startTime: '11:00', endTime: '12:00' });
    const slot17 = makeSlot({ id: 'slot-17', startTime: '17:00', endTime: '18:00' });
    const visitAt17 = makeVisit('CONFIRMADA', 17, 0);
    const slots = slotsForDate([slot11, slot17], makeDate(6), [visitAt17]);
    const s11 = slots.find((s) => s.slotConfigId === 'slot-11')!;
    const s17 = slots.find((s) => s.slotConfigId === 'slot-17')!;
    expect(s11.occupied).toBe(0);
    expect(s17.occupied).toBe(1);
  });

  it('devuelve múltiples franjas del mismo día', () => {
    const slot11 = makeSlot({ id: 'slot-11', startTime: '11:00', endTime: '12:00' });
    const slot17 = makeSlot({ id: 'slot-17', startTime: '17:00', endTime: '18:00' });
    const slots = slotsForDate([slot11, slot17], makeDate(6), []);
    expect(slots).toHaveLength(2);
  });

  it('expone autoApprove de la franja', () => {
    const slots = slotsForDate([makeSlot({ autoApprove: false })], makeDate(6), []);
    expect(slots[0]!.autoApprove).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateVisitCode
// ---------------------------------------------------------------------------

describe('generateVisitCode', () => {
  it('genera exactamente 8 caracteres', () => {
    expect(generateVisitCode()).toHaveLength(8);
  });

  it('solo usa el alfabeto BASE32 sin 0/O/1/I', () => {
    const ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
    for (let i = 0; i < 50; i++) {
      const code = generateVisitCode();
      expect(code, `código "${code}" contiene carácter inválido`).toMatch(ALPHABET);
    }
  });

  it('genera códigos distintos en llamadas sucesivas (probabilístico)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateVisitCode()));
    // Con 32^8 ≈ 10^12 combinaciones, 20 llamadas no deben colisionar
    expect(codes.size).toBe(20);
  });

  it('nunca contiene 0, O, 1 ni I', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateVisitCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });
});

// ---------------------------------------------------------------------------
// canCancel
// ---------------------------------------------------------------------------

describe('canCancel', () => {
  const future  = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const past    = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now     = new Date();

  it('SOLICITADA futura → cancelable', () => {
    expect(canCancel({ status: 'SOLICITADA', scheduledAt: future }, now)).toBe(true);
  });

  it('CONFIRMADA futura → cancelable', () => {
    expect(canCancel({ status: 'CONFIRMADA', scheduledAt: future }, now)).toBe(true);
  });

  it('SOLICITADA pasada → no cancelable', () => {
    expect(canCancel({ status: 'SOLICITADA', scheduledAt: past }, now)).toBe(false);
  });

  it('CONFIRMADA pasada → no cancelable', () => {
    expect(canCancel({ status: 'CONFIRMADA', scheduledAt: past }, now)).toBe(false);
  });

  it('EN_CURSO futura → no cancelable (ya en curso)', () => {
    expect(canCancel({ status: 'EN_CURSO', scheduledAt: future }, now)).toBe(false);
  });

  it('COMPLETADA futura → no cancelable', () => {
    expect(canCancel({ status: 'COMPLETADA', scheduledAt: future }, now)).toBe(false);
  });

  it('CANCELADA futura → no cancelable (ya cancelada)', () => {
    expect(canCancel({ status: 'CANCELADA', scheduledAt: future }, now)).toBe(false);
  });

  it('RECHAZADA → no cancelable', () => {
    expect(canCancel({ status: 'RECHAZADA', scheduledAt: future }, now)).toBe(false);
  });

  it('NO_SHOW → no cancelable', () => {
    expect(canCancel({ status: 'NO_SHOW', scheduledAt: future }, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// visitTransitions / canVisitTransition
// ---------------------------------------------------------------------------

describe('canVisitTransition', () => {
  // Transiciones válidas esperadas
  const validTransitions: [VisitStatus, VisitStatus][] = [
    ['SOLICITADA', 'CONFIRMADA'],
    ['SOLICITADA', 'RECHAZADA'],
    ['SOLICITADA', 'CANCELADA'],
    ['CONFIRMADA', 'CANCELADA'],
    ['CONFIRMADA', 'EN_CURSO'],
    ['CONFIRMADA', 'NO_SHOW'],
    ['EN_CURSO',   'COMPLETADA'],
  ];

  for (const [from, to] of validTransitions) {
    it(`${from} → ${to} es válida`, () => {
      expect(canVisitTransition(from, to)).toBe(true);
    });
  }

  // Transiciones inválidas
  const invalidTransitions: [VisitStatus, VisitStatus][] = [
    ['SOLICITADA', 'EN_CURSO'],    // debe pasar por CONFIRMADA
    ['SOLICITADA', 'COMPLETADA'],
    ['SOLICITADA', 'NO_SHOW'],
    ['CONFIRMADA', 'RECHAZADA'],   // ya confirmada, no puede rechazarse
    ['CONFIRMADA', 'COMPLETADA'],  // debe pasar por EN_CURSO
    ['EN_CURSO',   'CANCELADA'],   // en curso no puede cancelarse
    ['EN_CURSO',   'NO_SHOW'],
    ['COMPLETADA', 'EN_CURSO'],    // estado terminal
    ['RECHAZADA',  'SOLICITADA'],  // estado terminal
    ['CANCELADA',  'CONFIRMADA'],  // estado terminal
    ['NO_SHOW',    'COMPLETADA'],  // estado terminal
  ];

  for (const [from, to] of invalidTransitions) {
    it(`${from} → ${to} es inválida`, () => {
      expect(canVisitTransition(from, to)).toBe(false);
    });
  }

  it('estados terminales no tienen transiciones salientes', () => {
    const terminals: VisitStatus[] = ['RECHAZADA', 'CANCELADA', 'COMPLETADA', 'NO_SHOW'];
    for (const status of terminals) {
      expect(VISIT_TRANSITIONS[status]).toHaveLength(0);
    }
  });

  it('todos los estados del enum están representados en VISIT_TRANSITIONS', () => {
    const allStatuses: VisitStatus[] = [
      'SOLICITADA', 'CONFIRMADA', 'RECHAZADA', 'CANCELADA', 'EN_CURSO', 'COMPLETADA', 'NO_SHOW',
    ];
    for (const status of allStatuses) {
      expect(VISIT_TRANSITIONS).toHaveProperty(status);
    }
  });
});

// ---------------------------------------------------------------------------
// isVisitInSlot
// ---------------------------------------------------------------------------

describe('isVisitInSlot', () => {
  it('devuelve true si la fecha cae en el slot correcto', () => {
    const slot = makeSlot({ dayOfWeek: 6, startTime: '11:00', active: true });
    expect(isVisitInSlot(makeDate(6, 11, 0), slot)).toBe(true);
  });

  it('devuelve false si el día de la semana no coincide', () => {
    const slot = makeSlot({ dayOfWeek: 6, startTime: '11:00', active: true });
    expect(isVisitInSlot(makeDate(0, 11, 0), slot)).toBe(false); // domingo
  });

  it('devuelve false si la hora no coincide con startTime', () => {
    const slot = makeSlot({ dayOfWeek: 6, startTime: '11:00', active: true });
    expect(isVisitInSlot(makeDate(6, 17, 0), slot)).toBe(false);
  });

  it('devuelve false si el slot está inactivo', () => {
    const slot = makeSlot({ dayOfWeek: 6, startTime: '11:00', active: false });
    expect(isVisitInSlot(makeDate(6, 11, 0), slot)).toBe(false);
  });
});
