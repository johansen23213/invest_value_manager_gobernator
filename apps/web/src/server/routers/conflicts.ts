import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

/**
 * Revisión humana de divergencias de sincronización offline (R-CONF).
 *
 * El LWW por campo (CareRecord) y por evento (MAR) ya RESOLVIÓ el dato de forma
 * determinista al sincronizar; lo que falta es que un humano VALIDE que esa
 * resolución es clínicamente aceptable. Esta cola surfacea las divergencias y
 * permite marcarlas como revisadas (auditado). Si el ganador del LWW es
 * incorrecto, el corrector vuelve a registrar el dato en su pantalla (MAR /
 * atención) — aquí no se re-resuelve a ciegas.
 *
 * Permisos: ver la cola requiere `care:read`; marcar revisado exige el juicio
 * clínico de `conflicts:review` (DIRECTOR/SANITARIO/SUPERADMIN, no AUXILIAR).
 * Aislado por RLS en ambas tablas.
 */
export const conflictsRouter = createTRPCRouter({
  /** Divergencias pendientes de revisar (ambos tipos), con contexto para decidir. */
  list: permissionProcedure('care:read').query(async ({ ctx }) => {
    const [care, medication] = await Promise.all([
      ctx.db.syncConflict.findMany({
        where: { reviewedAt: null },
        orderBy: { resolvedAt: 'desc' },
        take: 100,
        include: {
          careRecord: {
            select: {
              id: true,
              type: true,
              recordedAt: true,
              resident: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      ctx.db.medicationSyncConflict.findMany({
        where: { reviewedAt: null },
        orderBy: { resolvedAt: 'desc' },
        take: 100,
        include: {
          administration: {
            select: {
              id: true,
              scheduledAt: true,
              medication: { select: { id: true, name: true, dose: true } },
              resident: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    return {
      care: care.map((c) => ({
        id: c.id,
        field: c.field,
        winner: c.winner,
        serverValue: c.serverValue,
        clientValue: c.clientValue,
        resolvedAt: c.resolvedAt,
        recordType: c.careRecord.type,
        recordedAt: c.careRecord.recordedAt,
        residentId: c.careRecord.resident.id,
        residentName: `${c.careRecord.resident.firstName} ${c.careRecord.resident.lastName}`,
      })),
      medication: medication.map((m) => ({
        id: m.id,
        winner: m.winner,
        serverEvent: m.serverEvent,
        clientEvent: m.clientEvent,
        resolvedAt: m.resolvedAt,
        scheduledAt: m.administration.scheduledAt,
        medicationName: m.administration.medication.name,
        medicationDose: m.administration.medication.dose,
        residentId: m.administration.resident.id,
        residentName: `${m.administration.resident.firstName} ${m.administration.resident.lastName}`,
      })),
      pendingCount: care.length + medication.length,
    };
  }),

  /** Nº de divergencias pendientes (para el badge del menú/panel). Barato. */
  pendingCount: permissionProcedure('care:read').query(async ({ ctx }) => {
    const [care, medication] = await Promise.all([
      ctx.db.syncConflict.count({ where: { reviewedAt: null } }),
      ctx.db.medicationSyncConflict.count({ where: { reviewedAt: null } }),
    ]);
    return care + medication;
  }),

  /** Marca una divergencia como revisada por un humano (auditado). Idempotente. */
  acknowledge: permissionProcedure('conflicts:review')
    .input(z.object({ kind: z.enum(['care', 'medication']), id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const reviewedById = ctx.session.user.id;

      if (input.kind === 'care') {
        const existing = await ctx.db.syncConflict.findUnique({
          where: { id: input.id },
          select: { id: true, reviewedAt: true, field: true },
        });
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Divergencia no encontrada.' });
        if (existing.reviewedAt) return { ok: true as const }; // ya revisada
        await ctx.db.syncConflict.update({
          where: { id: input.id },
          data: { reviewedAt: now, reviewedById },
        });
        await ctx.audit({
          action: 'REVIEW_CONFLICT',
          entity: 'SyncConflict',
          entityId: input.id,
          summary: `Divergencia de atención (campo ${existing.field}) revisada por ${ctx.session.user.email}`,
        });
        return { ok: true as const };
      }

      const existing = await ctx.db.medicationSyncConflict.findUnique({
        where: { id: input.id },
        select: { id: true, reviewedAt: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Divergencia no encontrada.' });
      if (existing.reviewedAt) return { ok: true as const };
      await ctx.db.medicationSyncConflict.update({
        where: { id: input.id },
        data: { reviewedAt: now, reviewedById },
      });
      await ctx.audit({
        action: 'REVIEW_CONFLICT',
        entity: 'MedicationSyncConflict',
        entityId: input.id,
        summary: `Divergencia de medicación revisada por ${ctx.session.user.email}`,
      });
      return { ok: true as const };
    }),
});
