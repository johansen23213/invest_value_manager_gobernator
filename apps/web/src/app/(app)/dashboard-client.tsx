'use client';

import Link from 'next/link';
import { Card, CardContent, CardTitle } from '@vetlla/ui';
import { api } from '@/trpc/react';

export function DashboardClient() {
  const centers = api.centers.list.useQuery();
  const residents = api.residents.list.useQuery();
  const me = api.me.useQuery();
  const canMeds = me.data?.permissions.includes('medication:read') ?? false;
  const alerts = api.medications.alertsToday.useQuery(undefined, { enabled: canMeds });

  const totalCenters = centers.data?.length ?? 0;
  const totalResidents = residents.data?.length ?? 0;
  const occupied = residents.data?.filter((r) => r.bed).length ?? 0;
  const alertCount = alerts.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Panel</h1>

      {canMeds && alertCount > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>{alertCount}</strong> dosis no administradas hoy.{' '}
          {alerts.data?.slice(0, 3).map((a) => (
            <span key={`${a.medicationId}-${a.scheduledAt}`} className="mr-2">
              {a.residentName} ({a.medicationName})
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-sm text-slate-500">Centros</p>
            <p className="text-3xl font-bold">{totalCenters}</p>
            <Link href="/centros" className="text-sm text-blue-600 hover:underline">
              Ver centros →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-slate-500">Residentes</p>
            <p className="text-3xl font-bold">{totalResidents}</p>
            <Link href="/residentes" className="text-sm text-blue-600 hover:underline">
              Ver residentes →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-slate-500">Residentes con plaza asignada</p>
            <p className="text-3xl font-bold">
              {occupied}
              <span className="text-base font-normal text-slate-400"> / {totalResidents}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <CardTitle className="mb-2">Bienvenido a Vetlla</CardTitle>
          <p className="text-sm text-slate-600">
            Gestiona centros, plazas y el expediente sociosanitario de los residentes. La atención
            directa a pie de cama, la medicación y el copiloto de IA llegan en los siguientes hitos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
