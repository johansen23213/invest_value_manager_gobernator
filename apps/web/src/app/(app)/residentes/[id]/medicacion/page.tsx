'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { Badge, Button, Card, CardContent, CardTitle } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { SHIFT_LABELS } from '@/lib/labels';
import { groupByShift, type DoseStatus, type MedForSchedule } from '@/lib/mar';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
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
    return <p className="text-sm text-slate-500">{t('med.prn.empty')}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {prnMeds.map((m) => (
        <li
          key={m.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm"
          aria-label={`${m.name} ${m.dose} — a demanda`}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <strong className="shrink-0">{m.name}</strong>
            <span className="text-slate-500">({m.dose})</span>
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

  const me = api.me.useQuery();
  const canPrescribe = me.data?.permissions.includes('medication:prescribe') ?? false;
  const canAdminister = me.data?.permissions.includes('medication:administer') ?? false;

  const meds = api.medications.listByResident.useQuery({ residentId });
  const schedule = api.medications.schedule.useQuery({ residentId });
  const prnMeds = api.medications.prnMeds.useQuery({ residentId });

  const refresh = async () => {
    await Promise.all([
      utils.medications.listByResident.invalidate({ residentId }),
      utils.medications.schedule.invalidate({ residentId }),
      utils.medications.prnMeds.invalidate({ residentId }),
    ]);
  };

  const record = api.medications.record.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success('Administración registrada.');
    },
    onError: (e) => toast.error(e.message),
  });

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
      record.mutate({
        medicationId,
        scheduledAt: new Date(),
        status: 'ADMINISTRADO',
        notes: result.reason,
      });
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* M-04: enlace a prescripción solo si el usuario puede prescribir */}
        {canPrescribe && (
            <Link
              href={`/residentes/${residentId}/medicacion/prescribir`}
              data-testid="prescribir-link"
              className="inline-flex min-h-[48px] items-center gap-2 rounded-md border border-brand-600 bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <IconPlus />
              {t('med.prescribe.link')}
            </Link>
          )}
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
                            data-testid="dose-item"
                            data-status={d.status}
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

        {/* Listado de prescripciones */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">{t('med.prescriptions')}</CardTitle>
            {meds.data && meds.data.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {meds.data.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 py-0.5">
                    <strong>{m.name}</strong>
                    <span className="text-slate-500">· {m.dose}</span>
                    {m.route && (
                      <Badge tone="neutral">{m.route as string}</Badge>
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
              <p className="text-sm text-slate-500">{t('med.noPrescriptions')}</p>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
