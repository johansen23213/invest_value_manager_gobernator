import { z } from 'zod';
import { CareRecordType, applyCareRecordPush } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

const fieldValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const incomingRecord = z.object({
  clientId: z.string().uuid(),
  residentId: z.string(),
  type: z.nativeEnum(CareRecordType),
  recordedAt: z.coerce.date(),
  payload: z.record(fieldValue),
  fieldTimestamps: z.record(z.string()),
});

export const careRouter = createTRPCRouter({
  /**
   * Sincroniza un lote de registros de atención (push desde el dispositivo).
   * Idempotente por clientId; aplica LWW por campo y registra conflictos.
   */
  push: permissionProcedure('care:write')
    .input(z.object({ records: z.array(incomingRecord).max(200) }))
    .mutation(({ ctx, input }) =>
      applyCareRecordPush(ctx.db, ctx.tenantId, ctx.session.user.id, input.records),
    ),

  /** Registros de un residente (más recientes primero). */
  listByResident: permissionProcedure('care:read')
    .input(z.object({ residentId: z.string(), limit: z.number().int().min(1).max(200).default(50) }))
    .query(({ ctx, input }) =>
      ctx.db.careRecord.findMany({
        where: { residentId: input.residentId },
        orderBy: { recordedAt: 'desc' },
        take: input.limit,
      }),
    ),
});
