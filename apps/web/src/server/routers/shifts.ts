/**
 * Router de Cuadrantes/Turnos del personal + Cierre de turno firmado
 * (Épica D del core asistencial — ADR-0016 core-suficiente).
 *
 * RF-PRO-003/004: cuadrante con asignaciones + alerta de infra-cobertura.
 * RF-PRO-008/009/010/013: cierre de turno firmado (firma simple).
 *
 * FUERA DE ALCANCE (decisión CIO):
 *   RF-PRO-005 (tareas operativas desde el PIA) y RF-PRO-012 (alerta tareas
 *   PIA vencidas) → módulo de tareas propio, épica futura.
 *
 * Sub-routers:
 *
 *   shifts.template.*     — Plantillas de turno (RF-PRO-003)
 *     - template.list     (shifts:read)   — plantillas activas de un centro
 *     - template.upsert   (shifts:manage) — crear o actualizar plantilla
 *     - template.delete   (shifts:manage) — desactivar plantilla
 *
 *   shifts.assignment.*   — Asignaciones del cuadrante (RF-PRO-003)
 *     - assignment.list   (shifts:read)   — cuadrante mensual (centro + rango de fechas)
 *     - assignment.upsert (shifts:manage) — crear o actualizar asignación
 *     - assignment.delete (shifts:manage) — eliminar asignación
 *     - assignment.setStatus (shifts:manage) — marcar AUSENTE/SUSTITUIDO/etc. (audita)
 *
 *   shifts.coverage       (shifts:read)   — estado de cobertura de un turno (RF-PRO-004)
 *
 *   shifts.handover.*     — Cierre de turno firmado (RF-PRO-008/009/010/013)
 *     - handover.draft    (care:read)     — material pre-relleno para el cierre
 *     - handover.close    (care:write)    — cerrar y firmar el turno (audita)
 *     - handover.getForShift (care:read)  — leer el cierre para el turno entrante
 *
 * ENUM DE TURNO:
 *   Se importa NursingNoteShift (ya existente) bajo el alias conceptual StaffShift.
 *   Mismos literales MANANA/TARDE/NOCHE — coherencia con MAR y notas de enfermería.
 *
 * FIRMA SIMPLE (RF-PRO-013):
 *   El par closedById (userId autenticado) + closedAt (now() del servidor) ES la firma.
 *   La firma avanzada eIDAS queda pendiente de Q-008 (decisión CIO).
 *
 * HANDOVER DRAFT — IMPLEMENTACIÓN:
 *   El borrador del cierre de turno recupera:
 *     1. Notas de enfermería de categoría INCIDENCIA del turno/fecha/unidad
 *        (reutiliza el dato de NursingNote — mismo modelo que listForShiftHandover).
 *     2. Medicaciones NO_ADMINISTRADO del día para residentes activos del centro/unidad
 *        (el llamante debe pasar los datos del MAR o el router los obtiene inline).
 *   El enfoque más simple: leer NursingNote/INCIDENCIA en el router directamente
 *   (sin duplicar el cálculo del MAR — el MAR ya existe en el router de medications).
 *   Las medicaciones no administradas se devuelven como hint; el cliente las puede
 *   pre-rellenar en incidentsSummary. Decisión documentada aquí.
 *
 * COMPATIBILIDAD con /relevo:
 *   clinicalNotes.nursing.listForShiftHandover SIGUE FUNCIONANDO sin cambios.
 *   handover.draft lo llama internamente para obtener las notas de incidencia.
 *   handover.close persiste el cierre; handover.getForShift lo recupera.
 *   El módulo /relevo existente NO se rompe.
 *
 * PERMISOS:
 *   shifts:read   → AUXILIAR, SANITARIO, DIRECTOR, SUPERADMIN
 *   shifts:manage → DIRECTOR, SUPERADMIN
 *   care:read / care:write → AUXILIAR, SANITARIO, DIRECTOR (cierre de turno)
 *   FAMILIAR: sin acceso a ningún endpoint de este router.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  NursingNoteShift,
  NursingNoteCategory,
  AssignmentStatus,
  type TenantPrisma,
} from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import {
  coverageFor,
  type ShiftTemplateForCoverage,
  type ShiftAssignmentForCoverage,
} from '@/lib/shifts';

// ---------------------------------------------------------------------------
// Esquemas Zod exportados — el cliente los reutiliza para validar igual
// ---------------------------------------------------------------------------

/** Turno (alias de NursingNoteShift para el dominio de personal). */
export const StaffShiftSchema = z.nativeEnum(NursingNoteShift);
export type StaffShiftSchema = z.infer<typeof StaffShiftSchema>;

