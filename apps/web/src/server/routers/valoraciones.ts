/**
 * Router de valoraciones/escalas — RF-VAL-004..008.
 *
 * Endpoints:
 *   - overdueAlerts   : valoraciones vencidas o próximas a vencer en el tenant,
 *                       filtrable por unidad.
 *   - scaleEvolution  : serie temporal de puntuaciones de una escala por residente.
 *   - pendingCount    : resumen (nVencidas, nProximas) para el dashboard.
 *
 * Permisos:
 *   - Lectura: 'residents:read' (alineado con el resto del expediente clínico;
 *     un auxiliar que puede ver el expediente puede ver las alertas de valoración).
 *     FAMILIAR no tiene residents:read → no ve estas alertas.
 *
 * Seguridad:
 *   - Toda query pasa por ctx.db (RLS en Postgres; no hay filtro solo en código).
 *   - El residente se verifica pertenecer al tenant mediante assertResident
 *     (que hace un findUnique — si RLS no lo devuelve, lanza NOT_FOUND).
 *
 * Lógica pura:
 *   - La cadencia y el cálculo de vencimiento están en lib/valoracion-alertas.ts.
 *   - El router solo orquesta BD + lógica pura, sin mezclar lógica de dominio.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { AssessmentType, type TenantPrisma } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { interpretScale, type ScaleType as LibScaleType } from '@/lib/scales';
import {
  getScaleCadenceDays,
  getAssessmentStatus,
  computeOverdueAlerts,
  type ScaleType,
  type AssessmentEntry,
} from '@/lib/valoracion-alertas';

/** Verifica que el residente existe en el tenant (vía RLS) o lanza NOT_FOUND. */
async function assertResident(db: TenantPrisma, residentId: string) {
  const found = await db.resident.findUnique({ where: { id: residentId } });
  if (!found)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
  return found;
}

/** Valoración aplanada con datos del residente para procesamiento. */
interface FlatAssessment {
  id:          string;
  residentId:  string;
  type:        string;
  score:       number;
  assessedAt:  Date;
  resident: {
    id:       string;
    firstName: string;
    lastName:  string;
    unitId:   string | null;
    unitName: string | null;
  };
}

/**
 * Para cada tipo de escala, obtiene la valoración más reciente de cada residente.
 *
 * Agrupamos en memoria porque Prisma no soporta GROUP BY directo.
 * Estrategia: ordenar por (residentId, type, assessedAt DESC) y coger la primera
 * de cada par (residentId, type). Funciona bien para N residentes de un centro
 * (cientos, no millones).
 */
function getLatestByResidentAndType(
  assessments: FlatAssessment[],
): Map<string, FlatAssessment> {
  const latest = new Map<string, FlatAssessment>();
  for (const a of assessments) {
    const key = `${a.residentId}::${a.type}`;
    const existing = latest.get(key);
    if (!existing || a.assessedAt > existing.assessedAt) {
      latest.set(key, a);
    }
  }
  return latest;
}

