// Componente compartido para el chip de estado de visita.
// Color + TEXTO + ICONO siempre juntos (WCAG 1.4.1: el color no es el único canal).
// Importable tanto desde el portal del familiar como desde el backoffice del staff.

import { Badge } from '@vetlla/ui';
import type { BadgeProps } from '@vetlla/ui';
import { VISIT_STATUS_LABELS } from '@/lib/labels';
import type { VisitStatus } from '@/lib/visits';

type BadgeTone = BadgeProps['tone'];

const STATUS_TONE: Record<VisitStatus, BadgeTone> = {
  SOLICITADA: 'amber',
  CONFIRMADA: 'green',
  RECHAZADA:  'red',
  CANCELADA:  'neutral',
  EN_CURSO:   'blue',
  COMPLETADA: 'neutral',
  NO_SHOW:    'red',
};

// Iconos decorativos inline (aria-hidden) — mejoran la escaneabilidad sin ser canal único.
const STATUS_ICON: Record<VisitStatus, string> = {
  SOLICITADA: '?',
  CONFIRMADA: '✓',
  RECHAZADA:  '×',
  CANCELADA:  '×',
  EN_CURSO:   '▶',
  COMPLETADA: '●',
  NO_SHOW:    '!',
};

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span>{' '}
      {VISIT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
