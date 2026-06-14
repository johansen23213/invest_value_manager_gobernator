'use client';

/**
 * Página principal de Admisiones y preadmisión.
 *
 * Acceso: admissions:read (ver) / admissions:manage (crear, transicionar, cerrar).
 *
 * Estructura:
 *   - Tab "Pipeline" — solicitudes agrupadas por estado, ordenadas por prioridad + fecha.
 *   - Tab "Forecast" — proyección de plazas libres en horizonte seleccionable.
 *
 * Accesibilidad (WCAG 2.1 AA):
 *   - Regiones landmark (<main> en layout, <section> con aria-labelledby aquí).
 *   - Badges con texto, nunca solo color.
 *   - Formulario con errores Zod por campo (FieldError).
 *   - Diálogos de confirmación con focus-trap (Radix Dialog).
 *   - Touch targets amplios (min-h-touch = 48px).
 *   - Tabla accesible alternativa para el gráfico SVG (sr-only).
 */

import { useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmptyState,
  FieldError,
  Input,
  Label,
  PageHeader,
  SectionCard,
  Select,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@vetlla/ui';
import { AdmissionStatus, AdmissionOrigin, DependencyGrade, PlaceRegime } from '@vetlla/db';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm';
import { useZodForm } from '@/lib/form';
import { formatDate } from '@/lib/format';
import { AdmissionStatusBadge } from './admission-status-badge';
import {
  allowedTransitions,
  isTerminalStatus,
  type AdmissionStatus as DomainStatus,
} from '@/lib/ocupacion-forecast';
import {
  admissionRequestCreateSchema,
} from '@/server/routers/admisiones';

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type AdmissionRequest = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactName: string | null;
  dependencyGrade: DependencyGrade | null;
  placeRegime: PlaceRegime | null;
  origin: AdmissionOrigin | null;
  priority: number;
  status: AdmissionStatus;
  requestedAt: Date;
  expectedAdmissionDate: Date | null;
  notes: string | null;
  residentId: string | null;
  center: { id: string; name: string };
  unit: { id: string; name: string } | null;
  resident: { id: string; firstName: string; lastName: string } | null;
};

// ---------------------------------------------------------------------------
// Constantes de estados (ordenados en el flujo normal del pipeline)
// ---------------------------------------------------------------------------

const PIPELINE_STATUSES: AdmissionStatus[] = [
  AdmissionStatus.LEAD,
  AdmissionStatus.WAITLIST,
  AdmissionStatus.EVALUATION,
  AdmissionStatus.OFFERED,
];
const TERMINAL_STATUSES: AdmissionStatus[] = [
  AdmissionStatus.ADMITTED,
  AdmissionStatus.REJECTED,
  AdmissionStatus.WITHDRAWN,
];

const PRIORITY_LABEL: Record<number, string> = { 1: 'Alta', 2: 'Normal', 3: 'Baja' };
const PRIORITY_TONE: Record<number, 'red' | 'amber' | 'neutral'> = {
  1: 'red',
  2: 'amber',
  3: 'neutral',
};

// ---------------------------------------------------------------------------
// Sub-schemas de formulario (reutilizan el schema del backend)
// ---------------------------------------------------------------------------

// Schema del frontend alineado con admissionRequestCreateSchema del backend.
// Añadimos .min(1) con mensajes en español para mostrar bajo el campo.
const admissionFormSchema = admissionRequestCreateSchema.extend({
  centerId:  z.string().min(1, 'Selecciona un centro.'),
  firstName: z.string().min(1, 'Introduce el nombre.').max(80),
  lastName:  z.string().min(1, 'Introduce los apellidos.').max(120),
  contactEmail: z.string().email('Email no válido.').optional().or(z.literal('')),
});

