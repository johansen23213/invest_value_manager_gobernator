/**
 * Helpers de UI para el MAR (Medicine Administration Record).
 * Separados del componente React para poder testearlos de forma aislada.
 * No tienen dependencias de DOM ni de React.
 */

import type { DoseStatus } from './mar';

/**
 * Devuelve la etiqueta de texto para un estado de dosis, considerando
 * el flag `overdue` (dosis pendiente que ya superó el margen de gracia).
 *
 * `t` es la función de traducción del contexto i18n.
 */
export function doseStatusLabel(
  status: DoseStatus,
  overdue: boolean,
  t: (key: string) => string,
): string {
  if (status === 'PENDIENTE' && overdue) return t('med.status.RETRASADA');
  if (status === 'ADMINISTRADO') return t('med.status.ADMINISTRADO');
  if (status === 'NO_ADMINISTRADO') return t('med.status.NO_ADMINISTRADO');
  if (status === 'RECHAZADO') return t('med.status.RECHAZADO');
  return t('med.status.PENDIENTE');
}

/**
 * Tone de Badge para un estado de dosis, teniendo en cuenta `overdue`.
 * "Retrasada" (pendiente + overdue) usa amber, no neutral.
 */
export function doseTone(
  status: DoseStatus,
  overdue: boolean,
): 'green' | 'amber' | 'red' | 'neutral' {
  if (status === 'PENDIENTE' && overdue) return 'amber';
  const map: Record<DoseStatus, 'green' | 'amber' | 'red' | 'neutral'> = {
    ADMINISTRADO: 'green',
    PENDIENTE: 'neutral',
    NO_ADMINISTRADO: 'red',
    RECHAZADO: 'amber',
  };
  return map[status];
}
