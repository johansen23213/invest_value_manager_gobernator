/**
 * Router de visitas (VIS-001..VIS-010).
 *
 * Aislamiento doble (igual que family.ts / requests.ts):
 *   1. RLS por tenant_id a nivel de BD.
 *   2. Para endpoints del FAMILIAR: verificación explícita de FamilyLink.
 *
 * Permisos:
 *   visits:request → FAMILIAR:
 *     - availability: ver franjas con disponibilidad de su centro.
 *     - request: solicitar visita para sus residentes vinculados.
 *     - listMine: ver sus visitas pasadas y futuras.
 *     - cancel: cancelar sus propias visitas (si canCancel).
 *
 *   visits:manage → DIRECTOR / AUXILIAR / SANITARIO (recepción):
 *     - availability: ídem (también necesitan verlo).
 *     - listForCenter: agenda del centro con filtros.
 *     - approve: SOLICITADA → CONFIRMADA + genera QR + email.
 *     - reject: SOLICITADA → RECHAZADA + motivo + email.
 *     - cancel: cancelar cualquier visita del tenant.
 *     - checkInByCode: recepción introduce/escanea código → EN_CURSO.
 *     - checkOut: EN_CURSO → COMPLETADA.
 *     - markNoShow: CONFIRMADA pasada → NO_SHOW.
 *
 *   centers:write → DIRECTOR (gestión de franjas):
 *     - slotConfig.list / slotConfig.upsert / slotConfig.delete
 *     (La configuración de franjas es configuración de centro; se reutiliza
 *     el permiso centers:write para no proliferar permisos innecesarios.)
 *
 * FUERA DE ALCANCE (P2/bloqueado):
 *   VIS-012: integración con control de accesos físico (IOT).
 *   Cuestionario previo.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { VisitStatus } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure, anyPermissionProcedure } from '@/server/trpc';
import { hasPermission } from '@/lib/rbac';
import {
  slotsForDate,
  generateVisitCode,
  canCancel,
  canVisitTransition,
  isSameLocalDate,
  CENTER_TIMEZONE,
  zonedParts,
  type SlotConfig,
  type VisitForSlot,
} from '@/lib/visits';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  visitConfirmedEmail,
  visitRejectedEmail,
  visitCancelledEmail,
} from '@/server/account/emails';
import { assertFamilyAccess } from '@/server/family-access';
import { sendEmailSafe } from '@/server/email/safe';
import { logger } from '@/server/logger';

// ALTO-03: mensaje de error ÚNICO y genérico para checkInByCode.
// No revela si el código no existe, está en estado incorrecto o es de otra fecha.
// Esto elimina el oracle binario que permitía enumeración de códigos QR.
const CHECK_IN_GENERIC_ERROR = 'Código no válido para hoy.';

// ALTO-03: rate limit en memoria para checkInByCode.
// Máximo 10 intentos fallidos por usuario por minuto (ventana deslizante).
// Suficiente para una instancia. LIMITACIÓN: en multi-instancia cada réplica
// tiene su propio contador; sustituir por Redis EU si se escala horizontalmente.
// Con rate limit de 10/min y espacio BASE32-8 (~10^12 combinaciones), la
// enumeración exhaustiva requeriría ~10^11 minutos = impráctica.
// El código se mantiene en 8 chars (no se amplía a 10): no rompe el seed ni la
// UX existente, y con rate limit el espacio es suficiente.
const CHECKIN_RL_MAX = 10;
const CHECKIN_RL_WINDOW_MS = 60_000; // 1 minuto

// ---------------------------------------------------------------------------
// Esquemas Zod reutilizables
// ---------------------------------------------------------------------------

export const VisitStatusSchema = z.nativeEnum(VisitStatus);

export const SlotConfigUpsertInput = z.object({
  id:          z.string().optional(), // si se pasa → update; si no → create
  centerId:    z.string().min(1),
  dayOfWeek:   z.number().int().min(0).max(6),
  startTime:   z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  endTime:     z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  capacity:    z.number().int().min(1).max(100),
  autoApprove: z.boolean().default(true),
  active:      z.boolean().default(true),
});

export const RequestVisitInput = z.object({
  residentId:   z.string().min(1),
  scheduledAt:  z.string().datetime({ message: 'scheduledAt debe ser ISO 8601 UTC' }),
  visitorNames: z.array(z.string().trim().min(1)).min(1).max(6),
  notes:        z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formatea una Date como string legible en es-ES para los emails. */
