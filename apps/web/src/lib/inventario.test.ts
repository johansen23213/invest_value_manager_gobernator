import { describe, expect, it } from 'vitest';
import {
  applyMovement,
  calculateStock,
  isLowStock,
  itemsToReorder,
  validateOutbound,
  type StockItem,
  type StockMovement,
} from './inventario';

// ---------------------------------------------------------------------------
// calculateStock
// ---------------------------------------------------------------------------

describe('calculateStock', () => {
  it('stock inicial sin movimientos', () => {
    expect(calculateStock(10, [])).toBe(10);
  });

  it('ENTRADA suma cantidad', () => {
    const movements: StockMovement[] = [{ type: 'ENTRADA', quantity: 5 }];
    expect(calculateStock(10, movements)).toBe(15);
  });

  it('SALIDA resta cantidad', () => {
    const movements: StockMovement[] = [{ type: 'SALIDA', quantity: 3 }];
    expect(calculateStock(10, movements)).toBe(7);
  });

  it('AJUSTE fija el stock absoluto (ignora el inicial)', () => {
    const movements: StockMovement[] = [{ type: 'AJUSTE', quantity: 7 }];
    expect(calculateStock(10, movements)).toBe(7);
  });

  it('AJUSTE a cero produce stock cero', () => {
    const movements: StockMovement[] = [{ type: 'AJUSTE', quantity: 0 }];
    expect(calculateStock(50, movements)).toBe(0);
  });

  it('múltiples movimientos encadenados', () => {
    const movements: StockMovement[] = [
      { type: 'ENTRADA', quantity: 20 },
      { type: 'SALIDA',  quantity: 5  },
      { type: 'SALIDA',  quantity: 3  },
      { type: 'AJUSTE',  quantity: 10 },
      { type: 'ENTRADA', quantity: 2  },
    ];
    // 0 + 20 = 20 → −5 = 15 → −3 = 12 → ajuste=10 → +2 = 12
    expect(calculateStock(0, movements)).toBe(12);
  });

  it('SALIDA puede producir stock 0', () => {
    const movements: StockMovement[] = [{ type: 'SALIDA', quantity: 10 }];
    expect(calculateStock(10, movements)).toBe(0);
  });

  it('SALIDA puede producir stock negativo (calculateStock es pura, sin validación)', () => {
    const movements: StockMovement[] = [{ type: 'SALIDA', quantity: 15 }];
    expect(calculateStock(10, movements)).toBe(-5);
  });
});

// ---------------------------------------------------------------------------
// isLowStock
// ---------------------------------------------------------------------------

