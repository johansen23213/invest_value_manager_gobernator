'use client';

import Link from 'next/link';
import { Card, CardContent, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import type { Permission } from '@/lib/rbac';

function Kpi({ label, value, loading, href, cta }: { label: string; value: number; loading: boolean; href?: string; cta?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-slate-500">{label}</p>
        {loading ? <Skeleton className="mt-1 h-9 w-16" /> : <p className="text-3xl font-bold">{value}</p>}
        {href && cta && (
          <Link href={href} className="text-sm text-brand-700 hover:underline">
            {cta} →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

const QUICK_LINKS: { perm: Permission; href: string; title: string; desc: string }[] = [
  { perm: 'care:write', href: '/atencion', title: 'Atención directa', desc: 'Registrar a pie de cama' },
  { perm: 'residents:read', href: '/residentes', title: 'Residentes', desc: 'Expedientes y altas' },
  { perm: 'centers:read', href: '/centros', title: 'Centros', desc: 'Unidades, plazas y ocupación' },
];

export function DashboardClient() {
  const me = api.me.useQuery();
  const perms = me.data?.permissions ?? [];
  const canMeds = perms.includes('medication:read');

  const centers = api.centers.list.useQuery(undefined, { enabled: perms.includes('centers:read') });
  const residents = api.residents.list.useQuery(undefined, { enabled: perms.includes('residents:read') });
  const alerts = api.medications.alertsToday.useQuery(undefined, { enabled: canMeds });

  const totalCenters = centers.data?.length ?? 0;
  const totalResidents = residents.data?.length ?? 0;
  const occupied = residents.data?.filter((r) => r.bed).length ?? 0;
  const alertCount = alerts.data?.length ?? 0;

  const links = QUICK_LINKS.filter((l) => perms.includes(l.perm));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Panel</h1>

      {canMeds && alertCount > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <strong>{alertCount}</strong> dosis no administradas hoy.{' '}
          {alerts.data?.slice(0, 3).map((a) => (
            <span key={`${a.medicationId}-${a.scheduledAt}`} className="mr-2">
              {a.residentName} ({a.medicationName})
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Centros" value={totalCenters} loading={centers.isLoading} href="/centros" cta="Ver centros" />
        <Kpi label="Residentes" value={totalResidents} loading={residents.isLoading} href="/residentes" cta="Ver residentes" />
        <Card>
          <CardContent>
            <p className="text-sm text-slate-500">Ocupación</p>
            {residents.isLoading ? (
              <Skeleton className="mt-1 h-9 w-20" />
            ) : (
              <p className="text-3xl font-bold">
                {occupied}
                <span className="text-base font-normal text-slate-400"> / {totalResidents}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {links.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Accesos rápidos</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                <p className="font-semibold">{l.title}</p>
                <p className="text-sm text-slate-500">{l.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
