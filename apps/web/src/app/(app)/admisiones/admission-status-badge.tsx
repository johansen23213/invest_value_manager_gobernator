'use client';

import { Badge, type BadgeProps } from '@vetlla/ui';
import type { AdmissionStatus } from '@vetlla/db';

const STATUS_TONE: Record<AdmissionStatus, BadgeProps['tone']> = {
  LEAD:       'neutral',
  WAITLIST:   'blue',
  EVALUATION: 'amber',
  OFFERED:    'green',
  ADMITTED:   'green',
  REJECTED:   'red',
  WITHDRAWN:  'neutral',
};

/** Etiquetas en castellano (usadas como fallback si el i18n no está disponible). */
const STATUS_LABEL_ES: Record<AdmissionStatus, string> = {
  LEAD:       'Primer contacto',
  WAITLIST:   'Lista de espera',
  EVALUATION: 'Evaluación',
  OFFERED:    'Plaza ofertada',
  ADMITTED:   'Ingresado',
  REJECTED:   'Rechazada',
  WITHDRAWN:  'Retirada',
};

interface AdmissionStatusBadgeProps {
  status: AdmissionStatus;
  t?: (key: string) => string;
}

export function AdmissionStatusBadge({ status, t }: AdmissionStatusBadgeProps) {
  const label = t ? t(`admission.status.${status}`) : STATUS_LABEL_ES[status];
  return <Badge tone={STATUS_TONE[status]}>{label}</Badge>;
}
