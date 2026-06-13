'use client';

// Visión 360 del residente (R-360): una sola pantalla con pestañas que agrega
// lo clínicamente relevante y permite ACCIONES RÁPIDAS in-situ, sin saltar entre
// sub-páginas. Hermana operativa de /atencion: misma cola offline (useCareSync).
//
//   · Hoy      — medicación pendiente + constantes + incidencia (acciones rápidas)
//   · Salud    — alergias, diagnósticos, escalas, medicación activa (lectura + enlaces)
//   · Atención — PIA activo y objetivos + timeline de registros de cuidado
//
// Permisos por rol (RBAC): cada acción se muestra solo si el usuario puede hacerla.

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Input,
  Label,
  SectionCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useCareSync } from '@/offline/use-care-sync';
import type { CarePayload } from '@/offline/types';
import { useToast } from '@/components/toast';
import { useT } from '@/i18n/provider';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';
import {
  ASSESSMENT_TYPE_LABELS,
  CARE_PLAN_STATUS_LABELS,
  CARE_TYPE_LABELS,
  DEVICE_TYPE_LABELS,
  GOAL_STATUS_LABELS,
  UPP_ORIGIN_LABELS,
} from '@/lib/labels';

function cleanPayload(raw: Record<string, string>): CarePayload {
  const out: CarePayload = {};
  for (const [k, v] of Object.entries(raw)) if (v.trim() !== '') out[k] = v.trim();
  return out;
}

/** Resumen legible de un payload de registro de cuidado. */
function payloadSummary(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');
}

