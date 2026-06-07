'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Input, Label } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useCareSync } from '@/offline/use-care-sync';
import type { CarePayload } from '@/offline/types';
import { CARE_TYPE_LABELS } from '@/lib/labels';
import { useT } from '@/i18n/provider';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/components/toast';

function cleanPayload(raw: Record<string, string>): CarePayload {
  const out: CarePayload = {};
  for (const [k, v] of Object.entries(raw)) if (v !== '') out[k] = v;
  return out;
}

const INTAKE_LEVELS = ['0', '25', '50', '75', '100'] as const;

export default function CarePage() {
  const me = api.me.useQuery();
  const canWrite = me.data?.permissions.includes('care:write') ?? false;
  const residents = api.residents.list.useQuery();
  const { enqueue, undo, online, pendingItems, syncNow } = useCareSync();
  const toast = useToast();
  const { locale } = useT();

  const [residentId, setResidentId] = useState('');
  const [query, setQuery] = useState('');
  const resident = useMemo(
    () => residents.data?.find((r) => r.id === residentId),
    [residents.data, residentId],
  );

  const [vitals, setVitals] = useState({ tension: '', fc: '', temperatura: '', sato2: '' });
  const [intake, setIntake] = useState({ comida: 'Comida', porcentaje: '100' });
  const [stool, setStool] = useState({ deposicion: 'Sí', notas: '' });
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
    return <p className="text-slate-500">Tu rol no registra atención directa.</p>;
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
          <CardTitle className="text-base">Pendientes de sincronizar ({pendingItems.length})</CardTitle>
          {online && (
            <Button size="sm" variant="secondary" onClick={() => syncNow()}>
              Sincronizar ahora
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
                {p.status === 'ERROR' ? 'Reintentando' : 'Pendiente'}
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
        <h1 className="text-2xl font-bold">Atención directa</h1>
        {!online && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Sin conexión: tus registros se guardan en el dispositivo y se envían solos al recuperar la red.
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
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{unit}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setResidentId(r.id)}
                  className="min-h-[64px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  <div className="text-lg font-semibold">
                    {r.lastName}, {r.firstName}
                  </div>
                  <div className="text-sm text-slate-500">
                    {r.bed ? `Plaza ${r.bed.code}` : 'Sin plaza asignada'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && <p className="text-slate-500">No hay residentes.</p>}
        {pendingPanel}
      </div>
    );
  }

  // ---- Paso 2: registrar atención del residente ---------------------------
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => setResidentId('')}
            className="text-sm text-brand-700 hover:underline"
          >
            ← Mi unidad
          </button>
          <h1 className="text-2xl font-bold">
            {resident.firstName} {resident.lastName}
          </h1>
          <p className="text-sm text-slate-500">
            {resident.bed ? `Plaza ${resident.bed.code} · ${resident.bed.unit.name}` : 'Sin plaza'}
          </p>
        </div>
        <Badge tone={online ? 'green' : 'amber'}>{online ? 'En línea' : 'Sin conexión'}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Constantes */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">Constantes</CardTitle>
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
              Registrar constantes
            </Button>
          </CardContent>
        </Card>

        {/* Ingesta */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">Ingesta</CardTitle>
            <Label htmlFor="comida">Comida</Label>
            <select
              id="comida"
              value={intake.comida}
              onChange={(e) => setIntake((s) => ({ ...s, comida: e.target.value }))}
              className="min-h-touch w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
            >
              {['Desayuno', 'Comida', 'Merienda', 'Cena'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <Label className="mt-3">Cantidad</Label>
            <div className="flex gap-2">
              {INTAKE_LEVELS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setIntake((s) => ({ ...s, porcentaje: p }))}
                  aria-pressed={intake.porcentaje === p}
                  className={`min-h-touch flex-1 rounded-md border text-base font-medium ${intake.porcentaje === p ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`}
                >
                  {p}%
                </button>
              ))}
            </div>
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={() => record('INGESTA', { comida: intake.comida, porcentaje: Number(intake.porcentaje) })}
            >
              Registrar ingesta
            </Button>
          </CardContent>
        </Card>

        {/* Deposición */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">Deposición</CardTitle>
            <div className="flex gap-2">
              {['Sí', 'No'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStool((s) => ({ ...s, deposicion: v }))}
                  aria-pressed={stool.deposicion === v}
                  className={`min-h-touch flex-1 rounded-md border text-base font-medium ${stool.deposicion === v ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <Label htmlFor="depNotas" className="mt-3">Notas</Label>
            <Input id="depNotas" value={stool.notas} onChange={(e) => setStool((s) => ({ ...s, notas: e.target.value }))} />
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={async () => {
                await record('DEPOSICION', cleanPayload(stool));
                setStool({ deposicion: 'Sí', notas: '' });
              }}
            >
              Registrar deposición
            </Button>
          </CardContent>
        </Card>

        {/* Incidencia */}
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">Incidencia</CardTitle>
            <Label htmlFor="inc">Descripción</Label>
            <Input id="inc" value={incident} onChange={(e) => setIncident(e.target.value)} placeholder="Ha dormido inquieto…" />
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={async () => {
                await record('INCIDENCIA', cleanPayload({ descripcion: incident }));
                setIncident('');
              }}
            >
              Registrar incidencia
            </Button>
          </CardContent>
        </Card>
      </div>

      {pendingPanel}

      <Card>
        <CardContent>
          <CardTitle className="mb-3 text-base">Registros recientes</CardTitle>
          {!online ? (
            <p className="text-sm text-slate-500">Sin conexión: el histórico se mostrará al volver online.</p>
          ) : records.data && records.data.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {records.data.map((rec) => (
                <li key={rec.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                  <span>
                    <Badge tone="neutral">{CARE_TYPE_LABELS[rec.type]}</Badge>{' '}
                    {Object.entries(rec.payload as Record<string, unknown>)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(' · ')}
                  </span>
                  <span className="text-slate-400">{formatDateTime(locale, rec.recordedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Sin registros todavía.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
