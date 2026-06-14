/**
 * lib/facturacion.ts — Lógica de dominio pura para facturación (RF-ECO-001..005).
 *
 * REGLAS DE DOMINIO:
 *   - Todos los importes se trabajan internamente en CÉNTIMOS (enteros) para
 *     evitar la aritmética de punto flotante. La conversión a Decimal/EUR
 *     ocurre solo en los límites (entrada desde BD, salida al router).
 *   - Redondeo: HALF_UP (estándar facturación española). Un céntimo "a favor"
 *     del cliente cuando la línea cae exactamente a mitad.
 *   - IVA: la mayoría de servicios sociosanitarios están exentos (art. 20 LIVA).
 *     El cálculo se hace igualmente para los que no lo están.
 *   - Prorrateo: por días naturales del mes en que cae la estancia. Se usa
 *     la duración real del mes (28/29/30/31 días).
 *
 * FUERA DE ALCANCE (bloqueado):
 *   - Cobro digital / remesas SEPA XML → TODO Q-007
 *   - Verifactu / factura electrónica AEAT → TODO Q-012
 */

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------

/** Línea de entrada para calcular una factura. */
export interface InvoiceLineInput {
  description: string;
  /** Cantidad (p. ej. 1 mes, 15.5 días, 3 unidades). */
  quantity: number;
  /** Precio unitario en EUR (admite decimales). */
  unitPrice: number;
  /** Porcentaje de IVA (0–100). Si vatExempt=true se ignora. */
  vatPct: number;
  /** true → exento de IVA (art. 20 LIVA; la mayoría de servicios socio-sanitarios). */
  vatExempt: boolean;
  /** Orden de presentación en la factura. */
  sortOrder?: number;
  /** ID de la tarifa origen (opcional, para trazabilidad). */
  tariffId?: string;
}

/** Resultado calculado de una línea. */
export interface InvoiceLineResult extends InvoiceLineInput {
  /** Importe base (quantity * unitPrice), en EUR, redondeado a 2 decimales. */
  lineBase: number;
  /** Importe IVA, en EUR, redondeado a 2 decimales (0 si exento). */
  lineVat: number;
  /** Total de la línea (lineBase + lineVat), en EUR. */
  lineTotal: number;
}

/** Resultado total de la factura. */
export interface InvoiceTotals {
  lines: InvoiceLineResult[];
  /** Suma de bases imponibles de todas las líneas. */
  baseAmount: number;
  /** Suma de cuotas IVA de todas las líneas. */
  vatAmount: number;
  /** Total a pagar (baseAmount + vatAmount). */
  totalAmount: number;
}

// ---------------------------------------------------------------------------
// Utilidades de redondeo
// ---------------------------------------------------------------------------

/**
 * Redondea un número a 2 decimales usando HALF_UP (Math.round convierte 0.5
 * hacia +∞, lo que equivale a HALF_UP para valores positivos — que son todos
 * los importes de factura).
 */
