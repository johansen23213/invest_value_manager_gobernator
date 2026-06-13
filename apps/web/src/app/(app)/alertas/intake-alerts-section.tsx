'use client';

/**
 * IntakeAlertsSection — Panel de alertas de baja ingesta (RF-NUT-007).
 *
 * Integrado en /alertas como sección complementaria a las alertas de medicación.
 * Llama a nutrition.intake.lowIntakeAlerts y muestra residentes con riesgo nutricional
 * con el motivo específico (media baja o racha de comidas muy bajas).
 */

import Link from 'next/link';
import { Badge, Card, CardContent, CardTitle, EmptyState, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { DIET_TYPE_LABELS } from '@/lib/labels';

interface IntakeAlertsSectionProps {
  centerId: string;
}

export function IntakeAlertsSection({ centerId }: IntakeAlertsSectionProps) {
  const { t } = useT();

  const query = api.nutrition.intake.lowIntakeAlerts.useQuery(
    { centerId },
    { enabled: Boolean(centerId) },
  );

  const alerts = query.data ?? [];

  if (query.isLoading) {
    return (
      <Card>
        <CardContent>
          <CardTitle className="mb-3 text-base">{t('intakeAlerts.title')}</CardTitle>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t('intakeAlerts.title')}</CardTitle>
            <p className="mt-0.5 text-sm text-[#1A3A3F]/60">{t('intakeAlerts.subtitle')}</p>
          </div>
          {alerts.length > 0 && (
            <Badge tone="amber">{alerts.length} alerta{alerts.length !== 1 ? 's' : ''}</Badge>
          )}
        </div>

        {alerts.length === 0 ? (
          <EmptyState
            title={t('intakeAlerts.empty.title')}
            description={t('intakeAlerts.empty.desc')}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-brand-100/60">
            {alerts.map((alert) => (
              <li key={alert.residentId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/residentes/${alert.residentId}`}
                      className="font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600"
                    >
                      {alert.lastName}, {alert.firstName}
                    </Link>
                    <Badge tone="amber">
                      {t('intakeAlerts.avgValue', {
                        avg: alert.avgFoodPct !== null ? alert.avgFoodPct.toFixed(0) : '—',
                      })}
                    </Badge>
                    {alert.dietType && (
                      <span className="text-xs text-[#1A3A3F]/50">
                        {DIET_TYPE_LABELS[alert.dietType] ?? alert.dietType}
                      </span>
                    )}
                  </div>

                  {alert.bed && (
                    <p className="text-xs text-[#1A3A3F]/50">
                      {alert.bed.unit.name} · Plaza {alert.bed.code}
                    </p>
                  )}

                  {/* Motivos de la alerta */}
                  {alert.reasons.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {alert.reasons.map((reason, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-[#1A3A3F]/70">
                          <span className="mt-0.5 text-warm-600" aria-hidden="true">•</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Link
                  href={`/residentes/${alert.residentId}`}
                  className="shrink-0 self-start rounded-full border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600"
                >
                  {t('intakeAlerts.viewResident')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
