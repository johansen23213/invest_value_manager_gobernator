import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { UserRole } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

// Portal de familias: el usuario familiar solo ve un resumen de SU residente
// vinculado (read-only). El aislamiento es doble: RLS por tenant + filtro por
// FamilyLink del usuario autenticado. Minimización de datos: solo lo necesario,
// y además respetando el control de privacidad por vínculo (UX-20).
export const familyRouter = createTRPCRouter({
  portal: permissionProcedure('portal:read').query(async ({ ctx }) => {
    const links = await ctx.db.familyLink.findMany({
      where: { userId: ctx.session.user.id },
      select: {
        residentId: true,
        relationship: true,
        canSeeCare: true,
        canSeeMedication: true,
        canSeeAssessments: true,
      },
    });
    const residentIds = links.map((l) => l.residentId);
    if (residentIds.length === 0) return [];

    const residents = await ctx.db.resident.findMany({
      where: { id: { in: residentIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        center: { select: { name: true } },
        bed: { select: { code: true, unit: { select: { name: true } } } },
        allergies: { select: { id: true, substance: true, severity: true } },
        careRecords: {
          orderBy: { recordedAt: 'desc' },
          take: 8,
          select: { id: true, type: true, payload: true, recordedAt: true },
        },
        medications: {
          where: { active: true },
          select: { id: true, name: true, dose: true, times: true },
          orderBy: { name: 'asc' },
        },
        assessments: {
          orderBy: { assessedAt: 'desc' },
          take: 3,
          select: { id: true, type: true, score: true, assessedAt: true },
        },
      },
    });

    // Aplica el control de privacidad por vínculo: si una sección no está
    // permitida, se devuelve vacía y un flag para que la UI lo explique.
    return residents.map((r) => {
      const link = links.find((l) => l.residentId === r.id);
      const canSeeCare = link?.canSeeCare ?? true;
      const canSeeMedication = link?.canSeeMedication ?? true;
      const canSeeAssessments = link?.canSeeAssessments ?? true;
      return {
        ...r,
        relationship: link?.relationship ?? null,
        careRecords: canSeeCare ? r.careRecords : [],
        medications: canSeeMedication ? r.medications : [],
        assessments: canSeeAssessments ? r.assessments : [],
        privacy: { canSeeCare, canSeeMedication, canSeeAssessments },
      };
    });
  }),

  // -------------------------------------------------------------------------
  // Gestión del acceso de familias (R-05). Solo dirección (users:write/read).
  // -------------------------------------------------------------------------

  /** Vínculos familiares del tenant (con usuario y residente). */
  listLinks: permissionProcedure('users:read').query(({ ctx }) =>
    ctx.db.familyLink.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        relationship: true,
        canSeeCare: true,
        canSeeMedication: true,
        canSeeAssessments: true,
        user: { select: { id: true, email: true, name: true } },
        resident: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ),

  /**
   * Da acceso a un familiar: reutiliza el usuario FAMILIAR si ya existe en el
   * tenant o lo crea con una contraseña provisional, y lo vincula al residente.
   * La contraseña la comunica la dirección al familiar fuera de banda.
   */
  link: permissionProcedure('users:write')
    .input(
      z.object({
        email: z.string().trim().email(),
        name: z.string().trim().min(1).max(120).optional(),
        residentId: z.string(),
        relationship: z.string().trim().max(60).optional(),
        password: z.string().min(8).max(72),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();

      // ¿Existe ya un usuario con ese email en el tenant? (RLS lo limita al tenant.)
      const existing = await ctx.db.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      });
      if (existing && existing.role !== UserRole.FAMILIAR) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Ese email pertenece a un usuario del equipo, no a un familiar.',
        });
      }

      let userId = existing?.id;
      if (!userId) {
        const passwordHash = await bcrypt.hash(input.password, 10);
        try {
          const created = await ctx.db.user.create({
            data: {
              email,
              name: input.name ?? null,
              passwordHash,
              role: UserRole.FAMILIAR,
              tenantId: ctx.tenantId,
            },
            select: { id: true },
          });
          userId = created.id;
        } catch {
          throw new TRPCError({ code: 'CONFLICT', message: 'Ese email ya está en uso.' });
        }
      }

      try {
        const linkRow = await ctx.db.familyLink.create({
          data: {
            tenantId: ctx.tenantId,
            userId,
            residentId: input.residentId,
            relationship: input.relationship ?? null,
          },
          select: { id: true },
        });
        await ctx.audit({
          action: 'CREATE',
          entity: 'FamilyLink',
          entityId: linkRow.id,
          summary: `Acceso de familia concedido a ${email} sobre el residente ${input.residentId}`,
          metadata: { email, residentId: input.residentId, relationship: input.relationship ?? null },
        });
        return linkRow;
      } catch {
        throw new TRPCError({ code: 'CONFLICT', message: 'Ese familiar ya está vinculado a este residente.' });
      }
    }),

  /** Revoca un vínculo familiar. */
  unlink: permissionProcedure('users:write')
    .input(z.object({ linkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.familyLink.findUnique({
        where: { id: input.linkId },
        select: { id: true, user: { select: { email: true } }, residentId: true },
      });
      if (!link) throw new TRPCError({ code: 'NOT_FOUND', message: 'Vínculo no encontrado.' });
      await ctx.db.familyLink.delete({ where: { id: input.linkId } });
      await ctx.audit({
        action: 'DELETE',
        entity: 'FamilyLink',
        entityId: input.linkId,
        summary: `Acceso de familia revocado a ${link.user.email} sobre el residente ${link.residentId}`,
        metadata: { email: link.user.email, residentId: link.residentId },
      });
      return { ok: true };
    }),

  /** Ajusta qué secciones del portal ve un familiar (control de privacidad). */
  updatePrivacy: permissionProcedure('users:write')
    .input(
      z.object({
        linkId: z.string(),
        canSeeCare: z.boolean(),
        canSeeMedication: z.boolean(),
        canSeeAssessments: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.familyLink.update({
        where: { id: input.linkId },
        data: {
          canSeeCare: input.canSeeCare,
          canSeeMedication: input.canSeeMedication,
          canSeeAssessments: input.canSeeAssessments,
        },
        select: { id: true, canSeeCare: true, canSeeMedication: true, canSeeAssessments: true },
      });
      await ctx.audit({
        action: 'UPDATE',
        entity: 'FamilyLink',
        entityId: input.linkId,
        summary: `Privacidad del portal actualizada (vínculo ${input.linkId})`,
        metadata: {
          canSeeCare: input.canSeeCare,
          canSeeMedication: input.canSeeMedication,
          canSeeAssessments: input.canSeeAssessments,
        },
      });
      return updated;
    }),
});
