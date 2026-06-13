/**
 * Router de informe social y perfil de bienestar ACP (Épica B).
 *
 * Cubre:
 *   social.upsert          — crear/actualizar informe social (RF-SOC-001..008)
 *   social.getByResident   — obtener informe social del residente
 *   wellbeing.upsert       — crear/actualizar perfil de bienestar ACP (RF-SOC-003..006)
 *   wellbeing.getByResident — obtener perfil ACP del residente
 *   wellbeing.listOverdueReviews — panel de revisiones ACP vencidas (RF-SOC-007)
 *
 * DISEÑO — router único (vs. dos routers separados):
 *   SocialReport y WellbeingProfile son dos caras del mismo bloque de trabajo
 *   social centrado en la persona. Compartir un router (con subrouters anidados)
 *   mantiene la cohesión y facilita que Dani importe un solo objeto (socialRouter).
 *   Patrón: igual que clinicalNotesRouter con nursing / medical anidados.
 *
 * PERMISOS:
 *   - residents:write → crear/editar (DIRECTOR, SANITARIO; el trabajo social
 *     se mapea a estos roles en el RBAC actual — no se crea un rol nuevo para
 *     evitar proliferación de permisos, ADR-0016).
 *   - residents:read  → consultar (DIRECTOR, SANITARIO, AUXILIAR).
 *   - FAMILIAR: sin acceso. SocialReport y WellbeingProfile son STAFF-ONLY.
 *     El informe social contiene situación económica, familiar y social de la
 *     persona: no se expone al portal de familias bajo ningún circunstancia.
 *
 * AUDITORÍA:
 *   Siempre en upsert (acción UPDATE para alinearse con el patrón de LifeStory).
 *   SocialReport y WellbeingProfile contienen datos personales de categoría
 *   especial (situación socioeconómica, datos familiares) — art. 9 RGPD.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { type TenantPrisma } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { isReviewOverdue } from '@/lib/wellbeing';

// ---------------------------------------------------------------------------
// Esquemas Zod exportados
// ---------------------------------------------------------------------------

/** Input para crear/actualizar el informe social. */
export const UpsertSocialReportInput = z.object({
  residentId:        z.string().min(1),
  reportDate:        z.coerce.date(),
  familySituation:   z.string().trim().max(5000).optional(),
  supportNetwork:    z.string().trim().max(5000).optional(),
  economicSituation: z.string().trim().max(5000).optional(),
  benefits:          z.string().trim().max(5000).optional(),
  workHistory:       z.string().trim().max(5000).optional(),
  socialAssessment:  z.string().trim().max(5000).optional(),
  agreements:        z.string().trim().max(5000).optional(),
  nextReviewDate:    z.coerce.date().optional(),
});
export type UpsertSocialReportInput = z.infer<typeof UpsertSocialReportInput>;

/** Input para obtener el informe social de un residente. */
export const GetSocialReportInput = z.object({
  residentId: z.string().min(1),
});

/** Input para crear/actualizar el perfil de bienestar ACP. */
export const UpsertWellbeingProfileInput = z.object({
  residentId:             z.string().min(1),
  // 8 dimensiones ACP (UNE 158101)
  emotionalWellbeing:     z.string().trim().max(5000).optional(),
  physicalWellbeing:      z.string().trim().max(5000).optional(),
  materialWellbeing:      z.string().trim().max(5000).optional(),
  personalDevelopment:    z.string().trim().max(5000).optional(),
  selfDetermination:      z.string().trim().max(5000).optional(),
  interpersonalRelations: z.string().trim().max(5000).optional(),
  socialInclusion:        z.string().trim().max(5000).optional(),
  rights:                 z.string().trim().max(5000).optional(),
  // RF-SOC-005
  importantToThePerson:   z.string().trim().max(5000).optional(),
  importantForThePerson:  z.string().trim().max(5000).optional(),
  // RF-SOC-007: fecha de próxima revisión periódica
  nextReviewDate:         z.coerce.date().optional(),
});
export type UpsertWellbeingProfileInput = z.infer<typeof UpsertWellbeingProfileInput>;

