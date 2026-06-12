'use client';

import { useState } from 'react';
import { Card, CardContent, EmptyState, Input, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { formatDateTime } from '@/lib/format';
import { VisitStatusBadge } from '@/components/visit-status-badge';
import type { VisitStatus } from '@/lib/visits';

// Devuelve la fecha de hoy en formato YYYY-MM-DD
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Normaliza un código: uppercase + quita espacios
function normalizeCode(code: string): string {
  return code.replace(/\s/g, '').toUpperCase();
}

type Visit = {
  id: string;
  status: string;
  scheduledAt: Date;
  visitorNames: unknown;
  qrCode: string | null;
  notes: string | null;
  resident: { id: string; firstName: string; lastName: string };
  requestedBy: { id: string; name: string | null; email: string };
};

function VisitCard({
  visit,
  locale,
  onApprove,
  onReject,
  onCheckOut,
  onNoShow,
  onCancel,
  mutatingId,
}: {
  visit: Visit;
  locale: string;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  onCheckOut: (id: string) => void;
  onNoShow:  (id: string) => void;
  onCancel:  (id: string) => void;
  mutatingId: string | null;
}) {
  const { t } = useT();
  const visitors = (visit.visitorNames as string[]) ?? [];
  const status = visit.status as VisitStatus;
  const isBusy = mutatingId === visit.id;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {/* Cabecera */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <VisitStatusBadge status={status} />
          <time
            dateTime={visit.scheduledAt.toString()}
            className="text-xs text-[#1A3A3F]/40"
          >
            {formatDateTime(locale as 'es' | 'ca', visit.scheduledAt)}
          </time>
        </div>

        {/* Datos */}
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-semibold text-[#1A3A3F]">
            {visit.resident.firstName} {visit.resident.lastName}
          </p>
          {visitors.length > 0 && (
            <p className="text-[#1A3A3F]/60">
              {t('visits.staff.visitors')}: {visitors.join(', ')}
            </p>
          )}
          <p className="text-[#1A3A3F]/40 text-xs">
            {t('visits.staff.requestedBy')}: {visit.requestedBy.name ?? visit.requestedBy.email}
          </p>
          {visit.qrCode && (
            <p className="text-[#1A3A3F]/40 text-xs font-mono">
              {t('visits.staff.code')}: {visit.qrCode}
            </p>
          )}
        </div>

        {/* Acciones según estado */}
        <div className="flex flex-wrap gap-2">
          {status === 'SOLICITADA' && (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onApprove(visit.id)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-700 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                {isBusy ? t('visits.staff.actions.approving') : t('visits.staff.actions.approve')}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onReject(visit.id)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
              >
                {t('visits.staff.actions.reject')}
              </button>
            </>
          )}
          {status === 'EN_CURSO' && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onCheckOut(visit.id)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-700 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              {t('visits.staff.actions.checkout')}
            </button>
          )}
          {status === 'CONFIRMADA' && (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onNoShow(visit.id)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-brand-200 px-4 py-1.5 text-sm font-medium text-[#1A3A3F]/70 transition hover:bg-brand-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                {t('visits.staff.actions.noshow')}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onCancel(visit.id)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
              >
                {t('visits.staff.actions.cancel')}
              </button>
            </>
          )}
          {(status === 'SOLICITADA') && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onCancel(visit.id)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
            >
              {t('visits.staff.actions.cancel')}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function VisitasStaffPage() {
  const { t, locale } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  const [date, setDate] = useState(todayISO());
  const [codeInput, setCodeInput] = useState('');
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  // Centro (usamos el primer centro disponible del tenant — DIRECTOR/SANITARIO/AUXILIAR)
  const centersQ = api.centers.list.useQuery();
  const centers = centersQ.data ?? [];
  const [selectedCenterId, setSelectedCenterId] = useState('');

  // Cuando se cargan los centros, seleccionamos el primero por defecto
  const centerId = selectedCenterId || (centers[0]?.id ?? '');

  const visitsQ = api.visits.listForCenter.useQuery(
    { centerId, date },
    { enabled: Boolean(centerId) },
  );
  const visitList = (visitsQ.data ?? []) as Visit[];

  // Invalidation helper
  async function invalidate() {
    await utils.visits.listForCenter.invalidate();
  }

  // --- Mutaciones ---
  const checkInMut = api.visits.checkInByCode.useMutation({
    onSuccess: async (visit) => {
      await invalidate();
      const residentName = `${(visit as unknown as { resident?: { firstName: string; lastName: string } }).resident?.firstName ?? ''} ${(visit as unknown as { resident?: { firstName: string; lastName: string } }).resident?.lastName ?? ''}`.trim();
      toast.success(t('visits.staff.checkin.success', { name: residentName || visit.id }));
      setCodeInput('');
    },
    onError: (err) => toast.error(err.message),
  });

  const approveMut = api.visits.approve.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success(t('visits.staff.actions.approved'));
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setMutatingId(null),
  });

  const rejectMut = api.visits.reject.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success(t('visits.staff.actions.rejected'));
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setMutatingId(null),
  });

  const checkOutMut = api.visits.checkOut.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success(t('visits.staff.actions.checkedOut'));
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setMutatingId(null),
  });

  const noShowMut = api.visits.markNoShow.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success(t('visits.staff.actions.noshowed'));
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setMutatingId(null),
  });

  const cancelMut = api.visits.cancel.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success(t('visits.staff.actions.cancelled'));
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setMutatingId(null),
  });

  // --- Handlers ---
  function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeCode(codeInput);
    if (code.length < 1) return;
    checkInMut.mutate({ qrCode: code });
  }

  async function handleApprove(visitId: string) {
    setMutatingId(visitId);
    approveMut.mutate({ visitId });
  }

  async function handleReject(visitId: string) {
    const result = await confirm({
      title:        t('visits.staff.actions.reject.title'),
      tone:         'danger',
      reason: {
        label:       t('visits.staff.actions.reject.reason'),
        required:    true,
        placeholder: t('visits.staff.actions.reject.reasonPh'),
      },
    });
    if (!result) return;
    setMutatingId(visitId);
    rejectMut.mutate({ visitId, reason: result.reason ?? '' });
  }

  async function handleCheckOut(visitId: string) {
    setMutatingId(visitId);
    checkOutMut.mutate({ visitId });
  }

  async function handleNoShow(visitId: string) {
    const result = await confirm({
      title:        t('visits.staff.actions.noshow.title'),
      description:  t('visits.staff.actions.noshow.desc'),
      confirmLabel: t('visits.staff.actions.noshow'),
    });
    if (!result) return;
    setMutatingId(visitId);
    noShowMut.mutate({ visitId });
  }

  async function handleCancel(visitId: string) {
    const result = await confirm({
      title:        t('visits.staff.actions.cancel.title'),
      tone:         'danger',
      reason: {
        label:       t('visits.staff.actions.cancel.reason'),
        required:    true,
        placeholder: t('visits.staff.actions.cancel.reasonPh'),
      },
    });
    if (!result) return;
    setMutatingId(visitId);
    cancelMut.mutate({ visitId, reason: result.reason ?? '' });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
          {t('visits.staff.title')}
        </h1>
        <p className="mt-1 text-sm text-[#1A3A3F]/60">{t('visits.staff.intro')}</p>
      </div>

      {/* Caja de check-in destacada */}
      <Card className="border-2 border-brand-200 bg-brand-50/40">
        <CardContent>
          <form onSubmit={handleCheckIn} className="flex flex-col gap-3">
            <h2 className="font-semibold text-[#1A3A3F]">{t('visits.staff.checkin')}</h2>
            <p className="text-sm text-[#1A3A3F]/60">{t('visits.staff.checkin.hint')}</p>
            <div className="flex gap-2">
              <Input
                id="checkin-code"
                value={codeInput}
                onChange={(e) => setCodeInput(normalizeCode(e.target.value))}
                placeholder={t('visits.staff.checkin.ph')}
                aria-label={t('visits.staff.checkin.label')}
                maxLength={8}
                className="min-h-[56px] flex-1 font-mono text-xl tracking-widest uppercase"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="submit"
                disabled={checkInMut.isPending || codeInput.length === 0}
                className="min-h-[56px] inline-flex items-center justify-center rounded-full bg-brand-700 px-6 text-base font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                {checkInMut.isPending
                  ? t('visits.staff.checkin.submitting')
                  : t('visits.staff.checkin.submit')}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        {centers.length > 1 && (
          <div>
            <label htmlFor="filter-center" className="sr-only">
              {t('visits.staff.center')}
            </label>
            <select
              id="filter-center"
              value={centerId}
              onChange={(e) => setSelectedCenterId(e.target.value)}
              className="min-h-[44px] rounded-2xl border border-brand-200 bg-white px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="filter-date" className="sr-only">
            {t('visits.staff.date')}
          </label>
          <Input
            id="filter-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-[44px]"
          />
        </div>
      </div>

      {/* Lista de visitas */}
      {!centerId || centersQ.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : visitsQ.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : visitList.length === 0 ? (
        <EmptyState
          title={t('visits.staff.empty.title')}
          description={t('visits.staff.empty.desc')}
        />
      ) : (
        <div
          role="list"
          aria-label={t('visits.staff.title')}
          className="flex flex-col gap-3"
        >
          {visitList.map((visit) => (
            <div key={visit.id} role="listitem">
              <VisitCard
                visit={visit}
                locale={locale}
                onApprove={handleApprove}
                onReject={handleReject}
                onCheckOut={handleCheckOut}
                onNoShow={handleNoShow}
                onCancel={handleCancel}
                mutatingId={mutatingId}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
