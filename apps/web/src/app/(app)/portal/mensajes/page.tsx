'use client';

import Link from 'next/link';
import { Badge, Button, Card, CardContent, EmptyState, PageHeader, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';
import { MessageThreadCategoryBadge, MessageThreadStatusBadge } from '@/components/comms-badges';

export default function PortalMensajesPage() {
  const { t, locale } = useT();
  const threads = api.comms.listThreads.useQuery();
  const list = threads.data ?? [];

  const totalUnread = list.reduce((sum, th) => sum + th.unreadCount, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <PageHeader
        title={t('comms.portal.messages.title')}
        subtitle={t('comms.portal.messages.intro')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {totalUnread > 0 && (
              <Badge tone="blue">
                {t('comms.portal.messages.unreadCount', { count: totalUnread })}
              </Badge>
            )}
            <Link href="/portal/mensajes/nueva">
              <Button>{t('comms.portal.messages.new')}</Button>
            </Link>
          </div>
        }
      />

      {/* Lista de hilos */}
      {threads.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={t('comms.portal.messages.empty.title')}
          description={t('comms.portal.messages.empty.desc')}
          action={
            <Link
              href="/portal/mensajes/nueva"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-700 px-5 py-2 text-base font-semibold text-white transition hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            >
              {t('comms.portal.messages.new')}
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((thread) => (
            <Link
              key={thread.id}
              href={`/portal/mensajes/${thread.id}`}
              className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <Card className="transition-smooth hover:shadow-card-hover">
                <CardContent>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex flex-col gap-1">
                      {/* Chips de categoría y estado */}
                      <div className="flex flex-wrap items-center gap-2">
                        <MessageThreadCategoryBadge category={thread.category} />
                        <MessageThreadStatusBadge status={thread.status} />
                      </div>
                      {/* Asunto */}
                      <p className="font-semibold text-[#1A3A3F] leading-snug">
                        {thread.subject}
                      </p>
                      {/* Residente */}
                      <p className="text-sm text-[#1A3A3F]/60">
                        {thread.resident.firstName} {thread.resident.lastName}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {thread.unreadCount > 0 && (
                        <Badge tone="blue">
                          {t('comms.portal.messages.unreadCount', {
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
          ))}
        </div>
      )}
    </div>
  );
}