/** Input para el panel de revisiones ACP vencidas. */
export const ListOverdueReviewsInput = z.object({
  /** Si se especifica, filtra solo los residentes de este centro. */
  centerId: z.string().min(1).optional(),
  /** Fecha de referencia para calcular vencimiento (default: now en el servidor). */
  asOf: z.coerce.date().optional(),
});
export type ListOverdueReviewsInput = z.infer<typeof ListOverdueReviewsInput>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertResident(db: TenantPrisma, residentId: string) {
  const found = await db.resident.findUnique({
    where:  { id: residentId },
    select: { id: true, centerId: true },
  });
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const socialRouter = createTRPCRouter({

  // =========================================================================
  // Informe social (RF-SOC-001..008)
  // =========================================================================

  social: createTRPCRouter({

    /**
     * Crear o actualizar el informe social del residente.
     *
     * Decisión: un residente puede tener múltiples informes a lo largo del tiempo
     * (no es upsert de 1:1 como WellbeingProfile). Cada llamada crea un nuevo
     * informe con su propia fecha. El "informe vigente" es el más reciente.
     * El autor queda registrado en el propio informe para trazabilidad.
     *
     * Permiso: residents:write (DIRECTOR, SANITARIO).
     */
    upsert: permissionProcedure('residents:write')
      .input(UpsertSocialReportInput)
      .mutation(async ({ ctx, input }) => {
        await assertResident(ctx.db, input.residentId);
        const { residentId, ...data } = input;

        const report = await ctx.db.socialReport.create({
          data: {
            tenantId:   ctx.tenantId,
            residentId,
            authorId:   ctx.session.user.id,
            ...data,
          },
        });

        await ctx.audit({
          action:   'UPDATE',
          entity:   'SocialReport',
          entityId: residentId,
          summary:  `Informe social actualizado — fecha: ${input.reportDate.toISOString().split('T')[0]}`,
          metadata: {
            reportId:       report.id,
            reportDate:     input.reportDate.toISOString(),
            nextReviewDate: input.nextReviewDate?.toISOString() ?? null,
          },
        });

        return report;
      }),

    /**
     * Obtener el informe social más reciente del residente.
     * Devuelve null si no existe ningún informe.
     *
     * Permiso: residents:read (DIRECTOR, SANITARIO, AUXILIAR).
     */
    getByResident: permissionProcedure('residents:read')
      .input(GetSocialReportInput)
      .query(({ ctx, input }) =>
        ctx.db.socialReport.findFirst({
          where:   { residentId: input.residentId },
          include: {
            author: { select: { id: true, name: true, jobTitle: true } },
          },
          orderBy: { reportDate: 'desc' },
        }),
      ),

    /**
     * Listar todos los informes sociales del residente (historial).
     * Útil para ver la evolución a lo largo del tiempo.
     *
     * Permiso: residents:read.
     */
    listByResident: permissionProcedure('residents:read')
      .input(GetSocialReportInput)
      .query(({ ctx, input }) =>
        ctx.db.socialReport.findMany({
          where:   { residentId: input.residentId },
          include: {
            author: { select: { id: true, name: true, jobTitle: true } },
          },
          orderBy: { reportDate: 'desc' },
        }),
      ),
  }),

  // =========================================================================
  // Perfil de bienestar ACP / UNE 158101 (RF-SOC-003..006)
  // =========================================================================

  wellbeing: createTRPCRouter({

    /**
     * Crear o actualizar el perfil de bienestar ACP del residente.
     * 1 perfil por residente (upsert por residentId @unique).
     *
     * Permiso: residents:write (DIRECTOR, SANITARIO).
     */
    upsert: permissionProcedure('residents:write')
      .input(UpsertWellbeingProfileInput)
      .mutation(async ({ ctx, input }) => {
        await assertResident(ctx.db, input.residentId);
        const { residentId, ...data } = input;

        const profile = await ctx.db.wellbeingProfile.upsert({
          where:  { residentId },
          update: { ...data, updatedById: ctx.session.user.id },
          create: {
            tenantId:   ctx.tenantId,
            residentId,
            updatedById: ctx.session.user.id,
            ...data,
          },
        });

        await ctx.audit({
          action:   'UPDATE',
          entity:   'WellbeingProfile',
          entityId: residentId,
          summary:  'Perfil de bienestar ACP actualizado',
          metadata: {
            profileId:      profile.id,
            nextReviewDate: input.nextReviewDate?.toISOString() ?? null,
          },
        });

        return profile;
      }),

    /**
     * Obtener el perfil de bienestar ACP del residente.
     * Devuelve null si no existe aún.
     *
     * Permiso: residents:read.
     */
    getByResident: permissionProcedure('residents:read')
      .input(z.object({ residentId: z.string().min(1) }))
      .query(({ ctx, input }) =>
        ctx.db.wellbeingProfile.findUnique({
          where:   { residentId: input.residentId },
          include: {
            updatedBy: { select: { id: true, name: true, jobTitle: true } },
          },
        }),
      ),

    /**
     * Panel de revisiones ACP vencidas del tenant (RF-SOC-007).
     *
     * Devuelve los perfiles de bienestar cuya revisión está vencida
     * (nextReviewDate <= asOf) o no tiene fecha planificada (según
     * el filtro de la UI: el panel puede mostrar tanto los vencidos
     * como los sin fecha).
     *
     * La lógica de "vencido" (isReviewOverdue) es una función pura
     * en lib/wellbeing.ts, testeable sin BD.
     *
     * Permiso: residents:read.
     */
    listOverdueReviews: permissionProcedure('residents:read')
      .input(ListOverdueReviewsInput)
      .query(async ({ ctx, input }) => {
        const asOf = input.asOf ?? new Date();

        // Traer perfiles con nextReviewDate <= asOf (vencidas en BD).
        // Los perfiles sin nextReviewDate (NOT_SET) no se incluyen aquí;
        // si el panel los quiere, la UI puede hacer una segunda llamada o
        // ampliar el filtro. Decisión: mejor ser explícito en el panel.
        const profiles = await ctx.db.wellbeingProfile.findMany({
          where: {
            nextReviewDate: { lte: asOf },
            // Filtrar por centro si se especifica (join vía resident)
            ...(input.centerId
              ? { resident: { centerId: input.centerId, status: 'ACTIVO' } }
              : { resident: { status: 'ACTIVO' } }),
          },
          include: {
            resident: {
              select: {
                id:        true,
                firstName: true,
                lastName:  true,
                centerId:  true,
                bed: { select: { id: true, code: true } },
              },
            },
            updatedBy: { select: { id: true, name: true } },
          },
          orderBy: { nextReviewDate: 'asc' }, // las más urgentes primero
        });

        // Enriquecer con el estado calculado (isReviewOverdue ya cubierto
        // por el filtro de BD, pero añadimos el campo para consistencia).
        return profiles.map((p) => ({
          ...p,
          reviewOverdue: isReviewOverdue(p.nextReviewDate, asOf),
        }));
      }),
  }),
});
