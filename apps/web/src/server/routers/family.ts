import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

// Portal de familias: el usuario familiar solo ve un resumen de SU residente
// vinculado (read-only). El aislamiento es doble: RLS por tenant + filtro por
// FamilyLink del usuario autenticado. Minimización de datos: solo lo necesario.
export const familyRouter = createTRPCRouter({
  portal: permissionProcedure('portal:read').query(async ({ ctx }) => {
    const links = await ctx.db.familyLink.findMany({
      where: { userId: ctx.session.user.id },
      select: { residentId: true, relationship: true },
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

    return residents.map((r) => ({
      ...r,
      relationship: links.find((l) => l.residentId === r.id)?.relationship ?? null,
    }));
  }),
});
