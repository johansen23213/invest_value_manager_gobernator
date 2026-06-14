'use client';

/**
 * ScaleEvolutionChart — gráfico de línea SVG ligero para la evolución temporal
 * de una escala de valoración geriátrica.
 *
 * Accesibilidad (WCAG 2.1 AA):
 *   - El SVG lleva role="img" + aria-label con descripción de los datos.
 *   - Una tabla equivalente oculta visualmente (sr-only) expone todos los valores
 *     a lectores de pantalla (técnica equivalente requerida por WCAG 1.1.1).
 *   - Respeta prefers-reduced-motion: cuando está activo, no hay transición de
 *     líneas (la animación de path se suprime con media query).
 *   - Color nunca único canal: la línea usa trazo y puntos, la interpretación
 *     aparece en tooltip y en la tabla accesible.
 *   - Tooltip accesible: no depende solo de hover (se muestra al hacer focus
 *     en el punto del teclado con tabIndex).
 *   - Touch targets: los puntos del gráfico tienen un área invisible de 48px.
 *
 * No requiere ninguna dependencia externa de charting.
 */

import { useState } from 'react';
import { EmptyState, Select, Label, Skeleton, Badge } from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import { SCALE_RANGES, type ScaleType } from '@/lib/scales';
import { AssessmentType } from '@vetlla/db';

// ---------------------------------------------------------------------------
// Constantes de diseño del gráfico
// ---------------------------------------------------------------------------
const CHART_W = 600;
const CHART_H = 200;
const PAD_L   = 48;
const PAD_R   = 24;
const PAD_T   = 16;
const PAD_B   = 36;
const INNER_W = CHART_W - PAD_L - PAD_R;
const INNER_H = CHART_H - PAD_T - PAD_B;

