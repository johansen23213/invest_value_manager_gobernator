'use client';

import { Badge } from '@vetlla/ui';
import { useCareSync } from './use-care-sync';
import { useT } from '@/i18n/provider';

export function SyncStatusBadge() {
  const { online, pending } = useCareSync();
  const { t } = useT();
  return (
    <span className="flex items-center gap-2" aria-live="polite">
      <Badge tone={online ? 'green' : 'amber'}>{online ? t('state.online') : t('state.offline')}</Badge>
      {pending > 0 && <Badge tone="blue">{t('state.pendingSync', { count: pending })}</Badge>}
    </span>
  );
}
