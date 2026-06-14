'use client';

/**
 * Portal de familias — Actividades del residente vinculado.
 *
 * Solo lectura: muestra las actividades en que participa el familiar
 * y su registro de asistencia.
 *
 * Acceso:
 *   - FAMILIAR: portal:read + assertFamilyAccess (endpoint participationForResident)
 *   - Roles staff: también pueden llegar aquí para consultar (uses same endpoint)
 *
 * Accesibilidad (WCAG 2.1 AA):
 *   - Sections con aria-labelledby.
 *   - Badge nunca es el único canal.
 *   - Touch targets mín. 48 px.
 *   - Fechas con <time> + dateTime.
 */

import { Badge, EmptyState, PageHeader, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';

// ---------------------------------------------------------------------------
// Tipos locales (inferidos del endpoint participationForResident)
// ---------------------------------------------------------------------------

type ParticipationEntry = {
  id: string;
  status: string;
  attended: boolean | null;
  observation: string | null;
  session: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: string;
    activity: {
      id: string;
      name: string;
      category: string;
      location: string | null;
    };
  };
};

// ---------------------------------------------------------------------------
// Badge de categoría (solo lectura)
// ---------------------------------------------------------------------------

const CATEGORY_TONE: Record<string, 'blue' | 'green' | 'amber' | 'neutral' | 'warm'> = {
  COGNITIVA: 'blue',
  FISICA:    'green',
  SOCIAL:    'amber',
  CREATIVA:  'warm',
  SALIDA:    'neutral',
  OTRA:      'neutral',
};

function CategoryBadge({ category }: { category: string }) {
  const { t } = useT();
  return (
    <Badge tone={CATEGORY_TONE[category] ?? 'neutral'}>
      {t(`activity.category.${category}`)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Badge de asistencia
// ---------------------------------------------------------------------------

function AttendanceBadge({ attended }: { attended: boolean | null }) {
  const { t } = useT();
  if (attended === null) {
    return <Badge tone="neutral">{t('activities.portal.pending')}</Badge>;
  }
  return attended ? (
    <Badge tone="green">{t('activities.portal.attended')}</Badge>
  ) : (
    <Badge tone="red">{t('activities.portal.notAttended')}</Badge>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de participación
// ---------------------------------------------------------------------------

function ParticipationCard({ entry, locale }: { entry: ParticipationEntry; locale: string }) {
  const { t } = useT();
  const { session } = entry;
  const isCancelled = session.status === 'CANCELADA';

  return (
    <article
      className={`flex flex-col gap-2 rounded-2xl border bg-white px-5 py-4 shadow-card ${
        isCancelled ? 'opacity-60 border-brand-100/60' : 'border-brand-100/60'
      }`}
      aria-label={session.activity.name}
    >
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#1A3A3F]">{session.activity.name}</span>
          <CategoryBadge category={session.activity.category} />
        </div>
        <AttendanceBadge attended={entry.attended} />
      </div>

      {/* Fecha y ubicación */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-[#1A3A3F]/60">
        <time dateTime={session.startsAt.toString()}>
          {formatDateTime(locale as 'es' | 'ca', session.startsAt)}
        </time>
        {session.activity.location && (
          <span>· {session.activity.location}</span>
        )}
        {isCancelled && (
          <Badge tone="red">{t('activity.session.status.CANCELADA')}</Badge>
        )}
      </div>

      {/* Observación del personal */}
      {entry.observation && (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-[#1A3A3F]/70 italic">
          {entry.observation}
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function PortalActividadesPage() {
  const { t, locale } = useT();

  // Obtener el residente vinculado a la cuenta del familiar
  const portalQ = api.family.portal.useQuery();
  const residents = portalQ.data ?? [];
  const residentId = residents[0]?.id ?? '';

  // El portal de familia usa el endpoint familiar (portal:read + assertFamilyAccess);
  // participationForResident quedó como staff-only (activities:read) tras SEC-A04.
  const participationQ = api.actividades.portal.participationForResidentFamiliar.useQuery(
    { residentId },
    { enabled: Boolean(residentId) },
  );
  const participation = (participationQ.data ?? []) as ParticipationEntry[];

  // Separar: próximas (PROGRAMADA, no ha pasado) y pasadas
  const now = new Date();
  const upcoming = participation.filter(
    (p) => p.session.status === 'PROGRAMADA' && new Date(p.session.startsAt) >= now,
  );
  const past = participation.filter(
    (p) => p.session.status !== 'PROGRAMADA' || new Date(p.session.startsAt) < now,
  );

  // ── Carga ────────────────────────────────────────────────────────────────
  if (portalQ.isLoading || (residentId && participationQ.isLoading)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // ── Sin residente vinculado ───────────────────────────────────────────────
  if (!residentId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={t('activities.portal.title')} accent />
        <p className="text-[#1A3A3F]/60">{t('portal.noResident')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('activities.portal.title')}
        subtitle={t('activities.portal.intro')}
        accent
      />

      {participation.length === 0 ? (
        <EmptyState
          title={t('activities.portal.empty.title')}
          description={t('activities.portal.empty.desc')}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {/* Próximas */}
          {upcoming.length > 0 && (
            <section aria-labelledby="upcoming-activities-heading">
              <h2
                id="upcoming-activities-heading"
                className="mb-3 text-base font-semibold text-[#1A3A3F]"
              >
                {t('visits.portal.upcoming')}
              </h2>
              <div className="flex flex-col gap-3">
                {upcoming.map((entry) => (
                  <ParticipationCard key={entry.id} entry={entry} locale={locale} />
                ))}
              </div>
            </section>
          )}

          {/* Historial */}
          {past.length > 0 && (
            <section aria-labelledby="past-activities-heading">
              <h2
                id="past-activities-heading"
                className="mb-3 text-base font-semibold text-[#1A3A3F]"
              >
                {t('visits.portal.history')}
              </h2>
              <div className="flex flex-col gap-3">
                {past.map((entry) => (
                  <ParticipationCard key={entry.id} entry={entry} locale={locale} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
