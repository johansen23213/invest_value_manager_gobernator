'use client';

/**
 * /valoraciones — Panel de alertas de valoración vencida o próxima a vencer.
 *
 * Consume:
 *   - api.valoraciones.overdueAlerts.useQuery({ unitId? })
 *   - api.valoraciones.pendingCount.useQuery()
 *
 * Permiso requerido: residents:read (Familiar NO tiene acceso).
 * Accesible WCAG 2.1 AA: tabla con cabeceras scope, roles aria, foco visible,
 * color nunca único canal, touch targets 48px.
 */

import Link from 'next/link';
import { useState, useMemo } from 'react';
import {
  Badge,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  SectionCard,
  Label,
  Table,
  Th,
  Td,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';

// ---------------------------------------------------------------------------
// Icono decorativo — reloj / alerta de tiempo
// ---------------------------------------------------------------------------
function IconClock({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Badge de estado — tono coherente con paleta Lifecare
// Color NUNCA único canal: siempre hay texto descriptivo (WCAG 1.4.1).
// ---------------------------------------------------------------------------
function StatusBadge({ status, t }: { status: 'vencida' | 'proxima' | 'al_dia'; t: (k: string) => string }) {
  const tone = status === 'vencida' ? 'red' : status === 'proxima' ? 'amber' : 'green';
  return (
    <Badge tone={tone}>
      {t(`valoracion.status.${status}`)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Fila de la tabla
// ---------------------------------------------------------------------------
type OverdueAlert = {
  residentId: string;
  residentName: string;
  unitId: string | null;
  unitName: string | null;
  scaleType: string;
  score: number;
  assessedAt: Date;
  assessmentId: string;
  status: 'vencida' | 'proxima';
  daysOverdue: number;
  daysUntilDue: number;
  dueDate: Date;
  cadenceDays: number;
};

function AlertRow({ alert, locale, t }: { alert: OverdueAlert; locale: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  // Etiqueta de días: vencida = días de retraso; próxima = días hasta vencer o "hoy"
  const daysLabel =
    alert.status === 'vencida'
      ? t('valoracion.alerts.daysOverdue', { days: alert.daysOverdue })
      : alert.daysUntilDue === 0
        ? t('valoracion.alerts.dueToday')
        : t('valoracion.alerts.daysUntilDue', { days: alert.daysUntilDue });

  // Nombre de escala: usar clave i18n scale.* si existe, si no el propio tipo
  const scaleLabel = t(`scale.${alert.scaleType}`) !== `scale.${alert.scaleType}`
    ? t(`scale.${alert.scaleType}`)
    : alert.scaleType;

  return (
    <tr className="transition-colors hover:bg-brand-50/40">
      {/* Residente — enlace al expediente */}
      <Td>
        <Link
          href={`/residentes/${alert.residentId}`}
          className="font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:underline"
        >
          {alert.residentName}
        </Link>
        {alert.unitName && (
          <p className="mt-0.5 text-xs text-[#1A3A3F]/50">{alert.unitName}</p>
        )}
      </Td>
      {/* Escala */}
      <Td>
        <span className="font-medium text-[#1A3A3F]">{scaleLabel}</span>
        <p className="mt-0.5 text-xs text-[#1A3A3F]/50">
          {t('valoracion.alerts.cadence', { days: alert.cadenceDays })}
        </p>
      </Td>
      {/* Última valoración */}
      <Td>
        <span className="tabular-nums">{alert.score}</span>
        <p className="mt-0.5 text-xs text-[#1A3A3F]/50">{formatDate(locale as 'es' | 'ca', alert.assessedAt)}</p>
      </Td>
      {/* Fecha límite */}
      <Td>
        <span className="tabular-nums">{formatDate(locale as 'es' | 'ca', alert.dueDate)}</span>
        <p
          className={`mt-0.5 flex items-center gap-1 text-xs ${
            alert.status === 'vencida' ? 'text-red-700' : 'text-amber-700'
          }`}
        >
          <IconClock />
          {daysLabel}
        </p>
      </Td>
      {/* Estado */}
      <Td>
        <StatusBadge status={alert.status} t={t} />
      </Td>
      {/* Acción */}
      <Td>
        <Link
          href={`/residentes/${alert.residentId}`}
          className="inline-flex min-h-[48px] items-center rounded-xl px-3 py-2 text-sm font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:underline"
        >
          {t('valoracion.alerts.action.assess')}
        </Link>
      </Td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function ValoracionesPage() {
  const { t, locale } = useT();
  const [unitId, setUnitId] = useState<string>('');

  const alertsQuery = api.valoraciones.overdueAlerts.useQuery(
    { unitId: unitId || undefined },
  );
  const countQuery = api.valoraciones.pendingCount.useQuery();

  const alertsData = alertsQuery.data;
  const alerts = alertsData ?? [];
  const count = countQuery.data;

  // Lista de unidades únicas para el filtro — extrae del payload de alertas
  const units = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of alertsData ?? []) {
      if (a.unitId && a.unitName) map.set(a.unitId, a.unitName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [alertsData]);

  const nVencidas = count?.nVencidas ?? 0;
  const nProximas = count?.nProximas ?? 0;

  const badgeAction =
    count && (nVencidas > 0 || nProximas > 0) ? (
      <div className="flex flex-wrap items-center gap-2" aria-label={t('valoracion.alerts.title')}>
        {nVencidas > 0 && (
          <Badge tone="red">
            {t('valoracion.dashboard.overdue', { count: nVencidas })}
          </Badge>
        )}
        {nProximas > 0 && (
          <Badge tone="amber">
            {t('valoracion.dashboard.proximas', { count: nProximas })}
          </Badge>
        )}
      </div>
    ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('valoracion.alerts.title')}
        subtitle={t('valoracion.alerts.subtitle')}
        accent
        action={badgeAction}
      />

      {/* Filtro por unidad */}
      <div className="max-w-xs">
        <Label htmlFor="unit-filter">{t('valoracion.alerts.filter.unit')}</Label>
        <Select
          id="unit-filter"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          aria-label={t('valoracion.alerts.filter.unit')}
        >
          <option value="">{t('valoracion.alerts.filter.all')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
      </div>

      {/* Tabla de alertas */}
      <SectionCard title={t('valoracion.alerts.title')}>
        {alertsQuery.isLoading ? (
          <div className="flex flex-col gap-2" role="status" aria-label={t('state.loading')}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <EmptyState
            variant="check"
            title={t('valoracion.alerts.empty.title')}
            description={t('valoracion.alerts.empty.desc')}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th scope="col">{t('valoracion.alerts.col.resident')}</Th>
                <Th scope="col">{t('valoracion.alerts.col.scale')}</Th>
                <Th scope="col">{t('valoracion.alerts.col.lastDate')}</Th>
                <Th scope="col">{t('valoracion.alerts.col.dueDate')}</Th>
                <Th scope="col">{t('valoracion.alerts.col.status')}</Th>
                <Th scope="col">{t('valoracion.alerts.col.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <AlertRow
                  key={`${alert.residentId}-${alert.scaleType}`}
                  alert={alert as OverdueAlert}
                  locale={locale}
                  t={t}
                />
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
