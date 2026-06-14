'use client';

/**
 * WellbeingTab — pestaña "Bienestar (ACP)" del expediente del residente.
 *
 * Implementa UNE 158101 / Modelo GENCAT de calidad de vida:
 *   - 8 dimensiones con lenguaje humano y no clínico.
 *   - "Qué es importante para la persona" y "Qué necesita / qué evitar".
 *   - Chip de estado de revisión con color + texto (WCAG 1.4.1).
 *
 * STAFF-ONLY: no visible en el portal de familias.
 */

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  SectionCard,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { formatDate } from '@/lib/format';
import { UpsertWellbeingProfileInput } from '@/lib/schemas/social';
import { getReviewStatus, daysUntilReview, type ReviewStatus } from '@/lib/wellbeing';

// ---------------------------------------------------------------------------
// Las 8 dimensiones en orden
// ---------------------------------------------------------------------------

type DimensionKey =
  | 'emotionalWellbeing'
  | 'physicalWellbeing'
  | 'materialWellbeing'
  | 'personalDevelopment'
  | 'selfDetermination'
  | 'interpersonalRelations'
  | 'socialInclusion'
  | 'rights';

const DIMENSION_KEYS: DimensionKey[] = [
  'emotionalWellbeing',
  'physicalWellbeing',
  'materialWellbeing',
  'personalDevelopment',
  'selfDetermination',
  'interpersonalRelations',
  'socialInclusion',
  'rights',
];

// ---------------------------------------------------------------------------
// Chip de estado de revisión (color + texto, WCAG 1.4.1)
// ---------------------------------------------------------------------------

type ReviewStatusTone = 'red' | 'amber' | 'green' | 'neutral';

const STATUS_TONE: Record<ReviewStatus, ReviewStatusTone> = {
  OVERDUE: 'red',
  DUE_SOON: 'amber',
  OK: 'green',
  NOT_SET: 'neutral',
};

