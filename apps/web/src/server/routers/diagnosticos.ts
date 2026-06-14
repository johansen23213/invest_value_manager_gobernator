/**
 * Router de diagnósticos con estado y ayudas técnicas (productos de apoyo).
 *
 * ---------------------------------------------------------------------------
 * Matriz RBAC
 * ---------------------------------------------------------------------------
 *
 * Diagnósticos (datos de salud — art. 9 RGPD):
 *   Lectura:   residents:read → DIRECTOR, SANITARIO, AUXILIAR
 *   Escritura: clinical:write → DIRECTOR, SANITARIO
 *   FAMILIAR:  sin acceso (dato clínico interno). El portal de familias no
 *              expone diagnósticos directamente; si en el futuro se quiere
 *              mostrar un resumen, debe ir por un endpoint específico con
 *              assertFamilyAccess. No se expone aquí por no existir ese
 *              patrón aún en el portal.
 *
 * Ayudas técnicas (productos de apoyo — dato clínico asociado al cuidado):
 *   Lectura:   residents:read → DIRECTOR, SANITARIO, AUXILIAR
 *   Escritura: clinical:write → DIRECTOR, SANITARIO
 *   FAMILIAR:  sin acceso (staff-only, igual que ResidentDevice).
 *
 * RBAC se implementa reutilizando `clinical:write` (ya existe para
 * diagnósticos, alergias, valoraciones) y `residents:read`. No se crean
 * permisos nuevos: estos dominios encajan perfectamente en la capa clínica
 * existente. Los auxiliares tienen lectura (residents:read) pero no escritura
 * (no tienen clinical:write), lo que es correcto para el rol asistencial.
 *
 * ---------------------------------------------------------------------------
 * Endpoints
 * ---------------------------------------------------------------------------
 *
 * diagnoses (sub-router):
 *   listForResident({ residentId })         → residents:read
 *   create(input)                           → clinical:write
 *   update({ id, ...campos })              → clinical:write
 *   transition({ id, residentId, next, resolvedAt? }) → clinical:write + lógica pura
 *   resolve({ id, residentId, resolvedAt }) → clinical:write (shortcut para RESUELTO)
 *
 * assistiveDevices (sub-router):
 *   listForResident({ residentId })         → residents:read
 *   create(input)                           → clinical:write
 *   update({ id, ...campos })              → clinical:write
 *   retire({ id, residentId, retiredAt })   → clinical:write
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { type TenantPrisma } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { validateDiagnosisTransition } from '@/lib/diagnosticos';

// ---------------------------------------------------------------------------
// Schemas Zod — importados desde el módulo CLIENT-SAFE (única fuente de verdad).
// Re-exportados para compatibilidad con módulos de servidor que los importen
// desde este router. Los ficheros CLIENTE deben importar directamente desde
// '@/lib/schemas/diagnosticos'.
// ---------------------------------------------------------------------------

import {
  createDiagnosisSchema,
  updateDiagnosisSchema,
  transitionDiagnosisSchema,
  createAssistiveDeviceSchema,
  updateAssistiveDeviceSchema,
  retireAssistiveDeviceSchema,
} from '@/lib/schemas/diagnosticos';

export {
  createDiagnosisSchema,
  updateDiagnosisSchema,
  transitionDiagnosisSchema,
  createAssistiveDeviceSchema,
  updateAssistiveDeviceSchema,
  retireAssistiveDeviceSchema,
};

// ---------------------------------------------------------------------------
// Guards de acceso
// ---------------------------------------------------------------------------

/** Verifica que el residente existe en el tenant (vía RLS) o lanza NOT_FOUND. */
async function assertResident(db: TenantPrisma, residentId: string) {
  const found = await db.resident.findUnique({ where: { id: residentId } });
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
  }
}

/** Verifica que un diagnóstico pertenece al residente indicado. */
async function assertDiagnosis(
  db: TenantPrisma,
  diagnosisId: string,
  residentId: string,
) {
  const dx = await db.diagnosis.findUnique({ where: { id: diagnosisId } });
  if (!dx || dx.residentId !== residentId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'El diagnóstico no pertenece a este residente.',
    });
  }
  return dx;
}

/** Verifica que una ayuda técnica pertenece al residente indicado. */
async function assertAssistiveDevice(
  db: TenantPrisma,
  deviceId: string,
  residentId: string,
) {
  const dev = await db.assistiveDevice.findUnique({ where: { id: deviceId } });
  if (!dev || dev.residentId !== residentId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'La ayuda técnica no pertenece a este residente.',
    });
  }
  return dev;
}

// ---------------------------------------------------------------------------
// Sub-router: diagnoses
// ---------------------------------------------------------------------------

