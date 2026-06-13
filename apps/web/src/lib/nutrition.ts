/**
 * Nutrición — lógica pura de cálculo de ingesta y alertas (RF-NUT-007).
 * Sin dependencias de BD: testeable de forma exhaustiva.
 *
 * RELACIÓN CON CareRecord/INGESTA:
 *   CareRecord(type=INGESTA) es el registro offline-first genérico (JSON libre).
 *   IntakeRecord es el registro estructurado con foodPct y franja MealType.
 *   Estas funciones operan sobre IntakeRecord. No contradicen ni duplican la
 *   lógica de care-humanize.ts (que procesa el payload libre de CareRecord).
 *
 * UMBRALES DE RIESGO (RF-NUT-007):
 *   Se definen dos criterios de riesgo, aplicables individualmente o combinados:
 *
 *   1. averageThreshold (default 50):
 *      Media de foodPct de las últimas N comidas < umbral → riesgo.
 *      Justificación: una media < 50 % sostenida indica que el residente no
 *      está cubriendo la mitad de sus necesidades calóricas estimadas.
 *
 *   2. consecutiveLowThreshold (default 25) + consecutiveLowCount (default 3):
 *      Si hay ≥ X comidas consecutivas (las más recientes, ordenadas desc) con
 *      foodPct ≤ consecutiveLowThreshold → riesgo inmediato.
 *      Justificación: 3 comidas seguidas al 25 % o menos es un patrón de
 *      rechazo activo o deterioro agudo que requiere intervención, aunque la
 *      media a largo plazo no sea tan baja.
 *
 *   Ambos criterios se evalúan de forma independiente; basta con que uno sea
 *   verdadero para considerar riesgo (OR lógico). El caller puede anular los
 *   defaults pasando `opts` explícito.
 */

/** Un registro de ingesta reducido a lo que necesita la lógica pura. */
export interface IntakeEntry {
  date: Date;
  foodPct: number; // 0–100
}

/**
 * Opciones para `isLowIntakeRisk`.
 * Todos los campos son opcionales; se aplican los defaults documentados arriba.
 */
export interface LowIntakeRiskOptions {
  /**
   * Número de comidas recientes a considerar para la media.
   * Default: 14 (aprox. 3–4 días de 4 comidas/día).
   */
  windowSize?: number;
  /**
   * Porcentaje medio por debajo del cual se considera riesgo.
   * Default: 50.
   */
  averageThreshold?: number;
  /**
   * Porcentaje por debajo del cual una comida individual cuenta como "baja".
   * Default: 25.
   */
  consecutiveLowThreshold?: number;
  /**
   * Número mínimo de comidas consecutivas bajas (más recientes) para activar
   * la alerta de riesgo inmediato.
   * Default: 3.
   */
  consecutiveLowCount?: number;
}

/**
 * Calcula el porcentaje medio de ingesta de los registros proporcionados.
 * Si el array está vacío, devuelve null (sin dato suficiente).
 */
export function averageIntake(records: IntakeEntry[]): number | null {
  if (records.length === 0) return null;
  const sum = records.reduce((acc, r) => acc + r.foodPct, 0);
  return sum / records.length;
}

/**
 * Determina si el conjunto de registros representa riesgo de baja ingesta
 * (RF-NUT-007). Devuelve un objeto con los motivos para que la UI pueda
 * mostrar la razón específica del riesgo.
 *
 * @param records  Registros de ingesta del residente (cualquier ventana temporal).
 *                 La función ordena por fecha desc internamente.
 * @param opts     Umbrales opcionales (ver LowIntakeRiskOptions para defaults).
 */
export function isLowIntakeRisk(
  records: IntakeEntry[],
  opts: LowIntakeRiskOptions = {},
): {
  isRisk: boolean;
  reasons: string[];
  avg: number | null;
} {
  const windowSize            = opts.windowSize            ?? 14;
  const averageThreshold      = opts.averageThreshold      ?? 50;
  const consecutiveLowThreshold = opts.consecutiveLowThreshold ?? 25;
  const consecutiveLowCount   = opts.consecutiveLowCount   ?? 3;

  if (records.length === 0) {
    return { isRisk: false, reasons: [], avg: null };
  }

  // Ordenar por fecha desc (más recientes primero) para evaluar consecutividad.
  const sorted = [...records].sort((a, b) => b.date.getTime() - a.date.getTime());

  // Ventana para la media.
  const window = sorted.slice(0, windowSize);
  const avg = averageIntake(window);

  const reasons: string[] = [];

  // Criterio 1: media baja.
  if (avg !== null && avg < averageThreshold) {
    reasons.push(
      `Media de ingesta ${avg.toFixed(1)}% < umbral ${averageThreshold}% (últimas ${window.length} comidas)`,
    );
  }

  // Criterio 2: comidas consecutivas muy bajas.
  // Contamos las N comidas más recientes que están ≤ consecutiveLowThreshold.
  // "Consecutivas" significa que no hay ninguna comida por encima del umbral
  // entre las N más recientes.
  let consecutiveLow = 0;
  for (const r of sorted) {
    if (r.foodPct <= consecutiveLowThreshold) {
      consecutiveLow++;
    } else {
      break; // la racha se rompe
    }
  }
  if (consecutiveLow >= consecutiveLowCount) {
    reasons.push(
      `${consecutiveLow} comidas consecutivas con ingesta ≤ ${consecutiveLowThreshold}% (mínimo: ${consecutiveLowCount})`,
    );
  }

  return {
    isRisk: reasons.length > 0,
    reasons,
    avg,
  };
}
