import { describe, expect, it } from 'vitest';
import {
  slotsForDate,
  generateVisitCode,
  canCancel,
  canVisitTransition,
  isVisitInSlot,
  isSameLocalDate,
  zonedParts,
  CENTER_TIMEZONE,
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

/**
 * Crea una Date cuya hora EN Europe/Madrid sea `hour:min` el día `dayOfWeek`.
 *
 * Antes usaba setUTCHours directamente, lo que daba horas UTC en el objeto pero
 * el módulo ahora trabaja siempre en Europe/Madrid: 11:00 UTC en verano (UTC+2)
 * es las 13:00 en Madrid, por lo que los slots de 11:00 no casaban.
 *
 * Estrategia: tomar medianoche UTC del día base y calcular el offset de Madrid
 * ese día con Intl, luego ajustar para que la hora resultante en Madrid sea la deseada.
 */
function makeDate(dayOfWeek: number, hour = 11, min = 0): Date {
  // 2026-06-13 = sábado (dayOfWeek=6), 2026-06-14 = domingo (dayOfWeek=0 mod7=1), ...
  const SAT_2026_06_13 = new Date('2026-06-13T00:00:00Z');
  // Ajustar al día de la semana deseado (sábado=6 es base; domingo=0 → offset=1)
  const offset = (dayOfWeek - 6 + 7) % 7;
  const base = new Date(SAT_2026_06_13.getTime() + offset * 24 * 60 * 60 * 1000);
  // base es medianoche UTC de ese día. Calculamos qué hora es en Madrid a medianoche UTC.
  const fmtHour = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    hour12: false,
  });
  const madridHourAtMidnightUTC = parseInt(
    fmtHour.formatToParts(base).find((p) => p.type === 'hour')!.value,
    10,
  );
  // madridHourAtMidnightUTC = cuántas horas ha avanzado Madrid respecto a UTC (p. ej. 2 en verano)
  // Para que sea `hour:min` en Madrid, UTC = hour - madridHourAtMidnightUTC
  const utcMs = base.getTime() + (hour - madridHourAtMidnightUTC) * 3_600_000 + min * 60_000;
  return new Date(utcMs);
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

// ---------------------------------------------------------------------------
// Tests de zona horaria (H-1) — medianoche Europe/Madrid vs servidor UTC
//
// Contexto: en verano Madrid = UTC+2. Una visita a las 23:30 en Madrid
// equivale a las 21:30Z. Una visita a las 00:30 del 13-jun en Madrid
// equivale a las 22:30Z del 12-jun.
//
// Todos los tests usan fechas fijas para ser deterministas: NO dependen de
// la TZ del runner (los helpers Intl son deterministas por diseño).
// ---------------------------------------------------------------------------

describe('zonedParts — determinismo con servidor UTC (H-1)', () => {
  // 2026-06-13 es sábado (dayOfWeek=6).
  // UTC+2 en verano (CEST): Madrid = UTC + 2 horas.
  // 2026-06-13T22:30:00Z = 2026-06-14T00:30 Europe/Madrid (domingo madrugada)
  const UTC_22_30_SAT = new Date('2026-06-13T22:30:00Z');
  // 2026-06-13T21:30:00Z = 2026-06-13T23:30 Europe/Madrid (sábado noche)
  const UTC_21_30_SAT = new Date('2026-06-13T21:30:00Z');

  it('22:30Z del sáb-13-jun es el 14-jun (domingo) en Europe/Madrid', () => {
    const parts = zonedParts(UTC_22_30_SAT, CENTER_TIMEZONE);
    // En Madrid ya es el domingo 14 de junio
    expect(parts.dateISO).toBe('2026-06-14');
    // Y son las 00:30
    expect(parts.timeHHMM).toBe('00:30');
  });

  it('21:30Z del sáb-13-jun es 23:30 del 13-jun en Europe/Madrid', () => {
    const parts = zonedParts(UTC_21_30_SAT, CENTER_TIMEZONE);
    expect(parts.dateISO).toBe('2026-06-13');
    expect(parts.timeHHMM).toBe('23:30');
  });

  it('weekday correcto en medianoche: 2026-06-14T00:30 Madrid es domingo (0)', () => {
    // 22:30Z del 13-jun = 00:30 del 14-jun en Madrid = domingo
    const parts = zonedParts(UTC_22_30_SAT, CENTER_TIMEZONE);
    expect(parts.weekday).toBe(0); // domingo
  });

  it('weekday correcto: 2026-06-13T21:30Z es sábado (6) en Madrid', () => {
    const parts = zonedParts(UTC_21_30_SAT, CENTER_TIMEZONE);
    expect(parts.weekday).toBe(6); // sábado
  });
});

