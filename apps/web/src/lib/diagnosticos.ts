/**
 * Lógica de dominio pura para diagnósticos y ayudas técnicas.
 *
 * Funciones puras (sin BD) — testables sin infraestructura.
 *
 * Diseño:
 *   - Las transiciones de estado del diagnóstico siguen el ciclo:
 *       ACTIVO → CRONICO   (estabilización crónica)
 *       ACTIVO → RESUELTO  (curación/remisión — requiere resolvedAt)
 *       CRONICO → RESUELTO (resolución de un proceso crónico — requiere resolvedAt)
 *       RESUELTO es estado terminal: no hay vuelta atrás desde aquí.
 *   - Los helpers de filtro devuelven subconjuntos sin mutar la entrada.
 */

// ---------------------------------------------------------------------------
// Tipos (importados desde @vetlla/db para coherencia; re-exportados aquí
// como tipos locales para que la UI no dependa directamente del paquete db
// en módulos alcanzables desde cliente)
// ---------------------------------------------------------------------------

export type DiagnosisStatus = 'ACTIVO' | 'CRONICO' | 'RESUELTO';
export type DiagnosisType   = 'PRINCIPAL' | 'SECUNDARIO';

export type AssistiveDeviceStatus = 'ACTIVO' | 'RETIRADO';

export interface DiagnosisLike {
  status:     DiagnosisStatus;
  resolvedAt: Date | null | undefined;
}

export interface AssistiveDeviceLike {
  status:    AssistiveDeviceStatus;
  retiredAt: Date | null | undefined;
}

// ---------------------------------------------------------------------------
// Transiciones de estado del diagnóstico
// ---------------------------------------------------------------------------

/**
 * Mapa de transiciones válidas.
 * RESUELTO es terminal; no hay transiciones desde él.
 */
const VALID_TRANSITIONS: Record<DiagnosisStatus, readonly DiagnosisStatus[]> = {
  ACTIVO:   ['CRONICO', 'RESUELTO'],
  CRONICO:  ['RESUELTO'],
  RESUELTO: [],   // estado terminal
};

export type TransitionResult =
  | { ok: true;  next:  DiagnosisStatus }
  | { ok: false; error: string };

/**
 * Valida si la transición de estado de un diagnóstico es válida.
 *
 * Regla adicional: si `next === 'RESUELTO'`, debe proveerse una fecha de
 * resolución (resolvedAt). Sin ella, la transición se rechaza aunque sea
 * estructuralmente válida.
 *
 * @returns TransitionResult — { ok: true, next } o { ok: false, error }
 */
export function validateDiagnosisTransition(
  current: DiagnosisStatus,
  next:    DiagnosisStatus,
  resolvedAt?: Date | null,
): TransitionResult {
  const allowed = VALID_TRANSITIONS[current];

  if (!allowed.includes(next)) {
    return {
      ok:    false,
      error: `Transición inválida: ${current} → ${next}. Permitidas desde ${current}: [${allowed.join(', ') || 'ninguna'}].`,
    };
  }

  if (next === 'RESUELTO' && !resolvedAt) {
    return {
      ok:    false,
      error: 'Para marcar un diagnóstico como RESUELTO debe indicarse la fecha de resolución.',
    };
  }

  if (next !== 'RESUELTO' && resolvedAt) {
    return {
      ok:    false,
      error: `La fecha de resolución solo aplica cuando el estado destino es RESUELTO (estado destino recibido: ${next}).`,
    };
  }

  return { ok: true, next };
}

/**
 * Devuelve true si la transición de estado es válida (sin detalles de error).
 * Útil para guards rápidos en la UI.
 */
export function canTransitionDiagnosis(
  current: DiagnosisStatus,
  next:    DiagnosisStatus,
): boolean {
  return VALID_TRANSITIONS[current].includes(next);
}

/**
 * Lista de transiciones posibles desde un estado dado.
 * Útil para construir selectores en la UI.
 */
export function availableTransitions(
  current: DiagnosisStatus,
): readonly DiagnosisStatus[] {
  return VALID_TRANSITIONS[current];
}

// ---------------------------------------------------------------------------
// Helpers de filtro / resumen
// ---------------------------------------------------------------------------

/**
 * Filtra diagnósticos activos (ACTIVO o CRONICO).
 * Un diagnóstico crónico sigue siendo "activo" en el sentido de que requiere
 * seguimiento; no está resuelto.
 */
export function activeDiagnoses<T extends DiagnosisLike>(
  diagnoses: T[],
): T[] {
  return diagnoses.filter(
    (d) => d.status === 'ACTIVO' || d.status === 'CRONICO',
  );
}

/**
 * Filtra diagnósticos resueltos.
 */
export function resolvedDiagnoses<T extends DiagnosisLike>(
  diagnoses: T[],
): T[] {
  return diagnoses.filter((d) => d.status === 'RESUELTO');
}

/**
 * Filtra ayudas técnicas activas.
 */
export function activeAssistiveDevices<T extends AssistiveDeviceLike>(
  devices: T[],
): T[] {
  return devices.filter((d) => d.status === 'ACTIVO');
}

/**
 * Resumen de diagnósticos: conteo por estado.
 * Útil para el panel de visión 360 y el expediente.
 */
export interface DiagnosisSummary {
  total:    number;
  activo:   number;
  cronico:  number;
  resuelto: number;
}

export function summarizeDiagnoses(diagnoses: DiagnosisLike[]): DiagnosisSummary {
  return diagnoses.reduce<DiagnosisSummary>(
    (acc, d) => {
      acc.total++;
      if (d.status === 'ACTIVO')    acc.activo++;
      else if (d.status === 'CRONICO')  acc.cronico++;
      else if (d.status === 'RESUELTO') acc.resuelto++;
      return acc;
    },
    { total: 0, activo: 0, cronico: 0, resuelto: 0 },
  );
}
