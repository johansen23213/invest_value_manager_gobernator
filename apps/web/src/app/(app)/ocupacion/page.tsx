'use client';

import { Badge, Card, CardContent, EmptyState, PageHeader, Skeleton, StatCard } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { CENTER_TYPE_LABELS } from '@/lib/labels';
import type { BedCounts, UnitOccupancy } from '@/lib/occupancy';

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** Tono del badge de ocupación: verde con plazas libres, ámbar casi lleno, rojo sin plazas. */
function occupancyTone(rate: number): 'green' | 'amber' | 'red' {
  if (rate >= 0.95) return 'red';
  if (rate >= 0.8) return 'amber';
  return 'green';
}


/** Plano de la unidad: cuadritos proporcionales (ocupada / libre / fuera de servicio). */
function BedMap({ counts }: { counts: BedCounts }) {
  const cells: { key: string; cls: string; title: string }[] = [];
  for (let i = 0; i < counts.occupied; i += 1)
    cells.push({ key: `o${i}`, cls: 'bg-brand-600 border-brand-700', title: 'Ocupada' });
  for (let i = 0; i < counts.free; i += 1)
    cells.push({ key: `f${i}`, cls: 'bg-white border-slate-300', title: 'Libre' });
  for (let i = 0; i < counts.outOfService; i += 1)
    cells.push({ key: `s${i}`, cls: 'bg-slate-200 border-slate-300 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(0,0,0,0.12)_3px,rgba(0,0,0,0.12)_4px)]', title: 'Fuera de servicio' });

  return (
    <div className="flex flex-wrap gap-1" role="img" aria-label={`${counts.occupied} ocupadas, ${counts.free} libres, ${counts.outOfService} fuera de servicio`}>
      {cells.map((c) => (
        <span key={c.key} title={c.title} className={`h-5 w-5 rounded border ${c.cls}`} />
      ))}
    </div>
  );
}

function UnitRow({ unit }: { unit: UnitOccupancy }) {
  return (
    <div className="flex flex-col gap-2 border-t border-brand-100/60 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{unit.unitName}</p>
        <p className="text-sm text-[#1A3A3F]/60">
          {unit.occupied}/{unit.capacity} ocupadas · {unit.free} libres
          {unit.outOfService > 0 && ` · ${unit.outOfService} fuera de servicio`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <BedMap counts={unit} />
        <Badge tone={occupancyTone(unit.occupancyRate)}>{pct(unit.occupancyRate)}</Badge>
      </div>
    </div>
  );
}

export default function OccupancyPage() {
  const { t } = useT();
  const occupancy = api.overview.occupancy.useQuery();
  const data = occupancy.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('occupancy.title')}
        subtitle="Plazas, ocupación y plano por centro y unidad."
        accent
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Plazas" value={data ? String(data.capacity) : '0'} sub={data ? `de ${data.total}` : undefined} loading={occupancy.isLoading} />
        <StatCard label="Ocupadas" value={data ? String(data.occupied) : '0'} loading={occupancy.isLoading} />
        <StatCard label="Libres" value={data ? String(data.free) : '0'} loading={occupancy.isLoading} />
        <StatCard label="Ocupación" value={data ? pct(data.occupancyRate) : '0%'} loading={occupancy.isLoading} />
      </div>

      {data && data.outOfService > 0 && (
        <p className="text-sm text-[#1A3A3F]/60">{data.outOfService} plaza(s) fuera de servicio (no computan en el aforo).</p>
      )}

      {occupancy.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : data && data.centers.length > 0 ? (
        <div className="flex flex-col gap-4">
          {data.centers.map((center) => (
            <Card key={center.centerId}>
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{center.centerName}</h2>
                    <Badge tone="blue">{CENTER_TYPE_LABELS[center.centerType as keyof typeof CENTER_TYPE_LABELS] ?? center.centerType}</Badge>
                  </div>
                  <Badge tone={occupancyTone(center.occupancyRate)}>
                    {center.occupied}/{center.capacity} · {pct(center.occupancyRate)}
                  </Badge>
                </div>
                <div className="mt-2">
                  {center.units.length > 0 ? (
                    center.units.map((unit) => <UnitRow key={unit.unitId} unit={unit} />)
                  ) : (
                    <p className="py-3 text-sm text-[#1A3A3F]/60">Este centro no tiene unidades todavía.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No hay centros todavía" description="Crea centros, unidades y plazas para ver la ocupación." />
      )}

      <div className="flex flex-wrap gap-4 text-xs text-[#1A3A3F]/60">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-brand-700 bg-brand-600" /> Ocupada</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-slate-300 bg-white" /> Libre</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-slate-300 bg-slate-200" /> Fuera de servicio</span>
      </div>
    </div>
  );
}