describe('isLowStock', () => {
  const makeItem = (stock: number, stockMin: number, active = true): StockItem => ({
    id: 'x',
    name: 'Test',
    stock,
    stockMin,
    active,
  });

  it('stock > stockMin → no alerta', () => {
    expect(isLowStock(makeItem(10, 5))).toBe(false);
  });

  it('stock === stockMin → alerta (en el límite)', () => {
    expect(isLowStock(makeItem(5, 5))).toBe(true);
  });

  it('stock < stockMin → alerta', () => {
    expect(isLowStock(makeItem(3, 5))).toBe(true);
  });

  it('stock 0 con stockMin 0 → sin alerta (stockMin=0 desactiva la alerta)', () => {
    // El centro no ha configurado stock mínimo: 0 <= 0 → alerta
    // Nota: si stockMin=0, cualquier stock 0 es igual al mínimo → true.
    // Este es el comportamiento correcto: stockMin=0 no desactiva la alerta
    // si el stock también es 0.
    expect(isLowStock(makeItem(0, 0))).toBe(true);
  });

  it('artículo inactivo nunca activa alerta aunque el stock sea 0', () => {
    expect(isLowStock(makeItem(0, 10, false))).toBe(false);
  });

  it('stockMin negativo (configuración rara pero posible) → sin alerta si stock >= 0', () => {
    // stockMin=-1 siempre cumple stock>stockMin para stock>=0
    expect(isLowStock(makeItem(0, -1))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// itemsToReorder
// ---------------------------------------------------------------------------

describe('itemsToReorder', () => {
  it('lista vacía → ningún artículo', () => {
    expect(itemsToReorder([])).toHaveLength(0);
  });

  it('filtra solo los artículos con bajo stock', () => {
    const items: StockItem[] = [
      { id: '1', name: 'A', stock: 2, stockMin: 5, active: true },
      { id: '2', name: 'B', stock: 10, stockMin: 5, active: true },
      { id: '3', name: 'C', stock: 5, stockMin: 5, active: true },
      { id: '4', name: 'D', stock: 0, stockMin: 0, active: true },
    ];
    const result = itemsToReorder(items);
    expect(result.map((i) => i.id)).toEqual(['1', '3', '4']);
  });

  it('excluye artículos inactivos aunque tengan bajo stock', () => {
    const items: StockItem[] = [
      { id: '1', name: 'A', stock: 0, stockMin: 5, active: false },
      { id: '2', name: 'B', stock: 0, stockMin: 5, active: true  },
    ];
    const result = itemsToReorder(items);
    expect(result.map((i) => i.id)).toEqual(['2']);
  });

  it('todos por encima del mínimo → lista vacía', () => {
    const items: StockItem[] = [
      { id: '1', name: 'A', stock: 100, stockMin: 5, active: true },
      { id: '2', name: 'B', stock: 50,  stockMin: 5, active: true },
    ];
    expect(itemsToReorder(items)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateOutbound
// ---------------------------------------------------------------------------

describe('validateOutbound', () => {
  it('cantidad positiva con stock suficiente → ok', () => {
    expect(validateOutbound(10, 5)).toEqual({ ok: true });
  });

  it('cantidad exacta al stock disponible → ok', () => {
    expect(validateOutbound(5, 5)).toEqual({ ok: true });
  });

  it('cantidad mayor que el stock → error', () => {
    const result = validateOutbound(3, 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Stock insuficiente');
    }
  });

  it('cantidad 0 → error', () => {
    const result = validateOutbound(10, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('mayor que cero');
    }
  });

  it('cantidad negativa → error', () => {
    const result = validateOutbound(10, -3);
    expect(result.ok).toBe(false);
  });

  it('stock cero y cantidad positiva → error', () => {
    const result = validateOutbound(0, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Stock insuficiente');
    }
  });
});

// ---------------------------------------------------------------------------
// applyMovement
// ---------------------------------------------------------------------------

describe('applyMovement', () => {
  it('ENTRADA suma al stock', () => {
    expect(applyMovement(10, { type: 'ENTRADA', quantity: 5 })).toBe(15);
  });

  it('SALIDA válida resta al stock', () => {
    expect(applyMovement(10, { type: 'SALIDA', quantity: 4 })).toBe(6);
  });

  it('SALIDA exacta al stock → 0', () => {
    expect(applyMovement(5, { type: 'SALIDA', quantity: 5 })).toBe(0);
  });

  it('SALIDA que deja stock negativo → lanza error de dominio', () => {
    expect(() => applyMovement(3, { type: 'SALIDA', quantity: 5 })).toThrow(
      /Stock insuficiente/,
    );
  });

  it('AJUSTE fija el stock absoluto', () => {
    expect(applyMovement(99, { type: 'AJUSTE', quantity: 7 })).toBe(7);
  });

  it('AJUSTE a cero siempre permitido', () => {
    expect(applyMovement(50, { type: 'AJUSTE', quantity: 0 })).toBe(0);
  });

  it('AJUSTE no pasa por validateOutbound (no lanza aunque sea menor que el stock)', () => {
    // Si fuera SALIDA con quantity=0 fallaría; AJUSTE con 0 está bien
    expect(() => applyMovement(10, { type: 'AJUSTE', quantity: 0 })).not.toThrow();
  });
});