describe('slotsForDate — franja nocturna Europe/Madrid (H-1)', () => {
  // Franja nocturna: sábado 23:30-00:30 (arranque a las 23:30 hora Madrid).
  // 2026-06-13 es sábado (verificado: getDay() en UTC no es fiable,
  // pero Intl con Europe/Madrid devuelve 'Sat' para ese día).
  const slotNocturno: SlotConfig = {
    id:          'slot-nocturno',
    dayOfWeek:   6,       // sábado
    startTime:   '23:30',
    endTime:     '00:30',
    capacity:    2,
    autoApprove: true,
    active:      true,
  };

  // Fecha de consulta: sábado 13-jun en Madrid = 10:00Z del 13-jun (UTC+2).
  // 10:00Z = 12:00 Madrid = sábado 13-jun → dayOfWeek = 6.
  const SAT_MADRID = new Date('2026-06-13T10:00:00Z');

  it('detecta la franja de las 23:30 Madrid en la fecha correcta (sábado)', () => {
    const slots = slotsForDate([slotNocturno], SAT_MADRID, []);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.startTime).toBe('23:30');
  });

  it('visita a las 23:30 Madrid (21:30Z del sáb-13-jun) ocupa la franja nocturna', () => {
    // 23:30 Madrid del sábado 13-jun = 21:30Z del 13-jun en verano (UTC+2)
    const visit: VisitForSlot = {
      scheduledAt: new Date('2026-06-13T21:30:00Z'),
      status:      'CONFIRMADA',
    };
    const slots = slotsForDate([slotNocturno], SAT_MADRID, [visit]);
    expect(slots[0]!.occupied).toBe(1);
    expect(slots[0]!.available).toBe(1);
  });

  it('visita a las 00:30 Madrid del dom-14-jun (22:30Z del 13-jun) NO ocupa la franja del sábado', () => {
    // 00:30 del 14-jun Madrid = 22:30Z del 13-jun → ya es domingo en Madrid
    // La franja es para el sábado; esta visita cae en domingo.
    const visit: VisitForSlot = {
      scheduledAt: new Date('2026-06-13T22:30:00Z'),
      status:      'CONFIRMADA',
    };
    const slots = slotsForDate([slotNocturno], SAT_MADRID, [visit]);
    // La visita es del domingo (00:30 Madrid del 14-jun), no del sábado → no ocupa
    expect(slots[0]!.occupied).toBe(0);
  });
});

describe('isVisitInSlot — medianoche Europe/Madrid (H-1)', () => {
  const slotNocturno: SlotConfig = {
    id:          'slot-noc',
    dayOfWeek:   6,       // sábado
    startTime:   '23:30',
    endTime:     '00:30',
    capacity:    2,
    autoApprove: true,
    active:      true,
  };

  it('visita a las 23:30 Madrid del sáb-13-jun (21:30Z) cae en el slot nocturno del sábado', () => {
    // 2026-06-13 es sábado; 21:30Z del 13-jun = 23:30 Madrid (UTC+2)
    expect(isVisitInSlot(new Date('2026-06-13T21:30:00Z'), slotNocturno)).toBe(true);
  });

  it('visita a las 22:30Z del 13-jun (00:30 Madrid del dom-14-jun) NO cae en el slot del sábado', () => {
    // 22:30Z del 13-jun = 00:30 del 14-jun en Madrid = domingo → no es el slot del sábado
    expect(isVisitInSlot(new Date('2026-06-13T22:30:00Z'), slotNocturno)).toBe(false);
  });
});

