'use client';

import Link from 'next/link';
import { Badge, Button, Card, CardContent, EmptyState, PageHeader, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { AnnouncementCategoryBadge } from '@/components/comms-badges';
import { ANNOUNCEMENT_AUDIENCE_LABELS } from '@/lib/labels';

/**
 * Componente que muestra las stats de un comunicado (% leído / % acuse).
 * Solo se renderiza si el usuario tiene comms:broadcast (lo garantiza la llamada
 * permissionProcedure del router).
 */
function AnnouncementStatsInline({ announcementId }: { announcementId: string }) {
  const { t } = useT();
  const stats = api.comms.announcementStats.useQuery({ announcementId });

  if (stats.isLoading) {
    return <Skeleton className="h-4 w-32 rounded-full" />;
  }
  if (!stats.data) return null;

  const { totalRecipients, readPct, ackPct } = stats.data;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="text-[#1A3A3F]/40">
        {t('comms.staff.announcements.stats.recipients', { n: totalRecipients })}
      </span>
      <Badge tone="blue">
        {readPct !== null
          ? t('comms.staff.announcements.stats.read', { pct: readPct })
          : t('comms.staff.announcements.stats.noData')}
      </Badge>
      {ackPct !== null && (
        <Badge tone="green">
          {t('comms.staff.announcements.stats.acked', { pct: ackPct })}
        </Badge>
      )}
    </div>
  );
}

export default function ComunicadosStaffPage() {
  const { t, locale } = useT();
  const meQuery = api.me.useQuery();
  const canBroadcast = meQuery.data?.permissions.includes('comms:broadcast') ?? false;

  const announcements = api.comms.listAnnouncementsForMe.useQuery();
  const list = announcements.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <PageHeader
        title={t('comms.staff.announcements.title')}
        subtitle={t('comms.staff.announcements.intro')}
        accent
        action={
          canBroadcast ? (
            <Link href="/comunicacion/comunicados/nueva">
              <Button>{t('comms.staff.announcements.new')}</Button>
            </Link>
          ) : undefined
        }
      />

      {/* Lista */}
      {announcements.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={t('comms.staff.announcements.empty.title')}
          description={t('comms.staff.announcements.empty.desc')}
          action={
            canBroadcast ? (
              <Link
                href="/comunicacion/comunicados/nueva"
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-700 px-5 py-2 text-base font-semibold text-white transition hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              >
                {t('comms.staff.announcements.new')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((ann) => (
            <Card key={ann.id} className="transition-smooth hover:shadow-card-hover">
              <CardContent className="flex flex-col gap-3">
                {/* Fila superior */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <AnnouncementCategoryBadge category={ann.category} />
                      <Badge tone="neutral">
                        {ANNOUNCEMENT_AUDIENCE_LABELS[ann.audience] ?? ann.audience}
                      </Badge>
                      {ann.requiresAck && (
                        <Badge tone="amber">
                          {t('comms.staff.announcements.requiresAck')}
                        </Badge>
                      )}
                    </div>
                    <h2 className="text-lg font-semibold text-[#1A3A3F] leading-snug">
                      {ann.title}
                    </h2>
                    <p className="line-clamp-2 text-sm text-[#1A3A3F]/60">
                      {ann.body}
                    </p>
                  </div>
                  <time
                    dateTime={ann.publishedAt.toString()}
                    className="shrink-0 text-xs text-[#1A3A3F]/40"
                  >
                    {formatDate(locale, ann.publishedAt)}
                  </time>
                </div>

                {/* Stats (solo si tiene permiso comms:broadcast) */}
                {canBroadcast && (
                  <AnnouncementStatsInline announcementId={ann.id} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
