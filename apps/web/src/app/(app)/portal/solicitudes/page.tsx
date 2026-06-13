'use client';

import Link from 'next/link';
import { Badge, Button, Card, CardContent, EmptyState, PageHeader, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';
import { SR_CATEGORY_LABELS } from '@/lib/labels';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/request-status-badge';
import type { SRStatus, SRPriority } from '@/lib/service-requests';

export default function PortalSolicitudesPage() {
  const { t, locale } = useT();
  const solicitudes = api.requests.listMine.useQuery();
  const list = solicitudes.data ?? [];

  // Solicitudes que necesitan atención del familiar: PENDIENTE_INFO
  const pendingAttention = list.filter((r) => r.status === 'PENDIENTE_INFO');

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <PageHeader
        title={t('requests.portal.title')}
        subtitle={t('requests.portal.intro')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {pendingAttention.length > 0 && (
              <Badge tone="amber" aria-label={t('requests.portal.counter.aria')}>
                {t('requests.portal.attention', { count: pendingAttention.length })}
              </Badge>
            )}
            <Link href="/portal/solicitudes/nueva">
              <Button>{t('requests.portal.new')}</Button>
            </Link>
          </div>
        }
      />

      {/* Lista */}
      {solicitudes.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={t('requests.portal.empty.title')}
          description={t('requests.portal.empty.desc')}
          action={
            <Link
              href="/portal/solicitudes/nueva"
              className="inline-flex min-h-touch items-center justify-center rounded-full bg-brand-700 px-5 py-2 text-base font-semibold text-white transition hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            >
              {t('requests.portal.new')}
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((req) => (
            <Link
              key={req.id}
              href={`/portal/solicitudes/${req.id}`}
              className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <Card className="transition-smooth hover:shadow-card-hover">
                <CardContent>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
                      {/* Título */}
                      <p className="font-semibold text-[#1A3A3F] leading-snug">{req.title}</p>
                      {/* Categoría */}
                      <p className="text-sm text-[#1A3A3F]/60">
                        {SR_CATEGORY_LABELS[req.category] ?? req.category}
                      </p>
                      {/* Residente (si hay varios vinculados) */}
                      <p className="text-xs text-[#1A3A3F]/40">
                        {req.resident.firstName} {req.resident.lastName}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                      <RequestStatusBadge status={req.status as SRStatus} />
                      <RequestPriorityBadge priority={req.priority as SRPriority} />
                      {req.overdue && (
                        <Badge tone="red" aria-label={t('requests.staff.overdueBadge')}>
                          ⚠ {t('requests.staff.overdueBadge')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* Fecha */}
                  <p className="mt-2 text-xs text-[#1A3A3F]/40">
                    {t('requests.detail.createdAt')}{' '}
                    <time dateTime={req.createdAt.toString()}>
                      {formatDateTime(locale, req.createdAt)}
                    </time>
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