export const valoracionesRouter = createTRPCRouter({
  /**
   * overdueAlerts — lista de valoraciones vencidas o próximas a vencer.
   *
   * Devuelve una entrada por (residente, tipo de escala) con la última
   * valoración y el estado de vencimiento calculado a partir de la cadencia
   * por defecto (o futura override por residente).
   *
   * Input:
   *   - unitId (opcional): filtrar por unidad de convivencia.
   *
   * Output por ítem:
   *   - residentId, residentName
   *   - scaleType, score, assessedAt (última valoración)
   *   - status: 'vencida' | 'proxima'
   *   - daysOverdue, daysUntilDue, dueDate
   *   - cadenceDays (cadencia usada)
   */
  overdueAlerts: permissionProcedure('residents:read')
    .input(
      z.object({
        unitId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();

      // Traemos todas las valoraciones del tenant (RLS garantiza el aislamiento).
      // Incluimos al residente para tener nombre y unidad.
      const allAssessments = await ctx.db.assessment.findMany({
        orderBy: { assessedAt: 'desc' },
        include: {
          resident: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              // unitId viene de la relación Bed → Unit.
              bed: { select: { unit: { select: { id: true, name: true } } } },
            },
          },
        },
      });

      // Aplanar para tener residentId, unitId y unitName accesibles
      const flat: FlatAssessment[] = allAssessments.map((a) => ({
        id:         a.id,
        residentId: a.residentId,
        type:       a.type as string,
        score:      a.score,
        assessedAt: a.assessedAt,
        resident: {
          id:        a.resident.id,
          firstName: a.resident.firstName,
          lastName:  a.resident.lastName,
          unitId:    a.resident.bed?.unit?.id   ?? null,
          unitName:  a.resident.bed?.unit?.name ?? null,
        },
      }));

      // Filtrar por unidad si se especifica
      const filtered = input.unitId
        ? flat.filter((a) => a.resident.unitId === input.unitId)
        : flat;

      // Obtener la última valoración por (residente, escala)
      const latestMap = getLatestByResidentAndType(filtered);

      // Calcular alertas usando la lógica pura
      const overdueItems: Array<{
        residentId:   string;
        residentName: string;
        unitId:       string | null;
        unitName:     string | null;
        scaleType:    ScaleType;
        score:        number;
        assessedAt:   Date;
        assessmentId: string;
        status:       'vencida' | 'proxima';
        daysOverdue:  number;
        daysUntilDue: number;
        dueDate:      Date;
        cadenceDays:  number;
      }> = [];

      for (const [, assessment] of latestMap) {
        const scaleType = assessment.type as ScaleType;
        const cadenceDays = getScaleCadenceDays(scaleType);
        const statusResult = getAssessmentStatus(assessment.assessedAt, cadenceDays, now);

        if (statusResult.status === 'vencida' || statusResult.status === 'proxima') {
          overdueItems.push({
            residentId:   assessment.resident.id,
            residentName: `${assessment.resident.firstName} ${assessment.resident.lastName}`,
            unitId:       assessment.resident.unitId,
            unitName:     assessment.resident.unitName,
            scaleType,
            score:        assessment.score,
            assessedAt:   assessment.assessedAt,
            assessmentId: assessment.id,
            status:       statusResult.status,
            daysOverdue:  statusResult.daysOverdue,
            daysUntilDue: statusResult.daysUntilDue,
            dueDate:      statusResult.dueDate,
            cadenceDays,
          });
        }
      }

      // Ordenar: más vencidas primero, próximas al final
      return overdueItems.sort((a, b) => b.daysOverdue - a.daysOverdue);
    }),

  /**
   * scaleEvolution — serie temporal de una escala para un residente.
   *
   * Devuelve todas las valoraciones del tipo solicitado ordenadas por fecha
   * ascendente (para graficar la evolución). Cada punto incluye la
   * interpretación textual de la puntuación.
   *
   * Acceso al residente verificado vía assertResident (misma lógica que el
   * resto de endpoints del expediente: si RLS no lo devuelve → NOT_FOUND).
   */
  scaleEvolution: permissionProcedure('residents:read')
    .input(
      z.object({
        residentId: z.string(),
        scaleType:  z.nativeEnum(AssessmentType),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verificar acceso al residente (RLS + existencia)
      await assertResident(ctx.db, input.residentId);

      const assessments = await ctx.db.assessment.findMany({
        where: {
          residentId: input.residentId,
          type:       input.scaleType,
        },
        orderBy: { assessedAt: 'asc' },
        select: {
          id:           true,
          score:        true,
          assessedAt:   true,
          notes:        true,
          assessedById: true,
          createdAt:    true,
        },
      });

      // Construir serie temporal con interpretación por punto
      const series = assessments.map((a) => ({
        id:             a.id,
        assessedAt:     a.assessedAt,
        score:          a.score,
        interpretation: interpretScale(input.scaleType as LibScaleType, a.score),
        notes:          a.notes ?? null,
      }));

      return {
        residentId: input.residentId,
        scaleType:  input.scaleType,
        series,
        cadenceDays: getScaleCadenceDays(input.scaleType as ScaleType),
      };
    }),

  /**
   * pendingCount — resumen de alertas para el dashboard.
   *
   * Conteo rápido de (nVencidas, nProximas) a nivel tenant para que la UI
   * muestre un badge de alerta sin cargar la lista completa.
   *
   * Complejidad: misma query que overdueAlerts pero solo devuelve contadores.
   * Separado para permitir polling ligero desde el dashboard.
   */
  pendingCount: permissionProcedure('residents:read')
    .query(async ({ ctx }) => {
      const now = new Date();

      const allAssessments = await ctx.db.assessment.findMany({
        orderBy: { assessedAt: 'desc' },
        select: {
          residentId: true,
          type:       true,
          assessedAt: true,
        },
      });

      // Última valoración por (residente, escala)
      const latestMap = new Map<string, { type: string; assessedAt: Date }>();
      for (const a of allAssessments) {
        const key = `${a.residentId}::${a.type}`;
        if (!latestMap.has(key)) {
          latestMap.set(key, { type: a.type, assessedAt: a.assessedAt });
        }
      }

      const entries: AssessmentEntry[] = Array.from(latestMap.values()).map((v) => ({
        scaleType: v.type as ScaleType,
        lastDate:  v.assessedAt,
      }));

      const alerts = computeOverdueAlerts(entries, now);
      const nVencidas = alerts.filter((a) => a.status === 'vencida').length;
      const nProximas = alerts.filter((a) => a.status === 'proxima').length;

      return { nVencidas, nProximas, total: nVencidas + nProximas };
    }),
});
