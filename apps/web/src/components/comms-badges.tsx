// Chips de estado y categoría para el módulo de comunicaciones (COM-001..COM-011).
// Patrón idéntico a request-status-badge.tsx:
//   color + TEXTO siempre juntos (WCAG 1.4.1 — el color no es el único canal).

import { Badge } from '@vetlla/ui';
import type { BadgeProps } from '@vetlla/ui';
import {
  ANNOUNCEMENT_CATEGORY_LABELS,
  MESSAGE_THREAD_CATEGORY_LABELS,
  MESSAGE_THREAD_STATUS_LABELS,
} from '@/lib/labels';

type BadgeTone = BadgeProps['tone'];
type AnnouncementCategory = keyof typeof ANNOUNCEMENT_CATEGORY_LABELS;
type MessageThreadCategory = keyof typeof MESSAGE_THREAD_CATEGORY_LABELS;
type MessageThreadStatus = 'ABIERTO' | 'CERRADO';

// ---------------------------------------------------------------------------
// Categoría de comunicado
// ---------------------------------------------------------------------------

const ANNOUNCEMENT_CATEGORY_TONE: Record<AnnouncementCategory, BadgeTone> = {
  GENERAL:        'neutral',
  SALUD:          'blue',
  ADMINISTRACION: 'neutral',
  ACTIVIDADES:    'green',
  URGENTE:        'red',
  MENU:           'warm',
  MANTENIMIENTO:  'amber',
};

const ANNOUNCEMENT_CATEGORY_ICON: Record<AnnouncementCategory, string> = {
  GENERAL:        '📋',
  SALUD:          '⚕',
  ADMINISTRACION: '📄',
  ACTIVIDADES:    '🎯',
  URGENTE:        '!',
  MENU:           '🍽',
  MANTENIMIENTO:  '🔧',
};

export function AnnouncementCategoryBadge({
  category,
}: {
  category: string;
}) {
  const cat = category as AnnouncementCategory;
  const tone = ANNOUNCEMENT_CATEGORY_TONE[cat] ?? 'neutral';
  const icon = ANNOUNCEMENT_CATEGORY_ICON[cat] ?? '●';
  const label = ANNOUNCEMENT_CATEGORY_LABELS[cat] ?? category;
  return (
    <Badge tone={tone}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Categoría de hilo de mensajería
// ---------------------------------------------------------------------------

const THREAD_CATEGORY_TONE: Record<MessageThreadCategory, BadgeTone> = {
  GENERAL:        'neutral',
  SALUD:          'blue',
  ADMINISTRACION: 'neutral',
  ACTIVIDADES:    'green',
  URGENTE:        'red',
};

export function MessageThreadCategoryBadge({
  category,
}: {
  category: string;
}) {
  const cat = category as MessageThreadCategory;
  const tone = THREAD_CATEGORY_TONE[cat] ?? 'neutral';
  const label = MESSAGE_THREAD_CATEGORY_LABELS[cat] ?? category;
  return <Badge tone={tone}>{label}</Badge>;
}

// ---------------------------------------------------------------------------
// Estado de hilo de mensajería
// ---------------------------------------------------------------------------

const THREAD_STATUS_TONE: Record<MessageThreadStatus, BadgeTone> = {
  ABIERTO: 'green',
  CERRADO: 'neutral',
};

const THREAD_STATUS_ICON: Record<MessageThreadStatus, string> = {
  ABIERTO: '●',
  CERRADO: '×',
};

export function MessageThreadStatusBadge({
  status,
}: {
  status: string;
}) {
  const s = status as MessageThreadStatus;
  const tone = THREAD_STATUS_TONE[s] ?? 'neutral';
  const icon = THREAD_STATUS_ICON[s] ?? '●';
  const label = MESSAGE_THREAD_STATUS_LABELS[s] ?? status;
  return (
    <Badge tone={tone}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </Badge>
  );
}