const diagnosesRouter = createTRPCRouter({

  listForResident: permissionProcedure('residents:read')
    .input(z.object({ residentId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.db.diagnosis.findMany({
        where:   { residentId: input.residentId },
        orderBy: [{ status: 'asc' }, { diagnosedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ),

  create: permissionProcedure('clinical:write')
    .input(createDiagnosisSchema)
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);

      // Validar coherencia: RESUELTO requiere fecha de resolución
      if (input.status === 'RESUELTO' && !input.resolvedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Para crear un diagnóstico como RESUELTO debe indicarse la fecha de resolución.',
        });
      }

      const { residentId, ...rest } = input;
      const dx = await ctx.db.diagnosis.create({
        data: {
          ...rest,
          residentId,
          tenantId:       ctx.tenantId,
          prescribedById: ctx.session.user.id,
        },
      });

      await ctx.audit({
        action:   'CREATE',
        entity:   'Diagnosis',
        entityId: residentId,
        summary:  `Diagnóstico creado: ${input.description}${input.code ? ` (${input.code})` : ''} — ${input.type}, ${input.status}`,
        metadata: { type: input.type, status: input.status, code: input.code ?? null },
      });

      return dx;
    }),

  update: permissionProcedure('clinical:write')
    .input(updateDiagnosisSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await assertDiagnosis(ctx.db, input.id, input.residentId);
      const { id, residentId, ...data } = input;

      const dx = await ctx.db.diagnosis.update({
        where: { id },
        data,
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'Diagnosis',
        entityId: residentId,
        summary:  `Diagnóstico actualizado: ${dx.description}`,
        metadata: { diagnosisId: id, previousDescription: existing.description },
      });

      return dx;
    }),

  /** Cambia el estado del diagnóstico validando la transición con la lógica pura. */
  transition: permissionProcedure('clinical:write')
    .input(transitionDiagnosisSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await assertDiagnosis(ctx.db, input.id, input.residentId);

      const result = validateDiagnosisTransition(
        existing.status as 'ACTIVO' | 'CRONICO' | 'RESUELTO',
        input.next       as 'ACTIVO' | 'CRONICO' | 'RESUELTO',
        input.resolvedAt ?? null,
      );

      if (!result.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
      }

      const dx = await ctx.db.diagnosis.update({
        where: { id: input.id },
        data:  {
          status:    input.next,
          resolvedAt: input.next === 'RESUELTO' ? (input.resolvedAt ?? null) : null,
        },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'Diagnosis',
        entityId: input.residentId,
        summary:  `Estado del diagnóstico cambiado: ${existing.description} — ${existing.status} → ${input.next}`,
        metadata: {
          diagnosisId: input.id,
          from:        existing.status,
          to:          input.next,
          resolvedAt:  input.resolvedAt?.toISOString() ?? null,
        },
      });

      return dx;
    }),

  /** Shortcut para marcar un diagnóstico como RESUELTO con fecha. */
  resolve: permissionProcedure('clinical:write')
    .input(
      z.object({
        id:         z.string().min(1),
        residentId: z.string().min(1),
        resolvedAt: z.coerce.date(),
        notes:      z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await assertDiagnosis(ctx.db, input.id, input.residentId);

      const result = validateDiagnosisTransition(
        existing.status as 'ACTIVO' | 'CRONICO' | 'RESUELTO',
        'RESUELTO',
        input.resolvedAt,
      );

      if (!result.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
      }

      const dx = await ctx.db.diagnosis.update({
        where: { id: input.id },
        data:  {
          status:     'RESUELTO',
          resolvedAt: input.resolvedAt,
          notes:      input.notes ?? existing.notes ?? undefined,
        },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'Diagnosis',
        entityId: input.residentId,
        summary:  `Diagnóstico resuelto: ${existing.description} (${input.resolvedAt.toISOString().split('T')[0]})`,
        metadata: { diagnosisId: input.id, from: existing.status, resolvedAt: input.resolvedAt.toISOString() },
      });

      return dx;
    }),
});

// ---------------------------------------------------------------------------
// Sub-router: assistiveDevices
// ---------------------------------------------------------------------------

const assistiveDevicesRouter = createTRPCRouter({

  listForResident: permissionProcedure('residents:read')
    .input(z.object({ residentId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.db.assistiveDevice.findMany({
        where:   { residentId: input.residentId },
        orderBy: [{ status: 'asc' }, { prescribedAt: 'desc' }],
      }),
    ),

  create: permissionProcedure('clinical:write')
    .input(createAssistiveDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);

      const { residentId, ...rest } = input;
      const device = await ctx.db.assistiveDevice.create({
        data: {
          ...rest,
          residentId,
          tenantId:       ctx.tenantId,
          prescribedById: ctx.session.user.id,
        },
      });

      await ctx.audit({
        action:   'CREATE',
        entity:   'AssistiveDevice',
        entityId: residentId,
        summary:  `Ayuda técnica registrada: ${input.type}${input.description ? ` — ${input.description}` : ''} (${input.ownedByCenter ? 'del centro' : 'del residente'})`,
        metadata: { type: input.type, ownedByCenter: input.ownedByCenter },
      });

      return device;
    }),

  update: permissionProcedure('clinical:write')
    .input(updateAssistiveDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      await assertAssistiveDevice(ctx.db, input.id, input.residentId);
      const { id, residentId, ...data } = input;

      const device = await ctx.db.assistiveDevice.update({
        where: { id },
        data,
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'AssistiveDevice',
        entityId: residentId,
        summary:  `Ayuda técnica actualizada: ${device.type}`,
        metadata: { deviceId: id },
      });

      return device;
    }),

  /** Marca la ayuda técnica como retirada (no se borra, queda en historial). */
  retire: permissionProcedure('clinical:write')
    .input(retireAssistiveDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await assertAssistiveDevice(ctx.db, input.id, input.residentId);

      if (existing.status === 'RETIRADO') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'La ayuda técnica ya está marcada como retirada.',
        });
      }

      const device = await ctx.db.assistiveDevice.update({
        where: { id: input.id },
        data:  {
          status:    'RETIRADO',
          retiredAt: input.retiredAt,
          notes:     input.notes ?? existing.notes ?? undefined,
        },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'AssistiveDevice',
        entityId: input.residentId,
        summary:  `Ayuda técnica retirada: ${existing.type}${input.notes ? ` — ${input.notes}` : ''}`,
        metadata: { deviceId: input.id, type: existing.type, retiredAt: input.retiredAt.toISOString() },
      });

      return device;
    }),
});

// ---------------------------------------------------------------------------
// Router raíz del dominio
// ---------------------------------------------------------------------------

export const diagnosticosRouter = createTRPCRouter({
  diagnoses:        diagnosesRouter,
  assistiveDevices: assistiveDevicesRouter,
});
