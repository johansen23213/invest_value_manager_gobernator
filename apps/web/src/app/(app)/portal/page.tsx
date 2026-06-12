'use client';

import Link from 'next/link';
import { Badge, Card, CardContent, CardTitle } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDateTime, formatDate } from '@/lib/format';
import { humanizeCareRecord } from '@/lib/care-humanize';
import { interpretScale, SCALE_RANGES, type ScaleType } from '@/lib/scales';
import {
  ALLERGY_SEVERITY_LABELS,
  ASSESSMENT_TYPE_LABELS,
  CARE_TYPE_LABELS,
  RESIDENT_STATUS_LABELS,
} from '@/lib/labels';


/** Aviso amable cuando el centro ha ocultado una sección a este acceso (UX-20). */
function PrivacyNotice({ text }: { text: string }) {
  return <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">{text}</p>;
}

export default function PortalPage() {
  const { t, locale } = useT();
  const portal = api.family.portal.useQuery();
  // Contador de solicitudes que necesitan respuesta del familiar
  const solicitudes = api.requests.listMine.useQuery();
  const pendingAttention = (solicitudes.data ?? []).filter(
    (r) => r.status === 'PENDIENTE_INFO',
  ).length;

  // Visitas: próxima visita confirmada
  const visits = api.visits.listMine.useQuery();
  const visitList = visits.data ?? [];
  const now = new Date();
  const nextConfirmedVisit = visitList
    .filter((v) => v.status === 'CONFIRMADA' && new Date(v.scheduledAt) > now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

  // Comunicados: no leídos + pendientes de acuse
  const announcements = api.comms.listAnnouncementsForMe.useQuery();
  const annList = announcements.data ?? [];
  const annUnread = annList.filter((a) => !a.receipts[0]?.readAt).length;
  const annPendingAck = annList.filter(
    (a) => a.requiresAck && !a.receipts[0]?.acknowledgedAt,
  ).length;

  // Mensajes: hilos con no leídos
  const threads = api.comms.listThreads.useQuery();
  const threadList = threads.data ?? [];
  const msgUnread = threadList.reduce((sum, th) => sum + th.unreadCount, 0);

  if (portal.isLoading) return <p className="text-[#1A3A3F]/60">…</p>;
  const residents = portal.data ?? [];
  if (residents.length === 0) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-[#1A3A3F]">{t('portal.title')}</h1>
        <p className="text-[#1A3A3F]/60">{t('portal.noResident')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1A3A3F]">{t('portal.title')}</h1>
        <p className="mt-1 text-sm text-[#1A3A3F]/60">{t('portal.intro')}</p>
      </div>

      {/* Accesos rápidos — visitas, solicitudes, comunicados, mensajes */}
      <div className="flex flex-col gap-3">
        {/* Visitas */}
        <Link
          href="/portal/visitas"
          className="flex items-center justify-between rounded-2xl border border-brand-100/60 bg-white px-5 py-4 shadow-card transition-smooth hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          aria-label={t('visits.portal.quicklink.label')}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 text-lg" aria-hidden="true">
              🗓
            </span>
            <div>
              <p className="font-semibold text-[#1A3A3F]">{t('visits.portal.quicklink.label')}</p>
              <p className="text-sm text-[#1A3A3F]/60">{t('visits.portal.quicklink.desc')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {nextConfirmedVisit && (
              <Badge tone="green">
                {t('visits.portal.nextVisit', {
                  date: formatDate(locale, new Date(nextConfirmedVisit.scheduledAt)),
                })}
              </Badge>
            )}
            <span className="text-brand-700" aria-hidden="true">→</span>
          </div>
        </Link>
        {/* Solicitudes */}
        <Link
          href="/portal/solicitudes"
          className="flex items-center justify-between rounded-2xl border border-brand-100/60 bg-white px-5 py-4 shadow-card transition-smooth hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          aria-label={t('requests.portal.title')}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 text-lg" aria-hidden="true">
              ✉
            </span>
            <div>
              <p className="font-semibold text-[#1A3A3F]">{t('requests.portal.title')}</p>
              <p className="text-sm text-[#1A3A3F]/60">{t('requests.portal.intro')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingAttention > 0 && (
              <Badge tone="amber" aria-label={t('requests.portal.counter.aria')}>
                {pendingAttention}
              </Badge>
            )}
            <span className="text-brand-700" aria-hidden="true">→</span>
          </div>
        </Link>

        {/* Comunicados */}
        <Link
          href="/portal/comunicados"
          className="flex items-center justify-between rounded-2xl border border-brand-100/60 bg-white px-5 py-4 shadow-card transition-smooth hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          aria-label={t('comms.portal.announcements.quicklink.label')}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 text-lg" aria-hidden="true">
              📢
            </span>
            <div>
              <p className="font-semibold text-[#1A3A3F]">
                {t('comms.portal.announcements.quicklink.label')}
              </p>
              <p className="text-sm text-[#1A3A3F]/60">
                {t('comms.portal.announcements.quicklink.desc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {annUnread > 0 && (
              <Badge tone="blue">
                {t('comms.portal.announcements.unread', { count: annUnread })}
              </Badge>
            )}
            {annPendingAck > 0 && (
              <Badge tone="amber">
                {t('comms.portal.announcements.pendingAck', { count: annPendingAck })}
              </Badge>
            )}
            <span className="text-brand-700" aria-hidden="true">→</span>
          </div>
        </Link>

        {/* Mensajes */}
        <Link
          href="/portal/mensajes"
          className="flex items-center justify-between rounded-2xl border border-brand-100/60 bg-white px-5 py-4 shadow-card transition-smooth hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          aria-label={t('comms.portal.messages.quicklink.label')}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 text-lg" aria-hidden="true">
              💬
            </span>
            <div>
              <p className="font-semibold text-[#1A3A3F]">
                {t('comms.portal.messages.quicklink.label')}
              </p>
              <p className="text-sm text-[#1A3A3F]/60">
                {t('comms.portal.messages.quicklink.desc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {msgUnread > 0 && (
              <Badge tone="blue">
                {t('comms.portal.messages.unreadCount', { count: msgUnread })}
              </Badge>
            )}
            <span className="text-brand-700" aria-hidden="true">→</span>
          </div>
        </Link>
      </div>

      {residents.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex flex-col gap-5">
            <div>
              <h2 className="text-xl font-semibold text-[#1A3A3F]">
                {r.firstName} {r.lastName}
              </h2>
              <p className="text-sm text-[#1A3A3F]/60">
                {t('portal.center')}: {r.center.name} ·{' '}
                {t('portal.bed')}: {r.bed ? `${r.bed.code} (${r.bed.unit.name})` : '—'} ·{' '}
                {t('portal.status')}: <Badge tone={r.status === 'ACTIVO' ? 'green' : 'neutral'}>{RESIDENT_STATUS_LABELS[r.status]}</Badge>
                {r.relationship ? ` · ${t('portal.relationship')}: ${r.relationship}` : ''}
              </p>
            </div>

            {/* Novedades */}
            <section>
              <CardTitle className="mb-2 text-base">{t('portal.novedades')}</CardTitle>
              {!r.privacy.canSeeCare ? (
                <PrivacyNotice text={t('portal.privacyHidden')} />
              ) : r.careRecords.length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('portal.noNovedades')}</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {r.careRecords.map((rec) => (
                    <li key={rec.id} className="rounded-xl bg-brand-50 px-3 py-2">
                      <Badge tone="neutral">{CARE_TYPE_LABELS[rec.type]}</Badge>{' '}
                      {humanizeCareRecord(rec.type, rec.payload)}{' '}
                      <span className="text-[#1A3A3F]/40">· {formatDateTime(locale, rec.recordedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Medicación */}
              <section>
                <CardTitle className="mb-2 text-base">{t('portal.medication')}</CardTitle>
                {!r.privacy.canSeeMedication ? (
                  <PrivacyNotice text={t('portal.privacyHidden')} />
                ) : r.medications.length === 0 ? (
                  <p className="text-sm text-[#1A3A3F]/60">{t('portal.noMedication')}</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {r.medications.map((m) => (
                      <li key={m.id}>
                        <strong>{m.name}</strong> · {m.dose} · {(m.times as string[]).join(', ')}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Alergias */}
              <section>
                <CardTitle className="mb-2 text-base">{t('portal.allergies')}</CardTitle>
                {r.allergies.length === 0 ? (
                  <p className="text-sm text-[#1A3A3F]/60">{t('portal.noAllergies')}</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {r.allergies.map((a) => (
                      <li key={a.id}>
                        <strong>{a.substance}</strong>
                        {a.severity ? ` · ${ALLERGY_SEVERITY_LABELS[a.severity]}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            {/* Valoraciones */}
            <section>
              <CardTitle className="mb-2 text-base">{t('portal.assessments')}</CardTitle>
              {!r.privacy.canSeeAssessments ? (
                <PrivacyNotice text={t('portal.privacyHidden')} />
              ) : r.assessments.length === 0 ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('portal.noAssessments')}</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {r.assessments.map((a) => (
                    <li key={a.id}>
                      {ASSESSMENT_TYPE_LABELS[a.type]}: {a.score}/{SCALE_RANGES[a.type as ScaleType].max}{' '}
                      <Badge tone="blue">{interpretScale(a.type as ScaleType, a.score)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
