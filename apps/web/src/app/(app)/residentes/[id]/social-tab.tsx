'use client';

/**
 * SocialTab — pestaña "Social" del expediente del residente.
 *
 * Muestra el informe social más reciente y permite crear uno nuevo
 * (cada llamada a upsert crea un nuevo informe, conservando el historial).
 *
 * STAFF-ONLY: no visible en el portal de familias (controla el padre).
 * RGPD: no se expone situación económica/familiar al FAMILIAR bajo ninguna ruta.
 */

import { useState } from 'react';
import {
  Badge,
  Button,
  FieldError,
  Input,
  Label,
  SectionCard,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useZodForm } from '@/lib/form';
import { formatDate } from '@/lib/format';
import { UpsertSocialReportInput } from '@/server/routers/social';

// ---------------------------------------------------------------------------
// Tipos de los campos del informe
// ---------------------------------------------------------------------------

type SocialReportFormFields = {
  reportDate: string;
  familySituation: string;
  supportNetwork: string;
  economicSituation: string;
  benefits: string;
  workHistory: string;
  socialAssessment: string;
  agreements: string;
  nextReviewDate: string;
};

const EMPTY_FORM: SocialReportFormFields = {
  reportDate: new Date().toISOString().split('T')[0]!,
  familySituation: '',
  supportNetwork: '',
  economicSituation: '',
  benefits: '',
  workHistory: '',
  socialAssessment: '',
  agreements: '',
  nextReviewDate: '',
};

interface SocialTabProps {
  residentId: string;
  canWrite: boolean;
}