function ReviewStatusChip({
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
  // Añadir días de contexto para OVERDUE y DUE_SOON
  if (status === 'DUE_SOON' && days !== null) {
    label = `${label} — ${t('exp.wellbeing.review.daysLeft', { days: Math.abs(days) })}`;
  }
  if (status === 'OVERDUE' && days !== null) {
    label = `${label} — ${t('exp.wellbeing.review.daysOverdue', { days: Math.abs(days) })}`;
  }

  return (
    <Badge tone={tone} aria-label={label}>
      {label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Textarea accesible
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
// Tarjeta de dimensión
// ---------------------------------------------------------------------------
function DimensionCard({
  dimKey,
  value,
  onChange,
  disabled,
  t,
}: {
  dimKey: DimensionKey;
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
  t: (k: string) => string;
}) {
  const id = `wb-${dimKey}`;
  return (
    <Card>
      <CardContent className="py-3">
        <Label htmlFor={id} className="mb-1 block text-sm font-semibold text-[#1A3A3F]">
          {t(`exp.wellbeing.dim.${dimKey}`)}
        </Label>
        <p className="mb-2 text-xs text-[#1A3A3F]/60">
          {t(`exp.wellbeing.dim.${dimKey}.desc`)}
        </p>
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(`exp.wellbeing.dim.${dimKey}.desc`)}
          disabled={disabled}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Estado del formulario
// ---------------------------------------------------------------------------

type WellbeingFormState = {
  emotionalWellbeing: string;
  physicalWellbeing: string;
  materialWellbeing: string;
  personalDevelopment: string;
  selfDetermination: string;
  interpersonalRelations: string;
  socialInclusion: string;
  rights: string;
  importantToThePerson: string;
  importantForThePerson: string;
  nextReviewDate: string;
};

const EMPTY_FORM: WellbeingFormState = {
  emotionalWellbeing: '',
  physicalWellbeing: '',
  materialWellbeing: '',
  personalDevelopment: '',
  selfDetermination: '',
  interpersonalRelations: '',
  socialInclusion: '',
  rights: '',
  importantToThePerson: '',
  importantForThePerson: '',
  nextReviewDate: '',
};

interface WellbeingTabProps {
  residentId: string;
  canWrite: boolean;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function WellbeingTab({ residentId, canWrite }: WellbeingTabProps) {
  const { t, locale } = useT();
  const toast = useToast();
  const utils = api.useUtils();
  const fmtDate = (d: Date | string | null | undefined) => formatDate(locale, d);

  // ── query ─────────────────────────────────────────────────────────────────
  const profileQ = api.social.wellbeing.getByResident.useQuery({ residentId });
  const profile = profileQ.data;

  // ── estado form ───────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<WellbeingFormState>(EMPTY_FORM);

  function openEdit() {
    if (profile) {
      setForm({
        emotionalWellbeing: profile.emotionalWellbeing ?? '',
        physicalWellbeing: profile.physicalWellbeing ?? '',
        materialWellbeing: profile.materialWellbeing ?? '',
        personalDevelopment: profile.personalDevelopment ?? '',
        selfDetermination: profile.selfDetermination ?? '',
        interpersonalRelations: profile.interpersonalRelations ?? '',
        socialInclusion: profile.socialInclusion ?? '',
        rights: profile.rights ?? '',
        importantToThePerson: profile.importantToThePerson ?? '',
        importantForThePerson: profile.importantForThePerson ?? '',
        nextReviewDate: profile.nextReviewDate
          ? new Date(profile.nextReviewDate).toISOString().split('T')[0]!
          : '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setEditing(true);
  }

  // ── mutation ──────────────────────────────────────────────────────────────
  const upsert = api.social.wellbeing.upsert.useMutation({
    onSuccess: async () => {
      setEditing(false);
      await utils.social.wellbeing.getByResident.invalidate({ residentId });
      toast.success(t('exp.wellbeing.saved'));
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = UpsertWellbeingProfileInput.omit({ residentId: true }).safeParse({
      emotionalWellbeing: form.emotionalWellbeing || undefined,
      physicalWellbeing: form.physicalWellbeing || undefined,
      materialWellbeing: form.materialWellbeing || undefined,
      personalDevelopment: form.personalDevelopment || undefined,
      selfDetermination: form.selfDetermination || undefined,
      interpersonalRelations: form.interpersonalRelations || undefined,
      socialInclusion: form.socialInclusion || undefined,
      rights: form.rights || undefined,
      importantToThePerson: form.importantToThePerson || undefined,
      importantForThePerson: form.importantForThePerson || undefined,
      nextReviewDate: form.nextReviewDate ? new Date(form.nextReviewDate) : undefined,
    });
    if (!data.success) {
      toast.error('Revisa los datos del formulario.');
      return;
    }
    upsert.mutate({ residentId, ...data.data });
  }

  // ── render — modo vista ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera */}
      <SectionCard
        title={t('exp.wellbeing.title')}
        aside={canWrite ? (
          <Button size="sm" onClick={openEdit}>
            {t('exp.wellbeing.edit')}
          </Button>
        ) : undefined}
      >
        <p className="mb-2 text-xs text-[#1A3A3F]/50">{t('exp.wellbeing.subtitle')}</p>
        {profileQ.isLoading ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('state.loading')}</p>
        ) : !profile ? (
          <p className="text-sm text-[#1A3A3F]/60">{t('exp.wellbeing.empty')}</p>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            {/* Metadatos + estado de revisión */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#1A3A3F]/50">
              {profile.updatedBy && (
                <span>
                  {t('exp.wellbeing.lastUpdate', {
                    name: profile.updatedBy.name ?? profile.updatedBy.id,
                  })}
                </span>
              )}
              <span aria-hidden="true">·</span>
              <span>{t('exp.wellbeing.nextReviewDate')}:</span>
              {profile.nextReviewDate ? (
                <span>{fmtDate(profile.nextReviewDate)}</span>
              ) : (
                <span>{t('exp.wellbeing.review.NOT_SET')}</span>
              )}
              <ReviewStatusChip nextReviewDate={profile.nextReviewDate} t={t} />
            </div>
          </div>
        )}
      </SectionCard>

      {/* Vista de las dimensiones (modo lectura) */}
      {profile && !editing && (
        <>
          {/* Campos narrativos (protagonistas en ACP) */}
          <Card>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-[#1A3A3F]">
                    {t('exp.wellbeing.importantToThePerson')}
                  </h3>
                  {profile.importantToThePerson ? (
                    <p className="whitespace-pre-wrap text-sm text-[#1A3A3F]">
                      {profile.importantToThePerson}
                    </p>
                  ) : (
                    <p className="text-sm italic text-[#1A3A3F]/40">No registrado</p>
                  )}
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-[#1A3A3F]">
                    {t('exp.wellbeing.importantForThePerson')}
                  </h3>
                  {profile.importantForThePerson ? (
                    <p className="whitespace-pre-wrap text-sm text-[#1A3A3F]">
                      {profile.importantForThePerson}
                    </p>
                  ) : (
                    <p className="text-sm italic text-[#1A3A3F]/40">No registrado</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 8 dimensiones en grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {DIMENSION_KEYS.map((key) => {
              const val = profile[key] as string | null | undefined;
              return (
                <Card key={key}>
                  <CardContent className="py-3">
                    <h3 className="mb-0.5 text-sm font-semibold text-[#1A3A3F]">
                      {t(`exp.wellbeing.dim.${key}`)}
                    </h3>
                    <p className="mb-1.5 text-xs text-[#1A3A3F]/50">
                      {t(`exp.wellbeing.dim.${key}.desc`)}
                    </p>
                    {val ? (
                      <p className="whitespace-pre-wrap text-sm text-[#1A3A3F]">{val}</p>
                    ) : (
                      <p className="text-sm italic text-[#1A3A3F]/40">No registrado</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Formulario de edición */}
      {editing && (
        <SectionCard title={t('exp.wellbeing.edit')}>
            <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
              {/* Narrativos primero (lo más importante de ACP) */}
              <div>
                <Label htmlFor="wb-importantTo">{t('exp.wellbeing.importantToThePerson')}</Label>
                <Textarea
                  id="wb-importantTo"
                  value={form.importantToThePerson}
                  onChange={(e) => setForm((s) => ({ ...s, importantToThePerson: e.target.value }))}
                  placeholder={t('exp.wellbeing.importantToPh')}
                  rows={4}
                />
              </div>
              <div>
                <Label htmlFor="wb-importantFor">{t('exp.wellbeing.importantForThePerson')}</Label>
                <Textarea
                  id="wb-importantFor"
                  value={form.importantForThePerson}
                  onChange={(e) => setForm((s) => ({ ...s, importantForThePerson: e.target.value }))}
                  placeholder={t('exp.wellbeing.importantForPh')}
                  rows={4}
                />
              </div>

              {/* 8 dimensiones */}
              <div className="grid gap-3 sm:grid-cols-2">
                {DIMENSION_KEYS.map((key) => (
                  <DimensionCard
                    key={key}
                    dimKey={key}
                    value={form[key]}
                    onChange={(val) => setForm((s) => ({ ...s, [key]: val }))}
                    disabled={upsert.isPending}
                    t={t}
                  />
                ))}
              </div>

              {/* Próxima revisión */}
              <div className="max-w-xs">
                <Label htmlFor="wb-review">{t('exp.wellbeing.nextReviewDate')}</Label>
                <Input
                  id="wb-review"
                  type="date"
                  value={form.nextReviewDate}
                  onChange={(e) => setForm((s) => ({ ...s, nextReviewDate: e.target.value }))}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={upsert.isPending}>
                  {upsert.isPending ? 'Guardando…' : t('exp.wellbeing.saved').replace('guardado', 'guardar')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
        </SectionCard>
      )}
    </div>
  );
}
