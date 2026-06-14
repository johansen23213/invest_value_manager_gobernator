'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, EmptyState, Input, Label, PageHeader, Select } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useCareSync } from '@/offline/use-care-sync';
import type { CarePayload } from '@/offline/types';
import { CARE_TYPE_LABELS } from '@/lib/labels';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/components/toast';
import { CopilotCard } from './copilot-card';
import { IntakeStructured } from './intake-structured';

function cleanPayload(raw: Record<string, string>): CarePayload {
  const out: CarePayload = {};
  for (const [k, v] of Object.entries(raw)) if (v !== '') out[k] = v;
  return out;
}

const INTAKE_LEVELS = ['0', '25', '50', '75', '100'] as const;
const MEAL_KEYS = ['DESAYUNO', 'COMIDA', 'MERIENDA', 'CENA'] as const;

export default function CarePage() {
  const me = api.me.useQuery();
  const canWrite = me.data?.permissions.includes('care:write') ?? false;
  const residents = api.residents.list.useQuery();
  const { enqueue, undo, online, pendingItems, syncNow } = useCareSync();
  const toast = useToast();
  const { locale, t } = useT();

  const [residentId, setResidentId] = useState('');
  const [query, setQuery] = useState('');
  const resident = useMemo(
    () => residents.data?.find((r) => r.id === residentId),
    [residents.data, residentId],
  );

  const [vitals, setVitals] = useState({ tension: '', fc: '', temperatura: '', sato2: '' });
  const [intake, setIntake] = useState({ comida: 'COMIDA', porcentaje: '100' });
  const [stool, setStool] = useState({ deposicion: 'SI', notas: '' });
  const [incident, setIncident] = useState('');

  const records = api.care.listByResident.useQuery(
    { residentId },
    { enabled: Boolean(residentId) && online },
  );

  // Residentes agrupados por unidad (UX-13: "mi unidad").
  const grouped = useMemo(() => {
    const list = (residents.data ?? []).filter((r) => {
      const q = query.trim().toLowerCase();
      return !q || `${r.firstName} ${r.lastName}`.toLowerCase().includes(q);
    });
    const groups = new Map<string, typeof list>();
    for (const r of list) {
      const key = `${r.center.name} · ${r.bed?.unit.name ?? 'Sin plaza'}`;
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [residents.data, query]);

  if (!canWrite) {
    return <p className="text-[#1A3A3F]/60">Tu rol no registra atención directa.</p>;
  }

  async function record(
    type: 'CONSTANTES' | 'INGESTA' | 'DEPOSICION' | 'INCIDENCIA',
    payload: CarePayload,
  ) {
    if (!resident || Object.keys(payload).length === 0) return;
    const clientId = await enqueue({
      residentId: resident.id,
      residentName: `${resident.firstName} ${resident.lastName}`,
      type,
      payload,
    });
    toast.success(
      `${CARE_TYPE_LABELS[type]} registrado${online ? '' : ' · se enviará al recuperar la red'}.`,
      {
        label: 'Deshacer',
        onClick: () => {
          void undo(clientId);
          toast.success('Registro deshecho.');
        },
      },
    );
    void records.refetch();
  }

  const pendingPanel = pendingItems.length > 0 && (
    <Card>
      <CardContent>
        <div className="mb-2 flex items-center justify-between">
          <CardTitle className="text-base">{t('care.pending.title', { count: pendingItems.length })}</CardTitle>
          {online && (
            <Button size="sm" variant="secondary" onClick={() => syncNow()}>
              {t('care.pending.syncNow')}
            </Button>
          )}
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {pendingItems.map((p) => (
            <li key={p.clientId} className="flex items-center justify-between">
              <span>
                <Badge tone="neutral">{CARE_TYPE_LABELS[p.type]}</Badge> {p.residentName}
              </span>
              <Badge tone={p.status === 'ERROR' ? 'red' : 'amber'}>
                {p.status === 'ERROR' ? t('care.pending.retrying') : t('care.pending.pending')}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );

  // ---- Paso 1: elegir residente (mi unidad) -------------------------------
  if (!resident) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('care.page.title')} />
        {!online && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('care.offline.notice')}
          </p>
        )}
        <Input
          type="search"
          placeholder="Buscar residente…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar residente"
        />
        {grouped.map(([unit, list]) => (
          <div key={unit}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#1A3A3F]/40">{unit}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setResidentId(r.id)}
                  className="min-h-[64px] rounded-2xl border border-brand-100 bg-white px-4 py-3 text-left shadow-card transition hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <div className="text-lg font-semibold text-[#1A3A3F]">
                    {r.lastName}, {r.firstName}
                  </div>
                  <div className="text-sm text-[#1A3A3F]/60">
                    {r.bed ? `Plaza ${r.bed.code}` : 'Sin plaza asignada'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && query && (
          <EmptyState variant="search" title="Sin resultados" description="No hay residentes con ese nombre." />
        )}
        {grouped.length === 0 && !query && <p className="text-[#1A3A3F]/60">No hay residentes.</p>}
        {pendingPanel}
      </div>
    );
  }

  // ---- Paso 2: registrar atención del residente ---------------------------
  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          type="button"
          onClick={() => setResidentId('')}
          className="mb-1 text-sm text-brand-700 hover:underline"
        >
          ← Mi unidad
        </button>
        <PageHeader
          title={`${resident.firstName} ${resident.lastName}`}
          subtitle={resident.bed ? `Plaza ${resident.bed.code} · ${resident.bed.unit.name}` : 'Sin plaza'}
          action={<Badge tone={online ? 'green' : 'amber'}>{online ? 'En línea' : 'Sin conexión'}</Badge>}
        />
      </div>

      {/* Copiloto: texto libre → borrador de registro, con confirmación humana (H5). */}
      <CopilotCard residentId={resident.id} online={online} onSaved={() => void records.refetch()} />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Constantes */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">{t('care.vitals.title')}</CardTitle>
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
                await record('CONSTANTES', cleanPayload(vitals));
                setVitals({ tension: '', fc: '', temperatura: '', sato2: '' });
              }}
            >
              {t('care.vitals.submit')}
            </Button>
          </CardContent>
        </Card>

        {/* Ingesta */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">{t('care.intake.title')}</CardTitle>
            <Label htmlFor="comida">{t('care.intake.meal')}</Label>
            <Select
              id="comida"
              value={intake.comida}
              onChange={(e) => setIntake((s) => ({ ...s, comida: e.target.value }))}
            >
              {MEAL_KEYS.map((key) => (
                <option key={key} value={key}>{t(`meal.${key}`)}</option>
              ))}
            </Select>
            <Label className="mt-3">{t('care.intake.quantity')}</Label>
            <div className="flex gap-2">
              {INTAKE_LEVELS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setIntake((s) => ({ ...s, porcentaje: p }))}
                  aria-pressed={intake.porcentaje === p}
                  className={`min-h-[56px] flex-1 rounded-full border text-base font-semibold transition-colors ${intake.porcentaje === p ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-200 bg-white text-[#1A3A3F] hover:bg-brand-50'}`}
                >
                  {p}%
                </button>
              ))}
            </div>
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={() => record('INGESTA', { comida: t(`meal.${intake.comida as typeof MEAL_KEYS[number]}`), porcentaje: Number(intake.porcentaje) })}
            >
              {t('care.intake.submit')}
            </Button>
          </CardContent>
        </Card>

        {/* Deposición */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">{t('care.stool.title')}</CardTitle>
            <div className="flex gap-2">
              {(['SI', 'NO'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStool((s) => ({ ...s, deposicion: v }))}
                  aria-pressed={stool.deposicion === v}
                  className={`min-h-[56px] flex-1 rounded-full border text-base font-semibold transition-colors ${stool.deposicion === v ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-200 bg-white text-[#1A3A3F] hover:bg-brand-50'}`}
                >
                  {v === 'SI' ? t('care.yes') : t('care.no')}
                </button>
              ))}
            </div>
            <Label htmlFor="depNotas" className="mt-3">{t('care.stool.notes')}</Label>
            <Input id="depNotas" value={stool.notas} onChange={(e) => setStool((s) => ({ ...s, notas: e.target.value }))} />
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={async () => {
                await record('DEPOSICION', cleanPayload({ deposicion: stool.deposicion === 'SI' ? t('care.yes') : t('care.no'), notas: stool.notas }));
                setStool({ deposicion: 'SI', notas: '' });
              }}
            >
              {t('care.stool.submit')}
            </Button>
          </CardContent>
        </Card>

        {/* Incidencia */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">{t('care.incident.title')}</CardTitle>
            <Label htmlFor="inc">{t('care.incident.label')}</Label>
            <Input id="inc" value={incident} onChange={(e) => setIncident(e.target.value)} placeholder="Ha dormido inquieto…" />
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={async () => {
                await record('INCIDENCIA', cleanPayload({ descripcion: incident }));
                setIncident('');
              }}
            >
              {t('care.incident.submit')}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Ingesta estructurada (IntakeRecord — RF-NUT-006) */}
      <IntakeStructured residentId={resident.id} online={online} />

      {pendingPanel}

      <Card>
        <CardContent>
          <CardTitle className="mb-3 text-base">{t('care.records.title')}</CardTitle>
          {!online ? (
            <p className="text-sm text-[#1A3A3F]/60">{t('r360.records.offline')}</p>
          ) : records.data && records.data.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {records.data.map((rec) => (
                <li key={rec.id} className="flex items-center justify-between rounded-md bg-brand-50 px-3 py-2">
                  <span>
                    <Badge tone="neutral">{CARE_TYPE_LABELS[rec.type]}</Badge>{' '}
                    {Object.entries(rec.payload as Record<string, unknown>)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(' · ')}
                  </span>
                  <span className="text-[#1A3A3F]/40">{formatDateTime(locale, rec.recordedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState variant="check" title="Sin registros todavía" description="Los registros de hoy aparecerán aquí." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