// ---------------------------------------------------------------------------
// Textarea accesible (Input no tiene rows, usamos textarea nativa)
// ---------------------------------------------------------------------------
function Textarea({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  rows = 3,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className="block w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm text-[#1A3A3F] placeholder:text-[#1A3A3F]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
    />
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function SocialTab({ residentId, canWrite }: SocialTabProps) {
  const { t, locale } = useT();
  const toast = useToast();
  const utils = api.useUtils();
  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);

  // ── queries ───────────────────────────────────────────────────────────────
  const latest = api.social.social.getByResident.useQuery({ residentId });
  const history = api.social.social.listByResident.useQuery({ residentId });

  // ── estado del formulario ─────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [fields, setFields] = useState<SocialReportFormFields>(EMPTY_FORM);
  const form = useZodForm(UpsertSocialReportInput.omit({ residentId: true }));

  function openForm() {
    // Pre-rellenar con datos del informe más reciente si existe
    const r = latest.data;
    if (r) {
      setFields({
        reportDate: new Date().toISOString().split('T')[0]!,
        familySituation: r.familySituation ?? '',
        supportNetwork: r.supportNetwork ?? '',
        economicSituation: r.economicSituation ?? '',
        benefits: r.benefits ?? '',
        workHistory: r.workHistory ?? '',
        socialAssessment: r.socialAssessment ?? '',
        agreements: r.agreements ?? '',
        nextReviewDate: r.nextReviewDate
          ? new Date(r.nextReviewDate).toISOString().split('T')[0]!
          : '',
      });
    } else {
      setFields(EMPTY_FORM);
    }
    setShowForm(true);
  }

  function set(field: keyof SocialReportFormFields) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFields((s) => ({ ...s, [field]: e.target.value }));
  }

  // ── mutation ──────────────────────────────────────────────────────────────
  const upsert = api.social.social.upsert.useMutation({
    onSuccess: async () => {
      setShowForm(false);
      form.clearErrors();
      await Promise.all([
        utils.social.social.getByResident.invalidate({ residentId }),
        utils.social.social.listByResident.invalidate({ residentId }),
      ]);
      toast.success(t('exp.social.report.saved'));
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = form.validate({
      reportDate: new Date(fields.reportDate),
      familySituation: fields.familySituation || undefined,
      supportNetwork: fields.supportNetwork || undefined,
      economicSituation: fields.economicSituation || undefined,
      benefits: fields.benefits || undefined,
      workHistory: fields.workHistory || undefined,
      socialAssessment: fields.socialAssessment || undefined,
      agreements: fields.agreements || undefined,
      nextReviewDate: fields.nextReviewDate ? new Date(fields.nextReviewDate) : undefined,
    });
    if (!data) return;
    upsert.mutate({ residentId, ...data });
  }

  // ── fields config ─────────────────────────────────────────────────────────
  const textareaFields: Array<{ key: keyof SocialReportFormFields; labelKey: string; phKey: string }> = [
    { key: 'familySituation', labelKey: 'exp.social.field.familySituation', phKey: 'exp.social.field.familySituationPh' },
    { key: 'supportNetwork', labelKey: 'exp.social.field.supportNetwork', phKey: 'exp.social.field.supportNetworkPh' },
    { key: 'economicSituation', labelKey: 'exp.social.field.economicSituation', phKey: 'exp.social.field.economicSituationPh' },
    { key: 'benefits', labelKey: 'exp.social.field.benefits', phKey: 'exp.social.field.benefitsPh' },
    { key: 'workHistory', labelKey: 'exp.social.field.workHistory', phKey: 'exp.social.field.workHistoryPh' },
    { key: 'socialAssessment', labelKey: 'exp.social.field.socialAssessment', phKey: 'exp.social.field.socialAssessmentPh' },
    { key: 'agreements', labelKey: 'exp.social.field.agreements', phKey: 'exp.social.field.agreementsPh' },
  ];

  // ── render ────────────────────────────────────────────────────────────────
  const r = latest.data;

  return (
    <div className="flex flex-col gap-4">
      {/* Informe más reciente */}
      <SectionCard
        title={t('exp.social.report.title')}
        aside={canWrite ? (
          <Button size="sm" onClick={openForm}>
            {r ? t('exp.social.report.edit') : t('exp.social.report.new')}
          </Button>
        ) : undefined}
      >
          {latest.isLoading ? (
            <p className="text-sm text-[#1A3A3F]/60">{t('state.loading')}</p>
          ) : !r ? (
            <p className="text-sm text-[#1A3A3F]/60">{t('exp.social.report.empty')}</p>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#1A3A3F]/50">
                <span>{fmtDate(r.reportDate)}</span>
                {r.author && (
                  <span>{t('exp.social.report.by', { name: r.author.name ?? r.author.id })}</span>
                )}
                {r.nextReviewDate && (
                  <Badge tone="neutral">
                    Revisión: {fmtDate(r.nextReviewDate)}
                  </Badge>
                )}
              </div>

              {textareaFields.map(({ key, labelKey }) => {
                const val = r[key as keyof typeof r] as string | null | undefined;
                if (!val) return null;
                return (
                  <div key={key}>
                    <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">
                      {t(labelKey)}
                    </p>
                    <p className="whitespace-pre-wrap text-[#1A3A3F]">{val}</p>
                  </div>
                );
              })}
            </div>
          )}
      </SectionCard>

      {/* Formulario de nuevo informe */}
      {showForm && (
        <SectionCard title={t('exp.social.report.new')}>
            <form
              className="flex flex-col gap-4"
              noValidate
              onSubmit={handleSubmit}
            >
              <div>
                <Label htmlFor="soc-date">{t('exp.social.field.reportDate')}</Label>
                <Input
                  id="soc-date"
                  type="date"
                  value={fields.reportDate}
                  onChange={set('reportDate')}
                />
              </div>

              {textareaFields.map(({ key, labelKey, phKey }) => (
                <div key={key}>
                  <Label htmlFor={`soc-${key}`}>{t(labelKey)}</Label>
                  <Textarea
                    id={`soc-${key}`}
                    value={fields[key]}
                    onChange={set(key)}
                    placeholder={t(phKey)}
                  />
                </div>
              ))}

              <div>
                <Label htmlFor="soc-review">{t('exp.social.field.nextReviewDate')}</Label>
                <Input
                  id="soc-review"
                  type="date"
                  value={fields.nextReviewDate}
                  onChange={set('nextReviewDate')}
                />
              </div>

              <FieldError>{form.errors._form}</FieldError>

              <div className="flex gap-2">
                <Button type="submit" disabled={upsert.isPending}>
                  {upsert.isPending ? 'Guardando…' : t('exp.social.report.edit')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setShowForm(false); form.clearErrors(); }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
        </SectionCard>
      )}

      {/* Historial de informes */}
      <SectionCard title={t('exp.social.history.title')}>
          {history.isLoading ? (
            <p className="text-sm text-[#1A3A3F]/60">{t('state.loading')}</p>
          ) : (history.data ?? []).length <= 1 ? (
            <p className="text-sm text-[#1A3A3F]/60">{t('exp.social.history.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {/* El primero ya está arriba (informe vigente), los demás son histórico */}
              {(history.data ?? []).slice(1).map((rep) => (
                <li
                  key={rep.id}
                  className="flex flex-wrap items-center gap-2 border-b border-brand-100/40 py-1 last:border-0 text-[#1A3A3F]/60 text-xs"
                >
                  <span>{fmtDate(rep.reportDate)}</span>
                  {rep.author && <span>· {rep.author.name ?? rep.author.id}</span>}
                  {rep.socialAssessment && (
                    <span className="truncate max-w-xs">
                      — {rep.socialAssessment.slice(0, 80)}
                      {rep.socialAssessment.length > 80 ? '…' : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
      </SectionCard>
    </div>
  );
}
