import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { anonymizeResident, exportResidentData } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

// DSAR — derechos del interesado (INC-2). Solo Dirección/Superadmin
// (permiso dsar:manage). Toda operación queda en AuditLog.
export const dsarRouter = createTRPCRouter({
  /**
   * Export íntegro del expediente (art. 15/20). Devuelve el JSON y su SHA-256;
   * el cliente lo descarga como fichero. RLS garantiza el ámbito del tenant.
   */
  exportResident: permissionProcedure('dsar:manage')
    .input(z.object({ residentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await exportResidentData(ctx.db, ctx.tenantId, input.residentId);
      await ctx.audit({
        action: 'DSAR_EXPORT',
        entity: 'Resident',
        entityId: input.residentId,
        summary: 'Exportación de datos del interesado (art. 15)',
        metadata: { sha256: result.sha256 },
      });
      return result;
    }),

  /**
   * Supresión por anonimización (art. 17). Exige confirmación textual con el
   * apellido del residente (fricción deliberada: es irreversible). La política
   * de retención clínica es la default conservadora hasta que Angel decida (Q-003).
   */
  anonymizeResident: permissionProcedure('dsar:manage')
    .input(
      z.object({
        residentId: z.string(),
        confirmLastName: z.string().min(1),
        reason: z.string().min(5).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const resident = await ctx.db.resident.findUnique({
        where: { id: input.residentId },
        select: { lastName: true },
      });
      if (!resident) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
      }
      if (resident.lastName.trim().toLowerCase() !== input.confirmLastName.trim().toLowerCase()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'La confirmación no coincide con el apellido del residente.',
        });
      }
      const result = await anonymizeResident(ctx.db, ctx.tenantId, input.residentId);
      await ctx.audit({
        action: 'DSAR_ANONYMIZE',
        entity: 'Resident',
        entityId: input.residentId,
        summary: `Supresión del interesado (art. 17) — ${result.pseudonym}`,
        metadata: {
          reason: input.reason,
          pseudonym: result.pseudonym,
          contactsDeleted: result.contactsDeleted,
          familyLinksDeleted: result.familyLinksDeleted,
          clinicalRecordsKept: result.clinicalRecordsKept,
        },
      });
      return result;
    }),
});
