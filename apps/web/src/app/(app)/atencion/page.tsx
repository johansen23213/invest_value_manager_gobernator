'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Input, Label, Select } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useCareSync } from '@/offline/use-care-sync';
import type { CarePayload } from '@/offline/types';
import { CARE_TYPE_LABELS } from '@/lib/labels';

function cleanPayload(raw: Record<string, string>): CarePayload {
  const out: CarePayload = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== '') out[k] = v;
  }
  return out;
}

export default function CarePage() {
  const me = api.me.useQuery();
  const canWrite = me.data?.permissions.includes('care:write') ?? false;
  const residents = api.residents.list.useQuery();
  const { enqueue, online } = useCareSync();

  const [residentId, setResidentId] = useState('');
  const [flash, setFlash] = useState('');
  const resident = useMemo(
    () => residents.data?.find((r) => r.id === residentId),
    [residents.data, residentId],
  );

  // Estado de los formularios rápidos.
  const [vitals, setVitals] = useState({ tension: '', fc: '', temperatura: '', sato2: '' });
  const [intake, setIntake] = useState({ comida: 'Comida', porcentaje: '100' });
  const [stool, setStool] = useState({ deposicion: 'Sí', notas: '' });
  const [incident, setIncident] = useState('');

  const records = api.care.listByResident.useQuery(
    { residentId },
    { enabled: Boolean(residentId) && online },
  );

  if (!canWrite) {
    return <p className="text-slate-500">Tu rol no registra atención directa.</p>;
  }

  async function record(type: 'CONSTANTES' | 'INGESTA' | 'DEPOSICION' | 'INCIDENCIA', payload: CarePayload) {
    if (!resident || Object.keys(payload).length === 0) return;
    await enqueue({
      residentId: resident.id,
      residentName: `${resident.firstName} ${resident.lastName}`,
      type,
      payload,
    });
    setFlash(`${CARE_TYPE_LABELS[type]} registrado${online ? '' : ' (se sincronizará al recuperar la red)'}.`);
    void records.refetch();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Atención directa</h1>
        <Badge tone={online ? 'green' : 'amber'}>{online ? 'En línea' : 'Sin conexión'}</Badge>
      </div>

      <Card>
        <CardContent>
          <Label htmlFor="resident">Residente</Label>
          <Select id="resident" value={residentId} onChange={(e) => setResidentId(e.target.value)}>
            <option value="">Selecciona un residente…</option>
            {residents.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.lastName}, {r.firstName} {r.bed ? `· ${r.bed.code}` : ''}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {flash && (
        <p role="status" className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-800">
          {flash}
        </p>
      )}

      {resident && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Constantes */}
          <Card>
            <CardContent>
              <CardTitle className="mb-3 text-base">Constantes</CardTitle>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tension">T. arterial</Label>
                  <Input id="tension" placeholder="120/80" value={vitals.tension} onChange={(e) => setVitals((s) => ({ ...s, tension: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="fc">FC (lpm)</Label>
                  <Input id="fc" type="number" value={vitals.fc} onChange={(e) => setVitals((s) => ({ ...s, fc: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="temp">Tª (ºC)</Label>
                  <Input id="temp" type="number" step="0.1" value={vitals.temperatura} onChange={(e) => setVitals((s) => ({ ...s, temperatura: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="sato2">SatO₂ (%)</Label>
                  <Input id="sato2" type="number" value={vitals.sato2} onChange={(e) => setVitals((s) => ({ ...s, sato2: e.target.value }))} />
                </div>
              </div>
              <Button
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
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="comida">Comida</Label>
                  <Select id="comida" value={intake.comida} onChange={(e) => setIntake((s) => ({ ...s, comida: e.target.value }))}>
                    {['Desayuno', 'Comida', 'Merienda', 'Cena'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex-1">
                  <Label htmlFor="pct">Cantidad</Label>
                  <Select id="pct" value={intake.porcentaje} onChange={(e) => setIntake((s) => ({ ...s, porcentaje: e.target.value }))}>
                    {['0', '25', '50', '75', '100'].map((p) => (
                      <option key={p} value={p}>
                        {p}%
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <Button
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
              <div className="flex gap-3">
                <div>
                  <Label htmlFor="dep">Deposición</Label>
                  <Select id="dep" value={stool.deposicion} onChange={(e) => setStool((s) => ({ ...s, deposicion: e.target.value }))}>
                    <option>Sí</option>
                    <option>No</option>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label htmlFor="depNotas">Notas</Label>
                  <Input id="depNotas" value={stool.notas} onChange={(e) => setStool((s) => ({ ...s, notas: e.target.value }))} />
                </div>
              </div>
              <Button
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
      )}

      {resident && (
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
                    <span className="text-slate-400">
                      {new Date(rec.recordedAt).toLocaleString('es-ES')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Sin registros todavía.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
