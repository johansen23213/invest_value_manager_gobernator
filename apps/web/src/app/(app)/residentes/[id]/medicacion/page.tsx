'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Input, Label } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { SHIFT_LABELS, ALLERGY_SEVERITY_LABELS } from '@/lib/labels';
import { groupByShift, type DoseStatus } from '@/lib/mar';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useT } from '@/i18n/provider';
import { formatTime } from '@/lib/format';
import { TimeListField } from '@/components/time-list-field';
import { doseStatusLabel, doseTone } from '@/lib/mar-ui';

// Iconos SVG inline — todos con aria-hidden para que el texto sea el canal de información
// (WCAG 1.4.1: color no es el único canal).

function IconClock({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconClockAlert({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
      <line x1="12" y1="17" x2="12" y2="17.01" strokeWidth="3" />
    </svg>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" opacity="0.15" />
      <polyline points="9 12 11 14 15 10" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function IconXCircle({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function IconArrowLeft({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="14 8 10 12 14 16" />
    </svg>
  );
}

function IconAlert({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" />
    </svg>
  );
}

function DoseStatusIcon({ status, overdue }: { status: DoseStatus; overdue: boolean }) {
  if (status === 'ADMINISTRADO') return <IconCheck />;
  if (status === 'NO_ADMINISTRADO') return <IconXCircle />;
  if (status === 'RECHAZADO') return <IconArrowLeft />;
  // PENDIENTE: reloj normal o reloj+alerta si está retrasada
  if (overdue) return <IconClockAlert />;
  return <IconClock />;
}

// ── Cabecera de alergias (M-01) ──────────────────────────────────────────────
interface AllergyChip {
  id: string;
  substance: string;
  severity?: string | null;
}

function AllergyBanner({ allergies, t }: { allergies: AllergyChip[]; t: (k: string) => string }) {
  if (allergies.length === 0) {
    return (
      <p className="text-xs text-slate-500 italic">{t('med.allergies.none')}</p>
    );
  }
  return (
    <div
      className="flex flex-wrap gap-2"
      role="list"
      aria-label={t('med.allergies.label')}
    >
      {allergies.map((al) => (
        <Badge
          key={al.id}
          tone="red"
          role="listitem"
          icon={<IconAlert />}
        >
          {al.substance.toUpperCase()}
          {al.severity ? ` — ${ALLERGY_SEVERITY_LABELS[al.severity] ?? al.severity}` : ''}
        </Badge>
      ))}
    </div>
  );
}

// ── Cabecera sticky del residente (M-03) ─────────────────────────────────────
interface ResidentHeaderProps {
  firstName: string;
  lastName: string;
  bedCode?: string | null;
  unitName?: string | null;
  allergies: AllergyChip[];
  locale: 'es' | 'ca';
  t: (k: string) => string;
}

const LOCALE_TAG: Record<'es' | 'ca', string> = { es: 'es-ES', ca: 'ca-ES' };

function ResidentStickyHeader({ firstName, lastName, bedCode, unitName, allergies, locale, t }: ResidentHeaderProps) {
  const todayLabel = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <header
      className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3 shadow-sm"
      aria-label="Datos del residente"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Nombre + plaza */}
        <div>
          <h1 className="text-xl font-bold leading-tight" style={{ fontSize: '1.25rem' }}>
            {firstName} {lastName}
          </h1>
          {(bedCode || unitName) && (
            <p className="mt-0.5 text-sm text-slate-500">
              {bedCode ? `Plaza ${bedCode}` : ''}
              {bedCode && unitName ? ' · ' : ''}
              {unitName ?? ''}
            </p>
          )}
        </div>
        {/* Fecha */}
        <p className="text-sm text-slate-500 capitalize">{todayLabel}</p>
      </div>

      {/* Alergias activas — siempre visibles, no colapsables */}
      <div className="mt-2">
        <span className="sr-only">{t('med.allergies.label')}: </span>
        <AllergyBanner allergies={allergies} t={t} />
      </div>
    </header>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function MedicationPage() {
  const params = useParams<{ id: string }>();
  const residentId = params.id;
  const utils = api.useUtils();
  const toast = useToast();
  const confirm = useConfirm();
  const { locale, t } = useT();

  const me = api.me.useQuery();
  const canPrescribe = me.data?.permissions.includes('medication:prescribe') ?? false;
  const canAdminister = me.data?.permissions.includes('medication:administer') ?? false;

  // residents.get ya incluye alergias (allergies: { id, substance, severity, reaction }[])
  const resident = api.residents.get.useQuery({ id: residentId });
  const meds = api.medications.listByResident.useQuery({ residentId });
  const schedule = api.medications.schedule.useQuery({ residentId });

  const [form, setForm] = useState<{ name: string; dose: string; times: string[]; startDate: string }>({
    name: '',
    dose: '',
    times: ['08:00', '20:00'],
    startDate: '',
  });

  const refresh = async () => {
    await Promise.all([
      utils.medications.listByResident.invalidate({ residentId }),
      utils.medications.schedule.invalidate({ residentId }),
    ]);
  };

  const prescribe = api.medications.prescribe.useMutation({
    onSuccess: async () => {
      setForm({ name: '', dose: '', times: ['08:00', '20:00'], startDate: '' });
      await refresh();
      toast.success(t('med.prescriptions') + ' — prescrita.');
    },
    onError: (e) => toast.error(e.message),
  });
  const record = api.medications.record.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success('Administración registrada.');
    },
    onError: (e) => toast.error(e.message),
  });

  async function reject(medicationId: string, scheduledAt: string) {
    const result = await confirm({
      title: 'Marcar como rechazada',
      description: 'El residente rechaza la dosis. Indica el motivo.',
      confirmLabel: 'Registrar',
      tone: 'danger',
      reason: { label: 'Motivo', required: true, placeholder: 'p. ej. el residente la rechaza' },
    });
    if (result) {
      record.mutate({ medicationId, scheduledAt: new Date(scheduledAt), status: 'RECHAZADO', notes: result.reason });
    }
  }

  async function notAdministered(medicationId: string, scheduledAt: string) {
    const result = await confirm({
      title: 'Marcar como no administrada',
      description: 'La dosis no se administra. Indica el motivo (obligatorio).',
      confirmLabel: 'Registrar',
      tone: 'danger',
      reason: { label: 'Motivo', required: true, placeholder: 'p. ej. en ayunas para analítica' },
    });
    if (result) {
      record.mutate({ medicationId, scheduledAt: new Date(scheduledAt), status: 'NO_ADMINISTRADO', notes: result.reason });
    }
  }

  const shiftGroups = useMemo(() => groupByShift(schedule.data ?? []), [schedule.data]);

  const allergies: AllergyChip[] = resident.data?.allergies ?? [];

  return (
    <div className="flex flex-col">
      {/* M-03 — Cabecera sticky */}
      {resident.data ? (
        <ResidentStickyHeader
          firstName={resident.data.firstName}
          lastName={resident.data.lastName}
          bedCode={resident.data.bed?.code}
          unitName={resident.data.bed?.unit?.name}
          allergies={allergies}
          locale={locale}
          t={t}
        />
      ) : null}

      <div className="flex flex-col gap-6 pt-4">
        <div>
          <Link href={`/residentes/${residentId}`} className="text-sm text-brand-700 hover:underline">
            ← Expediente
          </Link>
        </div>

        {/* MAR de hoy */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">{t('med.today')}</CardTitle>
            {schedule.isLoading ? (
              <p className="text-slate-500">Cargando…</p>
            ) : shiftGroups.length > 0 ? (
              <div className="flex flex-col gap-5">
                {shiftGroups.map((group) => (
                  <section key={group.shift} aria-label={`Turno de ${SHIFT_LABELS[group.shift]}`}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {SHIFT_LABELS[group.shift]}
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {group.doses.map((d) => {
                        const statusLabel = doseStatusLabel(d.status, d.overdue, t);
                        const tone = doseTone(d.status, d.overdue);
                        // M-02 — aria-label completo por dosis (WCAG)
                        const ariaLabel = `${d.medicationName} ${d.dose}, ${formatTime(locale, d.scheduledAt)}, estado: ${statusLabel.toLowerCase()}${d.notes ? `, motivo: ${d.notes}` : ''}`;
                        return (
                          <li
                            key={`${d.medicationId}-${d.scheduledAt}`}
                            aria-label={ariaLabel}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
                              d.overdue && d.status === 'PENDIENTE'
                                ? 'bg-amber-50'
                                : d.status === 'NO_ADMINISTRADO'
                                  ? 'bg-red-50'
                                  : 'bg-slate-50'
                            }`}
                          >
                            {/* Información de la dosis */}
                            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                              <strong className="shrink-0">{formatTime(locale, d.scheduledAt)}</strong>
                              <span className="truncate">
                                {d.medicationName} ({d.dose})
                              </span>
                              {/* M-02 — icono + texto + color, nunca solo color */}
                              <Badge
                                tone={tone}
                                icon={<DoseStatusIcon status={d.status} overdue={d.overdue} />}
                              >
                                {statusLabel}
                              </Badge>
                              {d.notes && (
                                <span className="text-slate-500">— {d.notes}</span>
                              )}
                            </span>

                            {/* Acciones — objetivos táctiles ≥48px (min-h-touch en Tailwind config) */}
                            {canAdminister && (
                              <span className="flex flex-wrap gap-1">
                                <Button
                                  size="sm"
                                  className="min-h-[48px] px-4"
                                  onClick={() =>
                                    record.mutate({
                                      medicationId: d.medicationId,
                                      scheduledAt: new Date(d.scheduledAt),
                                      status: 'ADMINISTRADO',
                                    })
                                  }
                                  aria-label={`Administrar ${d.medicationName} ${d.dose}`}
                                >
                                  {t('med.actions.administer')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="min-h-[48px] px-3"
                                  onClick={() => reject(d.medicationId, d.scheduledAt)}
                                  aria-label={`Marcar ${d.medicationName} como rechazada`}
                                >
                                  {t('med.actions.rejected')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="min-h-[48px] px-3"
                                  onClick={() => notAdministered(d.medicationId, d.scheduledAt)}
                                  aria-label={`Marcar ${d.medicationName} como no administrada`}
                                >
                                  {t('med.actions.notAdministered')}
                                </Button>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t('med.noDoses')}</p>
            )}
          </CardContent>
        </Card>

        {/* Prescripción */}
        {canPrescribe && (
          <Card>
            <CardContent>
              <CardTitle className="mb-3 text-base">{t('med.prescribe')}</CardTitle>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  prescribe.mutate({
                    residentId,
                    name: form.name,
                    dose: form.dose,
                    times: form.times,
                    startDate: form.startDate ? new Date(form.startDate) : new Date(),
                  });
                }}
              >
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label htmlFor="name">Fármaco</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="dose">Dosis</Label>
                    <Input
                      id="dose"
                      value={form.dose}
                      onChange={(e) => setForm((s) => ({ ...s, dose: e.target.value }))}
                      required
                      placeholder="1g"
                    />
                  </div>
                  <div>
                    <Label htmlFor="start">Inicio</Label>
                    <Input
                      id="start"
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm((s) => ({ ...s, startDate: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Horas de pauta</Label>
                  <TimeListField value={form.times} onChange={(times) => setForm((s) => ({ ...s, times }))} />
                </div>
                <div>
                  <Button type="submit" disabled={prescribe.isPending || form.times.length === 0}>
                    {t('med.prescribe')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Listado de prescripciones */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">{t('med.prescriptions')}</CardTitle>
            {meds.data && meds.data.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {meds.data.map((m) => (
                  <li key={m.id}>
                    <strong>{m.name}</strong> · {m.dose} · {(m.times as string[]).join(', ')}{' '}
                    {!m.active && (
                      <Badge tone="neutral" icon={
                        <svg aria-hidden="true" focusable="false" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                      }>
                        Inactiva
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{t('med.noPrescriptions')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
