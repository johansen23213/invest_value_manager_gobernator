'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardTitle, Input, Label } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { DOSE_STATUS_LABELS } from '@/lib/labels';
import type { DoseStatus } from '@/lib/mar';

const STATUS_TONE: Record<DoseStatus, 'green' | 'amber' | 'red' | 'neutral'> = {
  ADMINISTRADO: 'green',
  PENDIENTE: 'neutral',
  NO_ADMINISTRADO: 'red',
  RECHAZADO: 'amber',
};

export default function MedicationPage() {
  const params = useParams<{ id: string }>();
  const residentId = params.id;
  const utils = api.useUtils();
  const me = api.me.useQuery();
  const canPrescribe = me.data?.permissions.includes('medication:prescribe') ?? false;
  const canAdminister = me.data?.permissions.includes('medication:administer') ?? false;

  const resident = api.residents.get.useQuery({ id: residentId });
  const meds = api.medications.listByResident.useQuery({ residentId });
  const schedule = api.medications.schedule.useQuery({ residentId });

  const [form, setForm] = useState({ name: '', dose: '', times: '08:00,20:00', startDate: '' });

  const refresh = async () => {
    await Promise.all([utils.medications.listByResident.invalidate({ residentId }), utils.medications.schedule.invalidate({ residentId })]);
  };

  const prescribe = api.medications.prescribe.useMutation({
    onSuccess: async () => {
      setForm({ name: '', dose: '', times: '08:00,20:00', startDate: '' });
      await refresh();
    },
  });
  const record = api.medications.record.useMutation({ onSuccess: refresh });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/residentes/${residentId}`} className="text-sm text-blue-600 hover:underline">
          ← Expediente
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          Medicación{resident.data ? ` · ${resident.data.firstName} ${resident.data.lastName}` : ''}
        </h1>
      </div>

      {/* MAR de hoy */}
      <Card>
        <CardContent>
          <CardTitle className="mb-3 text-base">Pauta de hoy (MAR)</CardTitle>
          {schedule.isLoading ? (
            <p className="text-slate-500">Cargando…</p>
          ) : schedule.data && schedule.data.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {schedule.data.map((d) => (
                <li
                  key={`${d.medicationId}-${d.scheduledAt}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${d.overdue ? 'bg-red-50' : 'bg-slate-50'}`}
                >
                  <span>
                    <strong>{new Date(d.scheduledAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong>{' '}
                    {d.medicationName} ({d.dose}){' '}
                    <Badge tone={STATUS_TONE[d.status]}>{DOSE_STATUS_LABELS[d.status]}</Badge>
                  </span>
                  {canAdminister && (
                    <span className="flex gap-1">
                      <Button size="sm" onClick={() => record.mutate({ medicationId: d.medicationId, scheduledAt: new Date(d.scheduledAt), status: 'ADMINISTRADO' })}>
                        Administrar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => record.mutate({ medicationId: d.medicationId, scheduledAt: new Date(d.scheduledAt), status: 'RECHAZADO' })}>
                        Rechazado
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Sin dosis pautadas para hoy.</p>
          )}
        </CardContent>
      </Card>

      {/* Prescripción */}
      {canPrescribe && (
        <Card>
          <CardContent>
            <CardTitle className="mb-3 text-base">Prescribir medicación</CardTitle>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                prescribe.mutate({
                  residentId,
                  name: form.name,
                  dose: form.dose,
                  times: form.times.split(',').map((t) => t.trim()).filter(Boolean),
                  startDate: form.startDate ? new Date(form.startDate) : new Date(),
                });
              }}
            >
              <div>
                <Label htmlFor="name">Fármaco</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} required />
              </div>
              <div>
                <Label htmlFor="dose">Dosis</Label>
                <Input id="dose" value={form.dose} onChange={(e) => setForm((s) => ({ ...s, dose: e.target.value }))} required placeholder="1g" />
              </div>
              <div>
                <Label htmlFor="times">Horas (HH:MM, coma)</Label>
                <Input id="times" value={form.times} onChange={(e) => setForm((s) => ({ ...s, times: e.target.value }))} required />
              </div>
              <div>
                <Label htmlFor="start">Inicio</Label>
                <Input id="start" type="date" value={form.startDate} onChange={(e) => setForm((s) => ({ ...s, startDate: e.target.value }))} />
              </div>
              <Button type="submit" disabled={prescribe.isPending}>
                Prescribir
              </Button>
            </form>
            {prescribe.error && <p role="alert" className="mt-2 text-sm text-red-600">{prescribe.error.message}</p>}
          </CardContent>
        </Card>
      )}

      {/* Listado de prescripciones */}
      <Card>
        <CardContent>
          <CardTitle className="mb-3 text-base">Prescripciones</CardTitle>
          {meds.data && meds.data.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {meds.data.map((m) => (
                <li key={m.id}>
                  <strong>{m.name}</strong> · {m.dose} · {(m.times as string[]).join(', ')}{' '}
                  {!m.active && <Badge tone="neutral">Inactiva</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Sin prescripciones.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
