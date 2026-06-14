/**
 * Tests unitarios para lib/ocupacion-forecast.ts
 *
 * Cubre:
 *   1. Máquina de estados (canTransition, allowedTransitions, isTerminalStatus)
 *   2. occupancyForecast: horizonte, bajas, admisiones, solapes, bordes
 */

import { describe, expect, it } from 'vitest';
import {
  canTransition,
  allowedTransitions,
  isTerminalStatus,
  occupancyForecast,
  ADMISSION_TRANSITIONS,
  type AdmissionStatus,
} from './ocupacion-forecast';

// ---------------------------------------------------------------------------
// 1. Máquina de estados
// ---------------------------------------------------------------------------

describe('ADMISSION_TRANSITIONS — grafo completo', () => {
  it('todos los estados tienen una entrada en el grafo', () => {
    const allStates: AdmissionStatus[] = [
      'LEAD', 'WAITLIST', 'EVALUATION', 'OFFERED', 'ADMITTED', 'REJECTED', 'WITHDRAWN',
    ];
    for (const s of allStates) {
      expect(ADMISSION_TRANSITIONS[s], `falta estado ${s}`).toBeDefined();
    }
  });

  it('los estados terminales no tienen transiciones', () => {
    expect(ADMISSION_TRANSITIONS.ADMITTED).toHaveLength(0);
    expect(ADMISSION_TRANSITIONS.REJECTED).toHaveLength(0);
    expect(ADMISSION_TRANSITIONS.WITHDRAWN).toHaveLength(0);
  });
});

describe('canTransition', () => {
  it('LEAD → WAITLIST es válida', () => {
    expect(canTransition('LEAD', 'WAITLIST')).toBe(true);
  });

  it('LEAD → ADMITTED no es válida (sin pasar por OFFERED)', () => {
    expect(canTransition('LEAD', 'ADMITTED')).toBe(false);
  });

  it('OFFERED → ADMITTED es válida', () => {
    expect(canTransition('OFFERED', 'ADMITTED')).toBe(true);
  });

  it('ADMITTED → cualquier otro estado no es válida', () => {
    const others: AdmissionStatus[] = ['LEAD', 'WAITLIST', 'EVALUATION', 'OFFERED', 'REJECTED', 'WITHDRAWN'];
    for (const s of others) {
      expect(canTransition('ADMITTED', s), `ADMITTED → ${s} debería ser false`).toBe(false);
    }
  });

  it('desde cualquier estado activo se puede rechazar', () => {
    const active: AdmissionStatus[] = ['LEAD', 'WAITLIST', 'EVALUATION', 'OFFERED'];
    for (const s of active) {
      expect(canTransition(s, 'REJECTED'), `${s} → REJECTED debería ser true`).toBe(true);
    }
  });

  it('desde cualquier estado activo se puede retirar', () => {
    const active: AdmissionStatus[] = ['LEAD', 'WAITLIST', 'EVALUATION', 'OFFERED'];
    for (const s of active) {
      expect(canTransition(s, 'WITHDRAWN'), `${s} → WITHDRAWN debería ser true`).toBe(true);
    }
  });

  it('se permite retroceder de EVALUATION a WAITLIST', () => {
    expect(canTransition('EVALUATION', 'WAITLIST')).toBe(true);
  });

  it('no se puede ir de REJECTED a LEAD (reactivar)', () => {
    expect(canTransition('REJECTED', 'LEAD')).toBe(false);
  });
});

describe('allowedTransitions', () => {
  it('devuelve los estados destino correctos para LEAD', () => {
    const allowed = allowedTransitions('LEAD');
    expect(allowed).toContain('WAITLIST');
    expect(allowed).toContain('REJECTED');
    expect(allowed).toContain('WITHDRAWN');
    expect(allowed).not.toContain('ADMITTED');
  });

  it('devuelve array vacío para estados terminales', () => {
    expect(allowedTransitions('ADMITTED')).toHaveLength(0);
    expect(allowedTransitions('REJECTED')).toHaveLength(0);
    expect(allowedTransitions('WITHDRAWN')).toHaveLength(0);
  });
});

