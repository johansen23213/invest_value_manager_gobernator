/**
 * Tests unitarios de lib/facturacion.ts.
 *
 * Cubre:
 *   - Redondeo HALF_UP de importes
 *   - Cálculo de línea (base, IVA, total)
 *   - IVA exento vs sujeto
 *   - Totales de factura con múltiples líneas
 *   - Cálculo de copago privado
 *   - Prorrateo mensual por días de estancia
 *   - stayDaysInPeriod: casos de alta/baja a mitad de mes
 *   - getDaysInMonth: años bisiestos y normales
 */

import { describe, it, expect } from 'vitest';
import {
  roundEur,
  calcLine,
  calcInvoiceTotals,
  calcPrivateAmount,
  prorateMonthly,
  stayDaysInPeriod,
  getDaysInMonth,
  firstDayOfMonth,
  lastDayOfMonth,
} from './facturacion';

// ---------------------------------------------------------------------------
// roundEur
// ---------------------------------------------------------------------------

describe('roundEur', () => {
  it('redondea a 2 decimales', () => {
    // Valores exactamente representables en IEEE 754 para evitar sorpresas
    // de punto flotante. La función usa Math.round que es HALF_UP para positivos.
    expect(roundEur(1.234)).toBe(1.23);
    expect(roundEur(1.235)).toBe(1.24);  // 1.235 * 100 = 123.5 → Math.round → 124
    expect(roundEur(1.004)).toBe(1.00);
    expect(roundEur(1.995)).toBe(2.00);
    expect(roundEur(0.1 + 0.2)).toBe(0.30);  // evita 0.30000000000000004
  });

  it('maneja enteros sin cambio', () => {
    expect(roundEur(100)).toBe(100);
    expect(roundEur(0)).toBe(0);
  });

  it('maneja valores negativos (no deberían ocurrir en facturación, pero robustez)', () => {
    expect(roundEur(-1.005)).toBe(-1.00);  // Math.round negativo
  });
});

// ---------------------------------------------------------------------------
// calcLine
// ---------------------------------------------------------------------------

describe('calcLine', () => {
  it('calcula línea sin IVA (exento)', () => {
    const result = calcLine({
      description: 'Cuota mensual',
      quantity: 1,
      unitPrice: 1500,
      vatPct: 21,
      vatExempt: true,
    });
    expect(result.lineBase).toBe(1500);
    expect(result.lineVat).toBe(0);      // exento: IVA siempre 0
    expect(result.lineTotal).toBe(1500);
  });

  it('calcula línea con IVA (sujeto)', () => {
    const result = calcLine({
      description: 'Servicio con IVA',
      quantity: 1,
      unitPrice: 100,
      vatPct: 21,
      vatExempt: false,
    });
    expect(result.lineBase).toBe(100);
    expect(result.lineVat).toBe(21);
    expect(result.lineTotal).toBe(121);
  });

  it('calcula línea con IVA reducido (10%)', () => {
    const result = calcLine({
      description: 'Servicio IVA reducido',
      quantity: 1,
      unitPrice: 200,
      vatPct: 10,
      vatExempt: false,
    });
    expect(result.lineBase).toBe(200);
    expect(result.lineVat).toBe(20);
    expect(result.lineTotal).toBe(220);
  });

  it('calcula correctamente con cantidad decimal (prorrateo en días)', () => {
    // 15 días de 31 días → prorrateo parcial
    const result = calcLine({
      description: 'Cuota prorrateada',
      quantity: 15,
      unitPrice: 50,          // 50 EUR/día
      vatPct: 0,
      vatExempt: true,
    });
    expect(result.lineBase).toBe(750);
    expect(result.lineVat).toBe(0);
    expect(result.lineTotal).toBe(750);
  });

  it('redondea correctamente la base (price con decimales)', () => {
    // 31 días × 48.387... EUR/día = 1500.00 (si el precio es 1500/31)
    const unitPrice = 1500 / 31;  // ≈ 48.387...
    const result = calcLine({
      description: 'Test redondeo',
      quantity: 31,
      unitPrice,
      vatPct: 0,
      vatExempt: true,
    });
    // El resultado debería ser el redondeo de 31 × (1500/31)
    expect(result.lineBase).toBeCloseTo(1500, 0);
  });

  it('propaga campos de entrada al resultado', () => {
    const input = {
      description: 'Test',
      quantity: 2,
      unitPrice: 50,
      vatPct: 21,
      vatExempt: false,
      sortOrder: 5,
      tariffId: 'tariff-123',
    };
    const result = calcLine(input);
    expect(result.description).toBe('Test');
    expect(result.sortOrder).toBe(5);
    expect(result.tariffId).toBe('tariff-123');
  });
});

