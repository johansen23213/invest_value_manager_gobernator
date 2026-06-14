/**
 * Router de indicadores de calidad asistencial — panel de cohorte del centro.
 *
 * Agrega datos ya existentes (PressureUlcer, FallRecord, Assessment Norton/Braden,
 * Restraint, Resident) para calcular los indicadores estándar de calidad:
 *   - Prevalencia e incidencia de UPP por estadio
 *   - Tasa de caídas y caídas con lesión
 *   - Cobertura de valoración de riesgo Norton/Braden
 *   - Prevalencia de sujeciones mecánicas
 *
 * NO se añade ninguna tabla nueva. Toda la lógica de cálculo está en
 * `lib/indicadores-calidad.ts` (funciones puras testeables sin BD).
 *
 * Seguridad:
 *   - Permiso `quality:read` (DIRECTOR + SANITARIO; sin AUXILIAR ni FAMILIAR).
 *   - Todas las queries van por `ctx.db` (RLS en Postgres garantiza el
 *     aislamiento de tenant). No hay bypass ni filtro solo en código.
 *   - cohortAtRisk lista residentes concretos → se usa `residents:read` como
 *     permiso adicional para la lista nominal (el mismo que el expediente).
 *     En la práctica quality:read ⊂ roles que tienen residents:read (DIRECTOR,
 *     SANITARIO), así que el guard doble es una capa extra de defensa en profundidad.
 *
 * RBAC:
 *   SUPERADMIN  → quality:read (hereda todos los permisos)
 *   DIRECTOR    → quality:read
 *   SANITARIO   → quality:read
 *   AUXILIAR    → sin acceso
 *   FAMILIAR    → sin acceso
 */

import { z } from 'zod';
import { AssessmentType } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import {
  calcularDashboardCalidad,
  cohortEnRiesgo,
  type ResidentInput,
  type PressureUlcerInput,
  type FallRecordInput,
  type AssessmentUPPInput,
  type RestraintInput,
  type PeriodInput,
  type IndicadorTipo,
} from '@/lib/indicadores-calidad';

// ---------------------------------------------------------------------------
// Esquemas de validación Zod (reutilizables desde cliente)
// ---------------------------------------------------------------------------

export const PeriodSchema = z.object({
  desde: z.coerce.date(),
  hasta: z.coerce.date(),
});

export const DashboardInputSchema = z.object({
  /** Filtrar por centro. Si no se indica, se agregan todos los centros del tenant. */
  centerId: z.string().optional(),
  /** Filtrar por unidad dentro del centro. */
  unitId: z.string().optional(),
  /** Periodo de análisis (incidencia, caídas). Default: últimos 30 días. */
  period: PeriodSchema.optional(),
});

