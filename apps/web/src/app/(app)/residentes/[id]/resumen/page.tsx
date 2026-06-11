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
  Card,
  CardContent,
  CardTitle,
  Input,
  Label,
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
import { formatDateTime, formatTime } from '@/lib/format';
import {
  ASSESSMENT_TYPE_LABELS,
  CARE_PLAN_STATUS_LABELS,
  CARE_TYPE_LABELS,
  GOAL_STATUS_LABELS,
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
  const { locale } = useT();

  const me = api.me.useQuery();
  const canCareWrite = me.data?.permissions.includes('care:write') ?? false;
  const canAdminister = me.data?.permissions.includes('medication:administer') ?? false;

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
      `${CARE_TYPE_LABELS[type]} registrado${online ? '' : ' · se enviará al recuperar la red'}.`,
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
    toast.success(online ? 'Administración registrada.' : 'Registrada · se enviará al recuperar la red.');
  }

  if (resident.isLoading) {
    return <p className="mt-6 text-slate-500">Cargando…</p>;
  }
  if (!r) {
    return <p className="mt-6 text-slate-500">Residente no encontrado.</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Visión 360</h2>
        <Badge tone={online ? 'green' : 'amber'}>{online ? 'En línea' : 'Sin conexión'}</Badge>
      </div>

      <Tabs defaultValue="hoy">
        <TabsList aria-label="Secciones de la visión 360">
          <TabsTrigger value="hoy">Hoy</TabsTrigger>
          <TabsTrigger value="salud">Salud</TabsTrigger>
          <TabsTrigger value="atencion">Atención</TabsTrigger>
        </TabsList>

        {/* ── HOY — operativa del día con acciones rápidas ───────────────────── */}
        <TabsContent value="hoy">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Medicación pendiente */}
            <Card>
              <CardContent>
                <div className="mb-3 flex items-center justify-between">
                  <CardTitle className="text-base">Medicación de hoy</CardTitle>
                  <Link
                    href={`/residentes/${residentId}/medicacion`}
                    className="text-sm text-brand-700 hover:underline"
                  >
                    Ver MAR completo →
                  </Link>
                </div>
                <p className="mb-3 text-sm text-slate-600" aria-live="polite">
                  {medSummary.administered}/{medSummary.total} administradas
                  {medSummary.notAdministered > 0 && (
                    <>
                      {' · '}
                      <span className="font-medium text-red-700">
                        {medSummary.notAdministered} no administradas
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
                          d.overdue ? 'bg-amber-50' : 'bg-slate-50'
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                          <strong className="shrink-0">{formatTime(locale, d.scheduledAt)}</strong>
                          <span className="truncate">
                            {d.medicationName} ({d.dose})
                          </span>
                          {d.overdue && <Badge tone="amber">Retrasada</Badge>}
                        </span>
                        {canAdminister && (
                          <Button
                            size="sm"
                            className="min-h-[48px] px-4"
                            onClick={() => void administer(d.medicationId, d.medicationName, d.scheduledAt)}
                            aria-label={`Administrar ${d.medicationName} ${d.dose} de las ${formatTime(locale, d.scheduledAt)}`}
                          >
                            Administrar
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Sin dosis pendientes ahora mismo.</p>
                )}
              </CardContent>
            </Card>

            {/* Constantes rápidas */}
            {canCareWrite && (
              <Card>
                <CardContent>
                  <CardTitle className="mb-3 text-base">Registrar constantes</CardTitle>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="tension">T. arterial</Label>
                      <Input id="tension" inputMode="numeric" placeholder="120/80" value={vitals.tension} onChange={(e) => setVitals((s) => ({ ...s, tension: e.target.value }))} />
                    </div>
                    <div>
                      <Label htmlFor="fc">FC (lpm)</Label>
                      <Input id="fc" type="number" inputMode="numeric" value={vitals.fc} onChange={(e) => setVitals((s) => ({ ...s, fc: e.target.value }))} />
                    </div>
                    <div>
                      <Label htmlFor="temp">Tª (ºC)</Label>
                      <Input id="temp" type="number" inputMode="decimal" step="0.1" value={vitals.temperatura} onChange={(e) => setVitals((s) => ({ ...s, temperatura: e.target.value }))} />
                    </div>
                    <div>
                      <Label htmlFor="sato2">SatO₂ (%)</Label>
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
                    Registrar constantes
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Incidencia rápida */}
            {canCareWrite && (
              <Card>
                <CardContent>
                  <CardTitle className="mb-3 text-base">Registrar incidencia</CardTitle>
                  <Label htmlFor="inc">Descripción</Label>
                  <Input
                    id="inc"
                    value={incident}
                    onChange={(e) => setIncident(e.target.value)}
                    placeholder="Ha dormido inquieto…"
                  />
                  <Button
                    size="lg"
                    className="mt-3 w-full"
                    onClick={async () => {
                      await registerCare('INCIDENCIA', cleanPayload({ descripcion: incident }));
                      setIncident('');
                    }}
                  >
                    Registrar incidencia
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Registros de hoy / recientes */}
            <Card>
              <CardContent>
                <CardTitle className="mb-3 text-base">Registros recientes</CardTitle>
                {!online ? (
                  <p className="text-sm text-slate-500">Sin conexión: el histórico se mostrará al volver online.</p>
                ) : records.data && records.data.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {records.data.slice(0, 6).map((rec) => (
                      <li key={rec.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                        <span className="min-w-0">
                          <Badge tone="neutral">{CARE_TYPE_LABELS[rec.type]}</Badge>{' '}
                          <span className="text-slate-600">{payloadSummary(rec.payload as Record<string, unknown>)}</span>
                        </span>
                        <span className="shrink-0 text-slate-400">{formatDateTime(locale, rec.recordedAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Sin registros todavía.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── SALUD — instantánea clínica (lectura + enlaces al expediente) ──── */}
        <TabsContent value="salud">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Alergias */}
            <Card>
              <CardContent>
                <CardTitle className="mb-3 text-base">Alergias</CardTitle>
                {r.allergies.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {r.allergies.map((al) => (
                      <li key={al.id} className="flex items-center gap-2">
                        <Badge tone="red">{al.substance.toUpperCase()}</Badge>
                        {al.reaction && <span className="text-slate-500">{al.reaction}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Sin alergias registradas.</p>
                )}
              </CardContent>
            </Card>

            {/* Escalas */}
            <Card>
              <CardContent>
                <CardTitle className="mb-3 text-base">Escalas</CardTitle>
                {latestAssessments.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {latestAssessments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between">
                        <span>{ASSESSMENT_TYPE_LABELS[a.type] ?? a.type}</span>
                        <span className="text-slate-600">
                          <strong>{a.score ?? '—'}</strong>{' '}
                          <span className="text-slate-400">· {formatDateTime(locale, a.assessedAt)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Sin escalas valoradas.</p>
                )}
              </CardContent>
            </Card>

            {/* Diagnósticos */}
            <Card>
              <CardContent>
                <CardTitle className="mb-3 text-base">Diagnósticos</CardTitle>
                {r.diagnoses.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {r.diagnoses.map((dx) => (
                      <li key={dx.id} className="flex flex-wrap items-center gap-2">
                        {dx.code && <Badge tone="blue">{dx.code}</Badge>}
                        <span>{dx.description}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Sin diagnósticos registrados.</p>
                )}
              </CardContent>
            </Card>

            {/* Medicación activa */}
            <Card>
              <CardContent>
                <div className="mb-3 flex items-center justify-between">
                  <CardTitle className="text-base">Medicación activa</CardTitle>
                  <Link
                    href={`/residentes/${residentId}/medicacion`}
                    className="text-sm text-brand-700 hover:underline"
                  >
                    Gestionar →
                  </Link>
                </div>
                {activeMeds.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {activeMeds.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-2">
                        <strong>{m.name}</strong>
                        <span className="text-slate-500">· {m.dose}</span>
                        {m.type === 'PRN' && <Badge tone="blue">A demanda</Badge>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Sin medicación activa.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            ¿Falta algo o hay que corregir un dato?{' '}
            <Link href={`/residentes/${residentId}`} className="text-brand-700 hover:underline">
              Abrir el expediente completo
            </Link>
            .
          </p>
        </TabsContent>

        {/* ── ATENCIÓN — PIA + timeline de cuidado ──────────────────────────── */}
        <TabsContent value="atencion">
          <div className="flex flex-col gap-4">
            {/* PIA activo */}
            <Card>
              <CardContent>
                <div className="mb-3 flex items-center justify-between">
                  <CardTitle className="text-base">Plan de atención (PIA)</CardTitle>
                  <Link
                    href={`/residentes/${residentId}/pia`}
                    className="text-sm text-brand-700 hover:underline"
                  >
                    Gestionar PIA →
                  </Link>
                </div>
                {activePlans.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {activePlans.map((plan) => (
                      <section key={plan.id} aria-label={`Plan ${plan.title}`}>
                        <div className="mb-2 flex items-center gap-2">
                          <strong className="text-sm">{plan.title}</strong>
                          <Badge tone="green">{CARE_PLAN_STATUS_LABELS[plan.status] ?? plan.status}</Badge>
                        </div>
                        {plan.goals.length > 0 ? (
                          <ul className="flex flex-col gap-1 border-l-2 border-slate-200 pl-3 text-sm">
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
                          <p className="text-xs text-slate-500">Sin objetivos definidos.</p>
                        )}
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Sin plan de atención activo.</p>
                )}
              </CardContent>
            </Card>

            {/* Timeline de registros de cuidado */}
            <Card>
              <CardContent>
                <CardTitle className="mb-3 text-base">Histórico de cuidado</CardTitle>
                {!online ? (
                  <p className="text-sm text-slate-500">Sin conexión: el histórico se mostrará al volver online.</p>
                ) : records.data && records.data.length > 0 ? (
                  <ol className="flex flex-col gap-2">
                    {records.data.map((rec) => (
                      <li key={rec.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0">
                        <span className="min-w-0">
                          <Badge tone="neutral">{CARE_TYPE_LABELS[rec.type]}</Badge>{' '}
                          <span className="text-slate-600">{payloadSummary(rec.payload as Record<string, unknown>)}</span>
                        </span>
                        <span className="shrink-0 text-slate-400">{formatDateTime(locale, rec.recordedAt)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-500">Sin registros de cuidado todavía.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
