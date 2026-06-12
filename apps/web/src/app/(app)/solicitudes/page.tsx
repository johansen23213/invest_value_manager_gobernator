'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card, CardContent, EmptyState, Select, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';
import { SR_CATEGORY_LABELS, SR_STATUS_LABELS } from '@/lib/labels';
import { RequestPriorityBadge, RequestStatusBadge } from '@/components/request-status-badge';
import type { SRCategory, SRStatus } from '@/lib/service-requests';

const ALL_STATUSES = Object.keys(SR_STATUS_LABELS) as SRStatus[];
const ALL_CATEGORIES = Object.keys(SR_CATEGORY_LABELS) as SRCategory[];

export default function SolicitudesStaffPage() {
  const { t, locale } = useT();
  const [statusFilter, setStatusFilter] = useState<SRStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<SRCategory | ''>('');

  const solicitudes = api.requests.listAll.useQuery({
    status:   statusFilter   || undefined,
    category: categoryFilter || undefined,
  });

  const list = solicitudes.data ?? [];
  const overdueCount = list.filter((r) => r.overdue).length;
  const pendingCount = list.filter(
    (r) => !['RESUELTA', 'CERRADA'].includes(r.status),
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
            {t('requests.staff.title')}
          </h1>
          <p className="mt-1 text-sm text-[#1A3A3F]/60">{t('requests.staff.intro')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pendingCount > 0 && (
              <Badge tone="blue">
                {t('requests.staff.pendingBadge', { count: pendingCount })}
              </Badge>
            )}
            {overdueCount > 0 && (
              <Badge tone="red">
                {t('requests.staff.overdueBadgeCount', { count: overdueCount })}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="filter-status" className="sr-only">
            {t('requests.staff.filterStatus')}
          </label>
          <Select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SRStatus | '')}
            className="w-auto min-w-[10rem]"
          >
            <option value="">{t('requests.staff.filterStatus')}: {t('requests.staff.filterAll')}</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SR_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="filter-category" className="sr-only">
            {t('requests.staff.filterCategory')}
          </label>
          <Select
            id="filter-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as SRCategory | '')}
            className="w-auto min-w-[12rem]"
          >
            <option value="">{t('requests.staff.filterCategory')}: {t('requests.staff.filterAll')}</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SR_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Lista */}
      {solicitudes.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={t('requests.staff.empty.title')}
          description={t('requests.staff.empty.desc')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Encabezado de tabla oculto (accesible) */}
          <div
            role="list"
            aria-label={t('requests.staff.title')}
            className="flex flex-col gap-3"
          >
            {list.map((req) => (
              <div key={req.id} role="listitem">
                <Link
                  href={`/solicitudes/${req.id}`}
                  className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <Card
                    className={`transition-smooth hover:shadow-card-hover ${
                      req.overdue ? 'border-l-4 border-l-red-500' : ''
                    }`}
                  >
                    <CardContent>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-[#1A3A3F] leading-snug">
                              {req.title}
                            </p>
                            {req.overdue && (
                              <Badge tone="red">⚠ {t('requests.staff.overdueBadge')}</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-[#1A3A3F]/60">
                            {SR_CATEGORY_LABELS[req.category] ?? req.category}
                            {' · '}
                            {t('requests.staff.resident')}: {req.resident.firstName}{' '}
                            {req.resident.lastName}
                          </p>
                          <p className="text-xs text-[#1A3A3F]/40">
                            {t('requests.staff.assignedTo')}:{' '}
                            {req.assignedTo?.name ?? t('requests.staff.unassigned')}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                          <RequestStatusBadge status={req.status as SRStatus} />
                          <RequestPriorityBadge priority={req.priority as 'BAJA' | 'NORMAL' | 'ALTA' | 'URGENTE'} />
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-[#1A3A3F]/40">
                        {formatDateTime(locale, req.createdAt)}
                        {' · '}
                        {req.commentCount}{' '}
                        {req.commentCount === 1 ? 'comentario' : 'comentarios'}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
