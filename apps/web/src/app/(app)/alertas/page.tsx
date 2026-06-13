'use client';

import Link from 'next/link';
import { Badge, Card, CardContent, EmptyState, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import type { AlertItem, AlertSeverity } from '@/lib/alerts';
import { IntakeAlertsSection } from './intake-alerts-section';

const SEVERITY_TONE: Record<AlertSeverity, 'red' | 'amber'> = { high: 'red', medium: 'amber' };
const SEVERITY_LABEL: Record<AlertSeverity, string> = { high: 'Alta', medium: 'Media' };
const KIND_LABEL: Record<AlertItem['kind'], string> = { MEDICATION: 'Medicación', INCIDENT: 'Incidencia' };

function AlertRow({ alert, locale }: { alert: AlertItem; locale: string }) {
  const time = new Date(alert.at).toLocaleTimeString(locale === 'ca' ? 'ca-ES' : 'es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div className="flex flex-col gap-1 border-t border-brand-100/60 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Badge tone={SEVERITY_TONE[alert.severity]}>{SEVERITY_LABEL[alert.severity]}</Badge>
        <div className="min-w-0">
          <p className="font-medium">
            {alert.title}
            <span className="ml-2 text-xs font-normal uppercase tracking-wide text-[#1A3A3F]/40">
              {KIND_LABEL[alert.kind]}
            </span>
          </p>
          {alert.detail && <p className="truncate text-sm text-[#1A3A3F]/70">{alert.detail}</p>}
          {alert.residentName && (
            <p className="text-sm text-[#1A3A3F]/60">
              {alert.residentId ? (
                <Link href={`/residentes/${alert.residentId}`} className="text-brand-700 hover:underline">
                  {alert.residentName}
                </Link>
              ) : (
                alert.residentName
              )}
            </p>
          )}
        </div>
      </div>
      <time className="shrink-0 text-sm text-[#1A3A3F]/40" dateTime={alert.at}>
        {time}
      </time>
    </div>
  );
}

export default function AlertsPage() {
  const { locale } = useT();
  const alerts = api.overview.alerts.useQuery();
  const data = alerts.data ?? [];
  const high = data.filter((a) => a.severity === 'high').length;
  const medium = data.length - high;

  // Centro para alertas de ingesta: primer centro accesible
  const centers = api.centers.list.useQuery();
  const firstCenterId = (centers.data ?? [])[0]?.id ?? '';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1A3A3F]">Alertas</h1>
          <p className="text-sm text-[#1A3A3F]/60">Medicación no administrada e incidencias de hoy, por prioridad.</p>
        </div>
        {!alerts.isLoading && data.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge tone="red">{high} altas</Badge>
            <Badge tone="amber">{medium} medias</Badge>
          </div>
        )}
      </div>

      {/* Alertas de medicación e incidencias */}
      <Card>
        <CardContent>
          {alerts.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data.length > 0 ? (
            <div>
              {data.map((alert) => (
                <AlertRow key={alert.id} alert={alert} locale={locale} />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin alertas" description="No hay medicación pendiente ni incidencias hoy. Todo al día." />
          )}
        </CardContent>
      </Card>

      {/* Panel de alertas de baja ingesta (RF-NUT-007) */}
      {firstCenterId && <IntakeAlertsSection centerId={firstCenterId} />}
    </div>
  );
}
