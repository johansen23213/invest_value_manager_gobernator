// Componente compartido para el chip de estado de solicitud.
// Color + TEXTO siempre juntos (WCAG 1.4.1: el color no es el único canal).
// Importable tanto desde el portal del familiar como desde el backoffice del staff.

import { Badge } from '@vetlla/ui';
import type { BadgeProps } from '@vetlla/ui';
import { SR_STATUS_LABELS, SR_PRIORITY_LABELS } from '@/lib/labels';
import type { SRStatus, SRPriority } from '@/lib/service-requests';

type BadgeTone = BadgeProps['tone'];

const STATUS_TONE: Record<SRStatus, BadgeTone> = {
  RECIBIDA:       'blue',
  ASIGNADA:       'neutral',
  EN_CURSO:       'blue',
  PENDIENTE_INFO: 'amber',
  RESUELTA:       'green',
  CERRADA:        'neutral',
  REABIERTA:      'amber',
};

// Iconos decorativos inline (aria-hidden) — mejoran la escaneabilidad sin ser canal único.
const STATUS_ICON: Record<SRStatus, string> = {
  RECIBIDA:       '●',
  ASIGNADA:       '→',
  EN_CURSO:       '▶',
  PENDIENTE_INFO: '?',
  RESUELTA:       '✓',
  CERRADA:        '×',
  REABIERTA:      '↩',
};

const PRIORITY_TONE: Record<SRPriority, BadgeTone> = {
  BAJA:    'neutral',
  NORMAL:  'blue',
  ALTA:    'amber',
  URGENTE: 'red',
};

export function RequestStatusBadge({ status }: { status: SRStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span>
      {SR_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function RequestPriorityBadge({ priority }: { priority: SRPriority }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]}>
      {SR_PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}
