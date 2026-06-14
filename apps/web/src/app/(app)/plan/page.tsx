'use client';

// Plan y consumo (pricing por plaza ocupada/módulo). Visible para Dirección.

import { Badge, Card, CardContent, CardTitle } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { estimateMonthlyCents, formatEuros, PLAN_CATALOG, trialDaysLeft } from '@/lib/plans';

export default function PlanPage() {
  const { t, locale } = useT();
  const summary = api.plan.summary.useQuery();

  if (summary.isLoading) return <p className="text-[#1A3A3F]/60">{t('state.loading')}</p>;

  if (!summary.data) return null;

  const { plan, trialEndsAt, occupiedBeds, totalBeds } = summary.data;
  const def = PLAN_CATALOG[plan];
  const daysLeft = trialDaysLeft(trialEndsAt);
  const monthly = estimateMonthlyCents(plan, occupiedBeds);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-[#1A3A3F]">{t('plan.title')}</h1>

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-base">{t('plan.current')}</CardTitle>
            <Badge tone={plan === 'TRIAL' ? 'amber' : 'green'}>{t(`plan.tier.${plan}`)}</Badge>
            {plan === 'TRIAL' && daysLeft !== null && (
              <span
                className={`text-sm font-medium ${daysLeft > 0 ? 'text-amber-700' : 'text-red-700'}`}
              >
                {daysLeft > 0 ? t('plan.trialLeft', { days: daysLeft }) : t('plan.trialEnded')}
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[#1A3A3F]/60">{t('plan.occupiedBeds')}</dt>
              <dd className="text-lg font-semibold">{occupiedBeds}</dd>
            </div>
            <div>
              <dt className="text-[#1A3A3F]/60">{t('plan.totalBeds')}</dt>
              <dd className="text-lg font-semibold">{totalBeds}</dd>
            </div>
            <div>
              <dt className="text-[#1A3A3F]/60">{t('plan.pricePerBed')}</dt>
              <dd className="text-lg font-semibold">
                {formatEuros(def.pricePerBedMonthCents, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-[#1A3A3F]/60">{t('plan.monthlyEstimate')}</dt>
              <dd className="text-lg font-semibold">{formatEuros(monthly, locale)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-[#1A3A3F]/60">{t('plan.priceNote')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle className="mb-3 text-base">{t('plan.modules')}</CardTitle>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {def.modules.map((m) => (
              <li key={m} className="flex items-center gap-2">
                <span aria-hidden="true" className="text-green-600">
                  ✓
                </span>
                {t(`plan.module.${m}`)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-[#1A3A3F]/70">{t('plan.contact')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
