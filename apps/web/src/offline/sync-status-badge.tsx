'use client';

import { Badge } from '@vetlla/ui';
import { useCareSync } from './use-care-sync';

export function SyncStatusBadge() {
  const { online, pending } = useCareSync();
  return (
    <span className="flex items-center gap-2">
      <Badge tone={online ? 'green' : 'amber'}>{online ? 'En línea' : 'Sin conexión'}</Badge>
      {pending > 0 && <Badge tone="blue">{pending} por sincronizar</Badge>}
    </span>
  );
}
