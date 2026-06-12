'use client';

import { useEffect, useRef } from 'react';
import { Badge, Card, CardContent, EmptyState, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate, formatDateTime } from '@/lib/format';
import { useToast } from '@/components/toast';
import { AnnouncementCategoryBadge } from '@/components/comms-badges';

export default function PortalComunicadosPage() {
  const { t, locale } = useT();
  const toast = useToast();
  const utils = api.useUtils();
  const markedIds = useRef<Set<string>>(new Set());

  const announcements = api.comms.listAnnouncementsForMe.useQuery();
  const list = announcements.data ?? [];

  const markRead = api.comms.markAnnouncementRead.useMutation({
    onSuccess: () => {
      void utils.comms.listAnnouncementsForMe.invalidate();
    },
  });

  const acknowledge = api.comms.acknowledgeAnnouncement.useMutation({
    onSuccess: () => {
      toast.success(t('comms.portal.announcements.ack.done'));
      void utils.comms.listAnnouncementsForMe.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Auto-marcar como leídos los comunicados no leídos al montar
  useEffect(() => {
    if (!announcements.data) return;
    for (const ann of announcements.data) {
      const receipt = ann.receipts[0];
      if (!receipt?.readAt && !markedIds.current.has(ann.id)) {
        markedIds.current.add(ann.id);
        markRead.mutate({ announcementId: ann.id });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements.data]);

  const unreadCount = list.filter((a) => !a.receipts[0]?.readAt).length;
  const pendingAckCount = list.filter(
    (a) => a.requiresAck && !a.receipts[0]?.acknowledgedAt,
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
          {t('comms.portal.announcements.title')}
        </h1>
        <p className="mt-1 text-sm text-[#1A3A3F]/60">
          {t('comms.portal.announcements.intro')}
        </p>
        {(unreadCount > 0 || pendingAckCount > 0) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {unreadCount > 0 && (
              <Badge tone="blue">
                {t('comms.portal.announcements.unread', { count: unreadCount })}
              </Badge>
            )}
            {pendingAckCount > 0 && (
              <Badge tone="amber">
                {t('comms.portal.announcements.pendingAck', { count: pendingAckCount })}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Lista */}
      {announcements.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title={t('comms.portal.announcements.empty.title')}
          description={t('comms.portal.announcements.empty.desc')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((ann) => {
            const receipt = ann.receipts[0];
            const isRead = Boolean(receipt?.readAt);
            const isAcked = Boolean(receipt?.acknowledgedAt);
            const needsAck = ann.requiresAck && !isAcked;

            return (
              <Card
                key={ann.id}
                className={`transition-smooth ${!isRead ? 'border-l-4 border-l-brand-500' : ''}`}
              >
                <CardContent className="flex flex-col gap-3">
                  {/* Cabecera del comunicado */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <AnnouncementCategoryBadge category={ann.category} />
                        {!isRead && (
                          <Badge tone="blue">
                            {t('comms.portal.announcements.unreadBadge')}
                          </Badge>
                        )}
                        {ann.requiresAck && !isAcked && (
                          <Badge tone="amber">
                            {t('comms.staff.announcements.requiresAck')}
                          </Badge>
                        )}
                      </div>
                      <h2 className="text-lg font-semibold text-[#1A3A3F] leading-snug">
                        {ann.title}
                      </h2>
                    </div>
                    <time
                      dateTime={ann.publishedAt.toString()}
                      className="shrink-0 text-xs text-[#1A3A3F]/40"
                    >
                      {formatDate(locale, ann.publishedAt)}
                    </time>
                  </div>

                  {/* Cuerpo */}
                  <p className="whitespace-pre-wrap text-sm text-[#1A3A3F]/80 leading-relaxed">
                    {ann.body}
                  </p>

                  {/* Footer: metadatos de lectura + acuse */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-3 text-xs text-[#1A3A3F]/40">
                      {isRead && receipt?.readAt && (
                        <span>
                          {t('comms.portal.announcements.readAt', {
                            date: formatDateTime(locale, receipt.readAt),
                          })}
                        </span>
                      )}
                      {isAcked && receipt?.acknowledgedAt && (
                        <span>
                          {t('comms.portal.announcements.ackedAt', {
                            date: formatDateTime(locale, receipt.acknowledgedAt),
                          })}
                        </span>
                      )}
                    </div>

                    {needsAck && (
                      <button
                        type="button"
                        aria-label={t('comms.portal.announcements.ack.aria', {
                          title: ann.title,
                        })}
                        disabled={acknowledge.isPending}
                        onClick={() =>
                          acknowledge.mutate({ announcementId: ann.id })
                        }
                        className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:opacity-60"
                      >
                        {t('comms.portal.announcements.ack.button')}
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