// ---------------------------------------------------------------------------
// calcInvoiceTotals
// ---------------------------------------------------------------------------

describe('calcInvoiceTotals', () => {
  it('calcula totales con líneas mixtas (exento y sujeto)', () => {
    const result = calcInvoiceTotals([
      {
        description: 'Cuota mensual (exento)',
        quantity: 1,
        unitPrice: 1500,
        vatPct: 21,
        vatExempt: true,
      },
      {
        description: 'Material sanitario (IVA 21%)',
        quantity: 2,
        unitPrice: 50,
        vatPct: 21,
        vatExempt: false,
      },
    ]);

    expect(result.baseAmount).toBe(1600);      // 1500 + 100
    expect(result.vatAmount).toBe(21);         // 0 + 21
    expect(result.totalAmount).toBe(1621);     // 1600 + 21
    expect(result.lines).toHaveLength(2);
  });

  it('devuelve cero para array vacío', () => {
    const result = calcInvoiceTotals([]);
    expect(result.baseAmount).toBe(0);
    expect(result.vatAmount).toBe(0);
    expect(result.totalAmount).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it('suma correctamente muchas líneas (precisión de céntimos)', () => {
    // 10 líneas de 0.1 EUR → deberían sumar exactamente 1.00 EUR
    const lines = Array.from({ length: 10 }, (_, i) => ({
      description: `Línea ${i + 1}`,
      quantity: 1,
      unitPrice: 0.1,
      vatPct: 0,
      vatExempt: true,
    }));
    const result = calcInvoiceTotals(lines);
    expect(result.baseAmount).toBe(1.00);
    expect(result.vatAmount).toBe(0);
    expect(result.totalAmount).toBe(1.00);
  });

  it('calcula IVA con tipos distintos por línea', () => {
    const result = calcInvoiceTotals([
      { description: 'A', quantity: 1, unitPrice: 100, vatPct: 21, vatExempt: false },
      { description: 'B', quantity: 1, unitPrice: 100, vatPct: 10, vatExempt: false },
      { description: 'C', quantity: 1, unitPrice: 100, vatPct: 4,  vatExempt: false },
    ]);
    expect(result.baseAmount).toBe(300);
    expect(result.vatAmount).toBe(35);   // 21 + 10 + 4
    expect(result.totalAmount).toBe(335);
  });
});

// ---------------------------------------------------------------------------
// calcPrivateAmount
// ---------------------------------------------------------------------------

describe('calcPrivateAmount', () => {
  it('sin aportación pública → paga el 100% el privado', () => {
    expect(calcPrivateAmount(1500, 0)).toBe(1500);
  });

  it('100% aportación pública → el privado paga 0', () => {
    expect(calcPrivateAmount(1500, 100)).toBe(0);
  });

  it('50% aportación pública → el privado paga 750', () => {
    expect(calcPrivateAmount(1500, 50)).toBe(750);
  });

  it('calcula copago con porcentajes típicos de concertada', () => {
    // PVS: la CCAA aporta ~70%, el usuario un copago del ~30%
    expect(calcPrivateAmount(1500, 70)).toBe(450);
  });

  it('redondea correctamente a 2 decimales', () => {
    // 1000 × (1 - 33.33/100) = 1000 × 0.6667 = 666.70
    expect(calcPrivateAmount(1000, 33.33)).toBe(666.70);
  });

  it('lanza RangeError si publicCopayPct < 0', () => {
    expect(() => calcPrivateAmount(1500, -1)).toThrow(RangeError);
  });

  it('lanza RangeError si publicCopayPct > 100', () => {
    expect(() => calcPrivateAmount(1500, 101)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// getDaysInMonth
// ---------------------------------------------------------------------------

describe('getDaysInMonth', () => {
  it('enero tiene 31 días', () => expect(getDaysInMonth(2026, 0)).toBe(31));
  it('febrero 2026 tiene 28 días (no bisiesto)', () => expect(getDaysInMonth(2026, 1)).toBe(28));
  it('febrero 2024 tiene 29 días (bisiesto)', () => expect(getDaysInMonth(2024, 1)).toBe(29));
  it('abril tiene 30 días', () => expect(getDaysInMonth(2026, 3)).toBe(30));
  it('diciembre tiene 31 días', () => expect(getDaysInMonth(2026, 11)).toBe(31));
});

// ---------------------------------------------------------------------------
// firstDayOfMonth / lastDayOfMonth
// ---------------------------------------------------------------------------

describe('firstDayOfMonth / lastDayOfMonth', () => {
  it('firstDayOfMonth devuelve el día 1 del mes', () => {
    const d = firstDayOfMonth(2026, 5);  // junio 2026
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCFullYear()).toBe(2026);
  });

  it('lastDayOfMonth devuelve el último día del mes', () => {
    const d = lastDayOfMonth(2026, 5);   // junio 2026 → 30 días
    expect(d.getUTCDate()).toBe(30);
    expect(d.getUTCMonth()).toBe(5);
  });

  it('lastDayOfMonth en febrero bisiesto', () => {
    const d = lastDayOfMonth(2024, 1);   // febrero 2024 → 29 días
    expect(d.getUTCDate()).toBe(29);
  });
});

// ---------------------------------------------------------------------------
// stayDaysInPeriod
// ---------------------------------------------------------------------------

describe('stayDaysInPeriod', () => {
  // Usamos fechas normalizadas a medianoche UTC para claridad en los tests.
  // La función trunca internamente, pero los tests son más legibles así.
  const jun1  = new Date('2026-06-01T00:00:00.000Z');
  const jun30 = new Date('2026-06-30T00:00:00.000Z');

  it('residente todo el mes → días completos', () => {
    const days = stayDaysInPeriod(
      jun1, jun30,
      new Date('2026-01-01'),  // admisión antes del periodo
      null,                     // sin baja
    );
    expect(days).toBe(30);     // junio tiene 30 días
  });

  it('residente ingresa a mitad del mes (día 15)', () => {
    const days = stayDaysInPeriod(
      jun1, jun30,
      new Date('2026-06-15T00:00:00.000Z'),
      null,
    );
    expect(days).toBe(16);     // días 15..30 = 16 días
  });

  it('residente causa baja a mitad del mes (día 10)', () => {
    const days = stayDaysInPeriod(
      jun1, jun30,
      new Date('2026-01-01'),
      new Date('2026-06-10T00:00:00.000Z'),
    );
    expect(days).toBe(10);     // días 1..10 = 10 días
  });

  it('residente ingresa y causa baja dentro del mes', () => {
    const days = stayDaysInPeriod(
      jun1, jun30,
      new Date('2026-06-10T00:00:00.000Z'),
      new Date('2026-06-20T00:00:00.000Z'),
    );
    expect(days).toBe(11);     // días 10..20 = 11 días
  });

  it('residente fuera del periodo → 0 días', () => {
    const days = stayDaysInPeriod(
      jun1, jun30,
      new Date('2026-07-01'),   // ingresa después del periodo
      null,
    );
    expect(days).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// prorateMonthly
// ---------------------------------------------------------------------------

describe('prorateMonthly', () => {
  const jun2026 = new Date('2026-06-01T00:00:00.000Z');  // junio 2026: 30 días

  it('estancia completa → importe completo', () => {
    expect(prorateMonthly(1500, 30, jun2026)).toBe(1500);
  });

  it('15 de 30 días → mitad del importe', () => {
    expect(prorateMonthly(1500, 15, jun2026)).toBe(750);
  });

  it('1 día → 1/30 del importe, redondeado', () => {
    // 1500 / 30 = 50.00 exacto
    expect(prorateMonthly(1500, 1, jun2026)).toBe(50);
  });

  it('prorrateo importe que no es múltiplo exacto → redondeo correcto', () => {
    // 1000 / 30 × 7 = 233.333... → redondea a 233.33
    expect(prorateMonthly(1000, 7, jun2026)).toBe(233.33);
  });

  it('lanza RangeError si stayDays > daysInMonth', () => {
    expect(() => prorateMonthly(1500, 31, jun2026)).toThrow(RangeError);  // junio tiene 30 días
  });

  it('lanza RangeError si stayDays < 0', () => {
    expect(() => prorateMonthly(1500, -1, jun2026)).toThrow(RangeError);
  });

  it('funciona correctamente en enero (31 días)', () => {
    const jan2026 = new Date('2026-01-01T00:00:00.000Z');
    // 1500 / 31 × 31 = 1500 exacto
    expect(prorateMonthly(1500, 31, jan2026)).toBe(1500);
    // 1500 / 31 × 10 = 483.870... → redondea a 483.87
    expect(prorateMonthly(1500, 10, jan2026)).toBe(483.87);
  });

  it('funciona correctamente en febrero bisiesto (29 días)', () => {
    const feb2024 = new Date('2024-02-01T00:00:00.000Z');
    // 1500 / 29 × 15 = 775.862... → redondea a 775.86
    expect(prorateMonthly(1500, 15, feb2024)).toBe(775.86);
  });
});