export const AssignmentStatusSchema = z.nativeEnum(AssignmentStatus);
export type AssignmentStatusSchema = z.infer<typeof AssignmentStatusSchema>;

// --- Plantillas ---

export const UpsertShiftTemplateInput = z.object({
  id:         z.string().optional(),           // si se pasa, es un update; si no, create
  centerId:   z.string().min(1),
  unitId:     z.string().min(1).optional(),
  name:       z.string().trim().min(1).max(200),
  shift:      StaffShiftSchema,
  startTime:  z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  endTime:    z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  minStaff:   z.number().int().min(1).max(100).default(1),
  active:     z.boolean().default(true),
});
export type UpsertShiftTemplateInput = z.infer<typeof UpsertShiftTemplateInput>;

export const ListShiftTemplatesInput = z.object({
  centerId:  z.string().min(1),
  activeOnly: z.boolean().default(true),
});
export type ListShiftTemplatesInput = z.infer<typeof ListShiftTemplatesInput>;

export const DeleteShiftTemplateInput = z.object({
  id: z.string().min(1),
});
export type DeleteShiftTemplateInput = z.infer<typeof DeleteShiftTemplateInput>;

// --- Asignaciones ---

export const UpsertShiftAssignmentInput = z.object({
  id:                z.string().optional(),
  userId:            z.string().min(1),
  date:              z.coerce.date(),
  shift:             StaffShiftSchema,
  unitId:            z.string().min(1).optional(),
  status:            AssignmentStatusSchema.default('PLANIFICADO'),
  substituteUserId:  z.string().min(1).optional(),
  notes:             z.string().trim().max(2000).optional(),
});
export type UpsertShiftAssignmentInput = z.infer<typeof UpsertShiftAssignmentInput>;

export const ListShiftAssignmentsInput = z.object({
  centerId:  z.string().min(1),
  dateFrom:  z.coerce.date(),
  dateTo:    z.coerce.date(),
  unitId:    z.string().min(1).optional(),
});
export type ListShiftAssignmentsInput = z.infer<typeof ListShiftAssignmentsInput>;

export const DeleteShiftAssignmentInput = z.object({
  id: z.string().min(1),
});
export type DeleteShiftAssignmentInput = z.infer<typeof DeleteShiftAssignmentInput>;

export const SetAssignmentStatusInput = z.object({
  id:               z.string().min(1),
  status:           AssignmentStatusSchema,
  substituteUserId: z.string().min(1).optional(),
  notes:            z.string().trim().max(2000).optional(),
});
export type SetAssignmentStatusInput = z.infer<typeof SetAssignmentStatusInput>;

// --- Cobertura ---

export const CoverageInput = z.object({
  centerId: z.string().min(1),
  date:     z.coerce.date(),
  shift:    StaffShiftSchema,
  unitId:   z.string().min(1).optional(),
});
export type CoverageInput = z.infer<typeof CoverageInput>;

// --- Handover ---

export const HandoverDraftInput = z.object({
  centerId: z.string().min(1),
  date:     z.coerce.date(),
  shift:    StaffShiftSchema,
  unitId:   z.string().min(1).optional(),
});
export type HandoverDraftInput = z.infer<typeof HandoverDraftInput>;

export const CloseHandoverInput = z.object({
  centerId:         z.string().min(1),
  date:             z.coerce.date(),
  shift:            StaffShiftSchema,
  unitId:           z.string().min(1).optional(),
  summary:          z.string().trim().min(1).max(20000),
  incidentsSummary: z.string().trim().max(10000).optional(),
  pendingTasks:     z.string().trim().max(10000).optional(),
});
export type CloseHandoverInput = z.infer<typeof CloseHandoverInput>;