export function roundEur(value: number): number {
  // Multiplicar por 100, redondear a entero, dividir por 100 para evitar
  // errores de punto flotante en valores como 1.005.
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Cálculo de una línea
// ---------------------------------------------------------------------------

/**
 * Calcula los importes de una línea de factura a partir de los datos de entrada.
 * Función pura sin efectos secundarios.
 */
export function calcLine(input: InvoiceLineInput): InvoiceLineResult {
  const lineBase = roundEur(input.quantity * input.unitPrice);
  const lineVat = input.vatExempt ? 0 : roundEur(lineBase * (input.vatPct / 100));
  const lineTotal = roundEur(lineBase + lineVat);

  return {
    ...input,
    lineBase,
    lineVat,
    lineTotal,
  };
}

// ---------------------------------------------------------------------------
// Cálculo de totales de factura
// ---------------------------------------------------------------------------

/**
 * Calcula los totales de una factura a partir de un array de líneas de entrada.
 * Función pura: no accede a BD, no tiene efectos secundarios.
 *
 * Los totales se suman en céntimos (enteros) para evitar acumulación de error
 * de punto flotante al sumar muchas líneas, y se redondean al final.
 */
export function calcInvoiceTotals(inputs: InvoiceLineInput[]): InvoiceTotals {
  const lines = inputs.map(calcLine);

  // Sumar en céntimos para precisión
  let baseAmountCents = 0;
  let vatAmountCents = 0;

  for (const line of lines) {
    baseAmountCents += Math.round(line.lineBase * 100);
    vatAmountCents  += Math.round(line.lineVat  * 100);
  }

  const baseAmount  = baseAmountCents  / 100;
  const vatAmount   = vatAmountCents   / 100;
  const totalAmount = roundEur(baseAmount + vatAmount);

  return {
    lines,
    baseAmount:  roundEur(baseAmount),
    vatAmount:   roundEur(vatAmount),
    totalAmount,
  };
}

// ---------------------------------------------------------------------------
// Cálculo del copago
// ---------------------------------------------------------------------------

/**
 * Calcula el importe del copago privado a partir de la cuota bruta y el
 * porcentaje de aportación pública.
 *
 * @param grossAmount     Importe bruto de la plaza (EUR).
 * @param publicCopayPct  Porcentaje de aportación pública (0–100).
 * @returns               Importe neto que paga el privado (EUR), redondeado.
 */
export function calcPrivateAmount(grossAmount: number, publicCopayPct: number): number {
  if (publicCopayPct < 0 || publicCopayPct > 100) {
    throw new RangeError(`publicCopayPct debe estar entre 0 y 100; recibido: ${publicCopayPct}`);
  }
  return roundEur(grossAmount * (1 - publicCopayPct / 100));
}

// ---------------------------------------------------------------------------
// Prorrateo por días de estancia en el periodo
// ---------------------------------------------------------------------------

/**
 * Prorratea un importe mensual por los días que el residente estuvo en el
 * centro durante el periodo de facturación. Usa los días naturales del mes.
 *
 * El prorrateo se calcula sobre el mes del periodo. Si el periodo abarca más
 * de un mes, cada segmento debe prorratarse por separado y luego sumarse.
 * Esta función maneja el caso simple de UN mes (el más frecuente: factura mensual).
 *
 * @param monthlyAmount   Importe mensual base (EUR).
 * @param stayDays        Días de estancia dentro del periodo (1..daysInMonth).
 * @param periodStart     Inicio del periodo de facturación.
 * @returns               Importe prorrateado (EUR), redondeado a 2 decimales.
 */
export function prorateMonthly(
  monthlyAmount: number,
  stayDays: number,
  periodStart: Date,
): number {
  const daysInMonth = getDaysInMonth(periodStart.getFullYear(), periodStart.getMonth());
  if (stayDays < 0 || stayDays > daysInMonth) {
    throw new RangeError(
      `stayDays (${stayDays}) fuera de rango para el mes (1–${daysInMonth}).`,
    );
  }
  if (stayDays === daysInMonth) return roundEur(monthlyAmount);
  return roundEur((monthlyAmount / daysInMonth) * stayDays);
}

/**
 * Calcula el número de días de estancia del residente dentro de un periodo
 * dado (desde admissionDate hasta dischargeDate, acotado por el periodo).
 *
 * @param periodStart     Inicio del periodo facturado (inclusive).
 * @param periodEnd       Fin del periodo facturado (inclusive, último día del mes).
 * @param admissionDate   Fecha de ingreso del residente (puede ser anterior al periodo).
 * @param dischargeDate   Fecha de baja/alta del residente (null = sigue activo).
 * @returns               Número de días de estancia dentro del periodo (entero ≥ 0).
 */
export function stayDaysInPeriod(
  periodStart: Date,
  periodEnd: Date,
  admissionDate: Date,
  dischargeDate: Date | null,
): number {
  // Normalizar todas las fechas a medianoche UTC para contar días naturales
  // sin que la hora afecte al resultado.
  const truncDay = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  const start  = truncDay(periodStart);
  const end    = truncDay(periodEnd);
  const admit  = truncDay(admissionDate);
  const discharge = dischargeDate ? truncDay(dischargeDate) : null;

  // El inicio efectivo es el mayor entre el inicio del periodo y el ingreso
  const effectiveStart = admit > start ? admit : start;
  // El fin efectivo es el menor entre el fin del periodo y la baja
  const effectiveEnd = discharge !== null && discharge < end ? discharge : end;

  if (effectiveEnd < effectiveStart) return 0;

  const msPerDay = 1000 * 60 * 60 * 24;
  // Suma 1 porque tanto el día de inicio como el día de fin cuentan
  return Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / msPerDay) + 1;
}

// ---------------------------------------------------------------------------
// Utilidades de fecha
// ---------------------------------------------------------------------------

/**
 * Devuelve el número de días del mes dado (año, mes en base 0).
 * Maneja correctamente los años bisiestos.
 */
export function getDaysInMonth(year: number, month: number): number {
  // new Date(year, month + 1, 0) da el último día del mes `month`
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Devuelve la fecha del primer día del mes (00:00:00 UTC) para el año y mes dados.
 */
export function firstDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

/**
 * Devuelve la fecha del último día del mes (23:59:59.999 UTC) para el año y mes dados.
 */
export function lastDayOfMonth(year: number, month: number): Date {
  const days = getDaysInMonth(year, month);
  return new Date(Date.UTC(year, month, days, 23, 59, 59, 999));
}