describe('isSameLocalDate — comparación en Europe/Madrid (H-1)', () => {
  // 2026-06-13 es sábado. UTC+2 en verano (CEST).
  // 22:30Z del 13-jun = 00:30 del 14-jun en Madrid
  // 23:00Z del 13-jun = 01:00 del 14-jun en Madrid
  it('22:30Z y 23:00Z del sáb-13-jun son el mismo día en Madrid (ambos son dom-14-jun)', () => {
    const a = new Date('2026-06-13T22:30:00Z'); // 00:30 del 14-jun Madrid
    const b = new Date('2026-06-13T23:00:00Z'); // 01:00 del 14-jun Madrid
    // Ambas son 14-jun en Madrid
    expect(isSameLocalDate(a, b, CENTER_TIMEZONE)).toBe(true);
  });

  it('21:30Z del sáb-13-jun (23:30 Madrid) y 22:30Z del sáb-13-jun (00:30 Madrid dom-14) son días distintos', () => {
    const a = new Date('2026-06-13T21:30:00Z'); // 23:30 del 13-jun Madrid (sábado)
    const b = new Date('2026-06-13T22:30:00Z'); // 00:30 del 14-jun Madrid (domingo)
    expect(isSameLocalDate(a, b, CENTER_TIMEZONE)).toBe(false);
  });

  it('misma fecha UTC pero diferente día en Madrid → false', () => {
    // scheduledAt = 22:30Z del 13-jun (= 00:30 del 14 en Madrid = domingo)
    // now          = 20:00Z del 13-jun (= 22:00 del 13 en Madrid = sábado)
    const scheduledAt = new Date('2026-06-13T22:30:00Z');
    const now          = new Date('2026-06-13T20:00:00Z');
    // scheduledAt es el 14-jun en Madrid (domingo); now es el 13-jun (sábado)
    expect(isSameLocalDate(scheduledAt, now, CENTER_TIMEZONE)).toBe(false);
  });

  it('QR de visita nocturna (00:30 Madrid = 22:30Z del 13) debe pasar check-in el 14-jun Madrid', () => {
    // Simula el caso del informe: visita a las 00:30 del 14-jun Madrid
    // y "ahora" son las 22:45Z del 13-jun (= 00:45 del 14-jun Madrid).
    // Con UTC: scheduledAt es "2026-06-13", now es "2026-06-13" → parecerían iguales
    // pero en Madrid scheduledAt es el 14-jun y now también es el 14-jun → correcto.
    // El caso CRÍTICO era el opuesto: scheduledAt UTC distinto a now UTC pero
    // mismo día en Madrid. Aquí demostramos que la comparación en Madrid es correcta.
    const scheduledAt = new Date('2026-06-13T22:30:00Z'); // 00:30 del 14-jun Madrid
    const nowMadrid14 = new Date('2026-06-13T23:00:00Z'); // 01:00 del 14-jun Madrid
    expect(isSameLocalDate(scheduledAt, nowMadrid14, CENTER_TIMEZONE)).toBe(true);
  });

  it('bug original: scheduledAt UTC "2026-06-13" y now UTC "2026-06-14" son días distintos en ambas TZ', () => {
    // Este es el caso donde el bug UTC daba resultado incorrecto:
    // scheduledAt = 22:30Z del 13-jun = 00:30 del 14-jun Madrid
    // now         = 00:30Z del 14-jun = 02:30 del 14-jun Madrid
    // UTC: distintos ("2026-06-13" vs "2026-06-14") ← bug: habría rechazado con UTC
    // Madrid: iguales (ambos son el 14-jun) ← correcto
    const scheduledAt = new Date('2026-06-13T22:30:00Z'); // 00:30 del 14-jun Madrid
    const now          = new Date('2026-06-14T00:30:00Z'); // 02:30 del 14-jun Madrid
    // Con UTC serían días distintos pero en Madrid son el mismo día
    expect(isSameLocalDate(scheduledAt, now, CENTER_TIMEZONE)).toBe(true);
  });
});
