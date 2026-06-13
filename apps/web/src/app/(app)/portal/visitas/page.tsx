'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent, EmptyState, PageHeader, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { formatDate, formatDateTime } from '@/lib/format';
import { VisitStatusBadge } from '@/components/visit-status-badge';
import { canCancel } from '@/lib/visits';
import type { VisitStatus } from '@/lib/visits';

// Estados "activos" (próximas + en curso) que aparecen primero.
const ACTIVE_STATUSES: VisitStatus[] = ['CONFIRMADA', 'EN_CURSO'];
const PENDING_STATUSES: VisitStatus[] = ['SOLICITADA'];
const HISTORY_STATUSES: VisitStatus[] = ['COMPLETADA', 'CANCELADA', 'RECHAZADA', 'NO_SHOW'];

/** Tarjeta de embarque para visita CONFIRMADA */
function BoardingCard({
  visit,
  locale,
}: {
  visit: {
    id: string;
    qrCode: string | null;
    scheduledAt: Date;
    visitorNames: unknown;
    resident: { firstName: string; lastName: string };
    status: string;
  };
  locale: string;
}) {
  const { t } = useT();
  const visitors = (visit.visitorNames as string[]) ?? [];

  return (
    <Card className="border-2 border-brand-300 bg-white shadow-card">
      <CardContent className="flex flex-col gap-4">
        {/* Cabecera con badge de estado */}
        <div className="flex items-center justify-between">
          <VisitStatusBadge status={visit.status as VisitStatus} />
          <time
            dateTime={visit.scheduledAt.toString()}
            className="text-xs text-[#1A3A3F]/40"
          >
            {formatDateTime(locale as 'es' | 'ca', visit.scheduledAt)}
          </time>
        </div>

        {/* Código de visita — estilo tarjeta de embarque */}
        {visit.qrCode && (
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-brand-50 px-4 py-5">
            <p className="text-xs font-medium uppercase tracking-widest text-brand-600">
              {t('visits.portal.codeLabel')}
            </p>
            <p
              className="select-all font-mono text-4xl font-extrabold tracking-[0.25em] text-[#1A3A3F]"
              aria-label={`${t('visits.portal.codeLabel')}: ${visit.qrCode}`}
            >
              {visit.qrCode}
            </p>
            <p className="mt-1 text-center text-xs text-brand-600">
              {t('visits.portal.presentNote')}
            </p>
          </div>
        )}

        {/* Residente y visitantes */}
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-[#1A3A3F]/60">
            {t('visits.portal.resident')}:{' '}
            <strong className="text-[#1A3A3F]">
              {visit.resident.firstName} {visit.resident.lastName}
            </strong>
          </p>
          {visitors.length > 0 && (
            <p className="text-[#1A3A3F]/60">
              {t('visits.portal.visitors')}: {visitors.join(', ')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Tarjeta compacta para visita SOLICITADA */
function PendingCard({
  visit,
  locale,
  onCancel,
  cancelling,
}: {
  visit: {
    id: string;
    scheduledAt: Date;
    visitorNames: unknown;
    resident: { firstName: string; lastName: string };
    status: string;
  };
  locale: string;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const { t } = useT();
  const visitors = (visit.visitorNames as string[]) ?? [];
  const canCancelVisit = canCancel(
    { status: visit.status as VisitStatus, scheduledAt: visit.scheduledAt },
    new Date(),
  );

  return (
    <Card className="border border-amber-200 bg-amber-50/30">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <VisitStatusBadge status={visit.status as VisitStatus} />
          <time
            dateTime={visit.scheduledAt.toString()}
            className="text-xs text-[#1A3A3F]/40"
          >
            {formatDateTime(locale as 'es' | 'ca', visit.scheduledAt)}
          </time>
        </div>
        <p className="text-xs text-amber-700">{t('visits.portal.pendingNote')}</p>
        <div className="text-sm text-[#1A3A3F]/60">
          <p>
            {t('visits.portal.resident')}:{' '}
            <strong className="text-[#1A3A3F]">
              {visit.resident.firstName} {visit.resident.lastName}
            </strong>
          </p>
          {visitors.length > 0 && (
            <p>{t('visits.portal.visitors')}: {visitors.join(', ')}</p>
          )}
        </div>
        {canCancelVisit && (
          <button
            type="button"
            disabled={cancelling}
            onClick={() => onCancel(visit.id)}
            className="mt-1 self-start text-sm font-medium text-red-600 hover:underline disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 min-h-[44px] flex items-center"
          >
            {t('visits.portal.cancel')}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

/** Tarjeta compacta para historial */
function HistoryCard({
  visit,
  locale,
}: {
  visit: {
    id: string;
    scheduledAt: Date;
    visitorNames: unknown;
    resident: { firstName: string; lastName: string };
    status: string;
  };
  locale: string;
}) {
  const visitors = (visit.visitorNames as string[]) ?? [];

  return (
    <Card className="opacity-70">
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <VisitStatusBadge status={visit.status as VisitStatus} />
          <time
            dateTime={visit.scheduledAt.toString()}
            className="text-xs text-[#1A3A3F]/40"
          >
            {formatDate(locale as 'es' | 'ca', visit.scheduledAt)}
          </time>
        </div>
        <div className="text-sm text-[#1A3A3F]/60">
          <p>
            {visit.resident.firstName} {visit.resident.lastName}
            {visitors.length > 0 && <> · {visitors.join(', ')}</>}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortalVisitasPage() {
  const { t, locale } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const [showHistory, setShowHistory] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const visitsQ = api.visits.listMine.useQuery();
  const utils = api.useUtils();

  const cancelMut = api.visits.cancel.useMutation({
    onSuccess: async () => {
      await utils.visits.listMine.invalidate();
      toast.success(t('visits.portal.cancel.done'));
    },
    onError: (err) => {
      toast.error(err.message);
    },
    onSettled: () => {
      setCancellingId(null);
    },
  });

  async function handleCancel(visitId: string) {
    const result = await confirm({
      title:        t('visits.portal.cancel.confirm.title'),
      description:  t('visits.portal.cancel.confirm.desc'),
      confirmLabel: t('visits.portal.cancel'),
      tone:         'danger',
      reason: {
        label:       t('visits.portal.cancel.reason'),
        required:    true,
        placeholder: t('visits.portal.cancel.reasonPh'),
      },
    });
    if (!result) return;
    setCancellingId(visitId);
    cancelMut.mutate({ visitId, reason: result.reason ?? '' });
  }

  const all = visitsQ.data ?? [];

  // Separar por grupo (los activos/confirmados van primero, luego pendientes, luego historial)
  const upcoming = all.filter((v) => ACTIVE_STATUSES.includes(v.status as VisitStatus));
  const pending  = all.filter((v) => PENDING_STATUSES.includes(v.status as VisitStatus));
  const history  = all.filter((v) => HISTORY_STATUSES.includes(v.status as VisitStatus));

  // Próxima visita confirmada para el badge (la más cercana en el futuro)
  const now = new Date();
  const nextConfirmed = upcoming
    .filter((v) => v.status === 'CONFIRMADA' && new Date(v.scheduledAt) > now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <PageHeader
        title={t('visits.portal.title')}
        subtitle={t('visits.portal.intro')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {nextConfirmed && (
              <Badge tone="green">
                {t('visits.portal.nextVisit', {
                  date: formatDate(locale, new Date(nextConfirmed.scheduledAt)),
                })}
              </Badge>
            )}
            <Link href="/portal/visitas/nueva">
              <Button size="lg">{t('visits.portal.new')}</Button>
            </Link>
          </div>
        }
      />

      {/* Contenido */}
      {visitsQ.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          title={t('visits.portal.empty.title')}
          description={t('visits.portal.empty.desc')}
          action={
            <Link
              href="/portal/visitas/nueva"
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-700 px-5 py-2 text-base font-semibold text-white transition hover:bg-brand-800 active:bg-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
            >
              {t('visits.portal.new')}
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {/* Próximas (CONFIRMADA / EN_CURSO) */}
          {upcoming.length > 0 && (
            <section aria-labelledby="upcoming-heading">
              <h2
                id="upcoming-heading"
                className="mb-3 text-base font-semibold text-[#1A3A3F]"
              >
                {t('visits.portal.upcoming')}
              </h2>
              <div className="flex flex-col gap-3">
                {upcoming.map((v) => (
                  <BoardingCard
                    key={v.id}
                    visit={v}
                    locale={locale}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Pendientes de confirmación (SOLICITADA) */}
          {pending.length > 0 && (
            <section aria-labelledby="pending-heading">
              <h2
                id="pending-heading"
                className="mb-3 text-base font-semibold text-[#1A3A3F]"
              >
                {t('visits.portal.pending')}
              </h2>
              <div className="flex flex-col gap-3">
                {pending.map((v) => (
                  <PendingCard
                    key={v.id}
                    visit={v}
                    locale={locale}
                    onCancel={handleCancel}
                    cancelling={cancellingId === v.id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Historial (plegado) */}
          {history.length > 0 && (
            <section aria-labelledby="history-heading">
              <div className="flex items-center justify-between">
                <h2
                  id="history-heading"
                  className="text-base font-semibold text-[#1A3A3F]"
                >
                  {t('visits.portal.history')}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowHistory((s) => !s)}
                  className="text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 min-h-[44px] flex items-center"
                  aria-expanded={showHistory}
                  aria-controls="history-list"
                >
                  {showHistory
                    ? t('visits.portal.history.hide')
                    : t('visits.portal.history.show')}
                </button>
              </div>
              {showHistory && (
                <div id="history-list" className="mt-3 flex flex-col gap-3">
                  {history.map((v) => (
                    <HistoryCard
                      key={v.id}
                      visit={v}
                      locale={locale}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