describe('isTerminalStatus', () => {
  it('los estados terminales devuelven true', () => {
    expect(isTerminalStatus('ADMITTED')).toBe(true);
    expect(isTerminalStatus('REJECTED')).toBe(true);
    expect(isTerminalStatus('WITHDRAWN')).toBe(true);
  });

  it('los estados activos devuelven false', () => {
    const active: AdmissionStatus[] = ['LEAD', 'WAITLIST', 'EVALUATION', 'OFFERED'];
    for (const s of active) {
      expect(isTerminalStatus(s), `${s} no debería ser terminal`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. occupancyForecast
// ---------------------------------------------------------------------------

/** Fecha de referencia fija para tests (no depende de Date.now()). */
const REF = new Date('2026-07-01T00:00:00Z');
const d = (isoDate: string) => new Date(isoDate);

describe('occupancyForecast — sin eventos', () => {
  it('proyecta la ocupación constante si no hay bajas ni admisiones', () => {
    const result = occupancyForecast({
      totalBeds: 20,
      currentOccupied: 15,
      pendingDischarges: [],
      pendingAdmissions: [],
      horizonDays: 5,
      referenceDate: REF,
    });

    expect(result.totalBeds).toBe(20);
    expect(result.days).toHaveLength(5);
    for (const day of result.days) {
      expect(day.occupied).toBe(15);
      expect(day.free).toBe(5);
      expect(day.occupancyRate).toBeCloseTo(0.75);
      expect(day.discharges).toBe(0);
      expect(day.admissions).toBe(0);
    }
  });

  it('horizonDays=1 devuelve exactamente un día', () => {
    const result = occupancyForecast({
      totalBeds: 10,
      currentOccupied: 10,
      pendingDischarges: [],
      pendingAdmissions: [],
      horizonDays: 1,
      referenceDate: REF,
    });
    expect(result.days).toHaveLength(1);
  });
});

describe('occupancyForecast — bajas previstas', () => {
  it('una baja el día 3 reduce la ocupación a partir de ese día', () => {
    // REF = 2026-07-01 → índice 0 = 2026-07-01, índice 1 = 2026-07-02, índice 2 = 2026-07-03
    const result = occupancyForecast({
      totalBeds: 20,
      currentOccupied: 10,
      pendingDischarges: [
        { residentId: 'r1', dischargeDate: d('2026-07-03T00:00:00Z') },
      ],
      pendingAdmissions: [],
      horizonDays: 5,
      referenceDate: REF,
    });

    // Días 2026-07-01 y 2026-07-02: sin baja → 10 ocupadas
    expect(result.days[0]!.occupied).toBe(10); // 2026-07-01
    expect(result.days[1]!.occupied).toBe(10); // 2026-07-02

    // 2026-07-03 (índice 2): la baja se aplica → 9 ocupadas
    const day3 = result.days.find(
      (d) => d.date.toISOString().startsWith('2026-07-03'),
    );
    expect(day3).toBeDefined();
    expect(day3!.occupied).toBe(9);
    expect(day3!.discharges).toBe(1);

    // Los días posteriores también tienen 9
    const day4 = result.days.find(
      (d) => d.date.toISOString().startsWith('2026-07-04'),
    );
    expect(day4!.occupied).toBe(9);
  });

  it('múltiples bajas el mismo día se acumulan', () => {
    const result = occupancyForecast({
      totalBeds: 20,
      currentOccupied: 10,
      pendingDischarges: [
        { residentId: 'r1', dischargeDate: d('2026-07-02T00:00:00Z') },
        { residentId: 'r2', dischargeDate: d('2026-07-02T12:00:00Z') }, // misma día UTC
        { residentId: 'r3', dischargeDate: d('2026-07-02T23:59:00Z') },
      ],
      pendingAdmissions: [],
      horizonDays: 3,
      referenceDate: REF,
    });

    const day2 = result.days.find(
      (d) => d.date.toISOString().startsWith('2026-07-02'),
    );
    expect(day2!.discharges).toBe(3);
    expect(day2!.occupied).toBe(7);
  });

  it('la ocupación no cae por debajo de 0', () => {
    const result = occupancyForecast({
      totalBeds: 10,
      currentOccupied: 2,
      pendingDischarges: [
        { residentId: 'r1', dischargeDate: d('2026-07-01T00:00:00Z') },
        { residentId: 'r2', dischargeDate: d('2026-07-01T00:00:00Z') },
        { residentId: 'r3', dischargeDate: d('2026-07-01T00:00:00Z') }, // excede el actual
      ],
      pendingAdmissions: [],
      horizonDays: 2,
      referenceDate: REF,
    });

    expect(result.days[0]!.occupied).toBe(0); // pinza en 0
    expect(result.days[0]!.free).toBe(10);
  });
});

describe('occupancyForecast — admisiones previstas', () => {
  it('un ingreso previsto aumenta la ocupación a partir de ese día', () => {
    const result = occupancyForecast({
      totalBeds: 20,
      currentOccupied: 10,
      pendingDischarges: [],
      pendingAdmissions: [
        {
          requestId:    'req1',
          expectedDate: d('2026-07-05T00:00:00Z'),
          centerId:     'c1',
          unitId:       null,
        },
      ],
      horizonDays: 7,
      referenceDate: REF,
    });

    const day4 = result.days.find(
      (d) => d.date.toISOString().startsWith('2026-07-04'),
    );
    expect(day4!.occupied).toBe(10); // antes del ingreso

    const day5 = result.days.find(
      (d) => d.date.toISOString().startsWith('2026-07-05'),
    );
    expect(day5!.occupied).toBe(11);
    expect(day5!.admissions).toBe(1);
  });

  it('la ocupación no supera totalBeds', () => {
    const result = occupancyForecast({
      totalBeds: 10,
      currentOccupied: 10,
      pendingDischarges: [],
      pendingAdmissions: [
        {
          requestId:    'req1',
          expectedDate: d('2026-07-02T00:00:00Z'),
          centerId:     'c1',
          unitId:       null,
        },
      ],
      horizonDays: 3,
      referenceDate: REF,
    });

    const day2 = result.days.find(
      (d) => d.date.toISOString().startsWith('2026-07-02'),
    );
    expect(day2!.occupied).toBe(10); // pinza en totalBeds
    expect(day2!.free).toBe(0);
  });
});

describe('occupancyForecast — solapes (baja e ingreso el mismo día)', () => {
  it('baja e ingreso en el mismo día se aplican simultáneamente (neto neutro)', () => {
    const result = occupancyForecast({
      totalBeds: 20,
      currentOccupied: 10,
      pendingDischarges: [
        { residentId: 'r1', dischargeDate: d('2026-07-03T00:00:00Z') },
      ],
      pendingAdmissions: [
        {
          requestId:    'req1',
          expectedDate: d('2026-07-03T00:00:00Z'),
          centerId:     'c1',
          unitId:       null,
        },
      ],
      horizonDays: 4,
      referenceDate: REF,
    });

    const day3 = result.days.find(
      (d) => d.date.toISOString().startsWith('2026-07-03'),
    );
    // -1 baja +1 ingreso = neto 0 → ocupación sin cambio
    expect(day3!.occupied).toBe(10);
    expect(day3!.discharges).toBe(1);
    expect(day3!.admissions).toBe(1);
  });

  it('2 bajas y 3 ingresos el mismo día: neto +1', () => {
    const result = occupancyForecast({
      totalBeds: 20,
      currentOccupied: 10,
      pendingDischarges: [
        { residentId: 'r1', dischargeDate: d('2026-07-02T00:00:00Z') },
        { residentId: 'r2', dischargeDate: d('2026-07-02T00:00:00Z') },
      ],
      pendingAdmissions: [
        { requestId: 'req1', expectedDate: d('2026-07-02T00:00:00Z'), centerId: 'c1', unitId: null },
        { requestId: 'req2', expectedDate: d('2026-07-02T00:00:00Z'), centerId: 'c1', unitId: null },
        { requestId: 'req3', expectedDate: d('2026-07-02T00:00:00Z'), centerId: 'c1', unitId: null },
      ],
      horizonDays: 3,
      referenceDate: REF,
    });

    const day2 = result.days.find(
      (d) => d.date.toISOString().startsWith('2026-07-02'),
    );
    expect(day2!.occupied).toBe(11); // 10 - 2 + 3
    expect(day2!.discharges).toBe(2);
    expect(day2!.admissions).toBe(3);
  });
});

describe('occupancyForecast — horizonte 0 y casos borde', () => {
  it('horizonDays=0 devuelve array vacío', () => {
    const result = occupancyForecast({
      totalBeds: 10,
      currentOccupied: 5,
      pendingDischarges: [],
      pendingAdmissions: [],
      horizonDays: 0,
      referenceDate: REF,
    });
    expect(result.days).toHaveLength(0);
  });

  it('currentOccupied mayor que totalBeds queda pinzado', () => {
    // Situación anómala (nunca debería ocurrir, pero defensiva)
    const result = occupancyForecast({
      totalBeds: 10,
      currentOccupied: 15, // más que totalBeds
      pendingDischarges: [],
      pendingAdmissions: [],
      horizonDays: 2,
      referenceDate: REF,
    });
    // Se pinza al entrar
    expect(result.days[0]!.occupied).toBe(10);
  });

  it('totalBeds=0 → occupancyRate=0 y no divide por cero', () => {
    const result = occupancyForecast({
      totalBeds: 0,
      currentOccupied: 0,
      pendingDischarges: [],
      pendingAdmissions: [],
      horizonDays: 3,
      referenceDate: REF,
    });
    for (const day of result.days) {
      expect(day.occupancyRate).toBe(0);
    }
  });

  it('las fechas del resultado son UTC y consecutivas', () => {
    const result = occupancyForecast({
      totalBeds: 10,
      currentOccupied: 5,
      pendingDischarges: [],
      pendingAdmissions: [],
      horizonDays: 7,
      referenceDate: REF,
    });

    for (let i = 0; i < result.days.length; i++) {
      const expectedTs = REF.getTime() + i * 86_400_000;
      // El día UTC del result debe coincidir con el esperado
      const d = result.days[i]!.date;
      expect(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
      ).toBe(expectedTs);
    }
  });
});

describe('occupancyForecast — tasa de ocupación', () => {
  it('tasa de ocupación es 1 cuando está al 100%', () => {
    const result = occupancyForecast({
      totalBeds: 10,
      currentOccupied: 10,
      pendingDischarges: [],
      pendingAdmissions: [],
      horizonDays: 1,
      referenceDate: REF,
    });
    expect(result.days[0]!.occupancyRate).toBe(1);
  });

  it('tasa de ocupación es 0.5 al 50%', () => {
    const result = occupancyForecast({
      totalBeds: 10,
      currentOccupied: 5,
      pendingDischarges: [],
      pendingAdmissions: [],
      horizonDays: 1,
      referenceDate: REF,
    });
    expect(result.days[0]!.occupancyRate).toBeCloseTo(0.5);
  });

  it('la tasa refleja el cambio tras una baja', () => {
    const result = occupancyForecast({
      totalBeds: 10,
      currentOccupied: 10,
      pendingDischarges: [
        { residentId: 'r1', dischargeDate: d('2026-07-02T00:00:00Z') },
        { residentId: 'r2', dischargeDate: d('2026-07-02T00:00:00Z') },
      ],
      pendingAdmissions: [],
      horizonDays: 3,
      referenceDate: REF,
    });

    const day2 = result.days.find(
      (d) => d.date.toISOString().startsWith('2026-07-02'),
    );
    expect(day2!.occupancyRate).toBeCloseTo(0.8); // 8/10
  });
});