export default function Resident360Page() {
  const params = useParams<{ id: string }>();
  const residentId = params.id;
  const utils = api.useUtils();
  const toast = useToast();

  const me = api.me.useQuery();
  const canCareWrite = me.data?.permissions.includes('care:write') ?? false;
  const canAdminister = me.data?.permissions.includes('medication:administer') ?? false;

  const { locale, t } = useT();

  const resident = api.residents.get.useQuery({ id: residentId });
  const schedule = api.medications.schedule.useQuery({ residentId });
  const meds = api.medications.listByResident.useQuery({ residentId });
  const carePlans = api.carePlans.listByResident.useQuery({ residentId });
  const { online } = useCareSync();
  const records = api.care.listByResident.useQuery(
    { residentId, limit: 15 },
    { enabled: online },
  );

  const { enqueue, enqueueMed } = useCareSync();

  const [vitals, setVitals] = useState({ tension: '', fc: '', temperatura: '', sato2: '' });
  const [incident, setIncident] = useState('');

  const r = resident.data;
  const residentName = r ? `${r.firstName} ${r.lastName}` : '';

  // ── Resumen de la medicación de hoy ────────────────────────────────────────
  const doses = schedule.data ?? [];
  const medSummary = useMemo(() => {
    const total = doses.length;
    const administered = doses.filter((d) => d.status === 'ADMINISTRADO').length;
    const pending = doses.filter((d) => d.status === 'PENDIENTE');
    const notAdministered = doses.filter((d) => d.status === 'NO_ADMINISTRADO').length;
    return { total, administered, pending, notAdministered };
  }, [doses]);

  const activeMeds = (meds.data ?? []).filter((m) => m.active);
  const activePlans = (carePlans.data ?? []).filter((p) => p.status === 'ACTIVO');

  // Última escala de cada tipo (Barthel / Tinetti).
  type AssessmentItem = NonNullable<typeof resident.data>['assessments'][number];
  const latestAssessments = useMemo(() => {
    const seen = new Map<string, AssessmentItem>();
    for (const a of r?.assessments ?? []) if (!seen.has(a.type)) seen.set(a.type, a);
    return [...seen.values()];
  }, [r?.assessments]);

  async function registerCare(
    type: 'CONSTANTES' | 'INCIDENCIA',
    payload: CarePayload,
  ) {
    if (!r || Object.keys(payload).length === 0) return;
    await enqueue({ residentId: r.id, residentName, type, payload });
    toast.success(
      t('r360.care.saved', { type: CARE_TYPE_LABELS[type] ?? type }) + (online ? '' : t('r360.offlineSuffix')),
    );
    void records.refetch();
  }

  async function administer(medicationId: string, medicationName: string, scheduledAt: string) {
    await enqueueMed({
      medicationId,
      medicationName,
      residentId,
      scheduledAt: new Date(scheduledAt).toISOString(),
      status: 'ADMINISTRADO',
    });
    await utils.medications.schedule.invalidate({ residentId });
    toast.success(online ? t('r360.med.adminSaved') : t('r360.med.adminSavedOffline'));
  }

  if (resident.isLoading) {
    return <p className="mt-6 text-[#1A3A3F]/60">{t('r360.loading')}</p>;
  }
  if (!r) {
    return <p className="mt-6 text-[#1A3A3F]/60">{t('r360.notFound')}</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-display-lg text-[#1A3A3F]">{t('r360.title')}</h2>
        <Badge tone={online ? 'green' : 'amber'}>{online ? t('r360.online') : t('r360.offline')}</Badge>
      </div>

      <Tabs defaultValue="hoy">
        <TabsList aria-label={t('r360.tabsLabel')}>
          <TabsTrigger value="hoy">{t('r360.tab.today')}</TabsTrigger>
          <TabsTrigger value="salud">{t('r360.tab.health')}</TabsTrigger>
          <TabsTrigger value="atencion">{t('r360.tab.care')}</TabsTrigger>
        </TabsList>

        {/* ── HOY — operativa del día con acciones rápidas ───────────────────── */}
        <TabsContent value="hoy">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Medicación pendiente */}
            <SectionCard
              title={t('r360.med.title')}
              aside={
                <Link
                  href={`/residentes/${residentId}/medicacion`}
                  className="text-sm text-brand-700 hover:underline"
                >
                  {t('r360.med.viewMar')}
                </Link>
              }
            >
              <p className="mb-3 text-sm text-[#1A3A3F]/70" aria-live="polite">
                {t('r360.med.summary', { administered: medSummary.administered, total: medSummary.total })}
                {medSummary.notAdministered > 0 && (
                  <>
                    {' · '}
                    <span className="font-medium text-red-700">
                      {t('r360.med.notAdministered', { count: medSummary.notAdministered })}
                    </span>
                  </>
                )}
              </p>
              {medSummary.pending.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {medSummary.pending.map((d) => (
                    <li
                      key={`${d.medicationId}-${d.scheduledAt}`}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
                        d.overdue ? 'bg-amber-50' : 'bg-brand-50'
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <strong className="shrink-0">{formatTime(locale, d.scheduledAt)}</strong>
                        <span className="truncate">
                          {d.medicationName} ({d.dose})
                        </span>
                        {d.overdue && <Badge tone="amber">{t('r360.med.overdue')}</Badge>}
                      </span>
                      {canAdminister && (
                        <Button
                          size="sm"
                          className="min-h-[48px] px-4"
                          onClick={() => void administer(d.medicationId, d.medicationName, d.scheduledAt)}
                          aria-label={t('r360.med.administerAria', {
                            name: d.medicationName,
                            dose: d.dose,
                            time: formatTime(locale, d.scheduledAt),
                          })}
                        >
                          {t('med.actions.administer')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.med.noPending')}</p>
              )}
            </SectionCard>

            {/* Constantes rápidas */}
            {canCareWrite && (
              <SectionCard title={t('r360.vitals.title')}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="tension">{t('r360.vitals.tension')}</Label>
                    <Input id="tension" inputMode="numeric" placeholder="120/80" value={vitals.tension} onChange={(e) => setVitals((s) => ({ ...s, tension: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="fc">{t('r360.vitals.fc')}</Label>
                    <Input id="fc" type="number" inputMode="numeric" value={vitals.fc} onChange={(e) => setVitals((s) => ({ ...s, fc: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="temp">{t('r360.vitals.temp')}</Label>
                    <Input id="temp" type="number" inputMode="decimal" step="0.1" value={vitals.temperatura} onChange={(e) => setVitals((s) => ({ ...s, temperatura: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="sato2">{t('r360.vitals.sato2')}</Label>
                    <Input id="sato2" type="number" inputMode="numeric" value={vitals.sato2} onChange={(e) => setVitals((s) => ({ ...s, sato2: e.target.value }))} />
                  </div>
                </div>
                <Button
                  size="lg"
                  className="mt-3 w-full"
                  onClick={async () => {
                    await registerCare('CONSTANTES', cleanPayload(vitals));
                    setVitals({ tension: '', fc: '', temperatura: '', sato2: '' });
                  }}
                >
                  {t('r360.vitals.title')}
                </Button>
              </SectionCard>
            )}

            {/* Incidencia rápida */}
            {canCareWrite && (
              <SectionCard title={t('r360.incident.title')}>
                <Label htmlFor="inc">{t('r360.incident.label')}</Label>
                <Input
                  id="inc"
                  value={incident}
                  onChange={(e) => setIncident(e.target.value)}
                  placeholder={t('r360.incident.placeholder')}
                />
                <Button
                  size="lg"
                  className="mt-3 w-full"
                  onClick={async () => {
                    await registerCare('INCIDENCIA', cleanPayload({ descripcion: incident }));
                    setIncident('');
                  }}
                >
                  {t('r360.incident.title')}
                </Button>
              </SectionCard>
            )}

            {/* Registros de hoy / recientes */}
            <SectionCard title={t('r360.records.recent')}>
              {!online ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.records.offline')}</p>
              ) : records.data && records.data.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {records.data.slice(0, 6).map((rec) => (
                    <li key={rec.id} className="flex items-center justify-between rounded-md bg-brand-50 px-3 py-2">
                      <span className="min-w-0">
                        <Badge tone="neutral">{CARE_TYPE_LABELS[rec.type]}</Badge>{' '}
                        <span className="text-[#1A3A3F]/70">{payloadSummary(rec.payload as Record<string, unknown>)}</span>
                      </span>
                      <span className="shrink-0 text-[#1A3A3F]/40">{formatDateTime(locale, rec.recordedAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.records.empty')}</p>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        {/* ── SALUD — instantánea clínica (lectura + enlaces al expediente) ──── */}
        <TabsContent value="salud">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Alergias */}
            <SectionCard title={t('r360.allergies.title')}>
              {r.allergies.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {r.allergies.map((al) => (
                    <li key={al.id} className="flex items-center gap-2">
                      <Badge tone="red">{al.substance.toUpperCase()}</Badge>
                      {al.reaction && <span className="text-[#1A3A3F]/60">{al.reaction}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#1A3A3F]/60">{t('med.allergies.none')}</p>
              )}
            </SectionCard>

            {/* Escalas — todos los tipos valorados (ahora 11 posibles) */}
            <SectionCard title={t('r360.scales.title')}>
              {latestAssessments.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {latestAssessments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between">
                      <span className="text-[#1A3A3F]">{ASSESSMENT_TYPE_LABELS[a.type] ?? a.type}</span>
                      <span className="text-[#1A3A3F]/70">
                        <strong>{a.score ?? '—'}</strong>{' '}
                        <span className="text-[#1A3A3F]/40">· {formatDate(locale, a.assessedAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.scales.empty')}</p>
              )}
            </SectionCard>

            {/* Dispositivos activos */}
            <SectionCard title={t('r360.devices.title')}>
              {(r.devices ?? []).length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {(r.devices ?? []).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{DEVICE_TYPE_LABELS[d.type] ?? d.type}</Badge>
                      {d.description && (
                        <span className="text-[#1A3A3F]/60">{d.description}</span>
                      )}
                      {d.since && (
                        <span className="text-[#1A3A3F]/40">desde {formatDate(locale, d.since)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.devices.empty')}</p>
              )}
            </SectionCard>

            {/* UPP activas */}
            <SectionCard title={t('r360.upp.title')}>
              {(r.pressureUlcers ?? []).length > 0 ? (
                <ul className="flex flex-col gap-2 text-sm">
                  {(r.pressureUlcers ?? []).map((u) => (
                    <li key={u.id} className="rounded-md bg-warm-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="amber">
                          {t('r360.upp.stage', { stage: String(u.stage) })}
                        </Badge>
                        <span className="font-medium text-[#1A3A3F]">{u.location}</span>
                        <span className="text-[#1A3A3F]/40">
                          {UPP_ORIGIN_LABELS[u.acquired] ?? u.acquired}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#1A3A3F]/60">
                        {u.curings && u.curings.length > 0
                          ? t('r360.upp.lastCuring', { date: formatDate(locale, u.curings[0]!.date) })
                          : t('r360.upp.noCuring')}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.upp.empty')}</p>
              )}
            </SectionCard>

            {/* Peso reciente con tendencia */}
            <SectionCard title={t('r360.weight.title')}>
              {(r.weights ?? []).length > 0 ? (() => {
                const latest = r.weights![0]!;
                const prev = r.weights![1];
                let trendBadge: React.ReactNode = null;
                if (prev) {
                  const diff = latest.weightKg - prev.weightKg;
                  if (diff > 0.5) {
                    trendBadge = <Badge tone="amber">↑ {t('r360.weight.trend.up')}</Badge>;
                  } else if (diff < -0.5) {
                    trendBadge = <Badge tone="red">↓ {t('r360.weight.trend.down')}</Badge>;
                  } else {
                    trendBadge = <Badge tone="neutral">→ {t('r360.weight.trend.stable')}</Badge>;
                  }
                }
                return (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="text-2xl font-bold text-[#1A3A3F]">
                      {latest.weightKg} kg
                    </span>
                    {trendBadge}
                    <span className="text-[#1A3A3F]/40">{formatDate(locale, latest.recordedAt)}</span>
                    {latest.bmi && (
                      <span className="text-[#1A3A3F]/60">IMC: {latest.bmi}</span>
                    )}
                  </div>
                );
              })() : (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.weight.empty')}</p>
              )}
            </SectionCard>

            {/* Diagnósticos */}
            <SectionCard title={t('r360.dx.title')}>
              {r.diagnoses.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {r.diagnoses.map((dx) => (
                    <li key={dx.id} className="flex flex-wrap items-center gap-2">
                      {dx.code && <Badge tone="blue">{dx.code}</Badge>}
                      <span className="text-[#1A3A3F]">{dx.description}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.dx.empty')}</p>
              )}
            </SectionCard>

            {/* Medicación activa */}
            <SectionCard
              title={t('r360.activeMed.title')}
              aside={
                <Link
                  href={`/residentes/${residentId}/medicacion`}
                  className="text-sm text-brand-700 hover:underline"
                >
                  {t('r360.manage')}
                </Link>
              }
            >
              {activeMeds.length > 0 ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {activeMeds.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2">
                      <strong className="text-[#1A3A3F]">{m.name}</strong>
                      <span className="text-[#1A3A3F]/60">· {m.dose}</span>
                      {m.type === 'PRN' && <Badge tone="blue">{t('r360.prn')}</Badge>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.activeMed.empty')}</p>
              )}
            </SectionCard>
          </div>
          <p className="mt-3 text-sm text-[#1A3A3F]/60">
            {t('r360.health.editHint')}{' '}
            <Link href={`/residentes/${residentId}`} className="text-brand-700 hover:underline">
              {t('r360.health.openRecord')}
            </Link>
            .
          </p>
        </TabsContent>

        {/* ── ATENCIÓN — PIA + timeline de cuidado ──────────────────────────── */}
        <TabsContent value="atencion">
          <div className="flex flex-col gap-4">
            {/* PIA activo */}
            <SectionCard
              title={t('r360.pia.title')}
              aside={
                <Link
                  href={`/residentes/${residentId}/pia`}
                  className="text-sm text-brand-700 hover:underline"
                >
                  {t('r360.pia.manage')}
                </Link>
              }
            >
              {activePlans.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {activePlans.map((plan) => (
                    <section key={plan.id} aria-label={`Plan ${plan.title}`}>
                      <div className="mb-2 flex items-center gap-2">
                        <strong className="text-sm">{plan.title}</strong>
                        <Badge tone="green">{CARE_PLAN_STATUS_LABELS[plan.status] ?? plan.status}</Badge>
                      </div>
                      {plan.goals.length > 0 ? (
                        <ul className="flex flex-col gap-1 border-l-2 border-brand-100 pl-3 text-sm">
                          {plan.goals.map((g) => (
                            <li key={g.id} className="flex flex-wrap items-center gap-2">
                              <span>{g.description}</span>
                              <Badge tone={g.status === 'CONSEGUIDO' ? 'green' : 'neutral'}>
                                {GOAL_STATUS_LABELS[g.status] ?? g.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-[#1A3A3F]/60">{t('r360.pia.noGoals')}</p>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.pia.empty')}</p>
              )}
            </SectionCard>

            {/* Timeline de registros de cuidado */}
            <SectionCard title={t('r360.history.title')}>
              {!online ? (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.records.offline')}</p>
              ) : records.data && records.data.length > 0 ? (
                <ol className="flex flex-col gap-2">
                  {records.data.map((rec) => (
                    <li key={rec.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-100/60 pb-2 text-sm last:border-0">
                      <span className="min-w-0">
                        <Badge tone="neutral">{CARE_TYPE_LABELS[rec.type]}</Badge>{' '}
                        <span className="text-[#1A3A3F]/70">{payloadSummary(rec.payload as Record<string, unknown>)}</span>
                      </span>
                      <span className="shrink-0 text-[#1A3A3F]/40">{formatDateTime(locale, rec.recordedAt)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-[#1A3A3F]/60">{t('r360.history.empty')}</p>
              )}
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