export const CohortAtRiskInputSchema = z.object({
  /** Tipo de indicador para el que se quiere la lista de residentes. */
  indicator: z.enum(['UPP_ACTIVA', 'SIN_VALORACION_VIGENTE', 'EN_RIESGO_UPP', 'SUJECION_ACTIVA']),
  /** Filtrar por centro (opcional). */
  centerId: z.string().optional(),
  /** Filtrar por unidad (opcional). */
  unitId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Calcula el periodo por defecto: los últimos 30 días hasta hoy (UTC).
 * Las fechas son inyectables en tests, pero aquí usamos la fecha real.
 */
function defaultPeriod(now: Date): PeriodInput {
  const hasta = new Date(now);
  const desde = new Date(now);
  desde.setDate(desde.getDate() - 30);
  return { desde, hasta };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const indicadoresRouter = createTRPCRouter({
  /**
   * dashboard — todos los indicadores de calidad de cohorte para el panel.
   *
   * Carga los datos crudos del tenant (con RLS activa) y delega el cálculo
   * a las funciones puras de `lib/indicadores-calidad.ts`.
   *
   * Input:
   *   - centerId (opcional): filtrar por centro
   *   - unitId (opcional): filtrar por unidad
   *   - period (opcional): intervalo [desde, hasta] para incidencia y caídas;
   *                        default = últimos 30 días
   *
   * Output: DashboardCalidad con los 4 bloques de indicadores.
   *
   * Contrato para la UI:
   * {
   *   period: { desde: Date, hasta: Date },
   *   upp: {
   *     prevalenciaPct: number,
   *     prevalenciaCentroPct: number,
   *     incidenciaNuevas: number,
   *     incidenciaTasaPor1000: number,
   *     desglosePorEstadio: { stage1, stage2, stage3, stage4 },
   *     totalResidentes: number,
   *   },
   *   caidas: {
   *     totalCaidas: number,
   *     tasaPor1000EstanciasDia: number,
   *     pctResidentesConCaida: number,
   *     caidasConLesion: number,
   *     pctCaidasConLesion: number,
   *   },
   *   coberturaValoracion: {
   *     pctConValoracionVigente: number,
   *     pctEnRiesgo: number,
   *     sinValoracionVigente: number,
   *     enRiesgo: number,
   *     totalResidentes: number,
   *   },
   *   sujeciones: {
   *     prevalenciaPct: number,
   *     conSujecionActiva: number,
   *     totalResidentes: number,
   *   },
   * }
   */
  dashboard: permissionProcedure('quality:read')
    .input(DashboardInputSchema)
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const period = input.period ?? defaultPeriod(now);

      // ------------------------------------------------------------------
      // 1. Cargar residentes del tenant (RLS garantiza aislamiento).
      //    Filtramos por centerId/unitId si se especifica.
      //    `bed` incluye la unidad para poder filtrar por unitId.
      // ------------------------------------------------------------------
      const residentsRaw = await ctx.db.resident.findMany({
        where: {
          ...(input.centerId ? { centerId: input.centerId } : {}),
          // Filtrar por unidad: el residente tiene una cama en la unidad
          ...(input.unitId
            ? { bed: { unitId: input.unitId } }
            : {}),
          // Incluye ACTIVO y BAJA (para incidencia histórica); excluye PREINGRESO
          status: { in: ['ACTIVO', 'BAJA'] },
        },
        select: {
          id: true,
          status: true,
          admissionDate: true,
          dischargeDate: true,
          centerId: true,
          bed: { select: { unitId: true } },
        },
      });

      const residents: ResidentInput[] = residentsRaw.map((r) => ({
        id: r.id,
        status: r.status as ResidentInput['status'],
        admissionDate: r.admissionDate,
        dischargeDate: r.dischargeDate,
        centerId: r.centerId,
        unitId: r.bed?.unitId ?? null,
      }));

      const residentIds = residents.map((r) => r.id);

      // Optimización: si no hay residentes, devolvemos indicadores vacíos
      if (residentIds.length === 0) {
        return calcularDashboardCalidad([], [], [], [], [], period, now);
      }

      // ------------------------------------------------------------------
      // 2. Cargar UPPs (RLS activa; filtradas por residentes de la cohorte)
      // ------------------------------------------------------------------
      const uppRaw = await ctx.db.pressureUlcer.findMany({
        where: { residentId: { in: residentIds } },
        select: {
          id: true,
          residentId: true,
          stage: true,
          onsetDate: true,
          resolvedDate: true,
          acquired: true,
          active: true,
        },
      });

      const ulceras: PressureUlcerInput[] = uppRaw.map((u) => ({
        id: u.id,
        residentId: u.residentId,
        stage: u.stage,
        onsetDate: u.onsetDate,
        resolvedDate: u.resolvedDate,
        acquired: u.acquired as PressureUlcerInput['acquired'],
        active: u.active,
      }));

      // ------------------------------------------------------------------
      // 3. Cargar caídas
      // ------------------------------------------------------------------
      const caidasRaw = await ctx.db.fallRecord.findMany({
        where: { residentId: { in: residentIds } },
        select: {
          id: true,
          residentId: true,
          occurredAt: true,
          injuries: true,
        },
      });

      const caidas: FallRecordInput[] = caidasRaw.map((c) => ({
        id: c.id,
        residentId: c.residentId,
        occurredAt: c.occurredAt,
        injuries: c.injuries,
      }));

      // ------------------------------------------------------------------
      // 4. Cargar valoraciones Norton/Braden
      // ------------------------------------------------------------------
      const assessmentsRaw = await ctx.db.assessment.findMany({
        where: {
          residentId: { in: residentIds },
          type: { in: [AssessmentType.NORTON, AssessmentType.BRADEN] },
        },
        select: {
          id: true,
          residentId: true,
          type: true,
          score: true,
          assessedAt: true,
        },
        orderBy: { assessedAt: 'desc' },
      });

      const assessments: AssessmentUPPInput[] = assessmentsRaw.map((a) => ({
        id: a.id,
        residentId: a.residentId,
        type: a.type as 'NORTON' | 'BRADEN',
        score: a.score,
        assessedAt: a.assessedAt,
      }));

      // ------------------------------------------------------------------
      // 5. Cargar sujeciones
      // ------------------------------------------------------------------
      const restraintsRaw = await ctx.db.restraint.findMany({
        where: { residentId: { in: residentIds } },
        select: {
          id: true,
          residentId: true,
          active: true,
          prescribedAt: true,
          endDate: true,
        },
      });

      const restraints: RestraintInput[] = restraintsRaw.map((s) => ({
        id: s.id,
        residentId: s.residentId,
        active: s.active,
        prescribedAt: s.prescribedAt,
        endDate: s.endDate,
      }));

      // ------------------------------------------------------------------
      // 6. Calcular indicadores (lógica pura, sin BD)
      // ------------------------------------------------------------------
      return calcularDashboardCalidad(
        residents,
        ulceras,
        caidas,
        assessments,
        restraints,
        period,
        now,
      );
    }),

  /**
   * cohortAtRisk — lista nominal de residentes que disparan un indicador.
   *
   * Usada por el panel para la acción directa: "ver quién tiene UPP activa",
   * "ver quién no tiene valoración vigente", etc.
   *
   * Requiere `quality:read`. La lista devuelve residentId + nombre + unidad
   * para que la UI pueda navegar al expediente. Los datos personales mínimos
   * están protegidos por el mismo permiso (DIRECTOR + SANITARIO, no FAMILIAR).
   *
   * Input:
   *   - indicator: 'UPP_ACTIVA' | 'SIN_VALORACION_VIGENTE' | 'EN_RIESGO_UPP' | 'SUJECION_ACTIVA'
   *   - centerId (opcional)
   *   - unitId (opcional)
   *
   * Output: Array de { residentId, firstName, lastName, unitName, motivo, detalle }
   */
  cohortAtRisk: permissionProcedure('quality:read')
    .input(CohortAtRiskInputSchema)
    .query(async ({ ctx, input }) => {
      const now = new Date();

      // Cargar residentes activos de la cohorte
      const residentsRaw = await ctx.db.resident.findMany({
        where: {
          status: 'ACTIVO',
          ...(input.centerId ? { centerId: input.centerId } : {}),
          ...(input.unitId ? { bed: { unitId: input.unitId } } : {}),
        },
        select: {
          id: true,
          status: true,
          admissionDate: true,
          dischargeDate: true,
          centerId: true,
          firstName: true,
          lastName: true,
          bed: { select: { unitId: true, unit: { select: { name: true } } } },
        },
      });

      const residents: ResidentInput[] = residentsRaw.map((r) => ({
        id: r.id,
        status: r.status as ResidentInput['status'],
        admissionDate: r.admissionDate,
        dischargeDate: r.dischargeDate,
        centerId: r.centerId,
        unitId: r.bed?.unitId ?? null,
      }));

      const residentIds = residents.map((r) => r.id);

      if (residentIds.length === 0) return [];

      // Cargar los datos necesarios según el indicador pedido
      const indicator = input.indicator as IndicadorTipo;

      const ulceras: PressureUlcerInput[] =
        indicator === 'UPP_ACTIVA'
          ? (
              await ctx.db.pressureUlcer.findMany({
                where: { residentId: { in: residentIds } },
                select: { id: true, residentId: true, stage: true, onsetDate: true, resolvedDate: true, acquired: true, active: true },
              })
            ).map((u) => ({
              id: u.id,
              residentId: u.residentId,
              stage: u.stage,
              onsetDate: u.onsetDate,
              resolvedDate: u.resolvedDate,
              acquired: u.acquired as PressureUlcerInput['acquired'],
              active: u.active,
            }))
          : [];

      const assessments: AssessmentUPPInput[] =
        indicator === 'SIN_VALORACION_VIGENTE' || indicator === 'EN_RIESGO_UPP'
          ? (
              await ctx.db.assessment.findMany({
                where: {
                  residentId: { in: residentIds },
                  type: { in: [AssessmentType.NORTON, AssessmentType.BRADEN] },
                },
                select: { id: true, residentId: true, type: true, score: true, assessedAt: true },
                orderBy: { assessedAt: 'desc' },
              })
            ).map((a) => ({
              id: a.id,
              residentId: a.residentId,
              type: a.type as 'NORTON' | 'BRADEN',
              score: a.score,
              assessedAt: a.assessedAt,
            }))
          : [];

      const restraints: RestraintInput[] =
        indicator === 'SUJECION_ACTIVA'
          ? (
              await ctx.db.restraint.findMany({
                where: { residentId: { in: residentIds } },
                select: { id: true, residentId: true, active: true, prescribedAt: true, endDate: true },
              })
            ).map((s) => ({
              id: s.id,
              residentId: s.residentId,
              active: s.active,
              prescribedAt: s.prescribedAt,
              endDate: s.endDate,
            }))
          : [];

      // Calcular con la lógica pura
      const enRiesgo = cohortEnRiesgo(
        indicator,
        residents,
        ulceras,
        assessments,
        restraints,
        now,
      );

      // Enriquecer con datos de nombre y unidad para la UI
      const residentMap = new Map(
        residentsRaw.map((r) => [
          r.id,
          {
            firstName: r.firstName,
            lastName: r.lastName,
            unitName: r.bed?.unit?.name ?? null,
          },
        ]),
      );

      return enRiesgo.map((r) => {
        const info = residentMap.get(r.residentId);
        return {
          residentId: r.residentId,
          firstName: info?.firstName ?? '',
          lastName: info?.lastName ?? '',
          unitName: info?.unitName ?? null,
          motivo: r.motivo,
          detalle: r.detalle,
        };
      });
    }),
});
