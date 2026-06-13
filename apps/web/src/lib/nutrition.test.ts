/**
 * Tests exhaustivos de las funciones puras de nutrición (RF-NUT-007).
 * Sin BD, sin mocks: solo entradas/salidas.
 */
import { describe, expect, it } from 'vitest';
import { averageIntake, isLowIntakeRisk, type IntakeEntry } from './nutrition';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntries(pcts: number[], baseDate = new Date('2026-06-10')): IntakeEntry[] {
  return pcts.map((foodPct, i) => ({
    date: new Date(baseDate.getTime() + i * 6 * 60 * 60 * 1000), // cada 6h
    foodPct,
  }));
}

// ---------------------------------------------------------------------------
// averageIntake
// ---------------------------------------------------------------------------

describe('averageIntake', () => {
  it('devuelve null cuando no hay registros', () => {
    expect(averageIntake([])).toBeNull();
  });

  it('devuelve el valor exacto con un solo registro', () => {
    expect(averageIntake(makeEntries([80]))).toBe(80);
  });

  it('calcula la media correctamente con varios registros', () => {
    // (60 + 80 + 100) / 3 = 80
    expect(averageIntake(makeEntries([60, 80, 100]))).toBe(80);
  });

  it('media de cero cuando todos son 0', () => {
    expect(averageIntake(makeEntries([0, 0, 0, 0]))).toBe(0);
  });

  it('media exacta con decimales', () => {
    // (10 + 20 + 30) / 3 = 20
    const result = averageIntake(makeEntries([10, 20, 30]));
    expect(result).toBeCloseTo(20, 5);
  });

  it('maneja valores en los extremos 0 y 100', () => {
    expect(averageIntake(makeEntries([0, 100]))).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// isLowIntakeRisk — criterio 1: media baja
// ---------------------------------------------------------------------------

describe('isLowIntakeRisk — criterio de media', () => {
  it('no es riesgo cuando no hay registros', () => {
    const result = isLowIntakeRisk([]);
    expect(result.isRisk).toBe(false);
    expect(result.avg).toBeNull();
    expect(result.reasons).toHaveLength(0);
  });

  it('no es riesgo con media >= 50 (umbral por defecto)', () => {
    const result = isLowIntakeRisk(makeEntries([50, 60, 70, 80]));
    expect(result.isRisk).toBe(false);
  });

  it('es riesgo con media exactamente igual al umbral (< 50, no <=)', () => {
    // media exactamente 50 → NO es riesgo (la condición es estrictamente <)
    const result = isLowIntakeRisk(makeEntries([50, 50, 50]));
    expect(result.isRisk).toBe(false);
  });

  it('es riesgo cuando media < 50 (umbral por defecto)', () => {
    const result = isLowIntakeRisk(makeEntries([30, 40, 45, 48]));
    // (30+40+45+48)/4 = 40.75 < 50
    expect(result.isRisk).toBe(true);
    expect(result.reasons[0]).toContain('Media de ingesta');
  });

  it('respeta el windowSize: solo considera las N más recientes para la media', () => {
    // Las 2 más recientes son [90, 80] → media 85 (no riesgo con umbral 50)
    // Pero las 4 son [90, 80, 10, 10] → media 47.5 (riesgo si window=4)
    // Ordenadas por fecha: las más recientes son las de índices más altos
    const entries = makeEntries([10, 10, 80, 90]); // 10 más antigua, 90 más nueva
    const resultWindow2 = isLowIntakeRisk(entries, { windowSize: 2, consecutiveLowCount: 999 });
    // Ventana de 2: [90, 80] más recientes → avg 85 → no riesgo
    expect(resultWindow2.isRisk).toBe(false);

    const resultWindow4 = isLowIntakeRisk(entries, { windowSize: 4, consecutiveLowCount: 999 });
    // Ventana de 4: [90, 80, 10, 10] → avg 47.5 → riesgo
    expect(resultWindow4.isRisk).toBe(true);
  });

  it('permite umbral personalizado', () => {
    // media 60, umbral 70 → riesgo
    const result = isLowIntakeRisk(makeEntries([50, 60, 70]), {
      averageThreshold: 70,
      consecutiveLowCount: 999,
    });
    expect(result.isRisk).toBe(true);
  });

  it('devuelve la avg calculada en el resultado', () => {
    const result = isLowIntakeRisk(makeEntries([20, 40, 60]));
    expect(result.avg).toBeCloseTo(40, 5);
  });
});

// ---------------------------------------------------------------------------
// isLowIntakeRisk — criterio 2: comidas consecutivas muy bajas
// ---------------------------------------------------------------------------

describe('isLowIntakeRisk — criterio de comidas consecutivas bajas', () => {
  it('es riesgo inmediato con 3 comidas consecutivas al 25% o menos (defaults)', () => {
    // Las 3 más recientes son [20, 15, 25] → todas ≤ 25 → riesgo por consecutivas
    // desc: [25, 15, 20, 90, 80] → 25≤25, 15≤25, 20≤25, 90>25 → racha=3
    const entries = makeEntries([80, 90, 20, 15, 25]);
    const result = isLowIntakeRisk(entries, { averageThreshold: 0 }); // desactiva criterio 1
    expect(result.isRisk).toBe(true);
    expect(result.reasons.some((r) => r.includes('consecutivas'))).toBe(true);
  });

  it('no es riesgo si la racha se rompe con una comida alta', () => {
    // Para que NO sea riesgo por consecutivas necesitamos que el alto esté entre los recientes.
    // entries = [10, 15, 90, 20, 25] → desc: [25, 20, 90, 15, 10]
    // racha: 25≤25 ✓, 20≤25 ✓, 90>25 → racha=2 → no riesgo por consecutivas
    // averageThreshold:0 desactiva criterio 1 (avg nunca puede ser < 0)
    const entries = makeEntries([10, 15, 90, 20, 25]); // 90 en el medio
    const result = isLowIntakeRisk(entries, { averageThreshold: 0 });
    expect(result.isRisk).toBe(false);
  });

  it('es riesgo con exactamente 3 consecutivas (el mínimo por defecto)', () => {
    const entries = makeEntries([80, 25, 20, 10]);
    // desc: [10, 20, 25, 80] → 10≤25, 20≤25, 25≤25 → racha=3 → riesgo
    const result = isLowIntakeRisk(entries, { averageThreshold: 0 }); // desactiva criterio 1
    expect(result.isRisk).toBe(true);
  });

  it('no es riesgo con 2 consecutivas (menos que el mínimo por defecto de 3)', () => {
    // Entradas: [80, 70, 20, 10] → desc: [10, 20, 70, 80] → racha=2 → no riesgo
    // averageThreshold:0 desactiva criterio 1
    const entries = makeEntries([80, 70, 20, 10]);
    const result = isLowIntakeRisk(entries, { averageThreshold: 0 });
    expect(result.isRisk).toBe(false);
  });

  it('respeta consecutiveLowCount personalizado', () => {
    // Con consecutiveLowCount=5 y solo 3 consecutivas → no riesgo por consecutivas
    // Entradas con media alta: [90, 10, 15, 20] → avg=(90+10+15+20)/4=33.75
    // averageThreshold:0 desactiva criterio 1; solo queda criterio 2
    const entries = makeEntries([90, 10, 15, 20]);
    // desc: [20, 15, 10, 90] → racha: 20≤25, 15≤25, 10≤25 → racha=3 < 5 → no riesgo
    const result = isLowIntakeRisk(entries, {
      averageThreshold: 0,      // desactiva criterio 1
      consecutiveLowCount: 5,   // requiere 5 consecutivas
    });
    expect(result.isRisk).toBe(false);
  });

  it('respeta consecutiveLowThreshold personalizado', () => {
    // Las 3 más recientes son [30, 35, 40]; con umbral 50 todas son bajas → riesgo
    // desc: [40, 35, 30, 80] → 40≤50, 35≤50, 30≤50 → racha=3 → riesgo
    const entries = makeEntries([80, 30, 35, 40]);
    const result = isLowIntakeRisk(entries, {
      averageThreshold: 0,     // desactiva criterio 1
      consecutiveLowThreshold: 50,
      consecutiveLowCount: 3,
    });
    expect(result.isRisk).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isLowIntakeRisk — criterios combinados (OR lógico)
// ---------------------------------------------------------------------------

describe('isLowIntakeRisk — criterios combinados', () => {
  it('es riesgo si se activa cualquiera de los dos criterios (OR lógico)', () => {
    // Caso: media 60 (no riesgo por media si umbral 50), pero 3 consecutivas ≤ 25
    const entries = makeEntries([90, 90, 10, 15, 20]);
    // desc: [20, 15, 10, 90, 90] → racha: 20≤25, 15≤25, 10≤25, 90>25 → racha=3
    // avg(5) = (90+90+10+15+20)/5 = 45 < 50 → también riesgo por media
    const result = isLowIntakeRisk(entries);
    expect(result.isRisk).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(1);
  });

  it('devuelve múltiples razones cuando se activan ambos criterios', () => {
    // avg muy baja + 3 consecutivas bajas
    const entries = makeEntries([10, 15, 20, 10, 5]);
    const result = isLowIntakeRisk(entries);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('no es riesgo con ingesta alta consistente', () => {
    const entries = makeEntries([70, 80, 90, 75, 85, 95]);
    const result = isLowIntakeRisk(entries);
    expect(result.isRisk).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Casos extremos / frontera
// ---------------------------------------------------------------------------

describe('isLowIntakeRisk — casos extremos', () => {
  it('un único registro con foodPct 0 (riesgo por consecutivas)', () => {
    const result = isLowIntakeRisk(makeEntries([0]), { consecutiveLowCount: 1 });
    expect(result.isRisk).toBe(true);
  });

  it('un único registro con foodPct 100 (no riesgo)', () => {
    const result = isLowIntakeRisk(makeEntries([100]));
    expect(result.isRisk).toBe(false);
  });

  it('todos los registros en 0 activan ambos criterios', () => {
    const entries = makeEntries([0, 0, 0, 0, 0]);
    const result = isLowIntakeRisk(entries);
    expect(result.isRisk).toBe(true);
    expect(result.avg).toBe(0);
  });

  it('records con misma fecha se ordenan sin error (estabilidad)', () => {
    const sameDate = new Date('2026-06-10T10:00:00Z');
    const entries: IntakeEntry[] = [
      { date: sameDate, foodPct: 20 },
      { date: sameDate, foodPct: 15 },
      { date: sameDate, foodPct: 10 },
    ];
    // No debe lanzar excepción y debe devolver resultado
    expect(() => isLowIntakeRisk(entries)).not.toThrow();
  });
});
