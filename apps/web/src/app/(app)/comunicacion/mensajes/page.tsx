'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card, CardContent, EmptyState, PageHeader, Select, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';
import {
  MessageThreadCategoryBadge,
  MessageThreadStatusBadge,
} from '@/components/comms-badges';
import { MESSAGE_THREAD_CATEGORY_LABELS, MESSAGE_THREAD_STATUS_LABELS } from '@/lib/labels';
import type { MessageThreadStatus, MessageThreadCategory } from '@vetlla/db';

const ALL_STATUSES = Object.keys(MESSAGE_THREAD_STATUS_LABELS) as MessageThreadStatus[];
const ALL_CATEGORIES = Object.keys(MESSAGE_THREAD_CATEGORY_LABELS) as MessageThreadCategory[];

export default function MensajesStaffPage() {
  const { t, locale } = useT();
  const [statusFilter, setStatusFilter] = useState<MessageThreadStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<MessageThreadCategory | ''>('');

  const threads = api.comms.listThreads.useQuery({
    status:   statusFilter   || undefined,
    category: categoryFilter || undefined,
  });

  const list = threads.data ?? [];
  const totalUnread = list.reduce((sum, th) => sum + th.unreadCount, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <PageHeader
        title={t('comms.staff.messages.title')}
        subtitle={t('comms.staff.messages.intro')}
        accent
        action={
          totalUnread > 0 ? (
            <Badge tone="blue">
              {t('comms.staff.messages.unreadCount', { count: totalUnread })}
            </Badge>
          ) : undefined
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="filter-status" className="sr-only">
            {t('comms.staff.messages.filterStatus')}
          </label>
          <Select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MessageThreadStatus | '')}
            className="w-auto min-w-[10rem]"
          >
            <option value="">
              {t('comms.staff.messages.filterStatus')}: {t('comms.staff.messages.filterAll')}
            </option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MESSAGE_THREAD_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="filter-category" className="sr-only">
            {t('comms.staff.messages.filterCategory')}
          </label>
          <Select
            id="filter-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as MessageThreadCategory | '')}
            className="w-auto min-w-[12rem]"
          >
            <option value="">
              {t('comms.staff.messages.filterCategory')}: {t('comms.staff.messages.filterAll')}
            </option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {MESSAGE_THREAD_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Lista */}
      {threads.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={t('comms.staff.messages.empty.title')}
          description={t('comms.staff.messages.empty.desc')}
        />
      ) : (
        <div
          role="list"
          aria-label={t('comms.staff.messages.title')}
          className="flex flex-col gap-3"
        >
          {list.map((thread) => (
            <div key={thread.id} role="listitem">
              <Link
                href={`/comunicacion/mensajes/${thread.id}`}
                className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                <Card className="transition-smooth hover:shadow-card-hover">
                  <CardContent>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <MessageThreadCategoryBadge category={thread.category} />
                          <MessageThreadStatusBadge status={thread.status} />
                        </div>
                        <p className="font-semibold text-[#1A3A3F] leading-snug">
                          {thread.subject}
                        </p>
                        <p className="text-sm text-[#1A3A3F]/60">
                          {thread.resident.firstName} {thread.resident.lastName}
                          {thread.createdBy && (
                            <span className="text-[#1A3A3F]/40">
                              {' · '}
                              {t('comms.staff.messages.createdBy', {
                                name: thread.createdBy.name ?? '—',
                              })}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {thread.unreadCount > 0 && (
                          <Badge tone="blue">
                            {t('comms.staff.messages.unreadCount', {
                              count: thread.unreadCount,
                            })}
                          </Badge>
                        )}
                        <time
                          dateTime={thread.lastMessageAt.toString()}
                          className="text-xs text-[#1A3A3F]/40"
                        >
                          {formatDateTime(locale, thread.lastMessageAt)}
                        </time>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
