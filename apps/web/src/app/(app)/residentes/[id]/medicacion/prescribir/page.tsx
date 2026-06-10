'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, CardContent, CardTitle, Input, Label, Select } from '@vetlla/ui';
import { MedicationRoute, MedicationType } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { TimeListField } from '@/components/time-list-field';

// ── Iconos SVG inline (aria-hidden, texto es el canal principal) ──────────────

function IconAlert({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="3" />
    </svg>
  );
}

// ── Constantes ────────────────────────────────────────────────────────────────

const ROUTE_VALUES = Object.values(MedicationRoute);
const TYPE_VALUES = Object.values(MedicationType);

const UNIT_OPTIONS = [
  'COMPRIMIDO',
  'CAPSULA',
  'SOLUCION',
  'PARCHE',
  'INYECTABLE',
  'INHALADOR',
  'CREMA',
  'GOTAS',
  'SUPOSITORIO',
  'OTRA',
] as const;

type UnitKey = (typeof UNIT_OPTIONS)[number];

// Días de la semana: ISO 8601 en UI (L=1…D=0 para JS Date.getDay)
const DOW_OPTIONS: { value: number; labelEs: string; labelCa: string }[] = [
  { value: 1, labelEs: 'L', labelCa: 'Dl' },
  { value: 2, labelEs: 'M', labelCa: 'Dm' },
  { value: 3, labelEs: 'X', labelCa: 'Dc' },
  { value: 4, labelEs: 'J', labelCa: 'Dj' },
  { value: 5, labelEs: 'V', labelCa: 'Dv' },
  { value: 6, labelEs: 'S', labelCa: 'Ds' },
  { value: 0, labelEs: 'D', labelCa: 'Dg' },
];

const DOW_FULLNAMES_ES: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
};

// ── Tipos del formulario ──────────────────────────────────────────────────────

interface PrescribeForm {
  name: string;
  dose: string;
  route: MedicationRoute | '';
  unit: UnitKey | '';
  type: MedicationType | '';
  startDate: string;
  endDate: string;
  times: string[];
  daysOfWeek: number[] | null; // null = todos los días
  instructions: string;
  diagnosisId: string; // M-10: vínculo opcional a un diagnóstico
}

