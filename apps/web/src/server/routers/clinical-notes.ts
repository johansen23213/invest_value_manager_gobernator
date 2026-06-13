/**
 * Router de documentación clínica estructurada (Épica A del core asistencial).
 *
 * Cubre:
 *   - NursingNote (nursing_notes): notas de enfermería por turno
 *     (RF-ENF-001..011, RF-PRO-008/009 — traspaso de turno)
 *   - MedicalNote (medical_notes): evolución médica / evolutivos del médico
 *     (RF-CLI-001..006/009/011)
 *
 * DISEÑO DE ROUTER ÚNICO (vs. dos routers separados):
 *   Ambas entidades son documentación clínica narrativa vinculada al residente.
 *   Compartir un router evita dispersión, facilita que Dani importe un solo objeto
 *   (clinicalNotesRouter) y mantiene la cohesión con el patrón de clinical.ts.
 *
 * Permisos:
 *   NursingNote — crear: care:write (AUXILIAR + SANITARIO + DIRECTOR ya lo tienen).
 *                 leer:  care:read.
 *                 Decisión: care:* encaja sin crear permiso nuevo. La nota de turno
 *                 es un registro de atención directa (misma capa que CareRecord).
 *
 *   MedicalNote — crear: clinical:write (SANITARIO + DIRECTOR).
 *                 leer:  residents:read (staff únicamente; FAMILIAR NUNCA).
 *                 Decisión: clinical:write es el permiso correcto para documentación
 *                 clínica firmada por personal sanitario (misma capa que diagnósticos,
 *                 valoraciones, sujeciones).
 *
 * CONFIDENCIALIDAD (RF-CLI-010):
 *   MedicalNote es STAFF-ONLY. No se añade ningún endpoint al portal de familias
 *   (family.ts) ni se expone bajo ningún permiso accesible al rol FAMILIAR.
 *   El FAMILIAR tiene portal:read pero NO tiene care:read ni residents:read
 *   en modo staff, por lo que no puede acceder a ningún endpoint de este router.
 *
 * TRASPASO DE TURNO (RF-PRO-008/009):
 *   nursing.listForShiftHandover devuelve todas las notas del turno indicado
 *   para una fecha dada, agrupadas por residente dentro del centro/unidad.
 *   Permite al personal entrante revisar el estado de todos los residentes sin
 *   necesidad de entrar a cada expediente individual.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  NursingNoteShift,
  NursingNoteCategory,
  MedicalNoteType,
  type TenantPrisma,
} from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

// ---------------------------------------------------------------------------
// Esquemas Zod exportados — el cliente los reutiliza para validar igual
// ---------------------------------------------------------------------------

export const NursingNoteShiftSchema  = z.nativeEnum(NursingNoteShift);
export const NursingNoteCategorySchema = z.nativeEnum(NursingNoteCategory);
export const MedicalNoteTypeSchema   = z.nativeEnum(MedicalNoteType);

/** Input para crear una nota de enfermería. Exportado para el formulario del cliente. */
export const CreateNursingNoteInput = z.object({
  residentId: z.string().min(1),
  shift:      NursingNoteShiftSchema,
  noteDate:   z.coerce.date(),
  body:       z.string().trim().min(1).max(10000),
  category:   NursingNoteCategorySchema.optional().default('GENERAL'),
});
export type CreateNursingNoteInput = z.infer<typeof CreateNursingNoteInput>;

/** Input para listar notas por residente. */
export const ListNursingNotesByResidentInput = z.object({
  residentId: z.string().min(1),
  shift:      NursingNoteShiftSchema.optional(),
  dateFrom:   z.coerce.date().optional(),
  dateTo:     z.coerce.date().optional(),
});
export type ListNursingNotesByResidentInput = z.infer<typeof ListNursingNotesByResidentInput>;

/** Input para el traspaso de turno: notas de un turno/fecha para un centro completo. */
export const ListForShiftHandoverInput = z.object({
  centerId: z.string().min(1),
  unitId:   z.string().min(1).optional(), // filtrar por unidad si se especifica
  shift:    NursingNoteShiftSchema,
  noteDate: z.coerce.date(),
});
export type ListForShiftHandoverInput = z.infer<typeof ListForShiftHandoverInput>;