export const GetHandoverForShiftInput = z.object({
  centerId: z.string().min(1),
  date:     z.coerce.date(),
  shift:    StaffShiftSchema,
  unitId:   z.string().min(1).optional(),
});
export type GetHandoverForShiftInput = z.infer<typeof GetHandoverForShiftInput>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertCenter(db: TenantPrisma, centerId: string) {
  const center = await db.center.findUnique({ where: { id: centerId }, select: { id: true } });
  if (!center) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Centro no encontrado.' });
  }
}

async function assertAssignment(db: TenantPrisma, id: string) {
  const a = await db.shiftAssignment.findUnique({ where: { id }, select: { id: true } });
  if (!a) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Asignación no encontrada.' });
  }
  return a;
}

function dayRange(date: Date): { gte: Date; lte: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return { gte: start, lte: end };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const shiftsRouter = createTRPCRouter({

  // =========================================================================
  // Plantillas de turno (RF-PRO-003)
  // =========================================================================

  template: createTRPCRouter({

    /**
     * Listar plantillas de un centro (activas o todas).
     * Permiso: shifts:read → AUXILIAR, SANITARIO, DIRECTOR.
     */
    list: permissionProcedure('shifts:read')
      .input(ListShiftTemplatesInput)
      .query(({ ctx, input }) => {
        return ctx.db.shiftTemplate.findMany({
          where: {
            centerId: input.centerId,
            ...(input.activeOnly ? { active: true } : {}),
          },
          include: {
            unit: { select: { id: true, name: true } },
          },
          orderBy: [{ shift: 'asc' }, { name: 'asc' }],
        });
      }),

    /**
     * Crear o actualizar una plantilla de turno.
     * Permiso: shifts:manage → DIRECTOR.
     */
    upsert: permissionProcedure('shifts:manage')
      .input(UpsertShiftTemplateInput)
      .mutation(async ({ ctx, input }) => {
        await assertCenter(ctx.db, input.centerId);

        if (input.id) {
          // Update
          const updated = await ctx.db.shiftTemplate.update({
            where: { id: input.id },
            data: {
              unitId:    input.unitId ?? null,
              name:      input.name,
              shift:     input.shift,
              startTime: input.startTime,
              endTime:   input.endTime,
              minStaff:  input.minStaff,
              active:    input.active,
            },
          });
          return updated;
        } else {
          // Create
          const created = await ctx.db.shiftTemplate.create({
            data: {
              tenantId:   ctx.tenantId,
              centerId:   input.centerId,
              unitId:     input.unitId ?? null,
              name:       input.name,
              shift:      input.shift,
              startTime:  input.startTime,
              endTime:    input.endTime,
              minStaff:   input.minStaff,
              active:     input.active,
              createdById: ctx.session.user.id,
            },
          });
          return created;
        }
      }),

    /**
     * Desactivar (soft-delete) una plantilla de turno.
     * Permiso: shifts:manage → DIRECTOR.
     */
    delete: permissionProcedure('shifts:manage')
      .input(DeleteShiftTemplateInput)
      .mutation(async ({ ctx, input }) => {
        const template = await ctx.db.shiftTemplate.findUnique({
          where: { id: input.id },
          select: { id: true },
        });
        if (!template) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Plantilla no encontrada.' });
        }
        await ctx.db.shiftTemplate.update({
          where: { id: input.id },
          data: { active: false },
        });
        return { deleted: true };
      }),
  }),

  // =========================================================================
  // Asignaciones del cuadrante (RF-PRO-003/004)
  // =========================================================================

  assignment: createTRPCRouter({

    /**
     * Cuadrante mensual: asignaciones de un centro para un rango de fechas.
     * Filtro opcional por unidad.
     * Permiso: shifts:read → AUXILIAR, SANITARIO, DIRECTOR.
     */
    list: permissionProcedure('shifts:read')
      .input(ListShiftAssignmentsInput)
      .query(async ({ ctx, input }) => {
        // Obtener los usuarios del tenant para que el cuadrante tenga nombres
        const assignments = await ctx.db.shiftAssignment.findMany({
          where: {
            // Filtrar asignaciones del centro dado: el centerId no está en la
            // tabla directamente (es dato del trabajador por unitId o implícito).
            // Estrategia: si se pasa unitId, filtrar por unitId.
            // Si no, devolver todas las asignaciones del tenant en el rango de fechas
            // para que el cliente filtre por los usuarios del centro.
            date: { gte: input.dateFrom, lte: input.dateTo },
            ...(input.unitId ? { unitId: input.unitId } : {}),
          },
          include: {
            user: { select: { id: true, name: true, email: true, jobTitle: true } },
            substituteUser: { select: { id: true, name: true, email: true, jobTitle: true } },
            unit: { select: { id: true, name: true } },
          },
          orderBy: [{ date: 'asc' }, { shift: 'asc' }],
        });
        return assignments;
      }),

    /**
     * Crear o actualizar una asignación en el cuadrante.
     * Si el par (tenantId, userId, date, shift) ya existe, hace upsert.
     * Permiso: shifts:manage → DIRECTOR.
     */
    upsert: permissionProcedure('shifts:manage')
      .input(UpsertShiftAssignmentInput)
      .mutation(async ({ ctx, input }) => {
        // Normalizar la fecha al inicio del día (solo se guarda el día)
        const date = new Date(input.date);
        date.setUTCHours(0, 0, 0, 0);

        const data = {
          unitId:           input.unitId ?? null,
          status:           input.status,
          substituteUserId: input.substituteUserId ?? null,
          notes:            input.notes ?? null,
          updatedAt:        new Date(),
        };

        const result = await ctx.db.shiftAssignment.upsert({
          where: {
            tenantId_userId_date_shift: {
              tenantId: ctx.tenantId,
              userId:   input.userId,
              date,
              shift:    input.shift,
            },
          },
          update: data,
          create: {
            tenantId:    ctx.tenantId,
            userId:      input.userId,
            date,
            shift:       input.shift,
            createdById: ctx.session.user.id,
            ...data,
          },
        });
        return result;
      }),

    /**
     * Eliminar una asignación del cuadrante.
     * Permiso: shifts:manage → DIRECTOR.
     */
    delete: permissionProcedure('shifts:manage')
      .input(DeleteShiftAssignmentInput)
      .mutation(async ({ ctx, input }) => {
        await assertAssignment(ctx.db, input.id);
        await ctx.db.shiftAssignment.delete({ where: { id: input.id } });
        return { deleted: true };
      }),

    /**
     * Cambiar el estado de una asignación (AUSENTE/SUSTITUIDO con sustituto, etc.).
     * Audita la acción para trazabilidad de ausencias.
     * Permiso: shifts:manage → DIRECTOR.
     */
    setStatus: permissionProcedure('shifts:manage')
      .input(SetAssignmentStatusInput)
      .mutation(async ({ ctx, input }) => {
        const existing = await ctx.db.shiftAssignment.findUnique({
          where:  { id: input.id },
          select: { id: true, userId: true, date: true, shift: true, status: true },
        });
        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Asignación no encontrada.' });
        }

        const updated = await ctx.db.shiftAssignment.update({
          where: { id: input.id },
          data:  {
            status:           input.status,
            substituteUserId: input.substituteUserId ?? null,
            notes:            input.notes ?? null,
            updatedAt:        new Date(),
          },
        });

        await ctx.audit({
          action:   'UPDATE',
          entity:   'ShiftAssignment',
          entityId: input.id,
          summary:  `Cambio de estado de asignación: ${existing.status} → ${input.status}${input.substituteUserId ? ` (sustituto: ${input.substituteUserId})` : ''}`,
          metadata: {
            assignmentId:     input.id,
            userId:           existing.userId,
            date:             existing.date.toISOString(),
            shift:            existing.shift,
            previousStatus:   existing.status,
            newStatus:        input.status,
            substituteUserId: input.substituteUserId ?? null,
          },
        });

        return updated;
      }),
  }),

  // =========================================================================
  // Cobertura de turno (RF-PRO-004 — alerta de infra-cobertura)
  // =========================================================================

  /**
   * Estado de cobertura de personal para un centro/turno/fecha.
   * Devuelve el resultado de coverageFor (lógica pura de lib/shifts.ts):
   *   { assigned, required, understaffed, noTemplate }
   *
   * El cliente usa understaffed=true para mostrar la alerta de infra-cobertura
   * en el cuadrante mensual.
   *
   * Permiso: shifts:read → AUXILIAR, SANITARIO, DIRECTOR.
   */
  coverage: permissionProcedure('shifts:read')
    .input(CoverageInput)
    .query(async ({ ctx, input }) => {
      const dayRange_ = dayRange(input.date);

      const [templates, assignments] = await Promise.all([
        ctx.db.shiftTemplate.findMany({
          where: {
            centerId: input.centerId,
            active:   true,
            shift:    input.shift,
          },
          select: { unitId: true, shift: true, minStaff: true, active: true },
        }),
        ctx.db.shiftAssignment.findMany({
          where: {
            date:  dayRange_,
            shift: input.shift,
            ...(input.unitId ? { unitId: input.unitId } : {}),
          },
          select: {
            shift:           true,
            unitId:          true,
            status:          true,
            substituteUserId: true,
          },
        }),
      ]);

      const templatesMapped: ShiftTemplateForCoverage[] = templates.map((t) => ({
        unitId:   t.unitId,
        shift:    t.shift,
        minStaff: t.minStaff,
        active:   t.active,
      }));

      const assignmentsMapped: ShiftAssignmentForCoverage[] = assignments.map((a) => ({
        shift:           a.shift,
        unitId:          a.unitId,
        status:          a.status,
        substituteUserId: a.substituteUserId,
      }));

      return coverageFor(templatesMapped, assignmentsMapped, input.shift, input.unitId ?? null);
    }),

  // =========================================================================
  // Cierre de turno firmado (RF-PRO-008/009/010/013)
  // =========================================================================

  handover: createTRPCRouter({

    /**
     * Borrador pre-relleno para el cierre de turno (care:read).
     *
     * Devuelve:
     *   1. incidentNotes: notas de enfermería de categoría INCIDENCIA del
     *      turno/fecha/unidad del centro (reutiliza NursingNote directamente).
     *   2. existingHandover: si ya hay un cierre parcial guardado, lo devuelve
     *      para que el usuario pueda editar en lugar de sobrescribir en blanco.
     *   3. Hint de medicaciones no administradas: no se calcula inline aquí
     *      (requiere el MAR completo con la pauta). El cliente que llame a
     *      handover.draft debe complementarlo con medications.marForShift si
     *      quiere pre-rellenar las medicaciones no administradas. Se documenta
     *      esta decisión: el MAR ya existe y el cierre de turno no lo duplica.
     *
     * Permiso: care:read → AUXILIAR, SANITARIO, DIRECTOR.
     */
    draft: permissionProcedure('care:read')
      .input(HandoverDraftInput)
      .query(async ({ ctx, input }) => {
        const dayRange_ = dayRange(input.date);

        // 1. Notas de INCIDENCIA del turno/fecha/unidad
        const residents = await ctx.db.resident.findMany({
          where: {
            centerId: input.centerId,
            status:   'ACTIVO',
            ...(input.unitId ? { bed: { unitId: input.unitId } } : {}),
          },
          select: { id: true, firstName: true, lastName: true },
        });

        const residentIds = residents.map((r) => r.id);

        const incidentNotes = residentIds.length > 0
          ? await ctx.db.nursingNote.findMany({
              where: {
                residentId: { in: residentIds },
                shift:      input.shift,
                noteDate:   dayRange_,
                category:   NursingNoteCategory.INCIDENCIA,
              },
              include: {
                author: { select: { id: true, name: true, jobTitle: true } },
              },
              orderBy: { createdAt: 'desc' },
            })
          : [];

        // Enriquecer con datos del residente
        const residentMap = new Map(residents.map((r) => [r.id, r]));
        const incidentNotesWithResident = incidentNotes.map((n) => ({
          ...n,
          resident: residentMap.get(n.residentId) ?? null,
        }));

        // 2. Cierre ya existente (para reeditar)
        const existingHandover = await ctx.db.shiftHandover.findFirst({
          where: {
            centerId: input.centerId,
            date:     dayRange_,
            shift:    input.shift,
            ...(input.unitId ? { unitId: input.unitId } : { unitId: null }),
          },
          include: {
            closedBy: { select: { id: true, name: true } },
          },
        });

        return {
          incidentNotes: incidentNotesWithResident,
          existingHandover,
          // Nota: medicaciones no administradas → client debe llamar a medications.marForShift
          // (el MAR ya existe y el cierre de turno no lo duplica para evitar acoplamiento).
          medHint: 'Para completar el resumen de medicaciones no administradas, consulta el MAR del turno (medications.marForShift).',
        };
      }),

    /**
     * Cerrar y firmar el turno (RF-PRO-008/009/010/013).
     *
     * Crea o actualiza el ShiftHandover para el turno/unidad/día.
     * La firma simple: closedById = ctx.session.user.id (autenticado) +
     * closedAt = now() del servidor.
     *
     * Usa upsert para soportar el flujo de "cierre provisional + cierre definitivo":
     * si ya existe un cierre para ese turno, se actualiza con el nuevo contenido
     * y se firma de nuevo (el par closedById+closedAt se actualiza).
     *
     * Audita: action=SHIFT_HANDOVER, entity=ShiftHandover.
     *
     * Permiso: care:write → AUXILIAR, SANITARIO, DIRECTOR.
     */
    close: permissionProcedure('care:write')
      .input(CloseHandoverInput)
      .mutation(async ({ ctx, input }) => {
        await assertCenter(ctx.db, input.centerId);

        const date = new Date(input.date);
        date.setUTCHours(0, 0, 0, 0);
        const closedAt = new Date();

        // Para el upsert necesitamos encontrar el registro existente por los
        // índices únicos parciales (unitId puede ser NULL).
        const existing = await ctx.db.shiftHandover.findFirst({
          where: {
            centerId: input.centerId,
            date:     dayRange(date),
            shift:    input.shift,
            ...(input.unitId ? { unitId: input.unitId } : { unitId: null }),
          },
        });

        let handover;
        if (existing) {
          handover = await ctx.db.shiftHandover.update({
            where: { id: existing.id },
            data: {
              summary:          input.summary,
              incidentsSummary: input.incidentsSummary ?? null,
              pendingTasks:     input.pendingTasks ?? null,
              closedById:       ctx.session.user.id,
              closedAt,
            },
          });
        } else {
          handover = await ctx.db.shiftHandover.create({
            data: {
              tenantId:         ctx.tenantId,
              centerId:         input.centerId,
              unitId:           input.unitId ?? null,
              date,
              shift:            input.shift,
              summary:          input.summary,
              incidentsSummary: input.incidentsSummary ?? null,
              pendingTasks:     input.pendingTasks ?? null,
              closedById:       ctx.session.user.id,
              closedAt,
            },
          });
        }

        await ctx.audit({
          action:   'SHIFT_HANDOVER',
          entity:   'ShiftHandover',
          entityId: handover.id,
          summary:  `Cierre de turno ${input.shift} (${date.toISOString().split('T')[0]}) firmado por ${ctx.session.user.email ?? ctx.session.user.id}${input.unitId ? ` — unidad ${input.unitId}` : ''}`,
          metadata: {
            handoverId:  handover.id,
            centerId:    input.centerId,
            unitId:      input.unitId ?? null,
            date:        date.toISOString(),
            shift:       input.shift,
            closedById:  ctx.session.user.id,
            closedAt:    closedAt.toISOString(),
            isUpdate:    !!existing,
          },
        });

        return handover;
      }),

    /**
     * Obtener el cierre de turno para que lo lea el personal entrante.
     * RF-PRO-010: el turno entrante ve el resumen del turno saliente.
     *
     * Permiso: care:read → AUXILIAR, SANITARIO, DIRECTOR.
     */
    getForShift: permissionProcedure('care:read')
      .input(GetHandoverForShiftInput)
      .query(async ({ ctx, input }) => {
        const handover = await ctx.db.shiftHandover.findFirst({
          where: {
            centerId: input.centerId,
            date:     dayRange(input.date),
            shift:    input.shift,
            ...(input.unitId ? { unitId: input.unitId } : { unitId: null }),
          },
          include: {
            closedBy: { select: { id: true, name: true, jobTitle: true } },
            unit:     { select: { id: true, name: true } },
            center:   { select: { id: true, name: true } },
          },
        });

        if (!handover) {
          // No hay cierre todavía para este turno — no es un error, es estado válido.
          return null;
        }

        return handover;
      }),
  }),
});
