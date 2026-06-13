import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

// StatCard — tarjeta KPI con carácter para dashboards y resúmenes.
// Eleva KpiCard del dashboard-client a componente reutilizable en @vetlla/ui.
// Incluye el sello Vetlla (vetlla-card-accent), stagger de entrada, elevación hover.
// Sin lógica de datos: el consumidor pasa value/label/sub ya calculados.
// API: label, value, sub, trend, href, accent, loading, className.

// Icono de tendencia inline (decorativo, aria-hidden).
function TrendIcon({ direction }: { direction: 'up' | 'down' | 'neutral' }) {
  if (direction === 'neutral') {
    return (
      <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (direction === 'up') {
    return (
      <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 10l5-6 5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 4l5 6 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-brand-100', className)} />
  );
}

export interface StatCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Etiqueta del KPI (uppercase xs tracking-wide). */
  label: string;
  /** Valor principal del KPI. */
  value?: string | number;
  /** Texto secundario debajo del valor (p. ej. "de 30 plazas"). */
  sub?: string;
  /** Indicador de tendencia opcional. */
  trend?: 'up' | 'down' | 'neutral';
  /**
   * Hace toda la tarjeta un enlace clickable.
   * El consumidor debe envolver en <a> o <Link> si usa Next.js.
   * Aquí se pasa como prop para que la card muestre cursor-pointer y la
   * elevación hover incluso si el wrapper es externo.
   */
  clickable?: boolean;
  /** Gradiente warm sutil para KPIs de atención urgente. */
  accent?: boolean;
  /** Muestra skeletons en vez del contenido. */
  loading?: boolean;
  /** Nodo extra (p. ej. anillo SVG de ocupación). */
  aside?: ReactNode;
}

/**
 * Tarjeta KPI con carácter — el componente StatCard.
 *
 * ```tsx
 * // Básico
 * <StatCard label="Residentes" value={24} />
 *
 * // Con enlace (envolver en Next.js Link)
 * <Link href="/residentes">
 *   <StatCard label="Residentes" value={24} sub="activos" clickable />
 * </Link>
 *
 * // Con acento warm y tendencia
 * <StatCard label="Alertas hoy" value={3} accent trend="up" />
 *
 * // Con elemento lateral (anillo)
 * <StatCard label="Ocupación" value="87%" aside={<OccupancyRing />} />
 * ```
 */
export function StatCard({
  label,
  value,
  sub,
  trend,
  clickable = false,
  accent = false,
  loading = false,
  aside,
  className,
  ...props
}: StatCardProps) {
  return (
    <div
      className={cn(
        // Base Lifecare v2
        'rounded-2xl border border-brand-100/60 bg-white',
        // Sombra KPI más prominente que la card normal
        'shadow-kpi',
        // Sello Vetlla — esquina superior-izquierda diferencial
        'vetlla-card-accent',
        // Elevación interactiva (transition-lift desde globals.css)
        clickable && 'transition-lift hover:shadow-card-hover cursor-pointer',
        // Gradiente warm sutil para KPIs de alerta
        accent && 'bg-gradient-to-br from-warm-50 to-white border-warm-200',
        // Entrada animada (globals.css con guard prefers-reduced-motion)
        'animate-fade-in-up',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-4 px-6 py-4">
        {/* Contenido principal */}
        <div className="flex flex-1 flex-col gap-0.5">
          {/* Label en uppercase xs — section label Lifecare */}
          <p className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/60">
            {label}
          </p>

          {loading ? (
            <SkeletonBlock className="mt-1 h-9 w-20" />
          ) : (
            <div className="flex items-baseline gap-1.5">
              <p className="text-3xl font-bold tracking-tight text-[#1A3A3F]">
                {value ?? '—'}
              </p>
              {sub && (
                <span className="text-sm text-[#1A3A3F]/60">{sub}</span>
              )}
              {/* Icono de tendencia */}
              {trend && !loading && (
                <span
                  className={cn(
                    'ml-1 flex items-center gap-0.5 text-xs font-medium',
                    trend === 'up'      && 'text-delight-700',
                    trend === 'down'    && 'text-warm-700',
                    trend === 'neutral' && 'text-[#1A3A3F]/50',
                  )}
                  aria-hidden="true"
                >
                  <TrendIcon direction={trend} />
                </span>
              )}
            </div>
          )}
        </div>

        {/* Elemento lateral (p. ej. anillo SVG) */}
        {aside && (
          <div className="shrink-0" aria-hidden="true">
            {aside}
          </div>
        )}
      </div>
    </div>
  );
}
