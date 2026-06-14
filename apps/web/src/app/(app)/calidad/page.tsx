'use client';

/**
 * /calidad — Panel de indicadores de calidad asistencial.
 *
 * Permiso: quality:read (DIRECTOR + SANITARIO + SUPERADMIN).
 *
 * Consume:
 *   - api.indicadores.dashboard.useQuery({ centerId?, unitId?, period? })
 *   - api.indicadores.cohortAtRisk.useQuery({ indicator, centerId?, unitId? })
 *   - api.centers.list.useQuery()      → selector de centro
 *   - api.centers.get.useQuery({ id }) → selector de unidad
 *
 * Accesibilidad WCAG 2.1 AA:
 *   - StatCards con aria-label descriptivo (valor + etiqueta + contexto).
 *   - Tabla de cohorte con scope en cabeceras.
 *   - Color nunca canal único: coral/ámbar/sage siempre acompañados de texto.
 *   - Touch targets ≥ 48px en botones de acción y filas.
 *   - Foco visible en todos los interactivos.
 *   - role="status" en área de carga.
 */

import Link from 'next/link';
import { useState, useMemo } from 'react';
import {
  Badge,
  EmptyState,
  Label,
  PageHeader,
  SectionCard,
  Select,
  Skeleton,
  StatCard,
  Table,
  Td,
  Th,
} from '@vetlla/ui';
import { api } from '@/trpc/react';
import { useT } from '@/i18n/provider';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';

// ---------------------------------------------------------------------------
// Helpers de formateo
// ---------------------------------------------------------------------------

