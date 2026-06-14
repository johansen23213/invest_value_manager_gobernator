/**
 * Router de admisiones / preadmisión / forecast de ocupación.
 *
 * RBAC (ver lib/rbac.ts):
 *   admissions:manage → DIRECTOR, SUPERADMIN (crear, actualizar, transicionar)
 *   admissions:read   → DIRECTOR, SANITARIO, SUPERADMIN (leer, forecast)
 *   AUXILIAR y FAMILIAR: sin acceso (proceso interno del centro)
 *
 * Matriz RBAC de admisiones:
 *   SUPERADMIN → manage + read (todos los permisos)
 *   DIRECTOR   → manage + read (gestiona el proceso completo)
 *   SANITARIO  → read (participa en la evaluación clínica del candidato;
 *                aporta valoración clínica pero no gestiona el proceso)
 *   AUXILIAR   → sin acceso (no interviene en admisiones)
 *   FAMILIAR   → sin acceso (proceso interno del centro)
 *
 * Contrato de endpoints (para la UI posterior):
 *   admisiones.requests.list        — lista filtrada por estado/centro/unidad
 *   admisiones.requests.get         — detalle de una solicitud
 *   admisiones.requests.create      — nueva solicitud (LEAD por defecto)
 *   admisiones.requests.update      — actualizar datos del candidato / fechas / notas
 *   admisiones.requests.transition  — cambio de estado validado; al pasar a ADMITTED
 *                                     crea el Resident y vincula residentId
 *   admisiones.requests.close       — rechazar (REJECTED) o retirar (WITHDRAWN) con motivo
 *   admisiones.occupancy.forecast   — proyección de plazas libres en horizonte dado
 *
 * Nota sobre occupancy.current:
 *   Ya existe en overview.occupancy (permiso centers:read). No se duplica aquí.
 *
 * Creación del Resident al admitir (ADMITTED):
 *   Si no hay residentId previo: se crea un Resident mínimo con firstName, lastName,
 *   birthDate, centerId, dependencyGrade, admissionDate. El centro completa el
 *   expediente desde la ficha del residente.
 *   Si ya tiene residentId (reingreso): solo se vincula, no se crea otro Resident.
 *
 * AuditLog:
 *   Toda transición de estado registra action=ADMISSION_TRANSITION.
 *   La creación registra action=CREATE, entity=AdmissionRequest.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import {
  canTransition,
  occupancyForecast,
  type AdmissionStatus as DomainStatus,
  type PendingAdmission,
  type PendingDischarge,
} from '@/lib/ocupacion-forecast';

// ---------------------------------------------------------------------------
// Schemas Zod — importados desde el módulo CLIENT-SAFE (única fuente de verdad).
// Re-exportados para compatibilidad con módulos de servidor que los importen
// desde este router. Los ficheros CLIENTE deben importar directamente desde
// '@/lib/schemas/admisiones'.
// ---------------------------------------------------------------------------

import {
  admissionRequestCreateSchema,
  admissionRequestUpdateSchema,
  admissionTransitionSchema,
  admissionCloseSchema,
  AdmissionStatus,
} from '@/lib/schemas/admisiones';

export {
  admissionRequestCreateSchema,
  admissionRequestUpdateSchema,
  admissionTransitionSchema,
  admissionCloseSchema,
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const admisionesRouter = createTRPCRouter({
  requests: createTRPCRouter({
    /**
     * Lista filtrada de solicitudes. Admite filtros por estado, centro y unidad.
     * RLS garantiza aislamiento por tenant.
     */
    list: permissionProcedure('admissions:read')
      .input(
        z.object({
          status:   z.nativeEnum(AdmissionStatus).optional(),
          centerId: z.string().optional(),
          unitId:   z.string().optional(),
        }),
      )
      .query(({ ctx, input }) =>
        ctx.db.admissionRequest.findMany({
          where: {
            ...(input.status   ? { status:   input.status }   : {}),
            ...(input.centerId ? { centerId: input.centerId } : {}),
            ...(input.unitId   ? { unitId:   input.unitId }   : {}),
          },
          orderBy: [{ priority: 'asc' }, { requestedAt: 'asc' }],
          include: {
            center:   { select: { id: true, name: true } },
            unit:     { select: { id: true, name: true } },
            resident: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
      ),

    /**
     * Detalle de una solicitud concreta.
     */
    get: permissionProcedure('admissions:read')
      .input(z.object({ id: z.string() }))
      .query(({ ctx, input }) =>
        ctx.db.admissionRequest.findUniqueOrThrow({
          where: { id: input.id },
          include: {
            center:   { select: { id: true, name: true } },
            unit:     { select: { id: true, name: true } },
            resident: { select: { id: true, firstName: true, lastName: true, status: true } },
          },
        }),
      ),

    /**
     * Crea una nueva solicitud de admisión (estado inicial LEAD).
     */
    create: permissionProcedure('admissions:manage')
      .input(admissionRequestCreateSchema)
      .mutation(async ({ ctx, input }) => {
        // Verificar que el centro existe y pertenece al tenant (RLS)
        const center = await ctx.db.center.findUnique({ where: { id: input.centerId } });
        if (!center) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Centro no encontrado.' });
        }

        const request = await ctx.db.admissionRequest.create({
          data: {
            ...input,
            tenantId:    ctx.tenantId,
            createdById: ctx.session.user.id,
          },
        });

        await ctx.audit({
          action:   'CREATE',
          entity:   'AdmissionRequest',
          entityId: request.id,
          summary:  `Nueva solicitud de admisión: ${request.firstName} ${request.lastName}`,
        });

        return request;
      }),

    /**
     * Actualiza los datos del candidato, fechas o notas. No cambia el estado
     * (para eso usar `transition` o `close`).
     */
    update: permissionProcedure('admissions:manage')
      .input(admissionRequestUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;

        const existing = await ctx.db.admissionRequest.findUnique({ where: { id } });
        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitud no encontrada.' });
        }
        if (isTerminalStatusStr(existing.status)) {
          throw new TRPCError({
            code:    'BAD_REQUEST',
            message: `No se puede editar una solicitud en estado ${existing.status}.`,
          });
        }

        return ctx.db.admissionRequest.update({ where: { id }, data });
      }),

    /**
     * Transición de estado de la solicitud. Valida la transición con la máquina
     * de estados pura (canTransition). Al pasar a ADMITTED:
     *   1. Si residentId ya existe (reingreso): solo vincula.
     *   2. Si no existe: crea un Resident mínimo y vincula.
     * El AuditLog registra la transición siempre.
     */
    transition: permissionProcedure('admissions:manage')
      .input(admissionTransitionSchema)
      .mutation(async ({ ctx, input }) => {
        const { id, to, notes, admissionDate } = input;

        const request = await ctx.db.admissionRequest.findUnique({ where: { id } });
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitud no encontrada.' });
        }

        const fromStatus = request.status as DomainStatus;
        const toStatus   = to            as DomainStatus;

        if (!canTransition(fromStatus, toStatus)) {
          throw new TRPCError({
            code:    'BAD_REQUEST',
            message: `Transición ${fromStatus} → ${toStatus} no permitida.`,
          });
        }

        // --- Lógica específica para ADMITTED ---
        let residentId: string | null = request.residentId;

        if (toStatus === 'ADMITTED') {
          if (!residentId) {
            // Punto de integración: crear Resident mínimo a partir de los datos del candidato.
            // El equipo del centro completa el expediente desde la ficha del residente.
            // Los campos obligatorios de Resident son: tenantId, centerId, firstName, lastName.
            const newResident = await ctx.db.resident.create({
              data: {
                tenantId:        ctx.tenantId,
                centerId:        request.centerId,
                firstName:       request.firstName,
                lastName:        request.lastName,
                birthDate:       request.birthDate ?? undefined,
                dependencyGrade: request.dependencyGrade,
                status:          'ACTIVO',
                admissionDate:   admissionDate ?? request.expectedAdmissionDate ?? new Date(),
              },
            });
            residentId = newResident.id;

            await ctx.audit({
              action:   'CREATE',
              entity:   'Resident',
              entityId: newResident.id,
              summary:  `Residente creado por admisión desde solicitud ${request.id}: ${newResident.firstName} ${newResident.lastName}`,
            });
          }
        }

        // Notas: se acumulan (nueva nota se añade al historial)
        const updatedNotes = notes
          ? (request.notes ? `${request.notes}\n\n${notes}` : notes)
          : undefined;

        const updated = await ctx.db.admissionRequest.update({
          where: { id },
          data: {
            status:     to,
            residentId: residentId ?? undefined,
            ...(updatedNotes !== undefined ? { notes: updatedNotes } : {}),
          },
        });

        await ctx.audit({
          action:   'ADMISSION_TRANSITION',
          entity:   'AdmissionRequest',
          entityId: id,
          summary:  `Solicitud de admisión ${request.firstName} ${request.lastName}: ${fromStatus} → ${toStatus}`,
          metadata: { from: fromStatus, to: toStatus, residentId },
        });

        return updated;
      }),

    /**
     * Cierra la solicitud como REJECTED o WITHDRAWN con motivo opcional.
     */
    close: permissionProcedure('admissions:manage')
      .input(admissionCloseSchema)
      .mutation(async ({ ctx, input }) => {
        const { id, status, outcomeReason } = input;

        const request = await ctx.db.admissionRequest.findUnique({ where: { id } });
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitud no encontrada.' });
        }

        const fromStatus = request.status as DomainStatus;
        const toStatus   = status        as DomainStatus;

        if (!canTransition(fromStatus, toStatus)) {
          throw new TRPCError({
            code:    'BAD_REQUEST',
            message: `No se puede pasar de ${fromStatus} a ${toStatus}.`,
          });
        }

        const updated = await ctx.db.admissionRequest.update({
          where: { id },
          data:  { status, outcomeReason: outcomeReason ?? null },
        });

        await ctx.audit({
          action:   'ADMISSION_TRANSITION',
          entity:   'AdmissionRequest',
          entityId: id,
          summary:  `Solicitud ${request.firstName} ${request.lastName}: ${fromStatus} → ${toStatus}`,
          metadata: { from: fromStatus, to: toStatus, outcomeReason },
        });

        return updated;
      }),
  }),

  occupancy: createTRPCRouter({
    /**
     * Proyección de plazas libres en un horizonte dado para un centro/unidad.
     *
     * Input:
     *   centerId    — obligatorio
     *   unitId      — opcional (si se omite, proyecta a nivel de centro completo)
     *   horizonDays — número de días a proyectar (1–365; defecto 90)
     *
     * El forecast se calcula a partir de:
     *   - Plazas DISPONIBLES (status='DISPONIBLE') del centro/unidad
     *   - Ocupación actual (beds con residente)
     *   - Bajas previstas: residentes con dischargeDate futura
     *   - Admisiones previstas: solicitudes OFFERED con expectedAdmissionDate futura
     *
     * Permiso: admissions:read (DIRECTOR, SANITARIO, SUPERADMIN).
     * La ocupación actual ya está en overview.occupancy (centers:read); no se duplica.
     */
    forecast: permissionProcedure('admissions:read')
      .input(
        z.object({
          centerId:    z.string(),
          unitId:      z.string().optional(),
          horizonDays: z.number().int().min(1).max(365).default(90),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { centerId, unitId, horizonDays } = input;

        // --- 1. Plazas totales y ocupación actual ---
        const bedsWhere = unitId
          ? { unitId, unit: { centerId } }
          : { unit: { centerId } };

        const beds = await ctx.db.bed.findMany({
          where:  { ...bedsWhere, status: 'DISPONIBLE' },
          select: { id: true, resident: { select: { id: true } } },
        });

        const activeResidents = await ctx.db.resident.findMany({
          where: {
            centerId,
            status: 'ACTIVO',
            ...(unitId ? { bed: { unitId } } : {}),
          },
          select: { id: true, dischargeDate: true },
        });

        const totalBeds       = beds.length;
        const currentOccupied = beds.filter((b) => b.resident != null).length;

        // --- 2. Bajas previstas (residentes activos con dischargeDate futura) ---
        const now = new Date();
        const pendingDischarges: PendingDischarge[] = activeResidents
          .filter((r) => r.dischargeDate && r.dischargeDate > now)
          .map((r) => ({ residentId: r.id, dischargeDate: r.dischargeDate! }));

        // --- 3. Admisiones previstas (solicitudes OFFERED con expectedAdmissionDate) ---
        const pendingRequestsRaw = await ctx.db.admissionRequest.findMany({
          where: {
            centerId,
            status:               'OFFERED',
            expectedAdmissionDate: { not: null, gt: now },
            ...(unitId ? { unitId } : {}),
          },
          select: {
            id:                   true,
            expectedAdmissionDate: true,
            centerId:             true,
            unitId:               true,
          },
        });

        const pendingAdmissions: PendingAdmission[] = pendingRequestsRaw
          .filter((r) => r.expectedAdmissionDate != null)
          .map((r) => ({
            requestId:    r.id,
            expectedDate: r.expectedAdmissionDate!,
            centerId:     r.centerId,
            unitId:       r.unitId,
          }));

        // --- 4. Calcular forecast (lógica pura, sin BD) ---
        const result = occupancyForecast({
          totalBeds,
          currentOccupied,
          pendingDischarges,
          pendingAdmissions,
          horizonDays,
        });

        return {
          centerId,
          unitId:   unitId ?? null,
          ...result,
        };
      }),
  }),
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** True si el estado string es terminal (no permite edición). */
function isTerminalStatusStr(status: string): boolean {
  return status === 'ADMITTED' || status === 'REJECTED' || status === 'WITHDRAWN';
}
