'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, EmptyState, PageHeader } from '@vetlla/ui';
import type { MedAdminStatus } from '@vetlla/db';
import { api } from '@/trpc/react';
import { SHIFT_LABELS } from '@/lib/labels';
import { currentShift, groupByShift, type DoseStatus, type MedForSchedule, type Shift } from '@/lib/mar';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useCareSync } from '@/offline/use-care-sync';
import { useT } from '@/i18n/provider';
import { formatTime } from '@/lib/format';
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

function IconZap({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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


// ── Filtro de turno (UX-17) ─────────────────────────────────────────────────
//
// DECISIÓN DE DEFAULT (ver tarea MAR filtrado por turno):
//   Default = turno activo según la hora del dispositivo (opción b).
//   Análisis e2e estático: los specs medicacion-mar.spec.ts no cuentan dose-items
//   por turno ni asumen que se ven dosis de todos los turnos nada más cargar.
//   El guard `if (count > 0)` en M-02 protege contra residentes sin dosis en el
//   turno activo. La funcionalidad "Ver todos" está a un toque de distancia.

type ShiftFilter = Shift | 'ALL';

const SHIFT_FILTER_OPTIONS: { value: ShiftFilter; labelKey: string }[] = [
  { value: 'ALL', labelKey: 'mar.shift.all' },
  { value: 'MANANA', labelKey: 'mar.shift.MANANA' },
  { value: 'TARDE', labelKey: 'mar.shift.TARDE' },
  { value: 'NOCHE', labelKey: 'mar.shift.NOCHE' },
];

interface ShiftFilterBarProps {
  value: ShiftFilter;
  onChange: (v: ShiftFilter) => void;
  t: (k: string) => string;
}

function ShiftFilterBar({ value, onChange, t }: ShiftFilterBarProps) {
  return (
    <div
      role="radiogroup"
      aria-label={t('mar.shift.filter.label')}
      className="flex flex-wrap gap-2"
    >
      {SHIFT_FILTER_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => onChange(opt.value)}
            className={[
              // Píldora, objetivo táctil ≥48px, dirección de arte Lifecare
              'inline-flex min-h-[48px] items-center rounded-full px-5 text-sm font-medium',
              'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
              active
                ? 'bg-brand-700 text-white shadow-sm'
                : 'bg-brand-50 text-[#1A3A3F] hover:bg-brand-100 border border-brand-100',
            ].join(' ')}
          >
            {t(opt.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

// ── Sección PRN — medicaciones a demanda (M-07) ──────────────────────────────

interface PrnSectionProps {
  prnMeds: MedForSchedule[];
  residentId: string;
  canAdminister: boolean;
  t: (k: string, vars?: Record<string, string | number>) => string;
  onRecord: (medicationId: string) => void;
}

function PrnSection({ prnMeds, canAdminister, t, onRecord }: PrnSectionProps) {
  if (prnMeds.length === 0) {
    return <p className="text-sm text-[#1A3A3F]/60">{t('med.prn.empty')}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {prnMeds.map((m) => (
        <li
          key={m.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-brand-50 border border-brand-100 px-3 py-2 text-sm"
          aria-label={`${m.name} ${m.dose} — a demanda`}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <strong className="shrink-0">{m.name}</strong>
            <span className="text-[#1A3A3F]/60">({m.dose})</span>
            <Badge tone="blue" icon={<IconZap />}>
              {t('med.type.PRN')}
            </Badge>
          </span>
          {canAdminister && (
            <Button
              size="sm"
              className="min-h-[48px] px-4"
              onClick={() => onRecord(m.id)}
              aria-label={`Registrar dosis de ${m.name}`}
            >
              {t('med.prn.recordDose')}
            </Button>
          )}
        </li>
      ))}
    </ul>
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

  // UX-17: turno activo al abrir la pantalla → pre-selección automática del chip.
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>(() => currentShift(new Date()));

  const me = api.me.useQuery();
  const canPrescribe = me.data?.permissions.includes('medication:prescribe') ?? false;
  const canAdminister = me.data?.permissions.includes('medication:administer') ?? false;

  const meds = api.medications.listByResident.useQuery({ residentId });
  const schedule = api.medications.schedule.useQuery({ residentId });
  const prnMeds = api.medications.prnMeds.useQuery({ residentId });
  // M-09: tratamientos del residente (cabeceras que agrupan líneas).
  const treatments = api.treatments.listByResident.useQuery({ residentId });

  const refresh = async () => {
    await Promise.all([
      utils.medications.listByResident.invalidate({ residentId }),
      utils.medications.schedule.invalidate({ residentId }),
      utils.medications.prnMeds.invalidate({ residentId }),
      utils.treatments.listByResident.invalidate({ residentId }),
    ]);
  };

  // M-09: finalizar un tratamiento (no borra; cierra el histórico clínico).
  const endTreatment = api.treatments.end.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success(t('med.treatment.ended'));
    },
    onError: (e) => toast.error(e.message),
  });

  async function confirmEndTreatment(id: string, name: string) {
    const result = await confirm({
      title: `${t('med.treatment.endAction')}: ${name}`,
      description: 'El tratamiento se marca como finalizado (las líneas no se borran).',
      confirmLabel: t('med.treatment.endAction'),
      tone: 'danger',
    });
    if (result) endTreatment.mutate({ id });
  }

  // ADR-0012 — MAR offline-first: las administraciones entran en la cola local
  // (IndexedDB) y se sincronizan al instante si hay red; sin red quedan
  // PENDIENTE_SYNC con las mismas garantías de no-duplicado (clave natural).
  const { enqueueMed, medPendingItems, medPending, online } = useCareSync();

  // Al vaciarse la cola (sync en background), refrescar el estado del servidor.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medPending]);

  async function recordDose(
    medicationId: string,
    scheduledAt: string | Date,
    status: MedAdminStatus,
    notes?: string,
  ) {
    const med = meds.data?.find((m) => m.id === medicationId);
    await enqueueMed({
      medicationId,
      medicationName: med?.name,
      residentId,
      scheduledAt: new Date(scheduledAt).toISOString(),
      status,
      notes: notes ?? null,
    });
    await refresh();
    toast.success(online ? 'Administración registrada.' : t('med.status.PENDIENTE_SYNC'));
  }

  // M-07: registrar dosis PRN — pide la dosis real con motivo
  async function recordPrn(medicationId: string) {
    const result = await confirm({
      title: t('med.prn.recordDose'),
      description: t('med.prn.doseLabel'),
      confirmLabel: 'Registrar',
      tone: 'default',
      reason: { label: t('med.prn.doseLabel'), required: true, placeholder: 'p. ej. 500 mg' },
    });
    if (result) {
      await recordDose(medicationId, new Date(), 'ADMINISTRADO', result.reason);
    }
  }

  async function reject(medicationId: string, scheduledAt: string) {
    const result = await confirm({
      title: 'Marcar como rechazada',
      description: 'El residente rechaza la dosis. Indica el motivo.',
      confirmLabel: 'Registrar',
      tone: 'danger',
      reason: { label: 'Motivo', required: true, placeholder: 'p. ej. el residente la rechaza' },
    });
    if (result) {
      await recordDose(medicationId, scheduledAt, 'RECHAZADO', result.reason);
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
      await recordDose(medicationId, scheduledAt, 'NO_ADMINISTRADO', result.reason);
    }
  }

  // Mezcla servidor + cola local: una dosis con entrada local pendiente se pinta
  // con su estado local y el badge PENDIENTE_SYNC (el auxiliar ve que no ha subido).
  const shiftGroups = useMemo(() => {
    const base = schedule.data ?? [];
    const localByKey = new Map(
      medPendingItems.map((p) => [`${p.medicationId}|${new Date(p.scheduledAt).getTime()}`, p]),
    );
    const merged = base.map((d) => {
      const local = localByKey.get(`${d.medicationId}|${new Date(d.scheduledAt).getTime()}`);
      if (!local) return d;
      return { ...d, status: local.status as DoseStatus, notes: local.notes ?? d.notes, pendingSync: true };
    });
    return groupByShift(merged);
  }, [schedule.data, medPendingItems]);

  // UX-17: grupos visibles según el chip de turno seleccionado.
  // PRN y Tratamientos NO se filtran (están fuera de shiftGroups).
  const visibleShiftGroups = useMemo(
    () => (shiftFilter === 'ALL' ? shiftGroups : shiftGroups.filter((g) => g.shift === shiftFilter)),
    [shiftGroups, shiftFilter],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('med.mar.pageTitle')}
        action={canPrescribe ? (
          <Link
            href={`/residentes/${residentId}/medicacion/prescribir`}
            data-testid="prescribir-link"
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-brand-700 bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <IconPlus />
            {t('med.prescribe.link')}
          </Link>
        ) : undefined}
      />

        {/* MAR de hoy */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">{t('med.today')}</CardTitle>

            {/* UX-17 — Chips de turno: permiten a David ver solo su pase.
                Por defecto se activa el turno actual (función pura currentShift).
                PRN y Tratamientos quedan fuera de este filtro. */}
            <div className="mb-4 flex flex-col gap-2">
              <ShiftFilterBar value={shiftFilter} onChange={setShiftFilter} t={t} />
              {/* Aviso sutil cuando se muestra un turno concreto (no "Todos") */}
              {shiftFilter !== 'ALL' && (
                <p className="text-xs text-[#1A3A3F]/60" aria-live="polite">
                  {t('mar.shift.notice').replace('{shift}', t(`mar.shift.${shiftFilter}`))}
                  {t('mar.shift.noticeSuffix')}
                  <button
                    type="button"
                    onClick={() => setShiftFilter('ALL')}
                    className="underline underline-offset-2 hover:text-[#1A3A3F] focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
                  >
                    {t('mar.shift.showAll')}
                  </button>
                </p>
              )}
            </div>

            {schedule.isLoading ? (
              <p className="text-[#1A3A3F]/60">Cargando…</p>
            ) : visibleShiftGroups.length > 0 ? (
              <div className="flex flex-col gap-5">
                {visibleShiftGroups.map((group) => (
                  <section key={group.shift} aria-label={`Turno de ${SHIFT_LABELS[group.shift]}`}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/40">
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
                            data-testid="dose-item"
                            data-status={d.status}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
                              d.overdue && d.status === 'PENDIENTE'
                                ? 'bg-amber-50'
                                : d.status === 'NO_ADMINISTRADO'
                                  ? 'bg-warm-50 border border-warm-200'
                                  : 'bg-brand-50'
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
                              {/* ADR-0012: registrada en el dispositivo, sin subir aún */}
                              {d.pendingSync && (
                                <Badge tone="amber" icon={<IconClock />}>
                                  {t('med.status.PENDIENTE_SYNC')}
                                </Badge>
                              )}
                              {d.notes && (
                                <span className="text-[#1A3A3F]/60">— {d.notes}</span>
                              )}
                            </span>

                            {/* Acciones — objetivos táctiles ≥48px (min-h-touch en Tailwind config) */}
                            {canAdminister && (
                              <span className="flex flex-wrap gap-1">
                                <Button
                                  size="sm"
                                  className="min-h-[48px] px-4"
                                  onClick={() => void recordDose(d.medicationId, d.scheduledAt, 'ADMINISTRADO')}
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
              // Cuando hay filtro de turno activo y no hay dosis en ese turno,
              // indicamos que el turno está limpio y ofrecemos "Ver todos".
              shiftFilter !== 'ALL' ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <EmptyState
                    variant="check"
                    title={t('med.noDosesShift')}
                    action={
                      <button
                        type="button"
                        onClick={() => setShiftFilter('ALL')}
                        className="text-sm text-brand-700 underline underline-offset-2 hover:text-brand-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
                      >
                        {t('mar.shift.showAll')}
                      </button>
                    }
                  />
                </div>
              ) : (
                <EmptyState variant="check" title={t('med.noDoses')} />
              )
            )}
          </CardContent>
        </Card>

        {/* M-07 — Sección A demanda (PRN) */}
        <Card data-testid="prn-section">
          <CardContent>
            <CardTitle className="mb-3 flex items-center gap-2 text-base">
              <IconZap className="text-blue-600" />
              {t('med.prn.title')}
            </CardTitle>
            <PrnSection
              prnMeds={prnMeds.data ?? []}
              residentId={residentId}
              canAdminister={canAdminister}
              t={t}
              onRecord={recordPrn}
            />
          </CardContent>
        </Card>

        {/* M-09 — Tratamientos: cabeceras que agrupan líneas de prescripción */}
        {(treatments.data?.length ?? 0) > 0 && (
          <Card data-testid="treatments-section">
            <CardContent>
              <CardTitle className="mb-3 text-base">{t('med.treatment.title')}</CardTitle>
              <ul className="flex flex-col gap-3">
                {treatments.data!.map((tr) => (
                  <li key={tr.id} className="rounded-md border border-brand-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2 text-sm">
                        <strong>{tr.name}</strong>
                        {/* M-10: diagnóstico de referencia como chip clickable -> expediente */}
                        {tr.diagnosis && (
                          <Link
                            href={`/residentes/${residentId}`}
                            className="inline-flex"
                            aria-label={`Ver diagnóstico ${tr.diagnosis.description} en el expediente`}
                          >
                            <Badge tone="blue" title={tr.diagnosis.description}>
                              {tr.diagnosis.code ?? tr.diagnosis.description}
                            </Badge>
                          </Link>
                        )}
                        {!tr.active && <Badge tone="neutral">{t('med.treatment.ended')}</Badge>}
                      </span>
                      {canPrescribe && tr.active && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void confirmEndTreatment(tr.id, tr.name)}
                        >
                          {t('med.treatment.endAction')}
                        </Button>
                      )}
                    </div>
                    {tr.medications.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-1 border-l-2 border-brand-100 pl-3 text-sm">
                        {tr.medications.map((line) => (
                          <li key={line.id} className="flex flex-wrap items-center gap-2">
                            {line.name}
                            <span className="text-[#1A3A3F]/60">· {line.dose}</span>
                            {!line.active && <Badge tone="neutral">Inactiva</Badge>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-[#1A3A3F]/60">{t('med.treatment.linesEmpty')}</p>
                    )}
                  </li>
                ))}
              </ul>
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
                  <li key={m.id} className="flex flex-wrap items-center gap-2 py-0.5">
                    <strong>{m.name}</strong>
                    <span className="text-[#1A3A3F]/60">· {m.dose}</span>
                    {m.route && (
                      <Badge tone="neutral">{m.route as string}</Badge>
                    )}
                    {/* M-10: chip de diagnóstico clickable -> expediente del residente */}
                    {m.diagnosis && (
                      <Link
                        href={`/residentes/${residentId}`}
                        className="inline-flex"
                        aria-label={`Ver diagnóstico ${m.diagnosis.description} en el expediente`}
                      >
                        <Badge tone="blue" title={m.diagnosis.description}>
                          {m.diagnosis.code ? `${m.diagnosis.code}` : m.diagnosis.description}
                        </Badge>
                      </Link>
                    )}
                    {m.type === 'PRN' && (
                      <Badge tone="blue" icon={<IconZap />}>
                        {t('med.type.PRN')}
                      </Badge>
                    )}
                    {m.type && m.type !== 'PRN' && (
                      <Badge tone="neutral">{t(`med.type.${m.type as string}`)}</Badge>
                    )}
                    {!m.active && (
                      <Badge
                        tone="neutral"
                        icon={
                          <svg aria-hidden="true" focusable="false" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                          </svg>
                        }
                      >
                        Inactiva
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#1A3A3F]/60">{t('med.noPrescriptions')}</p>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