const INITIAL_FORM: PrescribeForm = {
  name: '',
  dose: '',
  route: '',
  unit: '',
  type: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  times: ['08:00'],
  daysOfWeek: null,
  instructions: '',
  diagnosisId: '',
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function PrescribirPage() {
  const params = useParams<{ id: string }>();
  const residentId = params.id;
  const router = useRouter();
  const { locale, t } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();

  // Control de acceso: redirige si el usuario no puede prescribir
  const me = api.me.useQuery();
  const canPrescribe = me.data?.permissions.includes('medication:prescribe') ?? null;
  useEffect(() => {
    if (canPrescribe === false) router.replace(`/residentes/${residentId}/medicacion`);
  }, [canPrescribe, residentId, router]);

  const resident = api.residents.get.useQuery({ id: residentId });
  const allergies = useMemo(() => resident.data?.allergies ?? [], [resident.data?.allergies]);

  const [form, setForm] = useState<PrescribeForm>(INITIAL_FORM);
  const [allergyMatch, setAllergyMatch] = useState<{
    substance: string;
    severity: string | null;
  } | null>(null);
  const [allergyOverrideConfirmed, setAllergyOverrideConfirmed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── M-08: chequeo textual de alergia con debounce 300 ms ─────────────────
  const checkAllergy = useCallback(
    (drugName: string) => {
      if (!drugName.trim()) {
        setAllergyMatch(null);
        setAllergyOverrideConfirmed(false);
        return;
      }
      const lower = drugName.toLowerCase();
      const match = allergies.find((a) => {
        const sub = a.substance.toLowerCase();
        return lower.includes(sub) || sub.includes(lower);
      });
      if (match) {
        setAllergyMatch({ substance: match.substance, severity: match.severity ?? null });
        setAllergyOverrideConfirmed(false);
      } else {
        setAllergyMatch(null);
        setAllergyOverrideConfirmed(false);
      }
    },
    [allergies],
  );

  function onNameChange(value: string) {
    setForm((s) => ({ ...s, name: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkAllergy(value), 300);
  }

  const isGraveAllergy = allergyMatch?.severity === 'GRAVE';
  const prescribeBlocked = isGraveAllergy && !allergyOverrideConfirmed;

  // ── Mutación prescripción ─────────────────────────────────────────────────
  const prescribe = api.medications.prescribe.useMutation({
    onSuccess: async () => {
      setForm(INITIAL_FORM);
      setAllergyMatch(null);
      setAllergyOverrideConfirmed(false);
      await Promise.all([
        utils.medications.listByResident.invalidate({ residentId }),
        utils.medications.schedule.invalidate({ residentId }),
        utils.medications.prnMeds.invalidate({ residentId }),
      ]);
      toast.success(t('med.prescribe.success'));
      router.push(`/residentes/${residentId}/medicacion`);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── M-08 cierre: flujo de confirmación para alergia GRAVE ───────────────
  async function handlePrescribeGrave() {
    const result = await confirm({
      title: t('med.allergy.block'),
      description: t('med.allergy.blockDesc', {
        substance: allergyMatch?.substance ?? '',
      }),
      confirmLabel: t('med.allergy.confirmPrescribe'),
      tone: 'danger',
      reason: {
        label: t('med.allergy.overrideReason'),
        required: true,
        placeholder: t('med.allergy.overridePlaceholder'),
      },
    });
    if (!result) return;
    setAllergyOverrideConfirmed(true);
    submitPrescription({
      allergyOverride:
        allergyMatch && result.reason
          ? {
              substance: allergyMatch.substance,
              severity: allergyMatch.severity ?? 'DESCONOCIDA',
              reason: result.reason,
            }
          : undefined,
    });
  }

  function submitPrescription(opts?: {
    allergyOverride?: { substance: string; severity: string; reason: string };
  }) {
    const isPrn = form.type === MedicationType.PRN;
    prescribe.mutate({
      residentId,
      name: form.name,
      dose: form.dose,
      route: form.route || undefined,
      unit: form.unit || undefined,
      type: (form.type as MedicationType) || undefined,
      times: isPrn ? [] : form.times,
      daysOfWeek: form.daysOfWeek ?? undefined,
      startDate: form.startDate ? new Date(form.startDate) : new Date(),
      endDate: form.endDate ? new Date(form.endDate) : undefined,
      instructions: opts?.allergyOverride
        ? `[Override alergia: ${opts.allergyOverride.reason}] ${form.instructions}`.trim()
        : form.instructions || undefined,
      diagnosisId: form.diagnosisId || undefined,
      allergyOverride: opts?.allergyOverride,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (prescribeBlocked) {
      await handlePrescribeGrave();
      return;
    }
    submitPrescription(undefined);
  }

  // ── Toggle days of week ───────────────────────────────────────────────────
  function toggleDay(day: number) {
    setForm((s) => {
      if (s.daysOfWeek === null) {
        // Era "todos": activar selección individual quitando este día
        const all = DOW_OPTIONS.map((d) => d.value).filter((d) => d !== day);
        return { ...s, daysOfWeek: all };
      }
      const already = s.daysOfWeek.includes(day);
      const next = already
        ? s.daysOfWeek.filter((d) => d !== day)
        : [...s.daysOfWeek, day];
      // Si seleccionamos todos, volver a null (más limpio)
      return { ...s, daysOfWeek: next.length === 7 ? null : next };
    });
  }

  function setAllDays() {
    setForm((s) => ({ ...s, daysOfWeek: null }));
  }

  const isDowSelected = (day: number) =>
    form.daysOfWeek === null || form.daysOfWeek.includes(day);

  const isPrn = form.type === MedicationType.PRN;
  const hasRequiredFields =
    form.name.trim() !== '' &&
    form.dose.trim() !== '' &&
    (isPrn || form.times.length > 0);

  // Resumen legible de días seleccionados
  const dowSummary = useMemo(() => {
    if (form.daysOfWeek === null) return t('med.prescribe.field.daysAll');
    if (form.daysOfWeek.length === 0) return '—';
    return form.daysOfWeek
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DOW_FULLNAMES_ES[d] ?? d)
      .join(', ');
  }, [form.daysOfWeek, t]);

  if (canPrescribe === false) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera de navegación */}
      <div className="flex items-center gap-3">
        <Link
          href={`/residentes/${residentId}/medicacion`}
          className="text-sm text-brand-700 hover:underline"
        >
          {t('med.prescribe.backToMar')}
        </Link>
      </div>

      {/* Alergias activas — siempre visible como aviso contextual */}
      {allergies.length > 0 && (
        <div
          role="alert"
          data-testid="prescribe-allergy-context"
          className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          aria-label="Alergias del residente"
        >
          <IconAlert className="shrink-0 text-red-600" />
          <strong>Alergias: </strong>
          {allergies.map((a) => (
            <span key={a.id} className="font-medium">
              {a.substance.toUpperCase()}
              {a.severity ? ` (${a.severity})` : ''}
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardContent>
          <CardTitle className="mb-4 text-base">{t('med.prescribe.title')}</CardTitle>

          {/* M-08: banner de alergia — ámbar para coincidencia, bloqueante si GRAVE */}
          {allergyMatch && (
            <div
              role="alert"
              aria-live="polite"
              data-testid="allergy-match-banner"
              data-severity={allergyMatch.severity ?? 'unknown'}
              className={`mb-4 flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${
                isGraveAllergy
                  ? 'border-red-300 bg-red-50 text-red-900'
                  : 'border-amber-300 bg-amber-50 text-amber-900'
              }`}
            >
              <IconShield
                className={`mt-0.5 shrink-0 ${isGraveAllergy ? 'text-red-600' : 'text-amber-600'}`}
              />
              <div>
                <p className="font-semibold">
                  {isGraveAllergy ? t('med.allergy.block') : 'Posible coincidencia con alergia'}
                </p>
                <p>
                  {t('med.allergy.warning', {
                    substance: allergyMatch.substance,
                    severity: allergyMatch.severity ?? 'desconocida',
                  })}
                </p>
                <p className="mt-1 text-xs opacity-80">{t('med.allergy.checkNote')}</p>
              </div>
            </div>
          )}

          <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
            {/* Paso 1 — Fármaco */}
            <fieldset>
              <legend className="mb-2 font-semibold text-slate-700">
                Fármaco y forma de administración
              </legend>
              <div className="flex flex-wrap gap-4">
                {/* Nombre del fármaco */}
                <div className="flex-1" style={{ minWidth: '180px' }}>
                  <Label htmlFor="drug-name">{t('med.prescribe.field.drug')}</Label>
                  <Input
                    id="drug-name"
                    value={form.name}
                    onChange={(e) => onNameChange(e.target.value)}
                    required
                    autoComplete="off"
                    aria-required="true"
                    aria-describedby={allergyMatch ? 'allergy-warning-banner' : undefined}
                  />
                </div>

                {/* Dosis */}
                <div style={{ minWidth: '120px' }}>
                  <Label htmlFor="dose">{t('med.prescribe.field.dose')}</Label>
                  <Input
                    id="dose"
                    value={form.dose}
                    onChange={(e) => setForm((s) => ({ ...s, dose: e.target.value }))}
                    required
                    placeholder="500 mg"
                    aria-required="true"
                  />
                </div>

                {/* Vía de administración — M-05: Select estructurado, no texto libre */}
                <div style={{ minWidth: '160px' }}>
                  <Label htmlFor="route">{t('med.prescribe.field.route')}</Label>
                  <Select
                    id="route"
                    data-testid="select-route"
                    value={form.route}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, route: e.target.value as MedicationRoute | '' }))
                    }
                  >
                    <option value="">— Selecciona —</option>
                    {ROUTE_VALUES.map((r) => (
                      <option key={r} value={r}>
                        {t(`med.route.${r}`)}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Forma farmacéutica — M-05: Select estructurado */}
                <div style={{ minWidth: '160px' }}>
                  <Label htmlFor="unit">{t('med.prescribe.field.unit')}</Label>
                  <Select
                    id="unit"
                    data-testid="select-unit"
                    value={form.unit}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, unit: e.target.value as UnitKey | '' }))
                    }
                  >
                    <option value="">— Selecciona —</option>
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {t(`med.unit.${u}`)}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Tipo — M-07 */}
                <div style={{ minWidth: '160px' }}>
                  <Label htmlFor="type">{t('med.prescribe.field.type')}</Label>
                  <Select
                    id="type"
                    data-testid="select-type"
                    value={form.type}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, type: e.target.value as MedicationType | '' }))
                    }
                  >
                    <option value="">— Selecciona —</option>
                    {TYPE_VALUES.map((tp) => (
                      <option key={tp} value={tp}>
                        {t(`med.type.${tp}`)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </fieldset>

            {/* Paso 2 — Pauta temporal */}
            <fieldset>
              <legend className="mb-2 font-semibold text-slate-700">Pauta temporal</legend>
              <div className="flex flex-wrap gap-4">
                <div style={{ minWidth: '140px' }}>
                  <Label htmlFor="start-date">{t('med.prescribe.field.start')}</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((s) => ({ ...s, startDate: e.target.value }))}
                  />
                </div>
                <div style={{ minWidth: '140px' }}>
                  <Label htmlFor="end-date">{t('med.prescribe.field.end')}</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((s) => ({ ...s, endDate: e.target.value }))}
                  />
                </div>
              </div>

              {/* M-06 — días de la semana */}
              <div className="mt-3">
                <p className="mb-1 font-medium text-slate-700">
                  {t('med.prescribe.field.daysOfWeek')}
                </p>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('med.prescribe.field.daysOfWeek')} data-testid="days-of-week-group">
                  {/* Botón "Todos los días" */}
                  <button
                    type="button"
                    onClick={setAllDays}
                    aria-pressed={form.daysOfWeek === null}
                    className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      form.daysOfWeek === null
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t('med.prescribe.field.daysAll')}
                  </button>

                  {/* Toggle por día (L M X J V S D) */}
                  {DOW_OPTIONS.map((d) => {
                    const label = locale === 'ca' ? d.labelCa : d.labelEs;
                    const fullName = DOW_FULLNAMES_ES[d.value] ?? String(d.value);
                    const selected = isDowSelected(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value)}
                        aria-pressed={selected}
                        aria-label={fullName}
                        className={`flex h-12 w-12 items-center justify-center rounded-md border text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                          selected
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {/* Resumen legible por SR / debug visual */}
                <p className="mt-1 text-xs text-slate-500" aria-live="polite">
                  {dowSummary}
                </p>
              </div>

              {/* Horas de pauta — solo si no es PRN */}
              {!isPrn && (
                <div className="mt-3">
                  <p className="mb-1 font-medium text-slate-700">
                    {t('med.prescribe.field.times')}
                  </p>
                  <TimeListField
                    value={form.times}
                    onChange={(times) => setForm((s) => ({ ...s, times }))}
                  />
                </div>
              )}
              {isPrn && (
                <p className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  <strong>{t('med.type.PRN')}:</strong> no requiere horas fijas. Se registra cuando ocurre.
                </p>
              )}
            </fieldset>

            {/* Diagnóstico relacionado (M-10) */}
            <fieldset>
              <legend className="mb-2 font-semibold text-slate-700">Diagnóstico relacionado (opcional)</legend>
              <Select
                id="diagnosis"
                aria-label="Diagnóstico relacionado"
                value={form.diagnosisId}
                onChange={(e) => setForm((s) => ({ ...s, diagnosisId: e.target.value }))}
              >
                <option value="">Sin vincular</option>
                {(resident.data?.diagnoses ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code ? `[${d.code}] ` : ''}
                    {d.description}
                  </option>
                ))}
              </Select>
            </fieldset>

            {/* Paso 3 — Instrucciones */}
            <fieldset>
              <legend className="mb-2 font-semibold text-slate-700">
                {t('med.prescribe.field.instructions')}
              </legend>
              <textarea
                id="instructions"
                value={form.instructions}
                onChange={(e) => setForm((s) => ({ ...s, instructions: e.target.value }))}
                maxLength={500}
                rows={3}
                className="min-h-touch w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label={t('med.prescribe.field.instructions')}
              />
            </fieldset>

            {/* Botón de envío */}
            <div>
              <Button
                type="submit"
                disabled={
                  prescribe.isPending ||
                  !hasRequiredFields ||
                  (prescribeBlocked && !prescribe.isPending)
                }
                aria-describedby={prescribeBlocked ? 'allergy-block-note' : undefined}
                className="min-h-[48px] px-6"
              >
                {prescribe.isPending
                  ? 'Guardando…'
                  : prescribeBlocked
                    ? t('med.allergy.block')
                    : t('med.prescribe.submit')}
              </Button>
              {prescribeBlocked && (
                <p
                  id="allergy-block-note"
                  className="mt-2 text-sm font-medium text-red-700"
                  role="alert"
                >
                  <IconAlert className="mr-1 inline-block align-text-bottom" />
                  {t('med.allergy.block')} — pulsa para confirmar con motivo.
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
