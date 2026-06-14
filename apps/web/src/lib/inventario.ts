/**
 * Lógica pura de inventario / almacén (sin dependencias de BD).
 *
 * Testeable en aislamiento con Vitest (apps/web/src/lib/inventario.test.ts).
 *
 * Principios:
 *   - El stock se recalcula a partir de los movimientos (fuente de verdad).
 *     El campo stock en InventoryItem es un cache denormalizado para consultas
 *     rápidas; los movimientos son el registro auditado.
 *   - La salida no puede dejar stock negativo salvo en AJUSTE (permite corregir
 *     diferencias de inventario físico).
 *   - isLowStock y itemsToReorder trabajan con la snapshot del item (stock + stockMin)
 *     sin tocar la BD.
 */

// ---------------------------------------------------------------------------
// Tipos mínimos (independientes de Prisma — pure domain)
// ---------------------------------------------------------------------------

export interface StockItem {
  id:       string;
  name:     string;
  stock:    number;
  stockMin: number;
  active:   boolean;
}

export interface StockMovement {
  type:     'ENTRADA' | 'SALIDA' | 'AJUSTE';
  quantity: number; // siempre positivo; el tipo determina el sentido
}

// ---------------------------------------------------------------------------
// Cálculo de stock a partir de movimientos
// ---------------------------------------------------------------------------

/**
 * Recalcula el stock actual aplicando una lista de movimientos ordenados.
 *
 * @param initial  Stock inicial (antes del primer movimiento).
 * @param movements Lista de movimientos en orden cronológico.
 * @returns Stock resultante.
 */
export function calculateStock(
  initial: number,
  movements: StockMovement[],
): number {
  return movements.reduce((acc, m) => {
    switch (m.type) {
      case 'ENTRADA': return acc + m.quantity;
      case 'SALIDA':  return acc - m.quantity;
      case 'AJUSTE':  return m.quantity; // ajuste fija el stock absoluto
    }
  }, initial);
}

// ---------------------------------------------------------------------------
// Detección de bajo stock
// ---------------------------------------------------------------------------

/**
 * Devuelve true si el artículo está en o por debajo del stock mínimo.
 * Un artículo inactivo nunca activa la alerta.
 */
export function isLowStock(item: StockItem): boolean {
  if (!item.active) return false;
  return item.stock <= item.stockMin;
}

/**
 * Devuelve los artículos que necesitan reposición (bajo stock).
 * Filtra artículos inactivos automáticamente.
 */
export function itemsToReorder(items: StockItem[]): StockItem[] {
  return items.filter(isLowStock);
}

// ---------------------------------------------------------------------------
// Validación de salida
// ---------------------------------------------------------------------------

export type OutboundValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Valida si se puede registrar una SALIDA de `quantity` unidades dado el stock
 * actual. Los AJUSTE no pasan por esta validación (se permiten siempre).
 *
 * Regla: SALIDA no puede dejar el stock en negativo.
 *
 * @param currentStock Stock actual del artículo.
 * @param quantity     Cantidad que se quiere sacar.
 * @returns { ok: true } si la operación es válida; { ok: false, error } si no.
 */
export function validateOutbound(
  currentStock: number,
  quantity: number,
): OutboundValidationResult {
  if (quantity <= 0) {
    return { ok: false, error: 'La cantidad debe ser mayor que cero.' };
  }
  if (currentStock - quantity < 0) {
    return {
      ok: false,
      error: `Stock insuficiente: hay ${currentStock} unidades disponibles, se intentan sacar ${quantity}. Usa un AJUSTE si el stock real difiere.`,
    };
  }
  return { ok: true };
}

/**
 * Devuelve el nuevo stock tras aplicar un movimiento, o lanza un error de
 * dominio si la operación no es válida.
 *
 * Para AJUSTE siempre se acepta y el stock pasa a ser `quantity`.
 * Para SALIDA se valida que no quede negativo.
 * Para ENTRADA siempre se acepta.
 */
export function applyMovement(
  currentStock: number,
  movement: StockMovement,
): number {
  if (movement.type === 'AJUSTE') {
    return movement.quantity;
  }
  if (movement.type === 'SALIDA') {
    const validation = validateOutbound(currentStock, movement.quantity);
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    return currentStock - movement.quantity;
  }
  // ENTRADA
  return currentStock + movement.quantity;
}