/** Input para crear un evolutivo médico. */
export const CreateMedicalNoteInput = z.object({
  residentId: z.string().min(1),
  noteDate:   z.coerce.date(),
  type:       MedicalNoteTypeSchema,
  reason:     z.string().trim().max(500).optional(),
  body:       z.string().trim().min(1).max(20000),
  plan:       z.string().trim().max(5000).optional(),
});
export type CreateMedicalNoteInput = z.infer<typeof CreateMedicalNoteInput>;

/** Input para listar evolutivos médicos por residente. */
export const ListMedicalNotesByResidentInput = z.object({
  residentId: z.string().min(1),
  type:       MedicalNoteTypeSchema.optional(),
  dateFrom:   z.coerce.date().optional(),
  dateTo:     z.coerce.date().optional(),
});
export type ListMedicalNotesByResidentInput = z.infer<typeof ListMedicalNotesByResidentInput>;

// ---------------------------------------------------------------------------
// Helper: verificar residente en el tenant (RLS filtra, pero damos error claro)
// ---------------------------------------------------------------------------

async function assertResident(db: TenantPrisma, residentId: string) {
  const found = await db.resident.findUnique({
    where: { id: residentId },
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

export const clinicalNotesRouter = createTRPCRouter({

  // =========================================================================
  // Notas de enfermería por turno (RF-ENF-001..011)
  // =========================================================================

  nursing: createTRPCRouter({

    /**
     * Registrar una nota de enfermería para un turno (RF-ENF-001..003).
     * Permiso: care:write → AUXILIAR, SANITARIO, DIRECTOR.
     * Audita: acción RECORD/CREATE sobre la entidad NursingNote.
     */
    create: permissionProcedure('care:write')
      .input(CreateNursingNoteInput)
      .mutation(async ({ ctx, input }) => {
        await assertResident(ctx.db, input.residentId);

        const note = await ctx.db.nursingNote.create({
          data: {
            tenantId:   ctx.tenantId,
            residentId: input.residentId,
            authorId:   ctx.session.user.id,
            shift:      input.shift,
            noteDate:   input.noteDate,
            body:       input.body,
            category:   input.category,
          },
        });

        await ctx.audit({
          action:   'RECORD',
          entity:   'NursingNote',
          entityId: input.residentId,
          summary:  `Nota de enfermería turno ${input.shift} (${note.category ?? 'GENERAL'}): ${input.body.slice(0, 100)}${input.body.length > 100 ? '…' : ''}`,
          metadata: {
            noteId:   note.id,
            shift:    input.shift,
            noteDate: input.noteDate.toISOString(),
            category: note.category,
          },
        });

        return note;
      }),

    /**
     * Listar notas de un residente (RF-ENF-005..007).
     * Filtros opcionales: turno y rango de fechas.
     * Permiso: care:read → AUXILIAR, SANITARIO, DIRECTOR.
     */
    listByResident: permissionProcedure('care:read')
      .input(ListNursingNotesByResidentInput)
      .query(({ ctx, input }) => {
        const dateFilter =
          input.dateFrom || input.dateTo
            ? {
                noteDate: {
                  ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                  ...(input.dateTo   ? { lte: input.dateTo   } : {}),
                },
              }
            : {};

        return ctx.db.nursingNote.findMany({
          where: {
            residentId: input.residentId,
            ...(input.shift ? { shift: input.shift } : {}),
            ...dateFilter,
          },
          include: {
            author: { select: { id: true, name: true, jobTitle: true } },
          },
          orderBy: [{ noteDate: 'desc' }, { createdAt: 'desc' }],
        });
      }),

    /**
     * Notas del turno actual para TODOS los residentes de un centro/unidad
     * (RF-PRO-008/009 — traspaso de turno).
     *
     * Devuelve las notas agrupadas por residente. El personal entrante puede
     * revisar el estado de cada residente sin navegar a cada expediente.
     *
     * Permiso: care:read.
     */
    listForShiftHandover: permissionProcedure('care:read')
      .input(ListForShiftHandoverInput)
      .query(async ({ ctx, input }) => {
        // Obtener residentes del centro (filtrado por unidad si se especifica).
        // RLS garantiza que solo se ven los del tenant.
        const residents = await ctx.db.resident.findMany({
          where: {
            centerId: input.centerId,
            status: 'ACTIVO',
            ...(input.unitId
              ? { bed: { unitId: input.unitId } }
              : {}),
          },
          select: {
            id:        true,
            firstName: true,
            lastName:  true,
            bed: { select: { id: true, code: true, unitId: true } },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });

        if (residents.length === 0) return [];

        const residentIds = residents.map((r) => r.id);

        // Normalizar la fecha a medianoche (solo día, sin hora) para comparar con noteDate.
        const dayStart = new Date(input.noteDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(input.noteDate);
        dayEnd.setHours(23, 59, 59, 999);

        const notes = await ctx.db.nursingNote.findMany({
          where: {
            residentId: { in: residentIds },
            shift: input.shift,
            noteDate: { gte: dayStart, lte: dayEnd },
          },
          include: {
            author: { select: { id: true, name: true, jobTitle: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        // Agrupar notas por residente
        const notesByResident = new Map<string, typeof notes>();
        for (const note of notes) {
          const existing = notesByResident.get(note.residentId) ?? [];
          existing.push(note);
          notesByResident.set(note.residentId, existing);
        }

        // Devolver la lista de residentes con sus notas (puede ser array vacío por residente)
        return residents.map((r) => ({
          resident: r,
          notes: notesByResident.get(r.id) ?? [],
        }));
      }),
  }),

  // =========================================================================
  // Evolutivos médicos — STAFF-ONLY (RF-CLI-001..006/009/011)
  // FAMILIAR NUNCA accede a estos endpoints.
  // =========================================================================

  medical: createTRPCRouter({

    /**
     * Registrar un evolutivo médico (RF-CLI-001/002).
     * Permiso: clinical:write → SANITARIO, DIRECTOR.
     * Audita con acción RECORD/CREATE.
     */
    create: permissionProcedure('clinical:write')
      .input(CreateMedicalNoteInput)
      .mutation(async ({ ctx, input }) => {
        await assertResident(ctx.db, input.residentId);

        const note = await ctx.db.medicalNote.create({
          data: {
            tenantId:   ctx.tenantId,
            residentId: input.residentId,
            authorId:   ctx.session.user.id,
            noteDate:   input.noteDate,
            type:       input.type,
            reason:     input.reason ?? null,
            body:       input.body,
            plan:       input.plan ?? null,
          },
        });

        await ctx.audit({
          action:   'RECORD',
          entity:   'MedicalNote',
          entityId: input.residentId,
          summary:  `Evolutivo médico (${input.type})${input.reason ? ` — motivo: ${input.reason.slice(0, 60)}` : ''}: ${input.body.slice(0, 80)}${input.body.length > 80 ? '…' : ''}`,
          metadata: {
            noteId:   note.id,
            type:     input.type,
            noteDate: input.noteDate.toISOString(),
          },
        });

        return note;
      }),

    /**
     * Listar evolutivos médicos de un residente (RF-CLI-003/004).
     * Permiso: residents:read (staff que puede ver el expediente).
     * El FAMILIAR no tiene residents:read en el contexto staff, así que
     * no puede llamar a este endpoint. STAFF-ONLY garantizado por permiso.
     */
    listByResident: permissionProcedure('residents:read')
      .input(ListMedicalNotesByResidentInput)
      .query(({ ctx, input }) => {
        const dateFilter =
          input.dateFrom || input.dateTo
            ? {
                noteDate: {
                  ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                  ...(input.dateTo   ? { lte: input.dateTo   } : {}),
                },
              }
            : {};

        return ctx.db.medicalNote.findMany({
          where: {
            residentId: input.residentId,
            ...(input.type ? { type: input.type } : {}),
            ...dateFilter,
          },
          include: {
            author: { select: { id: true, name: true, jobTitle: true } },
          },
          orderBy: [{ noteDate: 'desc' }, { createdAt: 'desc' }],
        });
      }),
  }),
});