function formatDate(d: Date): string {
  return d.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}


// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const visitsRouter = createTRPCRouter({

  // =========================================================================
  // CONFIGURACIÓN DE FRANJAS (centers:write — solo DIRECTOR)
  // =========================================================================

  slotConfig: createTRPCRouter({

    /** Lista todas las franjas de un centro (ordenadas por día y hora). */
    list: permissionProcedure('centers:read')
      .input(z.object({ centerId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        return ctx.db.visitSlotConfig.findMany({
          where:   { centerId: input.centerId },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        });
      }),

    /** Crea o actualiza una franja horaria (solo DIRECTOR vía centers:write). */
    upsert: permissionProcedure('centers:write')
      .input(SlotConfigUpsertInput)
      .mutation(async ({ ctx, input }) => {
        // Verificar que el centro pertenece al tenant (RLS garantiza que no se
        // puede leer fuera del tenant, pero lo verificamos explícitamente).
        const center = await ctx.db.center.findUnique({
          where:  { id: input.centerId },
          select: { id: true },
        });
        if (!center) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Centro no encontrado.' });
        }

        if (input.id) {
          // Update
          const updated = await ctx.db.visitSlotConfig.update({
            where: { id: input.id },
            data:  {
              dayOfWeek:   input.dayOfWeek,
              startTime:   input.startTime,
              endTime:     input.endTime,
              capacity:    input.capacity,
              autoApprove: input.autoApprove,
              active:      input.active,
            },
          });
          await ctx.audit({
            action:   'UPDATE',
            entity:   'VisitSlotConfig',
            entityId: input.id,
            summary:  `Franja de visita actualizada (${input.startTime}-${input.endTime} día ${input.dayOfWeek})`,
            metadata: { centerId: input.centerId },
          });
          return updated;
        } else {
          // Create
          const created = await ctx.db.visitSlotConfig.create({
            data: {
              tenantId:    ctx.tenantId,
              centerId:    input.centerId,
              dayOfWeek:   input.dayOfWeek,
              startTime:   input.startTime,
              endTime:     input.endTime,
              capacity:    input.capacity,
              autoApprove: input.autoApprove,
              active:      input.active,
            },
          });
          await ctx.audit({
            action:   'CREATE',
            entity:   'VisitSlotConfig',
            entityId: created.id,
            summary:  `Franja de visita creada (${input.startTime}-${input.endTime} día ${input.dayOfWeek})`,
            metadata: { centerId: input.centerId },
          });
          return created;
        }
      }),

    /** Desactiva (baja lógica) una franja. No elimina físicamente para preservar historial. */
    delete: permissionProcedure('centers:write')
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const slot = await ctx.db.visitSlotConfig.findUnique({
          where:  { id: input.id },
          select: { id: true },
        });
        if (!slot) throw new TRPCError({ code: 'NOT_FOUND', message: 'Franja no encontrada.' });

        const updated = await ctx.db.visitSlotConfig.update({
          where: { id: input.id },
          data:  { active: false },
        });
        await ctx.audit({
          action:   'UPDATE',
          entity:   'VisitSlotConfig',
          entityId: input.id,
          summary:  'Franja de visita desactivada',
        });
        return updated;
      }),
  }),

  // =========================================================================
  // DISPONIBILIDAD (visits:request o visits:manage)
  // =========================================================================

  /**
   * Franjas disponibles de un centro para una fecha dada.
   * El frontend usa esto para el selector de franjas al solicitar una visita.
   * SEC-A03: anyPermissionProcedure reemplaza el check manual en tenantProcedure.
   */
  availability: anyPermissionProcedure(['visits:request', 'visits:manage'] as const)
    .input(z.object({
      centerId: z.string().min(1),
      date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
    }))
    .query(async ({ ctx, input }) => {
      // Parsear la fecha (se interpreta como medianoche UTC del día solicitado)
      const dateObj = new Date(`${input.date}T00:00:00Z`);
      if (isNaN(dateObj.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Fecha inválida.' });
      }

      // Rango UTC del día completo
      const dayStart = new Date(`${input.date}T00:00:00Z`);
      const dayEnd   = new Date(`${input.date}T23:59:59Z`);

      // Franjas activas del centro
      const configs = await ctx.db.visitSlotConfig.findMany({
        where:   { centerId: input.centerId, active: true },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });

      // Visitas no-canceladas del día (consumen capacidad)
      const existingVisits = await ctx.db.visit.findMany({
        where: {
          resident: { centerId: input.centerId },
          scheduledAt: { gte: dayStart, lte: dayEnd },
          status: { notIn: ['CANCELADA', 'RECHAZADA', 'NO_SHOW', 'COMPLETADA'] },
        },
        select: { scheduledAt: true, status: true },
      });

      const slotConfigs: SlotConfig[] = configs.map((c) => ({
        id:          c.id,
        dayOfWeek:   c.dayOfWeek,
        startTime:   c.startTime,
        endTime:     c.endTime,
        capacity:    c.capacity,
        autoApprove: c.autoApprove,
        active:      c.active,
      }));

      const visits: VisitForSlot[] = existingVisits.map((v) => ({
        scheduledAt: v.scheduledAt,
        status:      v.status as import('@/lib/visits').VisitStatus,
      }));

      return slotsForDate(slotConfigs, dateObj, visits);
    }),

  // =========================================================================
  // SOLICITAR VISITA (visits:request — FAMILIAR)
  // =========================================================================

  request: permissionProcedure('visits:request')
    .input(RequestVisitInput)
    .mutation(async ({ ctx, input }) => {
      // 1. Verificar vínculo familiar (aislamiento crítico)
      await assertFamilyAccess(ctx.db, ctx.session.user.id, input.residentId);

      const scheduledAt = new Date(input.scheduledAt);
      if (isNaN(scheduledAt.getTime())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Fecha de visita inválida.' });
      }
      if (scheduledAt <= new Date()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'La visita debe programarse en el futuro.',
        });
      }

      // 2. Verificar que el residente existe y obtener su centerId
      const resident = await ctx.db.resident.findUnique({
        where:  { id: input.residentId },
        select: { id: true, centerId: true, firstName: true, lastName: true },
      });
      if (!resident) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });

      // 3. Buscar franjas activas del centro para ese día
      const dateISO = scheduledAt.toISOString().slice(0, 10); // "YYYY-MM-DD"
      const dayStart = new Date(`${dateISO}T00:00:00Z`);
      const dayEnd   = new Date(`${dateISO}T23:59:59Z`);

      const configs = await ctx.db.visitSlotConfig.findMany({
        where: { centerId: resident.centerId, active: true },
      });

      const slotConfigs: SlotConfig[] = configs.map((c) => ({
        id:          c.id,
        dayOfWeek:   c.dayOfWeek,
        startTime:   c.startTime,
        endTime:     c.endTime,
        capacity:    c.capacity,
        autoApprove: c.autoApprove,
        active:      c.active,
      }));

      // 4. Validar que scheduledAt cae en una franja activa con capacidad
      // La convención es: scheduledAt = hora de inicio de la franja.
      // Usamos CENTER_TIMEZONE para weekday y HH:MM (Europe/Madrid) — jamás
      // mezclar getDay() local con getUTCHours() UTC (bug H-1).
      const { weekday: scheduledWeekday, timeHHMM } = zonedParts(scheduledAt, CENTER_TIMEZONE);

      const matchingSlot = slotConfigs.find(
        (s) => s.dayOfWeek === scheduledWeekday && s.startTime === timeHHMM,
      );
      if (!matchingSlot) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No existe una franja de visita activa para esa fecha y hora.',
        });
      }

      // 5 + 6. Verificar capacidad y crear en transacción Serializable (H-3).
      //
      // Sin lock, dos familiares reservando la última plaza de forma concurrente
      // leen occupied = capacity-1 ambos y ambos crean → sobreventa silenciosa.
      // Con isolationLevel Serializable, Postgres detecta el conflicto de lectura
      // y rechaza una de las dos transacciones con error 40001 (serialization failure).
      // Hacemos un reintento simple (1 vez) antes de relanzar el error al cliente.
      //
      // El patrón es idéntico al que ya usa comms.ts en createThread/postMessage.
      const autoApprove = matchingSlot.autoApprove;
      const initialStatus = autoApprove ? VisitStatus.CONFIRMADA : VisitStatus.SOLICITADA;
      const qrCode = autoApprove ? generateVisitCode() : null;

      async function runCreateVisit() {
        return ctx.db.$transaction(
          async (tx) => {
            const occupied = await tx.visit.count({
              where: {
                resident:    { centerId: resident!.centerId },
                scheduledAt: { gte: dayStart, lte: dayEnd },
                status:      { in: ['SOLICITADA', 'CONFIRMADA', 'EN_CURSO'] },
              },
            });
            if (occupied >= matchingSlot!.capacity) {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'La franja seleccionada ya no tiene plazas disponibles.',
              });
            }

            return tx.visit.create({
              data: {
                tenantId:      ctx.tenantId,
                residentId:    input.residentId,
                requestedById: ctx.session.user.id,
                scheduledAt,
                visitorNames:  input.visitorNames,
                status:        initialStatus,
                qrCode,
                notes:         input.notes ?? null,
                durationMin:   (parseInt(matchingSlot!.endTime.split(':')[0]!) - parseInt(matchingSlot!.startTime.split(':')[0]!)) * 60,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      }

      let visit: Awaited<ReturnType<typeof runCreateVisit>>;
      try {
        visit = await runCreateVisit();
      } catch (err) {
        // Reintento ante error de serialización de Postgres (código P2034 en Prisma
        // o el código Postgres 40001 serialization_failure).
        const isSerializationError =
          err instanceof Error &&
          (err.message.includes('P2034') ||
            err.message.includes('40001') ||
            err.message.includes('serializ'));
        if (isSerializationError) {
          // Un único reintento: si también falla, dejamos que suba al cliente.
          visit = await runCreateVisit();
        } else {
          throw err;
        }
      }

      await ctx.audit({
        action:   'CREATE',
        entity:   'Visit',
        entityId: visit.id,
        summary:  `Visita solicitada por familiar para ${resident.firstName} ${resident.lastName} (${scheduledAt.toISOString()})`,
        metadata: { residentId: input.residentId, status: initialStatus, autoApprove },
      });

      // 7. Si auto-aprobada, enviar email de confirmación (no-throw)
      if (autoApprove && qrCode) {
        const user = await ctx.db.user.findUnique({
          where:  { id: ctx.session.user.id },
          select: { email: true },
        });
        if (user?.email) {
          await sendEmailSafe(
            {
              to: user.email,
              ...visitConfirmedEmail({
                residentName: `${resident.firstName} ${resident.lastName}`,
                scheduledAt:  formatDate(scheduledAt),
                visitorNames: input.visitorNames as string[],
                qrCode,
                visitId: visit.id,
              }),
            },
            { context: 'visits.request.autoApprove', visitId: visit.id },
          );
        }
      }

      return visit;
    }),

  // =========================================================================
  // LISTADO (visits:request — MIS VISITAS)
  // =========================================================================

  listMine: permissionProcedure('visits:request')
    .input(z.object({
      status: VisitStatusSchema.optional(),
      limit:  z.number().int().min(1).max(100).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Obtener residentes vinculados al familiar
      const links = await ctx.db.familyLink.findMany({
        where:  { userId: ctx.session.user.id },
        select: { residentId: true },
      });
      const residentIds = links.map((l) => l.residentId);
      if (residentIds.length === 0) return [];

      return ctx.db.visit.findMany({
        where: {
          residentId: { in: residentIds },
          ...(input?.status ? { status: input.status } : {}),
        },
        orderBy: [{ scheduledAt: 'desc' }],
        take:    input?.limit ?? 50,
        include: {
          resident: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    }),

  // =========================================================================
  // AGENDA DEL CENTRO (visits:manage — STAFF)
  // =========================================================================

  listForCenter: permissionProcedure('visits:manage')
    .input(z.object({
      centerId: z.string().min(1),
      date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // si no se pasa, muestra hoy primero
      status:   VisitStatusSchema.optional(),
      limit:    z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const dateFilter = input.date
        ? {
            gte: new Date(`${input.date}T00:00:00Z`),
            lte: new Date(`${input.date}T23:59:59Z`),
          }
        : undefined;

      return ctx.db.visit.findMany({
        where: {
          resident:    { centerId: input.centerId },
          ...(dateFilter  ? { scheduledAt: dateFilter }   : {}),
          ...(input.status ? { status: input.status }     : {}),
        },
        orderBy: [{ scheduledAt: 'asc' }],
        take:    input.limit,
        include: {
          resident:    { select: { id: true, firstName: true, lastName: true } },
          requestedBy: { select: { id: true, name: true, email: true } },
        },
      });
    }),

  // =========================================================================
  // APROBACIÓN / RECHAZO (visits:manage — STAFF)
  // =========================================================================

  approve: permissionProcedure('visits:manage')
    .input(z.object({ visitId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const visit = await ctx.db.visit.findUnique({
        where:   { id: input.visitId },
        include: {
          resident:    { select: { id: true, firstName: true, lastName: true, centerId: true } },
          requestedBy: { select: { id: true, email: true } },
        },
      });
      if (!visit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Visita no encontrada.' });

      if (!canVisitTransition(visit.status as import('@/lib/visits').VisitStatus, 'CONFIRMADA')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No se puede confirmar una visita en estado ${visit.status}.`,
        });
      }

      const qrCode = generateVisitCode();

      const updated = await ctx.db.visit.update({
        where: { id: input.visitId },
        data:  { status: VisitStatus.CONFIRMADA, qrCode },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'Visit',
        entityId: visit.id,
        summary:  `Visita aprobada por staff (→ CONFIRMADA, QR generado)`,
        metadata: { from: visit.status, to: 'CONFIRMADA' },
      });

      // Email al familiar con el QR (no-throw)
      await sendEmailSafe(
        {
          to: visit.requestedBy.email,
          ...visitConfirmedEmail({
            residentName: `${visit.resident.firstName} ${visit.resident.lastName}`,
            scheduledAt:  formatDate(visit.scheduledAt),
            visitorNames: (visit.visitorNames as string[]) ?? [],
            qrCode,
            visitId:      visit.id,
          }),
        },
        { context: 'visits.approve', visitId: visit.id },
      );

      return updated;
    }),

  reject: permissionProcedure('visits:manage')
    .input(z.object({
      visitId: z.string().min(1),
      reason:  z.string().trim().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const visit = await ctx.db.visit.findUnique({
        where:   { id: input.visitId },
        include: {
          resident:    { select: { id: true, firstName: true, lastName: true } },
          requestedBy: { select: { email: true } },
        },
      });
      if (!visit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Visita no encontrada.' });

      if (!canVisitTransition(visit.status as import('@/lib/visits').VisitStatus, 'RECHAZADA')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No se puede rechazar una visita en estado ${visit.status}.`,
        });
      }

      const updated = await ctx.db.visit.update({
        where: { id: input.visitId },
        data:  { status: VisitStatus.RECHAZADA, cancelReason: input.reason },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'Visit',
        entityId: visit.id,
        summary:  `Visita rechazada por staff`,
        metadata: { from: visit.status, to: 'RECHAZADA', reason: input.reason },
      });

      // Email al familiar (no-throw)
      await sendEmailSafe(
        {
          to: visit.requestedBy.email,
          ...visitRejectedEmail({
            residentName: `${visit.resident.firstName} ${visit.resident.lastName}`,
            scheduledAt:  formatDate(visit.scheduledAt),
            reason:       input.reason,
            visitId:      visit.id,
          }),
        },
        { context: 'visits.reject', visitId: visit.id },
      );

      return updated;
    }),

  // =========================================================================
  // CANCELACIÓN (familiar: solo las suyas con canCancel; staff: cualquiera)
  // SEC-A03: anyPermissionProcedure reemplaza el check manual en tenantProcedure.
  // =========================================================================

  cancel: anyPermissionProcedure(['visits:request', 'visits:manage'] as const)
    .input(z.object({
      visitId: z.string().min(1),
      reason:  z.string().trim().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const isStaff = hasPermission(role, 'visits:manage');
      const isFamiliar = hasPermission(role, 'visits:request');

      const visit = await ctx.db.visit.findUnique({
        where:   { id: input.visitId },
        include: {
          resident:    { select: { id: true, firstName: true, lastName: true } },
          requestedBy: { select: { id: true, email: true } },
        },
      });
      if (!visit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Visita no encontrada.' });

      if (isFamiliar && !isStaff) {
        // El familiar solo puede cancelar sus propias visitas
        if (visit.requestedById !== ctx.session.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo puedes cancelar tus propias visitas.' });
        }
        if (!canCancel({ status: visit.status as import('@/lib/visits').VisitStatus, scheduledAt: visit.scheduledAt }, new Date())) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Esta visita no puede cancelarse (estado o fecha no lo permiten).',
          });
        }
      } else {
        // Staff: puede cancelar cualquier visita con transición válida
        if (!canVisitTransition(visit.status as import('@/lib/visits').VisitStatus, 'CANCELADA')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `No se puede cancelar una visita en estado ${visit.status}.`,
          });
        }
      }

      const updated = await ctx.db.visit.update({
        where: { id: input.visitId },
        data:  { status: VisitStatus.CANCELADA, cancelReason: input.reason },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'Visit',
        entityId: visit.id,
        summary:  `Visita cancelada (por ${isStaff ? 'staff' : 'familiar'})`,
        metadata: { from: visit.status, to: 'CANCELADA', reason: input.reason },
      });

      // Email a la otra parte
      const cancelledBy = isStaff ? 'staff' : 'familiar';
      const residentName = `${visit.resident.firstName} ${visit.resident.lastName}`;
      const scheduledAtStr = formatDate(visit.scheduledAt);

      if (isStaff) {
        // Notificar al familiar (no-throw)
        await sendEmailSafe(
          {
            to: visit.requestedBy.email,
            ...visitCancelledEmail({ residentName, scheduledAt: scheduledAtStr, reason: input.reason, cancelledBy: 'staff' }),
          },
          { context: 'visits.cancel.staff', visitId: visit.id },
        );
      } else {
        // El familiar canceló — se podría notificar al email del centro (si existiera)
        // Por ahora se deja como TODO (el centro puede ver la agenda actualizada)
        logger.info('visits.cancel.by_familiar', {
          visitId: visit.id,
          cancelledBy,
          residentName,
          scheduledAt: scheduledAtStr,
        });
      }

      return updated;
    }),

  // =========================================================================
  // CHECK-IN POR CÓDIGO (visits:manage — RECEPCIÓN)
  // =========================================================================

  /**
   * Recepción introduce o escanea el código QR del familiar.
   * Busca la visita por qrCode dentro del tenant.
   * Valida:
   *   - Existe y pertenece al tenant (RLS garantiza el aislamiento).
   *   - Estado CONFIRMADA.
   *   - scheduledAt es HOY (rechaza códigos de días pasados/futuros — "QR caducado").
   */
  checkInByCode: permissionProcedure('visits:manage')
    .input(z.object({ qrCode: z.string().min(1).max(20).toUpperCase() }))
    .mutation(async ({ ctx, input }) => {
      // ALTO-03a: rate limit por actor (usuario que usa recepción).
      // Si se supera: mismo error genérico (no revela el motivo).
      const rlKey = `checkin:${ctx.session.user.id}`;
      if (!checkRateLimit(rlKey, CHECKIN_RL_MAX, CHECKIN_RL_WINDOW_MS)) {
        logger.warn('visits.checkInByCode.rate_limited', { actorId: ctx.session.user.id });
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: CHECK_IN_GENERIC_ERROR });
      }

      // Buscar visita por código dentro del tenant (la unicidad es por tenant+qrCode)
      const visit = await ctx.db.visit.findFirst({
        where:   { qrCode: input.qrCode },
        include: {
          resident: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      // ALTO-03b: mensaje de error ÚNICO y genérico para no-existe / estado-incorrecto /
      // fecha-incorrecta. Elimina el oracle binario que permitía enumeración de códigos.
      if (!visit) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: CHECK_IN_GENERIC_ERROR });
      }

      if (visit.status !== VisitStatus.CONFIRMADA) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: CHECK_IN_GENERIC_ERROR });
      }

      // Verificar que la visita es de HOY en la TZ del centro (Europe/Madrid).
      // Antes se comparaba con toISOString().slice(0,10) que usa UTC: a las 22:30Z
      // en verano (00:30 Madrid del día siguiente) el QR válido se rechazaba
      // porque la "fecha UTC" ya era otro día. Se compara ahora en CENTER_TIMEZONE
      // para que el check sea correcto en la franja nocturna (bug H-1).
      if (!isSameLocalDate(visit.scheduledAt, new Date())) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: CHECK_IN_GENERIC_ERROR });
      }

      const updated = await ctx.db.visit.update({
        where: { id: visit.id },
        data:  { status: VisitStatus.EN_CURSO, checkInAt: new Date() },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'Visit',
        entityId: visit.id,
        summary:  'Check-in realizado (→ EN_CURSO)',
        metadata: { residentId: visit.residentId, qrCode: input.qrCode },
      });

      return updated;
    }),

  // =========================================================================
  // CHECK-OUT (visits:manage — RECEPCIÓN)
  // =========================================================================

  checkOut: permissionProcedure('visits:manage')
    .input(z.object({ visitId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const visit = await ctx.db.visit.findUnique({
        where:  { id: input.visitId },
        select: { id: true, status: true, residentId: true },
      });
      if (!visit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Visita no encontrada.' });

      if (!canVisitTransition(visit.status as import('@/lib/visits').VisitStatus, 'COMPLETADA')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No se puede registrar el check-out de una visita en estado ${visit.status}. Solo visitas EN_CURSO.`,
        });
      }

      const updated = await ctx.db.visit.update({
        where: { id: input.visitId },
        data:  { status: VisitStatus.COMPLETADA, checkOutAt: new Date() },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'Visit',
        entityId: visit.id,
        summary:  'Check-out registrado (→ COMPLETADA)',
        metadata: { residentId: visit.residentId },
      });

      return updated;
    }),

  // =========================================================================
  // MARCAR NO_SHOW (visits:manage — STAFF)
  // =========================================================================

  markNoShow: permissionProcedure('visits:manage')
    .input(z.object({ visitId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const visit = await ctx.db.visit.findUnique({
        where:  { id: input.visitId },
        select: { id: true, status: true, scheduledAt: true, residentId: true },
      });
      if (!visit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Visita no encontrada.' });

      if (!canVisitTransition(visit.status as import('@/lib/visits').VisitStatus, 'NO_SHOW')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No se puede marcar no-show para una visita en estado ${visit.status}.`,
        });
      }

      const updated = await ctx.db.visit.update({
        where: { id: input.visitId },
        data:  { status: VisitStatus.NO_SHOW },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'Visit',
        entityId: visit.id,
        summary:  'Visita marcada como NO_SHOW',
        metadata: { residentId: visit.residentId, scheduledAt: visit.scheduledAt },
      });

      return updated;
    }),
});
