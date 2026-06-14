/**
 * Router de gestión de exitus/baja (Épica B — RF-ADM-011/012/013).
 *
 * Cubre:
 *   - discharge.register  — registrar baja con transacción atómica (libera cama)
 *   - discharge.listByResident — histórico de bajas de un residente
 *
 * DISEÑO (transacción atómica):
 *   Al registrar una baja se ejecuta en una sola transacción:
 *     1. Crea DischargeRecord.
 *     2. Actualiza Resident.status=BAJA + dischargeDate + dischargeReason.
 *     3. Libera la cama (bedId=null) para que la plaza quede disponible.
 *   Si cualquier paso falla, todo revierte. La cama nunca queda ocupada por
 *   un residente dado de baja.
 *
 * PERMISOS:
 *   - residents:write → registrar la baja (DIRECTOR, SANITARIO).
 *   - residents:read  → ver el histórico (DIRECTOR, SANITARIO, AUXILIAR).
 *   - FAMILIAR: sin acceso (ningún endpoint de este router).
 *
 * AUDITORÍA:
 *   Siempre. Action=DISCHARGE. El summary incluye el tipo de baja y la fecha,
 *   pero NO la causa clínica de muerte (dato sensible: va en notes/certifiedBy
 *   del propio registro, no en el AuditLog donde puede ser más accesible).
 *
 * STAFF-ONLY: igual que NursingNote / MedicalNote. No se añade ningún endpoint
 * al portal de familias (family.ts) bajo ningún permiso accesible al FAMILIAR.
 */

import { TRPCError } from '@trpc/server';
import { Prisma, type TenantPrisma } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

// ---------------------------------------------------------------------------
// Schemas Zod — importados desde el módulo CLIENT-SAFE (única fuente de verdad).
// Re-exportados para compatibilidad con módulos de servidor que los importen
// desde este router. Los ficheros CLIENTE deben importar directamente desde
// '@/lib/schemas/discharge'.
// ---------------------------------------------------------------------------

import {
  DischargeTypeSchema,
  RegisterDischargeInput,
  ListDischargesByResidentInput,
} from '@/lib/schemas/discharge';

export {
  DischargeTypeSchema,
  RegisterDischargeInput,
  ListDischargesByResidentInput,
};

export type {
  RegisterDischargeInput as RegisterDischargeInputType,
  ListDischargesByResidentInput as ListDischargesByResidentInputType,
} from '@/lib/schemas/discharge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertResident(db: TenantPrisma, residentId: string) {
  const found = await db.resident.findUnique({
    where: { id: residentId },
    select: { id: true, status: true, bedId: true, firstName: true, lastName: true },
  });
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const dischargeRouter = createTRPCRouter({

  /**
   * Registrar baja del residente (RF-ADM-011/012/013).
   *
   * Transacción atómica:
   *   1. Crea DischargeRecord.
   *   2. Actualiza Resident → status=BAJA, dischargeDate, dischargeReason.
   *   3. Libera la cama (bedId=null) → plaza disponible.
   *
   * Permiso: residents:write (DIRECTOR, SANITARIO).
   */
  register: permissionProcedure('residents:write')
    .input(RegisterDischargeInput)
    .mutation(async ({ ctx, input }) => {
      const resident = await assertResident(ctx.db, input.residentId);

      // Ejecutar en transacción: RLS sigue activo dentro de $transaction porque
      // usamos la extensión forTenant() que fija los GUC por operación.
      // El orden garantiza integridad referencial y libera la plaza atómicamente.
      const [record] = await ctx.db.$transaction([
        // 1) Crear registro de baja
        ctx.db.dischargeRecord.create({
          data: {
            tenantId:           ctx.tenantId,
            residentId:         input.residentId,
            type:               input.type,
            dischargedAt:       input.dischargedAt,
            reason:             input.reason ?? null,
            certifiedBy:        input.certifiedBy ?? null,
            destination:        input.destination ?? null,
            familyNotifiedAt:   input.familyNotifiedAt ?? null,
            belongingsReturned: input.belongingsReturned,
            checklist:          input.checklist
              ? (input.checklist as Prisma.InputJsonValue)
              : Prisma.DbNull,
            notes:              input.notes ?? null,
            recordedById:       ctx.session.user.id,
          },
        }),
        // 2+3) Actualizar estado del residente y liberar cama
        ctx.db.resident.update({
          where: { id: input.residentId },
          data: {
            status:         'BAJA',
            dischargeDate:  input.dischargedAt,
            // dischargeReason en Resident es texto libre; guardamos el tipo.
            // La razón detallada queda en DischargeRecord.reason.
            dischargeReason: input.type,
            bedId:          null,  // liberar plaza
          },
        }),
      ]);

      // Auditar SIEMPRE. Action=DISCHARGE.
      // IMPORTANTE: el summary NO incluye la causa clínica (dato sensible).
      // Solo el tipo de baja y la fecha.
      await ctx.audit({
        action:   'DISCHARGE',
        entity:   'Resident',
        entityId: input.residentId,
        summary:  `Baja registrada: ${input.type} — ${input.dischargedAt.toISOString().split('T')[0]}`,
        metadata: {
          dischargeRecordId: record.id,
          type:              input.type,
          dischargedAt:      input.dischargedAt.toISOString(),
          // certifiedBy solo se registra en metadata si es defunción y está presente.
          ...(input.type === 'DEFUNCION' && input.certifiedBy
            ? { certifiedBy: input.certifiedBy }
            : {}),
          previousBedId: resident.bedId,
        },
      });

      return record;
    }),

  /**
   * Histórico de bajas de un residente.
   * Permite ver el historial de un residente que ha tenido varios ingresos/bajas.
   *
   * Permiso: residents:read (DIRECTOR, SANITARIO, AUXILIAR).
   */
  listByResident: permissionProcedure('residents:read')
    .input(ListDischargesByResidentInput)
    .query(({ ctx, input }) =>
      ctx.db.dischargeRecord.findMany({
        where:   { residentId: input.residentId },
        include: {
          recordedBy: { select: { id: true, name: true, jobTitle: true } },
        },
        orderBy: { dischargedAt: 'desc' },
      }),
    ),
});
