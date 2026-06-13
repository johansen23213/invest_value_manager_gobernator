'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Skeleton, StatCard } from '@vetlla/ui';
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

// Colores Lifecare para el anillo: teal petróleo normal, coral en alerta.
function ringColor(rate: number): string {
  if (rate >= 0.95) return '#d4552d'; // warm-600 (coral)
  if (rate >= 0.8)  return '#d97706'; // amber-600 (aviso)
  return '#14666B';                    // brand-600 (petróleo)
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
// SVG icons para QuickLink — reemplazan los emojis OS-dependientes (v2)
// ---------------------------------------------------------------------------
function IconCare({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function IconResidents({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconOccupancy({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconAlerts({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Acceso rápido
// ---------------------------------------------------------------------------
const QUICK_LINKS: { perm: Permission; href: string; titleKey: string; descKey: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  {
    perm: 'care:write',
    href: '/atencion',
    titleKey: 'nav.care',
    descKey: 'dashboard.quickLinks',
    Icon: IconCare,
  },
  {
    perm: 'residents:read',
    href: '/residentes',
    titleKey: 'nav.residents',
    descKey: 'dashboard.quickLinks',
    Icon: IconResidents,
  },
  {
    perm: 'centers:read',
    href: '/ocupacion',
    titleKey: 'nav.occupancy',
    descKey: 'dashboard.quickLinks',
    Icon: IconOccupancy,
  },
  {
    perm: 'care:read',
    href: '/alertas',
    titleKey: 'nav.alerts',
    descKey: 'dashboard.quickLinks',
    Icon: IconAlerts,
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
  '/alertas': "Medicació i incidències d'avui",
};

function QuickLink({
  href,
  Icon,
  title,
  desc,
}: {
  href: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-brand-100/60 bg-white p-4 shadow-card transition-lift hover:border-brand-300 hover:shadow-card-hover focus-visible:border-brand-500"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 group-hover:bg-brand-100"
      >
        <Icon />
      </span>
      <div>
        <p className="font-semibold text-[#1A3A3F]">{title}</p>
        <p className="text-sm text-[#1A3A3F]/70">{desc}</p>
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
      <div className="flex items-center gap-3 rounded-2xl border border-delight-100 bg-delight-50 px-5 py-4">
        {/* Checkmark SVG inline */}
        <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 20 20" fill="none" className="shrink-0 text-delight-500">
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-sm font-medium text-delight-700">{t('dashboard.attention.empty')}</p>
      </div>
    );
  }
  const names = alertNames.slice(0, 4).join(', ');
  const hasMore = alertNames.length > 4;
  return (
    <Link
      href="/alertas"
      className="flex items-start gap-3 rounded-2xl border border-warm-200 bg-warm-50 px-5 py-4 transition-smooth hover:bg-warm-100"
      role="alert"
    >
      {/* Warning SVG inline */}
      <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0 text-warm-600">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" stroke="currentColor" strokeWidth="1.5" />
        <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="currentColor" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-warm-800">
          {t('dashboard.medAlert', { count: alertCount })}
        </p>
        {alertNames.length > 0 && (
          <p className="mt-0.5 truncate text-sm text-warm-700">
            {names}{hasMore ? ` ${t('dashboard.alertMore', { count: alertNames.length - 4 })}` : ''}
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold text-warm-700 underline">{t('dashboard.viewAll')}</span>
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

  // Porcentaje de ocupación
  const occupancyPct = totalResidents > 0 ? `${Math.round((occupied / totalResidents) * 100)}%` : '—';
  const occupancySub = totalResidents > 0 ? `${occupied}/${totalResidents}` : undefined;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Saludo personalizado ───────────────────────────────────────────── */}
      <div className="animate-fade-in-up">
        {me.isLoading ? (
          <Skeleton className="h-12 w-72" />
        ) : (
          <h1 className="font-display text-display-2xl text-[#1A3A3F]">
            {t(greetingKey, { name: userName })}
          </h1>
        )}
        <p className="mt-1 text-base text-[#1A3A3F]/70">
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
            className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/60"
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

      {/* ── KPIs visuales con StatCard v2 ─────────────────────────────────── */}
      <section aria-label="Indicadores clave">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {canCenters && (
            <Link href="/centros" className="animate-stagger-1">
              <StatCard
                label={t('dashboard.kpi.centers')}
                value={totalCenters}
                loading={centers.isLoading}
                clickable
              />
            </Link>
          )}
          {canResidents && (
            <Link href="/residentes" className="animate-stagger-2">
              <StatCard
                label={t('dashboard.kpi.residents')}
                value={totalResidents}
                loading={residents.isLoading}
                clickable
              />
            </Link>
          )}
          {canResidents && (
            <div className="animate-stagger-3">
              <StatCard
                label={t('dashboard.kpi.occupancy')}
                value={occupancyPct}
                sub={occupancySub}
                loading={residents.isLoading}
                aside={
                  <OccupancyRing
                    occupied={occupied}
                    total={totalResidents}
                    loading={residents.isLoading}
                  />
                }
              />
            </div>
          )}
          {canMeds && (
            alertCount > 0 ? (
              <Link href="/alertas" className="animate-stagger-4">
                <StatCard
                  label={t('dashboard.kpi.alerts')}
                  value={alertCount}
                  loading={alerts.isLoading}
                  accent
                  clickable
                />
              </Link>
            ) : (
              <div className="animate-stagger-4">
                <StatCard
                  label={t('dashboard.kpi.alerts')}
                  value={alertCount}
                  loading={alerts.isLoading}
                />
              </div>
            )
          )}
        </div>
      </section>

      {/* ── Accesos rápidos ────────────────────────────────────────────────── */}
      {links.length > 0 && (
        <section aria-labelledby="quick-links-heading">
          <h2
            id="quick-links-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/60"
          >
            {t('dashboard.quickLinks')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {links.map((l) => (
              <QuickLink
                key={l.href}
                href={l.href}
                Icon={l.Icon}
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