// ---------------------------------------------------------------------------
// Badge de prioridad
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: number }) {
  return (
    <Badge tone={PRIORITY_TONE[priority] ?? 'neutral'}>
      {PRIORITY_LABEL[priority] ?? String(priority)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de candidato en el pipeline
// ---------------------------------------------------------------------------

function CandidateCard({
  req,
  canManage,
  onTransition,
  onAdmit,
  onClose,
  t,
  locale,
}: {
  req: AdmissionRequest;
  canManage: boolean;
  onTransition: (id: string, to: DomainStatus) => void;
  onAdmit: (id: string) => void;
  onClose: (id: string, status: 'REJECTED' | 'WITHDRAWN') => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
}) {
  const from = req.status as DomainStatus;
  const nexts = allowedTransitions(from).filter(
    (s) => s !== 'REJECTED' && s !== 'WITHDRAWN' && s !== 'ADMITTED',
  );
  const canAdmit = allowedTransitions(from).includes('ADMITTED');
  const canReject = allowedTransitions(from).includes('REJECTED');
  const canWithdraw = allowedTransitions(from).includes('WITHDRAWN');

  return (
    <article
      aria-label={`${req.firstName} ${req.lastName}`}
      className="rounded-2xl border border-brand-100/60 bg-white p-4 shadow-sm transition-smooth hover:shadow-md"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        {/* Datos del candidato */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admisiones/${req.id}`}
              className="font-semibold text-[#1A3A3F] hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 leading-snug"
            >
              {req.firstName} {req.lastName}
            </Link>
            <PriorityBadge priority={req.priority} />
          </div>

          <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2">
            {req.dependencyGrade && (
              <div className="flex gap-1">
                <dt className="text-[#1A3A3F]/50">Dep.:</dt>
                <dd className="text-[#1A3A3F]">{req.dependencyGrade}</dd>
              </div>
            )}
            {req.placeRegime && (
              <div className="flex gap-1">
                <dt className="text-[#1A3A3F]/50">{t('admissions.detail.placeType')}:</dt>
                <dd className="text-[#1A3A3F]">{t(`admission.placeType.${req.placeRegime}`)}</dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt className="text-[#1A3A3F]/50">{t('admissions.detail.center')}:</dt>
              <dd className="text-[#1A3A3F]">{req.center.name}{req.unit ? ` · ${req.unit.name}` : ''}</dd>
            </div>
            {req.expectedAdmissionDate && (
              <div className="flex gap-1">
                <dt className="text-[#1A3A3F]/50">{t('admissions.detail.expectedDate')}:</dt>
                <dd className="text-[#1A3A3F]">
                  <time dateTime={new Date(req.expectedAdmissionDate).toISOString()}>
                    {formatDate(locale as 'es' | 'ca', req.expectedAdmissionDate)}
                  </time>
                </dd>
              </div>
            )}
            {req.contactPhone && (
              <div className="flex gap-1">
                <dt className="text-[#1A3A3F]/50">Tel.:</dt>
                <dd className="text-[#1A3A3F]">{req.contactPhone}</dd>
              </div>
            )}
            {req.contactName && (
              <div className="flex gap-1 sm:col-span-2">
                <dt className="text-[#1A3A3F]/50">Contacto:</dt>
                <dd className="text-[#1A3A3F]">{req.contactName}</dd>
              </div>
            )}
          </dl>

          <p className="mt-1 text-xs text-[#1A3A3F]/40">
            {t('admissions.detail.requestDate')}: {formatDate(locale as 'es' | 'ca', req.requestedAt)}
          </p>
        </div>

        {/* Acciones (solo canManage, y solo si el estado no es terminal) */}
        {canManage && !isTerminalStatus(from) && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:flex-col sm:items-end">
            {/* Avanzar al siguiente estado */}
            {nexts.map((next) => (
              <Button
                key={next}
                size="sm"
                variant="secondary"
                onClick={() => onTransition(req.id, next)}
                aria-label={`${req.firstName} ${req.lastName}: ${t(`admission.status.${next}`)}`}
              >
                → {t(`admission.status.${next}`)}
              </Button>
            ))}
            {/* Admitir */}
            {canAdmit && (
              <Button
                size="sm"
                onClick={() => onAdmit(req.id)}
                aria-label={`Ingresar a ${req.firstName} ${req.lastName}`}
              >
                {t('admissions.actions.admit')}
              </Button>
            )}
            {/* Rechazar / Retirar */}
            <div className="flex gap-1">
              {canReject && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => onClose(req.id, 'REJECTED')}
                  aria-label={`Rechazar solicitud de ${req.firstName} ${req.lastName}`}
                >
                  {t('admissions.actions.reject')}
                </Button>
              )}
              {canWithdraw && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onClose(req.id, 'WITHDRAWN')}
                  aria-label={`Retirar solicitud de ${req.firstName} ${req.lastName}`}
                >
                  {t('admissions.actions.withdraw')}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Enlace al expediente si ya está ingresado */}
        {req.residentId && (
          <Link
            href={`/residentes/${req.residentId}/resumen`}
            className="shrink-0 text-sm text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {t('admissions.detail.resident')} →
          </Link>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Columna de estado del pipeline
// ---------------------------------------------------------------------------

function PipelineColumn({
  status,
  requests,
  canManage,
  onTransition,
  onAdmit,
  onClose,
  t,
  locale,
}: {
  status: AdmissionStatus;
  requests: AdmissionRequest[];
  canManage: boolean;
  onTransition: (id: string, to: DomainStatus) => void;
  onAdmit: (id: string) => void;
  onClose: (id: string, status: 'REJECTED' | 'WITHDRAWN') => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
}) {
  return (
    <section
      aria-labelledby={`pipeline-col-${status}`}
      className="flex min-w-[280px] flex-1 flex-col gap-2"
    >
      <div className="flex items-center gap-2 pb-1">
        <h2
          id={`pipeline-col-${status}`}
          className="text-sm font-semibold uppercase tracking-widest text-[#1A3A3F]/60"
        >
          {t(`admission.status.${status}`)}
        </h2>
        {requests.length > 0 && (
          <Badge tone="neutral">{requests.length}</Badge>
        )}
      </div>
      {requests.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-200 px-3 py-4 text-center text-sm text-[#1A3A3F]/40">
          Sin candidatos
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((req) => (
            <CandidateCard
              key={req.id}
              req={req}
              canManage={canManage}
              onTransition={onTransition}
              onAdmit={onAdmit}
              onClose={onClose}
              t={t}
              locale={locale}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// SVG Forecast Chart (patrón reutilizado de scale-evolution-chart.tsx)
// ---------------------------------------------------------------------------

const CHART_W = 600;
const CHART_H = 180;
const PAD_L   = 40;
const PAD_R   = 16;
const PAD_T   = 12;
const PAD_B   = 32;
const INNER_W = CHART_W - PAD_L - PAD_R;
const INNER_H = CHART_H - PAD_T - PAD_B;
const COLOR_TEAL   = '#14666B';
const COLOR_WARN   = '#E76F51';
const COLOR_GRID   = '#e2f1f1';
const COLOR_BG     = '#d4ecec';

interface ForecastDay {
  date: Date;
  occupied: number;
  free: number;
  occupancyRate: number;
  discharges: number;
  admissions: number;
}

function ForecastChart({
  days,
  totalBeds,
  t,
  locale,
}: {
  days: ForecastDay[];
  totalBeds: number;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (days.length === 0) return null;

  const maxFree = totalBeds;
  const step = days.length > 1 ? INNER_W / (days.length - 1) : INNER_W;

  function toX(i: number) {
    return PAD_L + (days.length === 1 ? INNER_W / 2 : i * step);
  }
  function toY(v: number) {
    return PAD_T + INNER_H - (v / (maxFree || 1)) * INNER_H;
  }

  const freePoints = days
    .map((d, i) => `${toX(i)},${toY(d.free)}`)
    .join(' ');

  // Ticks Y (0, 25%, 50%, 75%, 100%)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * totalBeds));

  // Ticks X — muestra cada 7 días o cada N días dependiendo del horizonte
  const tickEvery = Math.max(1, Math.floor(days.length / 6));

  const ariaLabel = `${t('admissions.forecast.title')} — ${totalBeds} ${t('admissions.forecast.totalBeds')}`;

  return (
    <figure className="w-full overflow-x-auto" aria-label={ariaLabel}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{ minWidth: '320px', fontFamily: 'inherit' }}
      >
        {/* Fondo interior */}
        <rect
          x={PAD_L} y={PAD_T}
          width={INNER_W} height={INNER_H}
          rx="6" fill={COLOR_BG} opacity="0.25"
        />

        {/* Líneas de cuadrícula Y */}
        {yTicks.map((val) => {
          const cy = toY(val);
          return (
            <g key={val}>
              <line
                x1={PAD_L} y1={cy} x2={PAD_L + INNER_W} y2={cy}
                stroke={COLOR_GRID} strokeWidth="1"
              />
              <text
                x={PAD_L - 4} y={cy + 4}
                textAnchor="end" fontSize="9" fill={COLOR_TEAL} opacity="0.7"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Área bajo la línea de plazas libres */}
        {days.length > 1 && (
          <polygon
            points={[
              `${toX(0)},${PAD_T + INNER_H}`,
              ...days.map((d, i) => `${toX(i)},${toY(d.free)}`),
              `${toX(days.length - 1)},${PAD_T + INNER_H}`,
            ].join(' ')}
            fill={COLOR_TEAL}
            opacity="0.10"
          />
        )}

        {/* Línea de plazas libres */}
        {days.length > 1 && (
          <polyline
            points={freePoints}
            fill="none"
            stroke={COLOR_TEAL}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="motion-safe:transition-all"
          />
        )}

        {/* Etiquetas X */}
        {days.map((d, i) => {
          if (i % tickEvery !== 0 && i !== days.length - 1) return null;
          return (
            <text
              key={`xl-${i}`}
              x={toX(i)} y={CHART_H - 4}
              textAnchor="middle" fontSize="9" fill="#1A3A3F" opacity="0.45"
            >
              {formatDate(locale as 'es' | 'ca', d.date)}
            </text>
          );
        })}

        {/* Puntos interactivos */}
        {days.map((d, i) => {
          const cx = toX(i);
          const cy = toY(d.free);
          const isHot = hoveredIdx === i;
          return (
            <g
              key={`pt-${i}`}
              role="button"
              tabIndex={0}
              aria-label={`${formatDate(locale as 'es' | 'ca', d.date)}: ${d.free} plazas libres, ${d.occupied} ocupadas`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onFocus={() => setHoveredIdx(i)}
              onBlur={() => setHoveredIdx(null)}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              <rect x={cx - 12} y={cy - 12} width={24} height={24} fill="transparent" />
              {isHot && (
                <circle cx={cx} cy={cy} r={8} fill={COLOR_TEAL} opacity="0.15" />
              )}
              <circle
                cx={cx} cy={cy}
                r={isHot ? 5 : 3}
                fill={d.free === 0 ? COLOR_WARN : COLOR_TEAL}
                stroke="white" strokeWidth="1.5"
              />
            </g>
          );
        })}

        {/* Tooltip */}
        {hoveredIdx !== null && (() => {
          const d = days[hoveredIdx];
          if (!d) return null;
          const cx = toX(hoveredIdx);
          const cy = toY(d.free);
          const tx = Math.min(cx + 8, CHART_W - 120);
          const ty = Math.max(cy - 52, PAD_T);
          return (
            <g transform={`translate(${tx}, ${ty})`} aria-hidden="true">
              <rect width="110" height="48" rx="5" fill="white" stroke={COLOR_TEAL} strokeWidth="1" opacity="0.97" />
              <text x="6" y="14" fontSize="9" fontWeight="600" fill="#1A3A3F">
                {formatDate(locale as 'es' | 'ca', d.date)}
              </text>
              <text x="6" y="27" fontSize="10" fontWeight="700" fill={COLOR_TEAL}>
                {t('admissions.forecast.free')}: {d.free}
              </text>
              <text x="6" y="40" fontSize="9" fill="#1A3A3F" opacity="0.6">
                {t('admissions.forecast.occupied')}: {d.occupied}
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Tabla accesible equivalente (WCAG 1.1.1) */}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{t('admissions.forecast.date')}</th>
            <th scope="col">{t('admissions.forecast.free')}</th>
            <th scope="col">{t('admissions.forecast.occupied')}</th>
            <th scope="col">{t('admissions.forecast.rate')}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d, i) => (
            <tr key={i}>
              <td>{formatDate(locale as 'es' | 'ca', d.date)}</td>
              <td>{d.free}</td>
              <td>{d.occupied}</td>
              <td>{`${Math.round(d.occupancyRate * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Tab Forecast
// ---------------------------------------------------------------------------

function ForecastTab({ t, locale }: { t: (key: string, vars?: Record<string, string | number>) => string; locale: string }) {
  const [centerId, setCenterId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [horizonDays, setHorizonDays] = useState(90);
  const [queryParams, setQueryParams] = useState<{ centerId: string; unitId?: string; horizonDays: number } | null>(null);

  const centers = api.centers.list.useQuery();
  const centerData = (centers.data ?? []).find((c) => c.id === centerId);

  // Cargamos unidades del centro seleccionado
  const centerDetail = api.centers.get.useQuery(
    { id: centerId },
    { enabled: Boolean(centerId) },
  );

  const forecast = api.admisiones.occupancy.forecast.useQuery(
    queryParams ?? { centerId: '', horizonDays: 90 },
    { enabled: Boolean(queryParams?.centerId) },
  );

  const forecastData = forecast.data;

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    if (!centerId) return;
    setQueryParams({ centerId, unitId: unitId || undefined, horizonDays });
  }

  const days = (forecastData?.days ?? []) as ForecastDay[];

  return (
    <div className="flex flex-col gap-6">
      {/* Selector de parámetros */}
      <SectionCard title={t('admissions.forecast.title')}>
        <form
          id="forecast-form"
          onSubmit={handleCalculate}
          className="flex flex-wrap items-end gap-3"
          aria-label={t('admissions.forecast.title')}
          noValidate
        >
          {/* Centro */}
          <div className="min-w-[180px]">
            <Label htmlFor="forecast-center">{t('admissions.forecast.center')}</Label>
            <Select
              id="forecast-center"
              value={centerId}
              onChange={(e) => { setCenterId(e.target.value); setUnitId(''); }}
              disabled={centers.isLoading}
              aria-required="true"
            >
              <option value="">{t('admissions.filter.all')}</option>
              {(centers.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>

          {/* Unidad (opcional) */}
          {centerId && (
            <div className="min-w-[160px]">
              <Label htmlFor="forecast-unit">{t('admissions.forecast.unit')}</Label>
              <Select
                id="forecast-unit"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                disabled={centerDetail.isLoading}
              >
                <option value="">— Centro completo —</option>
                {(centerDetail.data?.units ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </div>
          )}

          {/* Horizonte */}
          <div className="min-w-[120px]">
            <Label htmlFor="forecast-horizon">{t('admissions.forecast.horizon')}</Label>
            <Select
              id="forecast-horizon"
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value))}
            >
              <option value={30}>30 días</option>
              <option value={60}>60 días</option>
              <option value={90}>90 días</option>
              <option value={180}>180 días</option>
              <option value={365}>365 días</option>
            </Select>
          </div>

          <Button
            type="submit"
            disabled={!centerId || forecast.isFetching}
            className="min-h-touch"
          >
            {forecast.isFetching ? '…' : t('admissions.forecast.calculate')}
          </Button>
        </form>
      </SectionCard>

      {/* Resultado */}
      {forecast.isFetching ? (
        <Skeleton className="h-52 w-full rounded-2xl" />
      ) : !queryParams?.centerId ? (
        <EmptyState
          variant="empty"
          title={t('admissions.forecast.empty')}
          description={`Selecciona un centro y pulsa "${t('admissions.forecast.calculate')}".`}
        />
      ) : forecastData && days.length > 0 ? (
        <div className="flex flex-col gap-4">
          {/* KPIs resumen */}
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: t('admissions.forecast.totalBeds'), value: forecastData.totalBeds },
              { label: t('admissions.forecast.occupied'), value: days[0]?.occupied ?? 0 },
              { label: t('admissions.forecast.free'), value: days[0]?.free ?? 0 },
              { label: t('admissions.forecast.rate'), value: `${Math.round((days[0]?.occupancyRate ?? 0) * 100)}%` },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-2xl border border-brand-100/60 bg-white p-3 text-center"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/50">{label}</p>
                <p className="text-2xl font-extrabold text-brand-700">{value}</p>
              </div>
            ))}
          </div>

          {/* Gráfico de línea */}
          <Card>
            <CardContent>
              <p className="mb-3 text-sm font-medium text-[#1A3A3F]/60">
                {t('admissions.forecast.subtitle')}
                {centerData && <span> — {centerData.name}</span>}
              </p>
              <ForecastChart days={days} totalBeds={forecastData.totalBeds} t={t} locale={locale} />
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#1A3A3F]/60">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-600" />
                  {t('admissions.forecast.free')}
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#E76F51]" />
                  Sin plazas
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Tabla resumen de eventos */}
          {days.some((d) => d.admissions > 0 || d.discharges > 0) && (
            <SectionCard title="Eventos previstos">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Eventos previstos en el horizonte">
                  <thead>
                    <tr className="border-b border-brand-100">
                      <th scope="col" className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">Fecha</th>
                      <th scope="col" className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">{t('admissions.forecast.admissions')}</th>
                      <th scope="col" className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">{t('admissions.forecast.discharges')}</th>
                      <th scope="col" className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[#1A3A3F]/50">{t('admissions.forecast.free')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.filter((d) => d.admissions > 0 || d.discharges > 0).map((d, i) => (
                      <tr key={i} className="border-b border-brand-100/50 last:border-0">
                        <td className="py-2">
                          <time dateTime={new Date(d.date).toISOString()}>
                            {formatDate(locale as 'es' | 'ca', d.date)}
                          </time>
                        </td>
                        <td className="py-2 text-right">
                          {d.admissions > 0 && <Badge tone="green">+{d.admissions}</Badge>}
                        </td>
                        <td className="py-2 text-right">
                          {d.discharges > 0 && <Badge tone="blue">-{d.discharges}</Badge>}
                        </td>
                        <td className="py-2 text-right font-medium text-[#1A3A3F]">{d.free}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>
      ) : (
        <EmptyState
          variant="empty"
          title={t('admissions.forecast.empty')}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario de nueva solicitud (Dialog)
// ---------------------------------------------------------------------------

const INITIAL_FORM = {
  centerId:              '',
  unitId:                '',
  firstName:             '',
  lastName:              '',
  birthDate:             '',
  contactPhone:          '',
  contactEmail:          '',
  contactName:           '',
  dependencyGrade:       '' as DependencyGrade | '',
  placeRegime:           '' as PlaceRegime | '',
  origin:                '' as AdmissionOrigin | '',
  priority:              '2',
  expectedAdmissionDate: '',
  notes:                 '',
};

function NewAdmissionDialog({
  open,
  onOpenChange,
  onCreated,
  t,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const toast = useToast();
  const [fields, setFields] = useState(INITIAL_FORM);
  const form = useZodForm(admissionFormSchema);

  const centers = api.centers.list.useQuery();
  const centerDetail = api.centers.get.useQuery(
    { id: fields.centerId },
    { enabled: Boolean(fields.centerId) },
  );
  const utils = api.useUtils();

  const create = api.admisiones.requests.create.useMutation({
    onSuccess: async () => {
      await utils.admisiones.requests.list.invalidate();
      onCreated();
      onOpenChange(false);
      resetForm();
      toast.success(t('admissions.form.success'));
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setFields(INITIAL_FORM);
    form.clearErrors();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = form.validate({
      centerId:              fields.centerId,
      unitId:                fields.unitId || undefined,
      firstName:             fields.firstName,
      lastName:              fields.lastName,
      birthDate:             fields.birthDate || undefined,
      contactPhone:          fields.contactPhone || undefined,
      contactEmail:          fields.contactEmail || undefined,
      contactName:           fields.contactName || undefined,
      dependencyGrade:       (fields.dependencyGrade as DependencyGrade) || undefined,
      placeRegime:           (fields.placeRegime as PlaceRegime) || undefined,
      origin:                (fields.origin as AdmissionOrigin) || undefined,
      priority:              Number(fields.priority),
      expectedAdmissionDate: fields.expectedAdmissionDate || undefined,
      notes:                 fields.notes || undefined,
    });
    if (!data) return;
    create.mutate(data);
  }

  function set<K extends keyof typeof INITIAL_FORM>(key: K, val: (typeof INITIAL_FORM)[K]) {
    setFields((s) => ({ ...s, [key]: val }));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}
    >
      <DialogContent aria-describedby="new-admission-desc">
        <DialogTitle>{t('admissions.form.title')}</DialogTitle>
        <p id="new-admission-desc" className="sr-only">
          Formulario para crear una nueva solicitud de admisión.
        </p>

        <form
          id="new-admission-form"
          noValidate
          onSubmit={handleSubmit}
          className="mt-2 flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1"
        >
          {/* Candidato */}
          <fieldset className="flex flex-col gap-3 rounded-xl border border-brand-100 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/60">
              {t('admissions.form.candidate')}
            </legend>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="adm-firstName">{t('admissions.form.firstName')}</Label>
                <Input
                  id="adm-firstName"
                  value={fields.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                  aria-invalid={Boolean(form.errors.firstName)}
                  aria-describedby={form.errors.firstName ? 'adm-firstName-err' : undefined}
                  autoComplete="off"
                />
                <FieldError id="adm-firstName-err">{form.errors.firstName}</FieldError>
              </div>
              <div>
                <Label htmlFor="adm-lastName">{t('admissions.form.lastName')}</Label>
                <Input
                  id="adm-lastName"
                  value={fields.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                  aria-invalid={Boolean(form.errors.lastName)}
                  aria-describedby={form.errors.lastName ? 'adm-lastName-err' : undefined}
                  autoComplete="off"
                />
                <FieldError id="adm-lastName-err">{form.errors.lastName}</FieldError>
              </div>
            </div>

            <div>
              <Label htmlFor="adm-birthDate">{t('admissions.form.birthDate')}</Label>
              <Input
                id="adm-birthDate"
                type="date"
                value={fields.birthDate}
                onChange={(e) => set('birthDate', e.target.value)}
                aria-describedby={form.errors.birthDate ? 'adm-birthDate-err' : undefined}
              />
              <FieldError id="adm-birthDate-err">{form.errors.birthDate}</FieldError>
            </div>
          </fieldset>

          {/* Contacto */}
          <fieldset className="flex flex-col gap-3 rounded-xl border border-brand-100 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/60">
              Contacto
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="adm-contactName">{t('admissions.form.contactName')}</Label>
                <Input
                  id="adm-contactName"
                  value={fields.contactName}
                  onChange={(e) => set('contactName', e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="adm-contactPhone">{t('admissions.form.contactPhone')}</Label>
                <Input
                  id="adm-contactPhone"
                  type="tel"
                  inputMode="tel"
                  value={fields.contactPhone}
                  onChange={(e) => set('contactPhone', e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="adm-contactEmail">{t('admissions.form.contactEmail')}</Label>
                <Input
                  id="adm-contactEmail"
                  type="email"
                  inputMode="email"
                  value={fields.contactEmail}
                  onChange={(e) => set('contactEmail', e.target.value)}
                  aria-invalid={Boolean(form.errors.contactEmail)}
                  aria-describedby={form.errors.contactEmail ? 'adm-contactEmail-err' : undefined}
                  autoComplete="off"
                />
                <FieldError id="adm-contactEmail-err">{form.errors.contactEmail}</FieldError>
              </div>
            </div>
          </fieldset>

          {/* Plaza */}
          <fieldset className="flex flex-col gap-3 rounded-xl border border-brand-100 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-[#1A3A3F]/60">
              Plaza y centro
            </legend>

            <div>
              <Label htmlFor="adm-center">{t('admissions.form.center')}</Label>
              <Select
                id="adm-center"
                value={fields.centerId}
                onChange={(e) => { set('centerId', e.target.value); set('unitId', ''); }}
                disabled={centers.isLoading}
                aria-invalid={Boolean(form.errors.centerId)}
                aria-describedby={form.errors.centerId ? 'adm-center-err' : undefined}
              >
                <option value="">{t('admissions.form.center.ph')}</option>
                {(centers.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <FieldError id="adm-center-err">{form.errors.centerId}</FieldError>
            </div>

            {fields.centerId && (
              <div>
                <Label htmlFor="adm-unit">{t('admissions.form.unit')}</Label>
                <Select
                  id="adm-unit"
                  value={fields.unitId}
                  onChange={(e) => set('unitId', e.target.value)}
                  disabled={centerDetail.isLoading}
                >
                  <option value="">{t('admissions.form.unit.none')}</option>
                  {(centerDetail.data?.units ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="adm-depGrade">{t('admissions.form.dependencyGrade')}</Label>
                <Select
                  id="adm-depGrade"
                  value={fields.dependencyGrade}
                  onChange={(e) => set('dependencyGrade', e.target.value as DependencyGrade | '')}
                >
                  <option value="">— Sin especificar —</option>
                  {Object.values(DependencyGrade).map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="adm-placeRegime">{t('admissions.form.placeType')}</Label>
                <Select
                  id="adm-placeRegime"
                  value={fields.placeRegime}
                  onChange={(e) => set('placeRegime', e.target.value as PlaceRegime | '')}
                >
                  <option value="">— Sin especificar —</option>
                  {Object.values(PlaceRegime).map((r) => (
                    <option key={r} value={r}>{t(`admission.placeType.${r}`)}</option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="adm-origin">{t('admissions.form.origin')}</Label>
                <Select
                  id="adm-origin"
                  value={fields.origin}
                  onChange={(e) => set('origin', e.target.value as AdmissionOrigin | '')}
                >
                  <option value="">— Sin especificar —</option>
                  {Object.values(AdmissionOrigin).map((o) => (
                    <option key={o} value={o}>{t(`admission.origin.${o}`)}</option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="adm-priority">{t('admissions.form.priority')}</Label>
                <Select
                  id="adm-priority"
                  value={fields.priority}
                  onChange={(e) => set('priority', e.target.value)}
                >
                  <option value="1">{t('admission.priority.ALTA')}</option>
                  <option value="2">{t('admission.priority.NORMAL')}</option>
                  <option value="3">{t('admission.priority.BAJA')}</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="adm-expectedDate">{t('admissions.form.expectedDate')}</Label>
                <Input
                  id="adm-expectedDate"
                  type="date"
                  value={fields.expectedAdmissionDate}
                  onChange={(e) => set('expectedAdmissionDate', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="adm-notes">{t('admissions.form.notes')}</Label>
              <textarea
                id="adm-notes"
                value={fields.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={2}
                maxLength={2000}
                className="w-full rounded-2xl border border-brand-200 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-y"
              />
            </div>
          </fieldset>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">{t('action.cancel')}</Button>
          </DialogClose>
          <Button
            type="submit"
            form="new-admission-form"
            disabled={create.isPending}
          >
            {create.isPending ? t('admissions.form.submitting') : t('admissions.form.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab Pipeline
// ---------------------------------------------------------------------------

function PipelineTab({
  canManage,
  t,
  locale,
}: {
  canManage: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const utils = api.useUtils();
  const [statusFilter, setStatusFilter] = useState<AdmissionStatus | ''>('');
  const [centerFilter, setCenterFilter] = useState('');
  const [showNew, setShowNew] = useState(false);

  const centers = api.centers.list.useQuery();

  const allStatuses: Array<AdmissionStatus | ''> = ['', ...Object.values(AdmissionStatus)];

  const requests = api.admisiones.requests.list.useQuery({
    status:   statusFilter || undefined,
    centerId: centerFilter || undefined,
  });

  const transition = api.admisiones.requests.transition.useMutation({
    onSuccess: async (data) => {
      await utils.admisiones.requests.list.invalidate();
      toast.success(t('admissions.actions.transitioned'));
      // Si se creó un residente, navegar al expediente
      if (data.residentId && data.status === 'ADMITTED') {
        window.location.href = `/residentes/${data.residentId}/resumen`;
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const close = api.admisiones.requests.close.useMutation({
    onSuccess: async () => {
      await utils.admisiones.requests.list.invalidate();
      toast.success(t('admissions.actions.closed'));
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleTransition(id: string, to: DomainStatus) {
    transition.mutate({ id, to: to as AdmissionStatus });
  }

  async function handleAdmit(id: string) {
    const req = (requests.data ?? []).find((r) => r.id === id);
    const result = await confirm({
      title: t('admissions.actions.admit'),
      description: req
        ? `¿Ingresar a ${req.firstName} ${req.lastName}? Se creará su expediente de residente.`
        : '¿Confirmar el ingreso?',
      confirmLabel: t('admissions.actions.admit'),
    });
    if (!result) return;
    transition.mutate({ id, to: AdmissionStatus.ADMITTED });
  }

  async function handleClose(id: string, status: 'REJECTED' | 'WITHDRAWN') {
    const req = (requests.data ?? []).find((r) => r.id === id);
    const actionLabel = status === 'REJECTED'
      ? t('admissions.actions.reject')
      : t('admissions.actions.withdraw');
    const result = await confirm({
      title: actionLabel,
      description: req
        ? `${actionLabel}: ${req.firstName} ${req.lastName}`
        : actionLabel,
      confirmLabel: actionLabel,
      tone: status === 'REJECTED' ? 'danger' : 'default',
      reason: {
        label: t('admissions.actions.closingReason'),
        required: false,
        placeholder: 'Motivo (opcional)…',
      },
    });
    if (!result) return;
    close.mutate({ id, status, outcomeReason: result.reason });
  }

  const list = (requests.data ?? []) as AdmissionRequest[];

  // Agrupar por estado
  const byStatus = (statuses: AdmissionStatus[]) =>
    statuses.reduce<Record<string, AdmissionRequest[]>>((acc, s) => {
      acc[s] = list.filter((r) => r.status === s);
      return acc;
    }, {});

  const activeGroups = byStatus(PIPELINE_STATUSES);
  const closedGroups = byStatus(TERMINAL_STATUSES);

  const activeCount = Object.values(activeGroups).flat().length;
  const closedCount = Object.values(closedGroups).flat().length;

  return (
    <div className="flex flex-col gap-6">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Filtro por estado */}
        <div>
          <label htmlFor="adm-filter-status" className="sr-only">{t('admissions.filter.status')}</label>
          <Select
            id="adm-filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AdmissionStatus | '')}
            className="w-auto min-w-[10rem]"
          >
            <option value="">{t('admissions.filter.status')}: {t('admissions.filter.all')}</option>
            {allStatuses.filter(Boolean).map((s) => (
              <option key={s} value={s}>{t(`admission.status.${s}`)}</option>
            ))}
          </Select>
        </div>

        {/* Filtro por centro */}
        <div>
          <label htmlFor="adm-filter-center" className="sr-only">{t('admissions.filter.center')}</label>
          <Select
            id="adm-filter-center"
            value={centerFilter}
            onChange={(e) => setCenterFilter(e.target.value)}
            className="w-auto min-w-[10rem]"
            disabled={centers.isLoading}
          >
            <option value="">{t('admissions.filter.center')}: {t('admissions.filter.all')}</option>
            {(centers.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>

        {canManage && (
          <Button
            onClick={() => setShowNew(true)}
            className="ml-auto min-h-touch"
          >
            {t('admissions.new')}
          </Button>
        )}
      </div>

      {/* Loading */}
      {requests.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : activeCount === 0 && closedCount === 0 ? (
        <EmptyState
          title={t('admissions.empty.title')}
          description={canManage ? t('admissions.empty.desc') : undefined}
        />
      ) : (
        <>
          {/* Pipeline activo */}
          {(!statusFilter || PIPELINE_STATUSES.includes(statusFilter as AdmissionStatus)) && (
            <section aria-label="Solicitudes activas">
              <div className="flex flex-wrap gap-4 overflow-x-auto pb-2">
                {PIPELINE_STATUSES
                  .filter((s) => !statusFilter || s === statusFilter)
                  .map((status) => (
                    <PipelineColumn
                      key={status}
                      status={status}
                      requests={activeGroups[status] ?? []}
                      canManage={canManage}
                      onTransition={handleTransition}
                      onAdmit={handleAdmit}
                      onClose={handleClose}
                      t={t}
                      locale={locale}
                    />
                  ))}
              </div>
            </section>
          )}

          {/* Solicitudes cerradas/terminales */}
          {(!statusFilter || TERMINAL_STATUSES.includes(statusFilter as AdmissionStatus)) &&
            closedCount > 0 && (
              <section aria-label="Solicitudes cerradas">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#1A3A3F]/50">
                  Cerradas
                </h2>
                <div className="flex flex-col gap-2">
                  {TERMINAL_STATUSES
                    .filter((s) => !statusFilter || s === statusFilter)
                    .flatMap((s) => closedGroups[s] ?? [])
                    .map((req) => (
                      <div
                        key={req.id}
                        className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-100/60 bg-white/60 px-4 py-3 text-sm"
                      >
                        <Link
                          href={`/admisiones/${req.id}`}
                          className="font-medium text-[#1A3A3F] hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                        >
                          {req.firstName} {req.lastName}
                        </Link>
                        <AdmissionStatusBadge status={req.status} t={t} />
                        <span className="ml-auto text-xs text-[#1A3A3F]/40">
                          {formatDate(locale as 'es' | 'ca', req.requestedAt)}
                        </span>
                        {req.residentId && (
                          <Link
                            href={`/residentes/${req.residentId}/resumen`}
                            className="text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                          >
                            {t('admissions.detail.resident')} →
                          </Link>
                        )}
                      </div>
                    ))}
                </div>
              </section>
            )}
        </>
      )}

      {/* Dialog nueva solicitud */}
      {canManage && (
        <NewAdmissionDialog
          open={showNew}
          onOpenChange={setShowNew}
          onCreated={() => {}}
          t={t}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function AdmisionesPage() {
  const { t, locale } = useT();
  const me = api.me.useQuery();

  const canRead   = me.data?.permissions.includes('admissions:read')   ?? false;
  const canManage = me.data?.permissions.includes('admissions:manage') ?? false;

  if (me.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!canRead) {
    return (
      <EmptyState
        title="Acceso restringido"
        description="Tu rol no tiene acceso a la sección de admisiones."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('admissions.title')}
        subtitle={t('admissions.subtitle')}
        accent
      />

      <Tabs defaultValue="pipeline" className="flex flex-col gap-2">
        <TabsList>
          <TabsTrigger value="pipeline">{t('admissions.tab.pipeline')}</TabsTrigger>
          <TabsTrigger value="forecast">{t('admissions.forecast.title')}</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <PipelineTab canManage={canManage} t={t} locale={locale} />
        </TabsContent>

        <TabsContent value="forecast">
          <ForecastTab t={t} locale={locale} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