/** Formatea un porcentaje con 1 decimal usando Intl, sin hardcodear separadores. */
function fmtPct(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale === 'ca' ? 'ca-ES' : 'es-ES', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/** Formatea un número con 2 decimales (tasas). */
function fmtRate(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale === 'ca' ? 'ca-ES' : 'es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Tooltip de definición — muestra el hint del indicador de forma accesible.
// Color nunca canal único: usa icono + texto + aria-describedby.
// ---------------------------------------------------------------------------
function HintTooltip({ hint, id }: { hint: string; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        aria-describedby={id}
        aria-label="Definición del indicador"
        className="ml-1.5 inline-flex h-[20px] w-[20px] items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-xs text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-7 z-10 w-72 rounded-xl border border-brand-100/60 bg-white px-3 py-2 text-xs text-[#1A3A3F]/80 shadow-card"
        >
          {hint}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// CohortTable — tabla de cohorte de acción para un indicador dado.
// ---------------------------------------------------------------------------
type CohortRow = {
  residentId: string;
  firstName: string;
  lastName: string;
  unitName: string | null;
  motivo: string;
  detalle: string;
};

type IndicadorTipo = 'UPP_ACTIVA' | 'SIN_VALORACION_VIGENTE' | 'EN_RIESGO_UPP' | 'SUJECION_ACTIVA';

function CohortTable({
  indicator,
  centerId,
  unitId,
  title,
  emptyText,
  t,
}: {
  indicator: IndicadorTipo;
  centerId: string | undefined;
  unitId: string | undefined;
  title: string;
  emptyText: string;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const query = api.indicadores.cohortAtRisk.useQuery(
    { indicator, centerId, unitId },
    { enabled: true },
  );

  const rows: CohortRow[] = (query.data ?? []) as CohortRow[];

  return (
    <SectionCard title={title}>
      {query.isLoading ? (
        <div className="flex flex-col gap-2" role="status" aria-label={t('state.loading')}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState variant="check" title={emptyText} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th scope="col">{t('calidad.cohort.col.resident')}</Th>
              <Th scope="col">{t('calidad.cohort.col.unit')}</Th>
              <Th scope="col">{t('calidad.cohort.col.motivo')}</Th>
              <Th scope="col">{t('calidad.cohort.col.actions')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.residentId}
                className="transition-colors hover:bg-brand-50/40"
              >
                <Td>
                  <span className="font-medium text-[#1A3A3F]">
                    {row.firstName} {row.lastName}
                  </span>
                </Td>
                <Td>
                  <span className="text-[#1A3A3F]/70">
                    {row.unitName ?? '—'}
                  </span>
                </Td>
                <Td>
                  <span className="text-sm text-[#1A3A3F]/80">{row.detalle}</span>
                </Td>
                <Td>
                  <Link
                    href={`/residentes/${row.residentId}`}
                    className="inline-flex min-h-[48px] items-center rounded-xl px-3 py-2 text-sm font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:underline"
                    aria-label={`${t('calidad.cohort.action.view')} ${row.firstName} ${row.lastName}`}
                  >
                    {t('calidad.cohort.action.view')}
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Periodos predefinidos
// ---------------------------------------------------------------------------

type PeriodPreset = '30d' | '90d' | 'custom';

function periodFromPreset(preset: PeriodPreset): { desde: Date; hasta: Date } | undefined {
  if (preset === 'custom') return undefined;
  const hasta = new Date();
  const desde = new Date();
  if (preset === '30d') desde.setDate(desde.getDate() - 30);
  if (preset === '90d') desde.setDate(desde.getDate() - 90);
  return { desde, hasta };
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function CalidadPage() {
  const { t, locale } = useT();

  // Filtros de contexto
  const [centerId, setCenterId] = useState<string>('');
  const [unitId, setUnitId] = useState<string>('');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');

  // Cohorte expandida activa (una a la vez)
  const [activeCohorte, setActiveCohorte] = useState<IndicadorTipo | null>(null);

  // Cargar centros para el selector
  const centersQuery = api.centers.list.useQuery();
  const centers = centersQuery.data ?? [];

  // Cargar unidades del centro seleccionado
  const centerQuery = api.centers.get.useQuery(
    { id: centerId },
    { enabled: !!centerId },
  );
  const units = useMemo(
    () => centerQuery.data?.units ?? [],
    [centerQuery.data],
  );

  // Resetear unidad al cambiar de centro
  function handleCenterChange(id: string) {
    setCenterId(id);
    setUnitId('');
  }

  // Calcular el periodo efectivo
  const effectivePeriod = useMemo(() => {
    if (periodPreset === 'custom' && customFrom && customTo) {
      return { desde: new Date(customFrom), hasta: new Date(customTo) };
    }
    return periodFromPreset(periodPreset as PeriodPreset);
  }, [periodPreset, customFrom, customTo]);

  // Query del dashboard
  const dashQuery = api.indicadores.dashboard.useQuery(
    {
      centerId: centerId || undefined,
      unitId: unitId || undefined,
      period: effectivePeriod
        ? { desde: effectivePeriod.desde, hasta: effectivePeriod.hasta }
        : undefined,
    },
    { refetchOnWindowFocus: false },
  );
  const dash = dashQuery.data;

  const isLoading = dashQuery.isLoading;

  // Formatear label del periodo actual
  const periodLabel = useMemo(() => {
    if (!dash) return '';
    return t('calidad.period.label', {
      desde: formatDate(locale as Locale, dash.period.desde),
      hasta: formatDate(locale as Locale, dash.period.hasta),
    });
  }, [dash, t, locale]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8">
      {/* Cabecera */}
      <PageHeader
        title={t('calidad.title')}
        subtitle={t('calidad.subtitle')}
        accent
        action={
          dash && !isLoading ? (
            <span className="text-sm text-[#1A3A3F]/60">{periodLabel}</span>
          ) : undefined
        }
      />

      {/* Filtros de contexto ─────────────────────────────────────────────── */}
      <section
        aria-label="Filtros del panel de calidad"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {/* Centro */}
        <div>
          <Label htmlFor="calidad-center">{t('calidad.filter.center')}</Label>
          <Select
            id="calidad-center"
            value={centerId}
            onChange={(e) => handleCenterChange(e.target.value)}
            aria-label={t('calidad.filter.center')}
          >
            <option value="">{t('calidad.filter.centerAll')}</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Unidad */}
        <div>
          <Label htmlFor="calidad-unit">{t('calidad.filter.unit')}</Label>
          <Select
            id="calidad-unit"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            disabled={!centerId || units.length === 0}
            aria-label={t('calidad.filter.unit')}
          >
            <option value="">{t('calidad.filter.unitAll')}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Periodo */}
        <div>
          <Label htmlFor="calidad-period">{t('calidad.filter.period')}</Label>
          <Select
            id="calidad-period"
            value={periodPreset}
            onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
            aria-label={t('calidad.filter.period')}
          >
            <option value="30d">{t('calidad.filter.period.30d')}</option>
            <option value="90d">{t('calidad.filter.period.90d')}</option>
            <option value="custom">{t('calidad.filter.period.custom')}</option>
          </Select>
        </div>

        {/* Periodo personalizado */}
        {periodPreset === 'custom' && (
          <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
            <div>
              <Label htmlFor="calidad-from">{t('calidad.filter.from')}</Label>
              <input
                id="calidad-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="block w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm text-[#1A3A3F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                aria-label={t('calidad.filter.from')}
              />
            </div>
            <div>
              <Label htmlFor="calidad-to">{t('calidad.filter.to')}</Label>
              <input
                id="calidad-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="block w-full rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm text-[#1A3A3F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                aria-label={t('calidad.filter.to')}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Bloque UPP ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="calidad-upp-title">
        <h2
          id="calidad-upp-title"
          className="mb-3 flex items-center text-base font-semibold text-[#1A3A3F]"
        >
          {t('calidad.upp.title')}
          <HintTooltip hint={t('calidad.upp.hint')} id="hint-upp" />
        </h2>

        {/* KPIs UPP */}
        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('calidad.upp.prevalencia')}
            value={isLoading ? undefined : fmtPct(locale as Locale, dash?.upp.prevalenciaPct ?? 0)}
            sub={t('calidad.upp.prevalenciaSub')}
            loading={isLoading}
            aria-label={`${t('calidad.upp.prevalencia')}: ${fmtPct(locale as Locale, dash?.upp.prevalenciaPct ?? 0)} — ${t('calidad.upp.prevalenciaSub')}`}
          />
          <StatCard
            label={t('calidad.upp.prevalenciaCentro')}
            value={isLoading ? undefined : fmtPct(locale as Locale, dash?.upp.prevalenciaCentroPct ?? 0)}
            sub={t('calidad.upp.prevalenciaCentroSub')}
            loading={isLoading}
            accent={(dash?.upp.prevalenciaCentroPct ?? 0) > 5}
            aria-label={`${t('calidad.upp.prevalenciaCentro')}: ${fmtPct(locale as Locale, dash?.upp.prevalenciaCentroPct ?? 0)} — ${t('calidad.upp.prevalenciaCentroSub')}`}
          />
          <StatCard
            label={t('calidad.upp.incidencia')}
            value={isLoading ? undefined : String(dash?.upp.incidenciaNuevas ?? 0)}
            sub={t('calidad.upp.incidenciaSub')}
            loading={isLoading}
            aria-label={`${t('calidad.upp.incidencia')}: ${dash?.upp.incidenciaNuevas ?? 0} — ${t('calidad.upp.incidenciaSub')}`}
          />
          <StatCard
            label={t('calidad.upp.tasa')}
            value={isLoading ? undefined : fmtRate(locale as Locale, dash?.upp.incidenciaTasaPor1000 ?? 0)}
            sub={t('calidad.upp.tasaSub')}
            loading={isLoading}
            aria-label={`${t('calidad.upp.tasa')}: ${fmtRate(locale as Locale, dash?.upp.incidenciaTasaPor1000 ?? 0)} — ${t('calidad.upp.tasaSub')}`}
          />
        </div>

        {/* Desglose por estadio */}
        {!isLoading && dash && (
          <div className="mb-4 rounded-2xl border border-brand-100/60 bg-white p-4 shadow-card">
            <p className="mb-3 text-sm font-semibold text-[#1A3A3F]/70 uppercase tracking-widest">
              {t('calidad.upp.desglose.title')}
            </p>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  { key: 'stage1', label: t('calidad.upp.stage1'), tone: 'amber' },
                  { key: 'stage2', label: t('calidad.upp.stage2'), tone: 'amber' },
                  { key: 'stage3', label: t('calidad.upp.stage3'), tone: 'red' },
                  { key: 'stage4', label: t('calidad.upp.stage4'), tone: 'red' },
                ] as const
              ).map(({ key, label, tone }) => {
                const count = dash.upp.desglosePorEstadio[key];
                return (
                  <div
                    key={key}
                    className="flex min-w-[90px] flex-col items-center gap-1 rounded-xl border border-brand-100/60 bg-brand-50 px-4 py-3"
                    aria-label={`${label}: ${count}`}
                  >
                    <span className="text-2xl font-bold text-[#1A3A3F] tabular-nums">
                      {count}
                    </span>
                    <Badge tone={count > 0 ? tone : 'neutral'}>{label}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cohorte UPP activa */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#1A3A3F]/60">{t('calidad.upp.cohorte.title')}</p>
          <button
            type="button"
            onClick={() =>
              setActiveCohorte((v) => (v === 'UPP_ACTIVA' ? null : 'UPP_ACTIVA'))
            }
            className="min-h-[48px] rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            aria-expanded={activeCohorte === 'UPP_ACTIVA'}
          >
            {t('calidad.upp.cohorte.action')}
          </button>
        </div>
        {activeCohorte === 'UPP_ACTIVA' && (
          <div className="mt-3">
            <CohortTable
              indicator="UPP_ACTIVA"
              centerId={centerId || undefined}
              unitId={unitId || undefined}
              title={t('calidad.upp.cohorte.title')}
              emptyText={t('calidad.upp.cohorte.empty')}
              t={t}
            />
          </div>
        )}
      </section>

      {/* ── Bloque Caídas ─────────────────────────────────────────────────── */}
      <section aria-labelledby="calidad-caidas-title">
        <h2
          id="calidad-caidas-title"
          className="mb-3 flex items-center text-base font-semibold text-[#1A3A3F]"
        >
          {t('calidad.caidas.title')}
          <HintTooltip hint={t('calidad.caidas.hint')} id="hint-caidas" />
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('calidad.caidas.total')}
            value={isLoading ? undefined : String(dash?.caidas.totalCaidas ?? 0)}
            sub={t('calidad.caidas.totalSub')}
            loading={isLoading}
            accent={(dash?.caidas.totalCaidas ?? 0) > 0}
            aria-label={`${t('calidad.caidas.total')}: ${dash?.caidas.totalCaidas ?? 0} — ${t('calidad.caidas.totalSub')}`}
          />
          <StatCard
            label={t('calidad.caidas.tasa')}
            value={isLoading ? undefined : fmtRate(locale as Locale, dash?.caidas.tasaPor1000EstanciasDia ?? 0)}
            sub={t('calidad.caidas.tasaSub')}
            loading={isLoading}
            aria-label={`${t('calidad.caidas.tasa')}: ${fmtRate(locale as Locale, dash?.caidas.tasaPor1000EstanciasDia ?? 0)} — ${t('calidad.caidas.tasaSub')}`}
          />
          <StatCard
            label={t('calidad.caidas.pctResidentes')}
            value={isLoading ? undefined : fmtPct(locale as Locale, dash?.caidas.pctResidentesConCaida ?? 0)}
            sub={t('calidad.caidas.pctResidentesSub')}
            loading={isLoading}
            aria-label={`${t('calidad.caidas.pctResidentes')}: ${fmtPct(locale as Locale, dash?.caidas.pctResidentesConCaida ?? 0)} — ${t('calidad.caidas.pctResidentesSub')}`}
          />
          <StatCard
            label={t('calidad.caidas.conLesion')}
            value={isLoading ? undefined : fmtPct(locale as Locale, dash?.caidas.pctCaidasConLesion ?? 0)}
            sub={t('calidad.caidas.conLesionSub')}
            loading={isLoading}
            accent={(dash?.caidas.pctCaidasConLesion ?? 0) > 20}
            aria-label={`${t('calidad.caidas.conLesion')}: ${fmtPct(locale as Locale, dash?.caidas.pctCaidasConLesion ?? 0)} — ${t('calidad.caidas.conLesionSub')}`}
          />
        </div>
      </section>

      {/* ── Bloque Cobertura de valoración ───────────────────────────────── */}
      <section aria-labelledby="calidad-cobertura-title">
        <h2
          id="calidad-cobertura-title"
          className="mb-3 flex items-center text-base font-semibold text-[#1A3A3F]"
        >
          {t('calidad.cobertura.title')}
          <HintTooltip hint={t('calidad.cobertura.hint')} id="hint-cobertura" />
        </h2>

        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('calidad.cobertura.pctVigente')}
            value={isLoading ? undefined : fmtPct(locale as Locale, dash?.coberturaValoracion.pctConValoracionVigente ?? 0)}
            sub={t('calidad.cobertura.pctVigenteSub')}
            loading={isLoading}
            aria-label={`${t('calidad.cobertura.pctVigente')}: ${fmtPct(locale as Locale, dash?.coberturaValoracion.pctConValoracionVigente ?? 0)} — ${t('calidad.cobertura.pctVigenteSub')}`}
          />
          <StatCard
            label={t('calidad.cobertura.pctEnRiesgo')}
            value={isLoading ? undefined : fmtPct(locale as Locale, dash?.coberturaValoracion.pctEnRiesgo ?? 0)}
            sub={t('calidad.cobertura.pctEnRiesgoSub')}
            loading={isLoading}
            accent={(dash?.coberturaValoracion.pctEnRiesgo ?? 0) > 30}
            aria-label={`${t('calidad.cobertura.pctEnRiesgo')}: ${fmtPct(locale as Locale, dash?.coberturaValoracion.pctEnRiesgo ?? 0)} — ${t('calidad.cobertura.pctEnRiesgoSub')}`}
          />
          <StatCard
            label={t('calidad.cobertura.sinValoracion')}
            value={isLoading ? undefined : String(dash?.coberturaValoracion.sinValoracionVigente ?? 0)}
            sub={t('calidad.cobertura.sinValoracionSub')}
            loading={isLoading}
            accent={(dash?.coberturaValoracion.sinValoracionVigente ?? 0) > 0}
            aria-label={`${t('calidad.cobertura.sinValoracion')}: ${dash?.coberturaValoracion.sinValoracionVigente ?? 0} — ${t('calidad.cobertura.sinValoracionSub')}`}
          />
          <StatCard
            label={t('calidad.cobertura.enRiesgo')}
            value={isLoading ? undefined : String(dash?.coberturaValoracion.enRiesgo ?? 0)}
            sub={t('calidad.cobertura.enRiesgoSub')}
            loading={isLoading}
            accent={(dash?.coberturaValoracion.enRiesgo ?? 0) > 0}
            aria-label={`${t('calidad.cobertura.enRiesgo')}: ${dash?.coberturaValoracion.enRiesgo ?? 0} — ${t('calidad.cobertura.enRiesgoSub')}`}
          />
        </div>

        {/* Cohorte: sin valoración vigente (accionable) */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#1A3A3F]/60">{t('calidad.cobertura.cohorte.title')}</p>
          <button
            type="button"
            onClick={() =>
              setActiveCohorte((v) =>
                v === 'SIN_VALORACION_VIGENTE' ? null : 'SIN_VALORACION_VIGENTE',
              )
            }
            className="min-h-[48px] rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            aria-expanded={activeCohorte === 'SIN_VALORACION_VIGENTE'}
          >
            {t('calidad.cobertura.cohorte.action')}
          </button>
        </div>
        {activeCohorte === 'SIN_VALORACION_VIGENTE' && (
          <div className="mt-3">
            <CohortTable
              indicator="SIN_VALORACION_VIGENTE"
              centerId={centerId || undefined}
              unitId={unitId || undefined}
              title={t('calidad.cobertura.cohorte.title')}
              emptyText={t('calidad.cobertura.cohorte.empty')}
              t={t}
            />
          </div>
        )}
      </section>

      {/* ── Bloque Sujeciones ─────────────────────────────────────────────── */}
      <section aria-labelledby="calidad-sujeciones-title">
        <h2
          id="calidad-sujeciones-title"
          className="mb-3 flex items-center text-base font-semibold text-[#1A3A3F]"
        >
          {t('calidad.sujeciones.title')}
          <HintTooltip hint={t('calidad.sujeciones.hint')} id="hint-sujeciones" />
        </h2>

        <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('calidad.sujeciones.prevalencia')}
            value={isLoading ? undefined : fmtPct(locale as Locale, dash?.sujeciones.prevalenciaPct ?? 0)}
            sub={t('calidad.sujeciones.prevalenciaSub')}
            loading={isLoading}
            accent={(dash?.sujeciones.prevalenciaPct ?? 0) > 0}
            aria-label={`${t('calidad.sujeciones.prevalencia')}: ${fmtPct(locale as Locale, dash?.sujeciones.prevalenciaPct ?? 0)} — ${t('calidad.sujeciones.prevalenciaSub')}`}
          />
          <StatCard
            label={t('calidad.sujeciones.activas')}
            value={isLoading ? undefined : String(dash?.sujeciones.conSujecionActiva ?? 0)}
            sub={t('calidad.sujeciones.activasSub')}
            loading={isLoading}
            accent={(dash?.sujeciones.conSujecionActiva ?? 0) > 0}
            aria-label={`${t('calidad.sujeciones.activas')}: ${dash?.sujeciones.conSujecionActiva ?? 0} — ${t('calidad.sujeciones.activasSub')}`}
          />
        </div>

        {/* Cohorte sujeciones activas */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#1A3A3F]/60">{t('calidad.sujeciones.cohorte.title')}</p>
          <button
            type="button"
            onClick={() =>
              setActiveCohorte((v) =>
                v === 'SUJECION_ACTIVA' ? null : 'SUJECION_ACTIVA',
              )
            }
            className="min-h-[48px] rounded-xl border border-brand-200 px-4 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            aria-expanded={activeCohorte === 'SUJECION_ACTIVA'}
          >
            {t('calidad.sujeciones.cohorte.action')}
          </button>
        </div>
        {activeCohorte === 'SUJECION_ACTIVA' && (
          <div className="mt-3">
            <CohortTable
              indicator="SUJECION_ACTIVA"
              centerId={centerId || undefined}
              unitId={unitId || undefined}
              title={t('calidad.sujeciones.cohorte.title')}
              emptyText={t('calidad.sujeciones.cohorte.empty')}
              t={t}
            />
          </div>
        )}
      </section>
    </div>
  );
}
