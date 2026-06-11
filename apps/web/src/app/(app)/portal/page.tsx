'use client';

import { Badge, Card, CardContent, CardTitle } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';
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