// Colores Lifecare (hex directos para evitar JIT miss en SVG inline)
const COLOR_TEAL = '#14666B';
const COLOR_WARM = '#E76F51';
const COLOR_TEAL_BG = '#d4ecec';
const COLOR_GRID = '#e2f1f1';
const TICKS_Y = 5;

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------
interface SeriesPoint {
  id: string;
  assessedAt: Date;
  score: number;
  interpretation: string;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Utilidades de escala SVG
// ---------------------------------------------------------------------------
function toX(idx: number, total: number): number {
  if (total === 1) return PAD_L + INNER_W / 2;
  return PAD_L + (idx / (total - 1)) * INNER_W;
}

function toY(score: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return PAD_T + INNER_H / 2;
  return PAD_T + INNER_H - ((score - min) / range) * INNER_H;
}

function buildPolylinePoints(series: SeriesPoint[], min: number, max: number): string {
  return series
    .map((p, i) => `${toX(i, series.length)},${toY(p.score, min, max)}`)
    .join(' ');
}

// ---------------------------------------------------------------------------
// Tooltip flotante
// ---------------------------------------------------------------------------
interface TooltipState {
  x: number;
  y: number;
  point: SeriesPoint;
}

// ---------------------------------------------------------------------------
// SVG del gráfico
// ---------------------------------------------------------------------------
function LineChart({
  series,
  scaleMin,
  scaleMax,
  locale,
  t,
  chartAriaLabel,
}: {
  series: SeriesPoint[];
  scaleMin: number;
  scaleMax: number;
  locale: string;
  t: (k: string, v?: Record<string, string | number>) => string;
  chartAriaLabel: string;
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const polyPoints = buildPolylinePoints(series, scaleMin, scaleMax);

  // Ticks eje Y
  const yTicks: number[] = [];
  for (let i = 0; i <= TICKS_Y; i++) {
    yTicks.push(scaleMin + Math.round(((scaleMax - scaleMin) / TICKS_Y) * i));
  }

  return (
    <figure className="w-full overflow-x-auto" aria-label={chartAriaLabel}>
      <svg
        role="img"
        aria-label={chartAriaLabel}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{
          minWidth: '320px',
          fontFamily: 'inherit',
        }}
      >
        {/* Fondo */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={INNER_W}
          height={INNER_H}
          rx="8"
          fill={COLOR_TEAL_BG}
          opacity="0.25"
        />

        {/* Líneas de cuadrícula Y */}
        {yTicks.map((val) => {
          const cy = toY(val, scaleMin, scaleMax);
          return (
            <g key={val}>
              <line
                x1={PAD_L}
                y1={cy}
                x2={PAD_L + INNER_W}
                y2={cy}
                stroke={COLOR_GRID}
                strokeWidth="1"
              />
              <text
                x={PAD_L - 6}
                y={cy + 4}
                textAnchor="end"
                fontSize="10"
                fill="#14666B"
                opacity="0.7"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Líneas de cuadrícula X (fechas) */}
        {series.map((p, i) => {
          const cx = toX(i, series.length);
          return (
            <line
              key={p.id}
              x1={cx}
              y1={PAD_T}
              x2={cx}
              y2={PAD_T + INNER_H}
              stroke={COLOR_GRID}
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          );
        })}

        {/* Área bajo la línea */}
        {series.length > 1 && (
          <polygon
            points={[
              `${toX(0, series.length)},${PAD_T + INNER_H}`,
              ...series.map((p, i) => `${toX(i, series.length)},${toY(p.score, scaleMin, scaleMax)}`),
              `${toX(series.length - 1, series.length)},${PAD_T + INNER_H}`,
            ].join(' ')}
            fill={COLOR_TEAL}
            opacity="0.08"
          />
        )}

        {/* Línea de evolución */}
        {series.length > 1 && (
          <polyline
            points={polyPoints}
            fill="none"
            stroke={COLOR_TEAL}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="motion-safe:transition-all"
          />
        )}

        {/* Etiquetas eje X (fechas) */}
        {series.map((p, i) => {
          const cx = toX(i, series.length);
          return (
            <text
              key={`xlabel-${p.id}`}
              x={cx}
              y={CHART_H - 6}
              textAnchor="middle"
              fontSize="9"
              fill="#1A3A3F"
              opacity="0.5"
            >
              {formatDate(locale as 'es' | 'ca', p.assessedAt)}
            </text>
          );
        })}

        {/* Puntos interactivos — área de toque 48px con <circle> invisible */}
        {series.map((p, i) => {
          const cx = toX(i, series.length);
          const cy = toY(p.score, scaleMin, scaleMax);
          const isHot = tooltip?.point.id === p.id;

          return (
            <g
              key={`pt-${p.id}`}
              role="button"
              tabIndex={0}
              aria-label={`${formatDate(locale as 'es' | 'ca', p.assessedAt)}: ${p.score} — ${p.interpretation}`}
              onMouseEnter={() => setTooltip({ x: cx, y: cy, point: p })}
              onMouseLeave={() => setTooltip(null)}
              onFocus={() => setTooltip({ x: cx, y: cy, point: p })}
              onBlur={() => setTooltip(null)}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              {/* Área de toque invisible 48×48 */}
              <rect
                x={cx - 24}
                y={cy - 24}
                width={48}
                height={48}
                fill="transparent"
              />
              {/* Punto halo en foco/hover */}
              {isHot && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={10}
                  fill={COLOR_TEAL}
                  opacity="0.18"
                />
              )}
              {/* Punto visible */}
              <circle
                cx={cx}
                cy={cy}
                r={isHot ? 6 : 4}
                fill={isHot ? COLOR_WARM : COLOR_TEAL}
                stroke="white"
                strokeWidth="2"
              />
              {/* Ring de foco para teclado (visible solo con focus-visible) */}
              <circle
                cx={cx}
                cy={cy}
                r={14}
                fill="none"
                stroke={COLOR_TEAL}
                strokeWidth="2"
                opacity="0"
                style={{ outline: 'none' }}
                className="focus-visible:opacity-100"
              />
            </g>
          );
        })}

        {/* Tooltip flotante */}
        {tooltip && (
          <g
            transform={`translate(${Math.min(tooltip.x + 10, CHART_W - 140)}, ${Math.max(tooltip.y - 60, PAD_T)})`}
            aria-hidden="true"
          >
            <rect width="130" height="54" rx="6" fill="white" stroke={COLOR_TEAL} strokeWidth="1" opacity="0.97" />
            <text x="8" y="16" fontSize="10" fontWeight="600" fill="#1A3A3F">
              {formatDate(locale as 'es' | 'ca', tooltip.point.assessedAt)}
            </text>
            <text x="8" y="28" fontSize="11" fontWeight="700" fill={COLOR_TEAL}>
              {t('valoracion.evolution.score')}: {tooltip.point.score}
            </text>
            <text x="8" y="42" fontSize="9" fill="#1A3A3F" opacity="0.7">
              {tooltip.point.interpretation.length > 22
                ? `${tooltip.point.interpretation.slice(0, 22)}…`
                : tooltip.point.interpretation}
            </text>
          </g>
        )}
      </svg>

      {/* Tabla equivalente accesible (sr-only) — WCAG 1.1.1 */}
      <table className="sr-only">
        <caption>{chartAriaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{t('valoracion.evolution.date')}</th>
            <th scope="col">{t('valoracion.evolution.score')}</th>
            <th scope="col">Interpretación</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.id}>
              <td>{formatDate(locale as 'es' | 'ca', p.assessedAt)}</td>
              <td>{p.score}</td>
              <td>{p.interpretation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Componente público — ScaleEvolutionChart
// ---------------------------------------------------------------------------

const ALL_SCALE_TYPES = Object.values(AssessmentType);

interface ScaleEvolutionChartProps {
  residentId: string;
}

export function ScaleEvolutionChart({ residentId }: ScaleEvolutionChartProps) {
  const { t, locale } = useT();
  const [scaleType, setScaleType] = useState<AssessmentType>(AssessmentType.BARTHEL);

  const evolutionQuery = api.valoraciones.scaleEvolution.useQuery(
    { residentId, scaleType },
  );

  const data = evolutionQuery.data;
  const series = (data?.series ?? []) as SeriesPoint[];
  const cadenceDays = data?.cadenceDays;

  const scaleRange = SCALE_RANGES[scaleType as ScaleType] ?? { min: 0, max: 100 };

  // Nombre localizado de la escala seleccionada
  const scaleName = t(`scale.${scaleType}`) !== `scale.${scaleType}`
    ? t(`scale.${scaleType}`)
    : String(scaleType);

  const chartAriaLabel = t('valoracion.evolution.title', { scale: scaleName });

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de escala */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <Label htmlFor="evo-scale-select">{t('r360.scales.title')}</Label>
          <Select
            id="evo-scale-select"
            value={scaleType}
            onChange={(e) => setScaleType(e.target.value as AssessmentType)}
            aria-label={t('r360.scales.title')}
          >
            {ALL_SCALE_TYPES.map((st) => {
              const label = t(`scale.${st}`) !== `scale.${st}` ? t(`scale.${st}`) : st;
              return (
                <option key={st} value={st}>{label}</option>
              );
            })}
          </Select>
        </div>
        {cadenceDays !== undefined && (
          <Badge tone="neutral">
            {t('valoracion.evolution.cadence', { days: cadenceDays })}
          </Badge>
        )}
      </div>

      {/* Gráfico */}
      {evolutionQuery.isLoading ? (
        <Skeleton className="h-52 w-full rounded-2xl" />
      ) : series.length === 0 ? (
        <EmptyState
          variant="empty"
          title={t('valoracion.evolution.empty')}
        />
      ) : (
        <LineChart
          series={series}
          scaleMin={scaleRange.min}
          scaleMax={scaleRange.max}
          locale={locale}
          t={t}
          chartAriaLabel={chartAriaLabel}
        />
      )}

      {/* Lista de valoraciones recientes (accesible y touch-friendly) */}
      {series.length > 0 && (
        <ol
          reversed
          aria-label={chartAriaLabel}
          className="flex flex-col gap-1"
        >
          {[...series].reverse().slice(0, 5).map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100/60 px-4 py-2 text-sm"
            >
              <span className="font-medium text-[#1A3A3F]">{p.score}</span>
              <span className="text-[#1A3A3F]/60">{p.interpretation}</span>
              <time
                dateTime={new Date(p.assessedAt).toISOString()}
                className="text-xs text-[#1A3A3F]/40"
              >
                {formatDate(locale as 'es' | 'ca', p.assessedAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
