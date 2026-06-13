/**
 * Tests exhaustivos de la lógica pura de turnos (lib/shifts.ts).
 * Sin BD, sin efectos secundarios.
 *
 * Cubre:
 *   - coverageFor: todos los casos de infra-cobertura (RF-PRO-004)
 *   - isPresent: lógica de presencia por estado de asignación
 *   - shiftForHour / currentStaffShift: franja por hora
 *   - Casos límite: sin plantilla, plantilla inactiva, ausente con/sin sustituto,
 *     mix de estados, unitId null vs definido.
 */

import { describe, expect, it } from 'vitest';
import {
  coverageFor,
  isPresent,
  shiftForHour,
  currentStaffShift,
  dayStart,
  dayEnd,
  type ShiftTemplateForCoverage,
  type ShiftAssignmentForCoverage,
  type StaffShift,
} from './shifts';

// ---------------------------------------------------------------------------
// Helpers de test
// ---------------------------------------------------------------------------

function makeTemplate(
  overrides: Partial<ShiftTemplateForCoverage> = {},
): ShiftTemplateForCoverage {
  return {
    unitId:   null,
    shift:    'MANANA',
    minStaff: 2,
    active:   true,
    ...overrides,
  };
}

function makeAssignment(
  overrides: Partial<ShiftAssignmentForCoverage> = {},
): ShiftAssignmentForCoverage {
  return {
    shift:           'MANANA',
    unitId:          null,
    status:          'CONFIRMADO',
    substituteUserId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isPresent — lógica de presencia por estado
// ---------------------------------------------------------------------------

describe('isPresent', () => {
  it('PLANIFICADO → cuenta como presente', () => {
    expect(isPresent(makeAssignment({ status: 'PLANIFICADO' }))).toBe(true);
  });

  it('CONFIRMADO → cuenta como presente', () => {
    expect(isPresent(makeAssignment({ status: 'CONFIRMADO' }))).toBe(true);
  });

  it('SUSTITUIDO → cuenta como presente (el sustituto ocupa la plaza)', () => {
    expect(isPresent(makeAssignment({ status: 'SUSTITUIDO', substituteUserId: 'sub-1' }))).toBe(true);
  });

  it('SUSTITUIDO sin substituteUserId → aún cuenta (la asignación indica que hay sustituto implícito)', () => {
    // El status SUSTITUIDO implica que hay sustituto; el substituteUserId es el dato opcional
    expect(isPresent(makeAssignment({ status: 'SUSTITUIDO', substituteUserId: null }))).toBe(true);
  });

  it('AUSENTE sin sustituto → NO cuenta (plaza vacía)', () => {
    expect(isPresent(makeAssignment({ status: 'AUSENTE', substituteUserId: null }))).toBe(false);
  });

  it('AUSENTE con sustituto → cuenta (el sustituto cubre la plaza)', () => {
    expect(isPresent(makeAssignment({ status: 'AUSENTE', substituteUserId: 'sub-2' }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// coverageFor — casos principales
// ---------------------------------------------------------------------------

describe('coverageFor', () => {
  const templates = [makeTemplate({ shift: 'MANANA', minStaff: 2, unitId: null })];

  it('sin plantilla activa → noTemplate:true, understaffed:false, assigned:0, required:0', () => {
    const result = coverageFor([], [], 'MANANA', null);
    expect(result).toEqual({ assigned: 0, required: 0, understaffed: false, noTemplate: true });
  });

  it('plantilla inactiva → noTemplate:true', () => {
    const inactiveTemplate = makeTemplate({ active: false, shift: 'MANANA' });
    const result = coverageFor([inactiveTemplate], [], 'MANANA', null);
    expect(result.noTemplate).toBe(true);
  });

  it('sin asignaciones con plantilla activa → understaffed:true', () => {
    const result = coverageFor(templates, [], 'MANANA', null);
    expect(result).toEqual({ assigned: 0, required: 2, understaffed: true, noTemplate: false });
  });

  it('asignaciones suficientes → understaffed:false', () => {
    const assignments = [
      makeAssignment({ status: 'CONFIRMADO' }),
      makeAssignment({ status: 'PLANIFICADO' }),
    ];
    const result = coverageFor(templates, assignments, 'MANANA', null);
    expect(result).toEqual({ assigned: 2, required: 2, understaffed: false, noTemplate: false });
  });

  it('asignaciones insuficientes → understaffed:true', () => {
    const assignments = [makeAssignment({ status: 'CONFIRMADO' })]; // solo 1, min es 2
    const result = coverageFor(templates, assignments, 'MANANA', null);
    expect(result.understaffed).toBe(true);
    expect(result.assigned).toBe(1);
    expect(result.required).toBe(2);
  });

  it('AUSENTE sin sustituto no cuenta → plaza vacía detectada', () => {
    const assignments = [
      makeAssignment({ status: 'CONFIRMADO' }),
      makeAssignment({ status: 'AUSENTE', substituteUserId: null }),
    ];
    const result = coverageFor(templates, assignments, 'MANANA', null);
    expect(result.assigned).toBe(1); // solo 1 presente
    expect(result.understaffed).toBe(true);
  });

  it('AUSENTE con sustituto cuenta → plaza cubierta', () => {
    const assignments = [
      makeAssignment({ status: 'CONFIRMADO' }),
      makeAssignment({ status: 'AUSENTE', substituteUserId: 'sub-x' }),
    ];
    const result = coverageFor(templates, assignments, 'MANANA', null);
    expect(result.assigned).toBe(2); // ambos presentes (uno como sustituto)
    expect(result.understaffed).toBe(false);
  });

  it('SUSTITUIDO cuenta como presente', () => {
    const assignments = [
      makeAssignment({ status: 'CONFIRMADO' }),
      makeAssignment({ status: 'SUSTITUIDO' }),
    ];
    const result = coverageFor(templates, assignments, 'MANANA', null);
    expect(result.assigned).toBe(2);
    expect(result.understaffed).toBe(false);
  });

  it('mezcla de estados: 2 confirmados + 1 ausente sin sub + 1 ausente con sub → 3 presentes', () => {
    const templates3 = [makeTemplate({ minStaff: 3, unitId: null })];
    const assignments = [
      makeAssignment({ status: 'CONFIRMADO' }),
      makeAssignment({ status: 'CONFIRMADO' }),
      makeAssignment({ status: 'AUSENTE', substituteUserId: null }),  // no cuenta
      makeAssignment({ status: 'AUSENTE', substituteUserId: 'sub-z' }), // cuenta
    ];
    const result = coverageFor(templates3, assignments, 'MANANA', null);
    expect(result.assigned).toBe(3);
    expect(result.understaffed).toBe(false);
  });

  // --- Filtro por unitId ---

  it('con unitId: solo cuenta asignaciones de esa unidad', () => {
    const templatesUnit = [
      makeTemplate({ unitId: 'unit-1', shift: 'MANANA', minStaff: 2 }),
    ];
    const assignments = [
      makeAssignment({ unitId: 'unit-1', status: 'CONFIRMADO' }),
      makeAssignment({ unitId: 'unit-2', status: 'CONFIRMADO' }), // otra unidad — no cuenta
    ];
    const result = coverageFor(templatesUnit, assignments, 'MANANA', 'unit-1');
    expect(result.assigned).toBe(1);
    expect(result.required).toBe(2);
    expect(result.understaffed).toBe(true);
  });

  it('con unitId: usa plantilla de unidad específica primero', () => {
    const templatesMulti = [
      makeTemplate({ unitId: 'unit-1', shift: 'TARDE', minStaff: 3 }), // específica
      makeTemplate({ unitId: null,     shift: 'TARDE', minStaff: 1 }), // centro
    ];
    const assignments = [
      makeAssignment({ shift: 'TARDE', unitId: 'unit-1', status: 'CONFIRMADO' }),
      makeAssignment({ shift: 'TARDE', unitId: 'unit-1', status: 'CONFIRMADO' }),
    ];
    const result = coverageFor(templatesMulti, assignments, 'TARDE', 'unit-1');
    // Debe usar minStaff=3 (plantilla específica), no minStaff=1 (plantilla de centro)
    expect(result.required).toBe(3);
    expect(result.understaffed).toBe(true); // 2 presentes vs 3 requeridos
  });

  it('con unitId sin plantilla de unidad: usa plantilla de centro como fallback', () => {
    const templatesCenter = [
      makeTemplate({ unitId: null, shift: 'NOCHE', minStaff: 1 }), // plantilla de centro
    ];
    const assignments = [
      makeAssignment({ shift: 'NOCHE', unitId: 'unit-x', status: 'CONFIRMADO' }),
    ];
    const result = coverageFor(templatesCenter, assignments, 'NOCHE', 'unit-x');
    // Usa plantilla de centro como fallback
    expect(result.required).toBe(1);
    // Pero las asignaciones tienen unitId='unit-x' y se filtran por esa unidad
    expect(result.assigned).toBe(1);
    expect(result.understaffed).toBe(false);
  });

  it('sin plantilla para ese turno (plantilla de otro turno) → noTemplate:true', () => {
    const templates_ = [makeTemplate({ shift: 'TARDE', minStaff: 2 })];
    const result = coverageFor(templates_, [], 'MANANA', null); // preguntamos MANANA
    expect(result.noTemplate).toBe(true);
  });

  it('exactamente el mínimo → understaffed:false (límite exacto)', () => {
    const templates1 = [makeTemplate({ minStaff: 1, unitId: null })];
    const assignments = [makeAssignment({ status: 'CONFIRMADO' })];
    const result = coverageFor(templates1, assignments, 'MANANA', null);
    expect(result.understaffed).toBe(false);
    expect(result.assigned).toBe(1);
    expect(result.required).toBe(1);
  });

  it('más del mínimo → understaffed:false', () => {
    const templates1 = [makeTemplate({ minStaff: 1, unitId: null })];
    const assignments = [
      makeAssignment({ status: 'CONFIRMADO' }),
      makeAssignment({ status: 'PLANIFICADO' }),
    ];
    const result = coverageFor(templates1, assignments, 'MANANA', null);
    expect(result.understaffed).toBe(false);
    expect(result.assigned).toBe(2);
  });

  it('asignaciones de otro turno no cuentan para este turno', () => {
    const templates_ = [makeTemplate({ shift: 'MANANA', minStaff: 2 })];
    const assignments = [
      makeAssignment({ shift: 'TARDE', status: 'CONFIRMADO' }), // turno distinto
      makeAssignment({ shift: 'TARDE', status: 'CONFIRMADO' }), // turno distinto
    ];
    const result = coverageFor(templates_, assignments, 'MANANA', null);
    expect(result.assigned).toBe(0);
    expect(result.understaffed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shiftForHour — franja por hora
// ---------------------------------------------------------------------------

describe('shiftForHour', () => {
  const cases: Array<[number, StaffShift]> = [
    [0,  'NOCHE'],
    [1,  'NOCHE'],
    [5,  'NOCHE'],
    [6,  'MANANA'],
    [7,  'MANANA'],
    [13, 'MANANA'],
    [14, 'TARDE'],
    [15, 'TARDE'],
    [21, 'TARDE'],
    [22, 'NOCHE'],
    [23, 'NOCHE'],
  ];

  for (const [hour, expectedShift] of cases) {
    it(`hora ${hour}h → turno ${expectedShift}`, () => {
      expect(shiftForHour(hour)).toBe(expectedShift);
    });
  }
});

// ---------------------------------------------------------------------------
// currentStaffShift — turno actual
// ---------------------------------------------------------------------------

describe('currentStaffShift', () => {
  it('las 8h → MANANA', () => {
    const d = new Date('2026-06-13T08:00:00');
    expect(currentStaffShift(d)).toBe('MANANA');
  });

  it('las 16h → TARDE', () => {
    const d = new Date('2026-06-13T16:00:00');
    expect(currentStaffShift(d)).toBe('TARDE');
  });

  it('las 23h → NOCHE', () => {
    const d = new Date('2026-06-13T23:00:00');
    expect(currentStaffShift(d)).toBe('NOCHE');
  });
});

// ---------------------------------------------------------------------------
// dayStart / dayEnd — utilidades de día
// ---------------------------------------------------------------------------

describe('dayStart / dayEnd', () => {
  it('dayStart normaliza a 00:00:00.000 UTC', () => {
    const d = dayStart(new Date('2026-06-13T15:30:45.123Z'));
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });

  it('dayEnd normaliza a 23:59:59.999 UTC', () => {
    const d = dayEnd(new Date('2026-06-13T08:00:00.000Z'));
    expect(d.getUTCHours()).toBe(23);
    expect(d.getUTCMinutes()).toBe(59);
    expect(d.getUTCSeconds()).toBe(59);
    expect(d.getUTCMilliseconds()).toBe(999);
  });

  it('dayStart y dayEnd conservan el mismo día UTC', () => {
    const input = new Date('2026-06-13T12:00:00.000Z');
    const start = dayStart(input);
    const end   = dayEnd(input);
    expect(start.getUTCDate()).toBe(13);
    expect(end.getUTCDate()).toBe(13);
    expect(start.getUTCMonth()).toBe(5); // junio = mes 5
    expect(end.getUTCMonth()).toBe(5);
  });
});
