/**
 * Router de solicitudes del portal de familias (REQ-001..REQ-011).
 *
 * Aislamiento doble (igual que family.ts):
 *   1. RLS por tenant_id a nivel de BD.
 *   2. Para endpoints del FAMILIAR: verificación explícita de que el
 *      residente está vinculado al usuario vía FamilyLink.
 *
 * Permisos:
 *   requests:create → FAMILIAR: crea solicitudes de SUS residentes vinculados
 *                     y comenta/valora SUS solicitudes.
 *   requests:manage → DIRECTOR / SANITARIO / AUXILIAR: gestión completa
 *                     del tenant (ver todas, asignar, cambiar estado).
 *
 * Nota Q-004: adjuntos de fichero bloqueados hasta Q-004.
 * Los comentarios de texto cubren la evidencia textual por ahora.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  ServiceRequestCategory,
  ServiceRequestStatus,
  ServiceRequestPriority,
} from '@vetlla/db';
import { createTRPCRouter, permissionProcedure, tenantProcedure } from '@/server/trpc';
import { hasPermission } from '@/lib/rbac';
import { slaDueAt, canTransition, type SRCategory, type SRPriority, type SRStatus } from '@/lib/service-requests';
import { requestStatusChangedEmail } from '@/server/account/emails';
import { assertFamilyAccess } from '@/server/family-access';
import { sendEmailSafe } from '@/server/email/safe';
import { sendPushToUser } from '@/server/push';
import { buildPushPayload } from '@/server/push/payload';

// ---------------------------------------------------------------------------
// Esquemas Zod reutilizables (reutilizables en el cliente para validación igual)
// ---------------------------------------------------------------------------

export const ServiceRequestCategorySchema = z.nativeEnum(ServiceRequestCategory);
export const ServiceRequestStatusSchema = z.nativeEnum(ServiceRequestStatus);
export const ServiceRequestPrioritySchema = z.nativeEnum(ServiceRequestPriority);

export const CreateRequestInput = z.object({
  residentId:  z.string().min(1),
  category:    ServiceRequestCategorySchema,
  priority:    ServiceRequestPrioritySchema.default('NORMAL'),
  title:       z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
});

export const AddCommentInput = z.object({
  requestId: z.string().min(1),
  body:      z.string().trim().min(1).max(5000),
  internal:  z.boolean().default(false), // solo staff puede poner true; familiar siempre false
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const requestsRouter = createTRPCRouter({

  // -------------------------------------------------------------------------
  // CREATE — el familiar crea una solicitud para su residente vinculado
  // -------------------------------------------------------------------------

  create: permissionProcedure('requests:create')
    .input(CreateRequestInput)
    .mutation(async ({ ctx, input }) => {
      // Verificar vínculo familiar (aislamiento por residente, crítico)
      await assertFamilyAccess(ctx.db, ctx.session.user.id, input.residentId);

      const now = new Date();
      const due = slaDueAt(now, input.category as SRCategory, input.priority as SRPriority);

      const req = await ctx.db.serviceRequest.create({
        data: {
          tenantId:    ctx.tenantId,
          residentId:  input.residentId,
          createdById: ctx.session.user.id,
          category:    input.category,
          priority:    input.priority,
          status:      ServiceRequestStatus.RECIBIDA,
          title:       input.title,
          description: input.description,
          slaDueAt:    due,
        },
      });

      await ctx.audit({
        action:   'CREATE',
        entity:   'ServiceRequest',
        entityId: req.id,
        summary:  `Solicitud creada por familiar (${input.category}): "${input.title}"`,
        metadata: { residentId: input.residentId, category: input.category, priority: input.priority },
      });

      return req;
    }),

  // -------------------------------------------------------------------------
  // LIST_MINE — solicitudes de los residentes vinculados al familiar
  // -------------------------------------------------------------------------

  listMine: permissionProcedure('requests:create')
    .input(z.object({
      status: ServiceRequestStatusSchema.optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Obtener todos los residentes vinculados
      const links = await ctx.db.familyLink.findMany({
        where: { userId: ctx.session.user.id },
        select: { residentId: true },
      });
      const residentIds = links.map((l) => l.residentId);
      if (residentIds.length === 0) return [];

      const now = new Date();
      const requests = await ctx.db.serviceRequest.findMany({
        where: {
          residentId: { in: residentIds },
          ...(input?.status ? { status: input.status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          resident: { select: { id: true, firstName: true, lastName: true } },
          _count:   { select: { comments: { where: { internal: false } } } },
        },
      });

      return requests.map((r) => ({
        ...r,
        commentCount: r._count.comments,
        overdue: r.slaDueAt !== null && !['RESUELTA', 'CERRADA'].includes(r.status) && now > r.slaDueAt,
      }));
    }),

  // -------------------------------------------------------------------------
  // LIST_ALL — staff: todas las solicitudes del tenant con filtros opcionales
  // -------------------------------------------------------------------------

  listAll: permissionProcedure('requests:manage')
    .input(z.object({
      status:     ServiceRequestStatusSchema.optional(),
      category:   ServiceRequestCategorySchema.optional(),
      residentId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const requests = await ctx.db.serviceRequest.findMany({
        where: {
          ...(input?.status     ? { status: input.status }         : {}),
          ...(input?.category   ? { category: input.category }     : {}),
          ...(input?.residentId ? { residentId: input.residentId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          resident:   { select: { id: true, firstName: true, lastName: true } },
          createdBy:  { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          _count:     { select: { comments: true } },
        },
      });

      return requests.map((r) => ({
        ...r,
        commentCount: r._count.comments,
        overdue: r.slaDueAt !== null && !['RESUELTA', 'CERRADA'].includes(r.status) && now > r.slaDueAt,
      }));
    }),

  // -------------------------------------------------------------------------
  // GET — detalle + comentarios (familiar: solo sus residentes; staff: todos)
  // -------------------------------------------------------------------------

  get: tenantProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const isFamiliar = !hasPermission(role, 'requests:manage');

      // Verificar que tiene al menos uno de los dos permisos
      if (!hasPermission(role, 'requests:create') && !hasPermission(role, 'requests:manage')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin acceso al módulo de solicitudes.' });
      }

      const req = await ctx.db.serviceRequest.findUnique({
        where: { id: input.requestId },
        include: {
          resident:   { select: { id: true, firstName: true, lastName: true } },
          createdBy:  { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          comments: {
            orderBy: { createdAt: 'asc' },
            include: { author: { select: { id: true, name: true } } },
          },
        },
      });

      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitud no encontrada.' });

      // Si es familiar, verificar vínculo con el residente de la solicitud
      if (isFamiliar) {
        await assertFamilyAccess(ctx.db, ctx.session.user.id, req.residentId);
      }

      // Filtrar comentarios internos para el familiar
      const comments = isFamiliar
        ? req.comments.filter((c) => !c.internal)
        : req.comments;

      const now = new Date();
      return {
        ...req,
        comments,
        overdue: req.slaDueAt !== null && !['RESUELTA', 'CERRADA'].includes(req.status) && now > req.slaDueAt,
      };
    }),

  // -------------------------------------------------------------------------
  // ADD_COMMENT — familiar en sus solicitudes; staff en cualquiera
  // -------------------------------------------------------------------------

  addComment: tenantProcedure
    .input(AddCommentInput)
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const isFamiliar = !hasPermission(role, 'requests:manage');

      if (!hasPermission(role, 'requests:create') && !hasPermission(role, 'requests:manage')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin acceso al módulo de solicitudes.' });
      }

      const req = await ctx.db.serviceRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, residentId: true, firstResponseAt: true, status: true },
      });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitud no encontrada.' });

      if (isFamiliar) {
        // El familiar solo puede comentar sus solicitudes
        await assertFamilyAccess(ctx.db, ctx.session.user.id, req.residentId);
      }

      // El familiar no puede crear comentarios internos
      const internal = isFamiliar ? false : input.internal;

      const comment = await ctx.db.serviceRequestComment.create({
        data: {
          tenantId:  ctx.tenantId,
          requestId: input.requestId,
          authorId:  ctx.session.user.id,
          body:      input.body,
          internal,
        },
      });

      // REQ-005: registrar fecha de primera respuesta del staff
      if (!isFamiliar && req.firstResponseAt === null) {
        await ctx.db.serviceRequest.update({
          where: { id: input.requestId },
          data:  { firstResponseAt: new Date() },
        });
      }

      await ctx.audit({
        action:   'CREATE',
        entity:   'ServiceRequestComment',
        entityId: comment.id,
        summary:  `Comentario añadido a solicitud ${input.requestId}${internal ? ' (interno)' : ''}`,
        metadata: { requestId: input.requestId, internal },
      });

      return comment;
    }),

  // -------------------------------------------------------------------------
  // UPDATE_STATUS — staff: cambiar estado con validación de la máquina
  // -------------------------------------------------------------------------

  updateStatus: permissionProcedure('requests:manage')
    .input(z.object({
      requestId: z.string().min(1),
      status:    ServiceRequestStatusSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const req = await ctx.db.serviceRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id:          true,
          status:      true,
          title:       true,
          createdById: true,
          createdBy:   { select: { email: true } },
        },
      });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitud no encontrada.' });

      const fromStatus = req.status as SRStatus;
      const toStatus   = input.status as SRStatus;

      if (!canTransition(fromStatus, toStatus)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Transición no válida: ${fromStatus} → ${toStatus}.`,
        });
      }

      const now = new Date();
      const data: Record<string, unknown> = { status: input.status, updatedAt: now };
      if (input.status === ServiceRequestStatus.RESUELTA && !data.resolvedAt) {
        data.resolvedAt = now;
      }
      if (input.status === ServiceRequestStatus.CERRADA) {
        data.closedAt = now;
      }

      const updated = await ctx.db.serviceRequest.update({
        where: { id: input.requestId },
        data,
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'ServiceRequest',
        entityId: input.requestId,
        summary:  `Estado actualizado: ${fromStatus} → ${toStatus}`,
        metadata: { from: fromStatus, to: toStatus },
      });

      // REQ-008: notificar al familiar por email (no-throw si falla)
      await sendEmailSafe(
        { to: req.createdBy.email, ...requestStatusChangedEmail({ requestTitle: req.title, requestId: req.id, newStatus: input.status }) },
        { context: 'requests.updateStatus', requestId: input.requestId },
      );

      // RF-NOT-003: notificación push al familiar creador de la solicitud (no-throw).
      // El fallo de push NUNCA debe tumbar la operación principal.
      void sendPushToUser(
        ctx.db,
        req.createdById,
        buildPushPayload({
          type:        'service_request_status',
          requestId:   req.id,
          requestTitle: req.title,
          newStatus:   input.status,
          residentName: '',   // no cargamos el residente aquí para minimizar el impacto
        }),
      ).catch(() => {/* silenciado: el fallo de push no debe interrumpir la respuesta */});

      return updated;
    }),

  // -------------------------------------------------------------------------
  // ASSIGN — staff: asignar solicitud a un miembro del equipo
  // -------------------------------------------------------------------------

  assign: permissionProcedure('requests:manage')
    .input(z.object({
      requestId:    z.string().min(1),
      assignedToId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verificar que el asignado pertenece al tenant (RLS garantiza visibilidad)
      const assignee = await ctx.db.user.findUnique({
        where: { id: input.assignedToId },
        select: { id: true, tenantId: true },
      });
      if (!assignee) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado en el tenant.' });
      }

      const req = await ctx.db.serviceRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, status: true },
      });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitud no encontrada.' });

      // Si estaba RECIBIDA y se asigna, avanzar a ASIGNADA
      const nextStatus =
        req.status === ServiceRequestStatus.RECIBIDA
          ? ServiceRequestStatus.ASIGNADA
          : (req.status as ServiceRequestStatus);

      const updated = await ctx.db.serviceRequest.update({
        where: { id: input.requestId },
        data:  { assignedToId: input.assignedToId, status: nextStatus },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'ServiceRequest',
        entityId: input.requestId,
        summary:  `Solicitud asignada a usuario ${input.assignedToId}`,
        metadata: { assignedToId: input.assignedToId, status: nextStatus },
      });

      return updated;
    }),

  // -------------------------------------------------------------------------
  // REOPEN — familiar (sus solicitudes) o staff (cualquiera)
  // -------------------------------------------------------------------------

  reopen: tenantProcedure
    .input(z.object({ requestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const isFamiliar = !hasPermission(role, 'requests:manage');

      if (!hasPermission(role, 'requests:create') && !hasPermission(role, 'requests:manage')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Sin acceso al módulo de solicitudes.' });
      }

      const req = await ctx.db.serviceRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, status: true, residentId: true },
      });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitud no encontrada.' });

      if (isFamiliar) {
        await assertFamilyAccess(ctx.db, ctx.session.user.id, req.residentId);
      }

      const fromStatus = req.status as SRStatus;
      if (!canTransition(fromStatus, 'REABIERTA')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `La solicitud no puede reabrirse desde el estado ${fromStatus}.`,
        });
      }

      const updated = await ctx.db.serviceRequest.update({
        where: { id: input.requestId },
        data:  { status: ServiceRequestStatus.REABIERTA, resolvedAt: null, closedAt: null },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'ServiceRequest',
        entityId: input.requestId,
        summary:  `Solicitud reabierta desde ${fromStatus}`,
        metadata: { from: fromStatus, to: 'REABIERTA' },
      });

      return updated;
    }),

  // -------------------------------------------------------------------------
  // RATE — el familiar valora la solicitud (CSAT 1-5, REQ-009)
  // -------------------------------------------------------------------------

  rate: permissionProcedure('requests:create')
    .input(z.object({
      requestId:         z.string().min(1),
      satisfactionScore: z.number().int().min(1).max(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const req = await ctx.db.serviceRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, residentId: true, createdById: true, status: true },
      });
      if (!req) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitud no encontrada.' });

      // Solo el creador puede valorar
      if (req.createdById !== ctx.session.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el creador puede valorar esta solicitud.' });
      }

      // Verificar vínculo (aislamiento por residente)
      await assertFamilyAccess(ctx.db, ctx.session.user.id, req.residentId);

      // Solo si está RESUELTA o CERRADA
      if (!['RESUELTA', 'CERRADA'].includes(req.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Solo puedes valorar solicitudes resueltas o cerradas.',
        });
      }

      const updated = await ctx.db.serviceRequest.update({
        where: { id: input.requestId },
        data:  { satisfactionScore: input.satisfactionScore },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'ServiceRequest',
        entityId: input.requestId,
        summary:  `Solicitud valorada con CSAT ${input.satisfactionScore}/5`,
        metadata: { satisfactionScore: input.satisfactionScore },
      });

      return updated;
    }),
});
