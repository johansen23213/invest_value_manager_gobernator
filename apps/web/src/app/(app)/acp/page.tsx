'use client';

/**
 * Panel de revisiones ACP pendientes (RF-SOC-007).
 *
 * Lista residentes con revisión del perfil de bienestar ACP vencida o próxima
 * (UNE 158101). Permite filtrar por centro y acceder al perfil de cada residente.
 *
 * Útil para el inspector de la administración: demuestra que las revisiones
 * se mantienen al día conforme a la normativa.
 */

import Link from 'next/link';
import { Badge, Card, CardContent, EmptyState } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { getReviewStatus, daysUntilReview, type ReviewStatus } from '@/lib/wellbeing';

// ---------------------------------------------------------------------------
// Chip de estado de revisión
// ---------------------------------------------------------------------------

type ReviewStatusTone = 'red' | 'amber' | 'green' | 'neutral';

const STATUS_TONE: Record<ReviewStatus, ReviewStatusTone> = {
  OVERDUE: 'red',
  DUE_SOON: 'amber',
  OK: 'green',
  NOT_SET: 'neutral',
};

function ReviewChip({
  nextReviewDate,
  t,
}: {
  nextReviewDate: Date | null | undefined;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const now = new Date();
  const status = getReviewStatus(nextReviewDate, now);
  const days = daysUntilReview(nextReviewDate, now);
  const tone = STATUS_TONE[status];

  let label = t(`exp.wellbeing.review.${status}`);
  if (status === 'DUE_SOON' && days !== null) {
    label = `${label} (${Math.abs(days)}d)`;
  }
  if (status === 'OVERDUE' && days !== null) {
    label = `${label} (${Math.abs(days)}d)`;
  }

  return <Badge tone={tone}>{label}</Badge>;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AcpPage() {
  const { t, locale } = useT();
  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);

  const reviewsQ = api.social.wellbeing.listOverdueReviews.useQuery({});
  const reviews = reviewsQ.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1A3A3F]">
          {t('acp.title')}
        </h1>
        <p className="mt-1 text-sm text-[#1A3A3F]/60">{t('acp.subtitle')}</p>
      </div>

      {/* Resumen de badges */}
      {!reviewsQ.isLoading && reviews.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const now = new Date();
            const overdue = reviews.filter((r) => getReviewStatus(r.nextReviewDate, now) === 'OVERDUE').length;
            const dueSoon = reviews.filter((r) => getReviewStatus(r.nextReviewDate, now) === 'DUE_SOON').length;
            return (
              <>
                {overdue > 0 && (
                  <Badge tone="red">
                    {overdue} {t('acp.badge.overdue')}
                  </Badge>
                )}
                {dueSoon > 0 && (
                  <Badge tone="amber">
                    {dueSoon} {t('acp.badge.due_soon')}
                  </Badge>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Tabla / lista */}
      <Card>
        <CardContent>
          {reviewsQ.isLoading ? (
            <p className="text-sm text-[#1A3A3F]/60">Cargando…</p>
          ) : reviews.length === 0 ? (
            <EmptyState
              title={t('acp.empty.title')}
              description={t('acp.empty.desc')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-100 text-left text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                    <th className="py-2 pr-4">{t('acp.col.resident')}</th>
                    <th className="py-2 pr-4">{t('acp.col.nextReview')}</th>
                    <th className="py-2 pr-4">{t('acp.col.status')}</th>
                    <th className="py-2 pr-4">{t('acp.col.updatedBy')}</th>
                    <th className="py-2">{t('acp.col.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-brand-100/40 last:border-0 hover:bg-brand-50/50"
                    >
                      <td className="py-3 pr-4 font-medium text-[#1A3A3F]">
                        {r.resident.firstName} {r.resident.lastName}
                        {r.resident.bed && (
                          <span className="ml-1 text-xs text-[#1A3A3F]/50">
                            · Plaza {r.resident.bed.code}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-[#1A3A3F]/70">
                        {r.nextReviewDate ? fmtDate(r.nextReviewDate) : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <ReviewChip nextReviewDate={r.nextReviewDate} t={t} />
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#1A3A3F]/60">
                        {r.updatedBy?.name ?? '—'}
                      </td>
                      <td className="py-3">
                        <Link
                          href={`/residentes/${r.resident.id}?tab=bienestar`}
                          className="text-brand-700 hover:underline focus-visible:underline font-medium text-sm min-h-[48px] inline-flex items-center"
                        >
                          {t('acp.action.viewProfile')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
