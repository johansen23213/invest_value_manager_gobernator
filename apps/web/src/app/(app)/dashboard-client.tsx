'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Card, CardContent, Skeleton } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import type { Permission } from '@/lib/rbac';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function getGreetingKey(): 'dashboard.greeting.morning' | 'dashboard.greeting.afternoon' | 'dashboard.greeting.evening' {
  const h = new Date().getHours();
  if (h >= 5 && h < 14) return 'dashboard.greeting.morning';
  if (h >= 14 && h < 21) return 'dashboard.greeting.afternoon';
  return 'dashboard.greeting.evening';
}

/** Calcula el % de circunferencia consumida para el anillo SVG. */
function ringDash(pct: number, r: number): { dashArray: string; dashOffset: number } {
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(1, pct)));
  return { dashArray: `${circ}`, dashOffset: offset };
}

function ringColor(rate: number): string {
  if (rate >= 0.95) return '#dc2626'; // red-600
  if (rate >= 0.8) return '#d97706';  // amber-600
  return '#0d9488';                    // brand-600
}

// ---------------------------------------------------------------------------
// Anillo de ocupación (SVG inline, sin dependencias externas)
// ---------------------------------------------------------------------------
function OccupancyRing({
  occupied,
  total,
  loading,
}: {
  occupied: number;
  total: number;
  loading: boolean;
}) {
  const r = 36;
  const size = 88;
  const pct = total > 0 ? occupied / total : 0;
  const { dashArray, dashOffset } = ringDash(pct, r);
  const color = ringColor(pct);
  const pctLabel = total > 0 ? `${Math.round(pct * 100)}%` : '—';

  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      {loading ? (
        <Skeleton className="h-[88px] w-[88px] rounded-full" />
      ) : (
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Ocupació: ${pctLabel}`}
        >
          <circle
            className="occupancy-ring-track"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={10}
          />
          <circle
            className="occupancy-ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={10}
            stroke={color}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
      )}
      <span className="sr-only">{pctLabel}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta KPI
// ---------------------------------------------------------------------------
interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  loading: boolean;
  href?: string;
  cta?: string;
  accent?: boolean;
  /** Número en grande para dar jerarquía visual. */
  large?: boolean;
}

function KpiCard({ label, value, sub, loading, href, cta, accent, large }: KpiCardProps) {
  return (
    <Card
      className={`animate-fade-in-up transition-smooth hover:shadow-card-hover ${
        accent ? 'border-warm-200 bg-gradient-to-br from-warm-50 to-white' : ''
      }`}
    >
      <CardContent className="flex flex-col gap-1">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-9 w-20" />
        ) : (
          <p className={large ? 'text-4xl font-extrabold tracking-tight text-slate-900' : 'text-3xl font-bold text-slate-900'}>
            {value}
            {sub && (
              <span className="ml-1.5 text-sm font-normal text-slate-400">{sub}</span>
            )}
          </p>
        )}
        {href && cta && !loading && (
          <Link
            href={href}
            className="mt-1 text-sm font-medium text-brand-700 hover:underline focus-visible:underline"
          >
            {cta}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta KPI de ocupación (especial: incluye anillo)
// ---------------------------------------------------------------------------
function OccupancyKpiCard({
  occupied,
  total,
  loading,
  t,
}: {
  occupied: number;
  total: number;
  loading: boolean;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const pctLabel = total > 0 ? `${Math.round((occupied / total) * 100)}%` : '—';
  return (
    <Card className="animate-fade-in-up col-span-1 transition-smooth hover:shadow-card-hover sm:col-span-1">
      <CardContent className="flex items-center gap-4">
        <OccupancyRing occupied={occupied} total={total} loading={loading} />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-slate-500">{t('dashboard.kpi.occupancy')}</p>
          {loading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <>
              <p className="text-3xl font-bold text-slate-900" aria-label={`Ocupación: ${pctLabel}`}>
                {pctLabel}
              </p>
              <p className="text-sm text-slate-400">
                {occupied}/{total} {t('dashboard.kpi.occupancyOf', { total })}
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Acceso rápido
// ---------------------------------------------------------------------------
const QUICK_LINKS: { perm: Permission; href: string; titleKey: string; descKey: string; icon: string }[] = [
  {
    perm: 'care:write',
    href: '/atencion',
    titleKey: 'nav.care',
    descKey: 'dashboard.quickLinks',
    icon: '🩺',
  },
  {
    perm: 'residents:read',
    href: '/residentes',
    titleKey: 'nav.residents',
    descKey: 'dashboard.quickLinks',
    icon: '👥',
  },
  {
    perm: 'centers:read',
    href: '/ocupacion',
    titleKey: 'nav.occupancy',
    descKey: 'dashboard.quickLinks',
    icon: '🏠',
  },
  {
    perm: 'care:read',
    href: '/alertas',
    titleKey: 'nav.alerts',
    descKey: 'dashboard.quickLinks',
    icon: '🔔',
  },
];

const QUICK_LINK_DESCS: Record<string, string> = {
  '/atencion': 'Registrar a pie de cama',
  '/residentes': 'Expedientes y altas',
  '/ocupacion': 'Plano y KPIs por unidad',
  '/alertas': 'Medicación e incidencias de hoy',
};

const QUICK_LINK_DESCS_CA: Record<string, string> = {
  '/atencion': 'Registrar al llit del resident',
  '/residentes': 'Expedients i altes',
  '/ocupacion': 'Plànol i KPIs per unitat',
  '/alertas': 'Medicació i incidències d\'avui',
};

function QuickLink({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-smooth hover:border-brand-300 hover:shadow-card-hover focus-visible:border-brand-500"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl text-brand-700 group-hover:bg-brand-100"
      >
        {icon}
      </span>
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{desc}</p>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Panel de alertas urgentes
// ---------------------------------------------------------------------------
function AttentionPanel({
  alertCount,
  alertNames,
  loading,
  t,
}: {
  alertCount: number;
  alertNames: string[];
  loading: boolean;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  if (loading) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (alertCount === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4">
        {/* Checkmark SVG inline */}
        <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 text-green-600">
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-sm font-medium text-green-800">{t('dashboard.attention.empty')}</p>
      </div>
    );
  }
  const names = alertNames.slice(0, 4).join(', ');
  const hasMore = alertNames.length > 4;
  return (
    <Link
      href="/alertas"
      className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 transition-smooth hover:bg-red-100"
      role="alert"
    >
      {/* Warning SVG inline */}
      <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-red-600">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="1.5" />
        <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="currentColor" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-red-800">
          {t('dashboard.medAlert', { count: alertCount })}
        </p>
        {alertNames.length > 0 && (
          <p className="mt-0.5 truncate text-sm text-red-700">
            {names}{hasMore ? ` +${alertNames.length - 4} más` : ''}
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm font-medium text-red-700 underline">{t('dashboard.viewAll')}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Dashboard principal
// ---------------------------------------------------------------------------
export function DashboardClient() {
  const { t, locale } = useT();
  const me = api.me.useQuery();
  const perms = me.data?.permissions ?? [];
  const canMeds = perms.includes('medication:read');
  const canCenters = perms.includes('centers:read');
  const canResidents = perms.includes('residents:read');

  const centers = api.centers.list.useQuery(undefined, { enabled: canCenters });
  const residents = api.residents.list.useQuery(undefined, { enabled: canResidents });
  const alerts = api.medications.alertsToday.useQuery(undefined, { enabled: canMeds });

  const totalCenters = centers.data?.length ?? 0;
  const totalResidents = residents.data?.length ?? 0;
  const occupied = residents.data?.filter((r) => r.bed).length ?? 0;
  const alertCount = alerts.data?.length ?? 0;
  const alertNames = useMemo(
    () => [...new Set((alerts.data ?? []).map((a) => a.residentName).filter((n): n is string => typeof n === 'string'))],
    [alerts.data],
  );

  const links = QUICK_LINKS.filter((l) => perms.includes(l.perm));
  const greetingKey = getGreetingKey();
  const userName = me.data?.name?.split(' ')[0] ?? me.data?.email?.split('@')[0] ?? '';

  // Fecha localizada
  const today = new Intl.DateTimeFormat(locale === 'ca' ? 'ca-ES' : 'es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1);

  const quickLinkDescs = locale === 'ca' ? QUICK_LINK_DESCS_CA : QUICK_LINK_DESCS;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Saludo personalizado ───────────────────────────────────────────── */}
      <div className="animate-fade-in-up">
        {me.isLoading ? (
          <Skeleton className="h-9 w-64" />
        ) : (
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            {t(greetingKey, { name: userName })}
          </h1>
        )}
        <p className="mt-1 text-base text-slate-500">
          <time dateTime={new Date().toISOString().slice(0, 10)}>{todayCapitalized}</time>
          {' · '}
          {t('dashboard.subtitle')}
        </p>
      </div>

      {/* ── Necesita atención ahora ────────────────────────────────────────── */}
      {canMeds && (
        <section aria-labelledby="attention-heading">
          <h2
            id="attention-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400"
          >
            {t('dashboard.attention')}
          </h2>
          <AttentionPanel
            alertCount={alertCount}
            alertNames={alertNames}
            loading={alerts.isLoading}
            t={t}
          />
        </section>
      )}

      {/* ── KPIs visuales ─────────────────────────────────────────────────── */}
      <section aria-label="Indicadores clave">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {canCenters && (
            <KpiCard
              label={t('dashboard.kpi.centers')}
              value={totalCenters}
              loading={centers.isLoading}
              href="/centros"
              cta={t('dashboard.kpi.viewCenters')}
            />
          )}
          {canResidents && (
            <KpiCard
              label={t('dashboard.kpi.residents')}
              value={totalResidents}
              loading={residents.isLoading}
              href="/residentes"
              cta={t('dashboard.kpi.viewResidents')}
              large
            />
          )}
          {canResidents && (
            <OccupancyKpiCard
              occupied={occupied}
              total={totalResidents}
              loading={residents.isLoading}
              t={t}
            />
          )}
          {canMeds && (
            <KpiCard
              label={t('dashboard.kpi.alerts')}
              value={alertCount}
              loading={alerts.isLoading}
              href={alertCount > 0 ? '/alertas' : undefined}
              cta={alertCount > 0 ? t('dashboard.kpi.viewAlerts') : undefined}
              accent={alertCount > 0}
            />
          )}
        </div>
      </section>

      {/* ── Accesos rápidos ────────────────────────────────────────────────── */}
      {links.length > 0 && (
        <section aria-labelledby="quick-links-heading">
          <h2
            id="quick-links-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400"
          >
            {t('dashboard.quickLinks')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {links.map((l) => (
              <QuickLink
                key={l.href}
                href={l.href}
                icon={l.icon}
                title={t(l.titleKey)}
                desc={quickLinkDescs[l.href] ?? ''}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
