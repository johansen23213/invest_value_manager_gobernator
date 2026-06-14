/**
 * Router de comunicaciones (COM-001..COM-011).
 *
 * Aislamiento doble (igual que requests.ts y family.ts):
 *   1. RLS por tenant_id a nivel de BD.
 *   2. Para endpoints del FAMILIAR: verificación explícita de que el
 *      residente está vinculado al usuario vía FamilyLink.
 *
 * Permisos:
 *   comms:broadcast → DIRECTOR + SUPERADMIN: publicar comunicados.
 *   comms:read      → FAMILIAR + DIRECTOR + SANITARIO + AUXILIAR: leer
 *                     comunicados y mensajes que les corresponden.
 *
 * PIEZA 1 — COMUNICADOS (Announcement):
 *   publishAnnouncement  · listAnnouncementsForMe
 *   markAnnouncementRead · acknowledgeAnnouncement
 *   announcementStats
 *
 * PIEZA 2 — MENSAJERÍA (MessageThread + Message):
 *   createThread · listThreads · getThread
 *   postMessage  · closeThread · reopenThread
 *
 * NOTA Q-004: adjuntos de fichero en mensajes quedan fuera de alcance hasta
 * que se resuelva el object storage (Q-004). Documentar en el TODO de postMessage.
 *
 * NOTA email masivo: publicar un comunicado NO envía email individualmente
 * aquí (por volumen). El TODO queda marcado; se implementará vía job/queue en Q-005.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  AnnouncementAudience,
  AnnouncementCategory,
  MessageThreadCategory,
  MessageThreadStatus,
} from '@vetlla/db';
import { createTRPCRouter, permissionProcedure, tenantProcedure } from '@/server/trpc';
import { hasPermission } from '@/lib/rbac';
import {
  computeRecipients,
  computeAnnouncementStats,
  validateAnnouncementAudience,
  type FamilyLinkMin,
  type ResidentMin,
} from '@/lib/announcements';
import { newMessageEmail } from '@/server/account/emails';
import { assertFamilyAccess } from '@/server/family-access';
import { sendEmailSafe } from '@/server/email/safe';
import { sendPushToUser } from '@/server/push';
import { buildPushPayload } from '@/server/push/payload';

// ---------------------------------------------------------------------------
// Esquemas Zod reutilizables (exportados para validación en cliente)
// ---------------------------------------------------------------------------

export const AnnouncementAudienceSchema = z.nativeEnum(AnnouncementAudience);
export const AnnouncementCategorySchema = z.nativeEnum(AnnouncementCategory);
export const MessageThreadCategorySchema = z.nativeEnum(MessageThreadCategory);
export const MessageThreadStatusSchema = z.nativeEnum(MessageThreadStatus);

export const PublishAnnouncementInput = z.object({
  title:      z.string().trim().min(3).max(160),
  body:       z.string().trim().min(10).max(10000),
  category:   AnnouncementCategorySchema.default('GENERAL'),
  audience:   AnnouncementAudienceSchema,
  unitId:     z.string().min(1).optional().nullable(),
  residentId: z.string().min(1).optional().nullable(),
  requiresAck: z.boolean().default(false),
  publishedAt: z.coerce.date().optional(), // permite programar la publicación
});

export const CreateThreadInput = z.object({
  residentId: z.string().min(1),
  subject:    z.string().trim().min(3).max(200),
  category:   MessageThreadCategorySchema.default('GENERAL'),
  body:       z.string().trim().min(1).max(5000), // primer mensaje
});

export const PostMessageInput = z.object({
  threadId: z.string().min(1),
  body:     z.string().trim().min(1).max(5000),
  // NOTA Q-004: campo `attachments` intencionadamente ausente.
  // Implementar cuando se resuelva Q-004 (object storage EU).
});

export const ListThreadsInput = z.object({
  status:     MessageThreadStatusSchema.optional(),
  category:   MessageThreadCategorySchema.optional(),
  residentId: z.string().optional(),
}).optional();

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

/** Devuelve true si el usuario es familiar (no tiene comms:broadcast). */
function isFamiliarRole(role: string): boolean {
  return !hasPermission(role as never, 'comms:broadcast');
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const commsRouter = createTRPCRouter({

  // =========================================================================
  // PIEZA 1 — COMUNICADOS
  // =========================================================================

  /**
   * Publicar un comunicado (COM-001).
   * Permiso: comms:broadcast (DIRECTOR + SUPERADMIN).
   * Valida unitId/residentId según audience.
   *
   * TODO Q-005: al publicar, encolar un job para enviar email a los destinatarios.
   * No se envía aquí por volumen (puede haber cientos de familiares).
   */
  publishAnnouncement: permissionProcedure('comms:broadcast')
    .input(PublishAnnouncementInput)
    .mutation(async ({ ctx, input }) => {
      // Validación de audiencia
      const audienceError = validateAnnouncementAudience(
        input.audience,
        input.unitId ?? null,
        input.residentId ?? null,
      );
      if (audienceError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: audienceError });
      }

      // Verificar que unitId pertenece al tenant (RLS lo garantiza, pero
      // comprobamos para devolver un error claro en caso de id inválido).
      if (input.unitId) {
        const unit = await ctx.db.unit.findUnique({
          where: { id: input.unitId },
          select: { id: true },
        });
        if (!unit) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Unidad no encontrada en este tenant.' });
        }
      }

      // Verificar que residentId pertenece al tenant
      if (input.residentId) {
        const resident = await ctx.db.resident.findUnique({
          where: { id: input.residentId },
          select: { id: true },
        });
        if (!resident) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado en este tenant.' });
        }
      }

      const announcement = await ctx.db.announcement.create({
        data: {
          tenantId:    ctx.tenantId,
          authorId:    ctx.session.user.id,
          title:       input.title,
          body:        input.body,
          category:    input.category,
          audience:    input.audience,
          unitId:      input.unitId ?? null,
          residentId:  input.residentId ?? null,
          requiresAck: input.requiresAck,
          publishedAt: input.publishedAt ?? new Date(),
        },
      });

      await ctx.audit({
        action:   'CREATE',
        entity:   'Announcement',
        entityId: announcement.id,
        summary:  `Comunicado publicado (${input.audience}): "${input.title}"`,
        metadata: {
          category:    input.category,
          audience:    input.audience,
          unitId:      input.unitId ?? null,
          residentId:  input.residentId ?? null,
          requiresAck: input.requiresAck,
        },
      });

      // TODO Q-005: encolar job para enviar email a los destinatarios calculados
      // por computeRecipients(). No se hace aquí para evitar latencia y timeouts.

      // RF-NOT-002: notificación push a los familiares destinatarios del comunicado.
      // Se ejecuta en background (void + catch) para no bloquear la respuesta al
      // publicador. Un fallo de push NUNCA debe tumbar la publicación del comunicado.
      void (async () => {
        try {
          // Calcular destinatarios (misma lógica que announcementStats)
          const [allFamilyLinks, allResidents] = await Promise.all([
            ctx.db.familyLink.findMany({ select: { userId: true, residentId: true } }),
            ctx.db.resident.findMany({
              select: { id: true, bedId: true, bed: { select: { unitId: true } } },
            }),
          ]);

          const recipientUserIds = computeRecipients(
            {
              audience:   announcement.audience,
              unitId:     announcement.unitId,
              residentId: announcement.residentId,
            },
            allFamilyLinks as FamilyLinkMin[],
            allResidents   as ResidentMin[],
          );

          const payload = buildPushPayload({
            type:           'announcement',
            title:          announcement.title,
            body:           announcement.body,
            announcementId: announcement.id,
          });

          // Enviar en paralelo a todos los destinatarios (fire-and-forget por usuario)
          await Promise.all(
            recipientUserIds.map((userId) =>
              sendPushToUser(ctx.db, userId, payload).catch(() => {/* silenciado */}),
            ),
          );
        } catch {
          // El bloque completo falla silenciosamente: el comunicado ya está publicado.
        }
      })();

      return announcement;
    }),

  /**
   * Listar comunicados que corresponden al usuario actual (COM-011).
   * - Familiar: comunicados de audiencia TODO_EL_CENTRO + POR_UNIDAD (su unidad)
   *   + RESIDENTE (sus residentes vinculados).
   * - Staff: todos los comunicados del tenant.
   * Incluye el receipt del usuario (readAt, acknowledgedAt).
   */
  listAnnouncementsForMe: permissionProcedure('comms:read')
    .query(async ({ ctx }) => {
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const isFamiliar = isFamiliarRole(role);

      if (!isFamiliar) {
        // Staff: todos los del tenant, con receipt del propio usuario
        return ctx.db.announcement.findMany({
          orderBy: { publishedAt: 'desc' },
          include: {
            receipts: {
              where: { userId },
              select: { readAt: true, acknowledgedAt: true },
            },
          },
        });
      }

      // Familiar: calcular qué comunicados le corresponden
      const familyLinks = await ctx.db.familyLink.findMany({
        where: { userId },
        select: { residentId: true },
      });
      const residentIds = familyLinks.map((fl) => fl.residentId);
      if (residentIds.length === 0) return [];

      // Obtener unidades de sus residentes (para filtrar POR_UNIDAD)
      const residents = await ctx.db.resident.findMany({
        where: { id: { in: residentIds } },
        select: {
          id: true,
          bed: { select: { unitId: true } },
        },
      });
      const unitIds = [...new Set(
        residents.flatMap((r) => r.bed ? [r.bed.unitId] : []),
      )];

      // Comunicados visibles: TODO_EL_CENTRO | POR_UNIDAD (en sus unidades) | RESIDENTE (sus residentes)
      const announcements = await ctx.db.announcement.findMany({
        where: {
          OR: [
            { audience: AnnouncementAudience.TODO_EL_CENTRO },
            { audience: AnnouncementAudience.POR_UNIDAD, unitId: { in: unitIds } },
            { audience: AnnouncementAudience.RESIDENTE,  residentId: { in: residentIds } },
          ],
        },
        orderBy: { publishedAt: 'desc' },
        include: {
          receipts: {
            where: { userId },
            select: { readAt: true, acknowledgedAt: true },
          },
        },
      });

      return announcements;
    }),

  /**
   * Marcar un comunicado como leído (COM-006).
   * Upsert del receipt con readAt = now si aún no tiene readAt.
   */
  markAnnouncementRead: permissionProcedure('comms:read')
    .input(z.object({ announcementId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verificar que el comunicado existe en el tenant
      const announcement = await ctx.db.announcement.findUnique({
        where: { id: input.announcementId },
        select: { id: true },
      });
      if (!announcement) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Comunicado no encontrado.' });
      }

      const now = new Date();
      const receipt = await ctx.db.announcementReceipt.upsert({
        where: {
          announcementId_userId: {
            announcementId: input.announcementId,
            userId,
          },
        },
        update: {
          readAt: now,
        },
        create: {
          tenantId:       ctx.tenantId,
          announcementId: input.announcementId,
          userId,
          readAt:         now,
        },
      });

      return receipt;
    }),

  /**
   * Registrar acuse de recibo de un comunicado (COM-010).
   * Solo válido en comunicados con requiresAck=true.
   * Upsert: si ya existe, añade acknowledgedAt.
   */
  acknowledgeAnnouncement: permissionProcedure('comms:read')
    .input(z.object({ announcementId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const announcement = await ctx.db.announcement.findUnique({
        where: { id: input.announcementId },
        select: { id: true, requiresAck: true, title: true },
      });
      if (!announcement) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Comunicado no encontrado.' });
      }
      if (!announcement.requiresAck) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Este comunicado no requiere acuse de recibo.',
        });
      }

      const now = new Date();
      const receipt = await ctx.db.announcementReceipt.upsert({
        where: {
          announcementId_userId: {
            announcementId: input.announcementId,
            userId,
          },
        },
        update: {
          readAt:         now,
          acknowledgedAt: now,
        },
        create: {
          tenantId:       ctx.tenantId,
          announcementId: input.announcementId,
          userId,
          readAt:         now,
          acknowledgedAt: now,
        },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'AnnouncementReceipt',
        entityId: receipt.id,
        summary:  `Acuse de recibo del comunicado "${announcement.title}"`,
        metadata: { announcementId: input.announcementId },
      });

      return receipt;
    }),

  /**
   * Estadísticas de un comunicado para dirección (COM-006).
   * Permiso: comms:broadcast (solo staff con capacidad de publicar ve las stats).
   * Devuelve: nº destinatarios calculados / leídos / acuses.
   */
  announcementStats: permissionProcedure('comms:broadcast')
    .input(z.object({ announcementId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const announcement = await ctx.db.announcement.findUnique({
        where: { id: input.announcementId },
        select: {
          id:         true,
          audience:   true,
          unitId:     true,
          residentId: true,
          requiresAck: true,
          receipts:   { select: { readAt: true, acknowledgedAt: true } },
        },
      });
      if (!announcement) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Comunicado no encontrado.' });
      }

      // Calcular destinatarios reales usando la función pura
      const [allFamilyLinks, allResidents] = await Promise.all([
        ctx.db.familyLink.findMany({ select: { userId: true, residentId: true } }),
        ctx.db.resident.findMany({
          select: {
            id:    true,
            bedId: true,
            bed:   { select: { unitId: true } },
          },
        }),
      ]);

      const recipientUserIds = computeRecipients(
        {
          audience:   announcement.audience,
          unitId:     announcement.unitId,
          residentId: announcement.residentId,
        },
        allFamilyLinks as FamilyLinkMin[],
        allResidents as ResidentMin[],
      );

      const stats = computeAnnouncementStats(recipientUserIds.length, announcement.receipts);
      return { ...stats, announcementId: input.announcementId };
    }),

  // =========================================================================
  // PIEZA 2 — MENSAJERÍA
  // =========================================================================

  /**
   * Crear un hilo de mensajería con su primer mensaje (COM-002).
   * Permiso: comms:read (tanto familiar como staff pueden iniciar).
   * Si el usuario es familiar, verifica vínculo con el residente.
   */
  createThread: permissionProcedure('comms:read')
    .input(CreateThreadInput)
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const familiar = isFamiliarRole(role);

      if (familiar) {
        await assertFamilyAccess(ctx.db, userId, input.residentId);
      } else {
        // Staff: verificar que el residente existe en el tenant
        const resident = await ctx.db.resident.findUnique({
          where: { id: input.residentId },
          select: { id: true },
        });
        if (!resident) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado en este tenant.' });
        }
      }

      const now = new Date();

      // Crear hilo y primer mensaje en una transacción
      const thread = await ctx.db.$transaction(async (tx) => {
        const t = await tx.messageThread.create({
          data: {
            tenantId:     ctx.tenantId,
            residentId:   input.residentId,
            subject:      input.subject,
            category:     input.category,
            createdById:  userId,
            lastMessageAt: now,
          },
        });
        await tx.message.create({
          data: {
            tenantId:           ctx.tenantId,
            threadId:           t.id,
            authorId:           userId,
            body:               input.body,
            readByStaffAt:      familiar ? null : now,
            readByFamilyAt:     familiar ? now  : null,
          },
        });
        return t;
      });

      await ctx.audit({
        action:   'CREATE',
        entity:   'MessageThread',
        entityId: thread.id,
        summary:  `Hilo creado: "${input.subject}"`,
        metadata: { residentId: input.residentId, category: input.category },
      });

      return thread;
    }),

  /**
   * Listar hilos de mensajería (COM-011 — bandeja de entrada).
   * - Familiar: solo hilos de sus residentes vinculados.
   * - Staff: todos los del tenant (con filtros opcionales de status/category).
   * Incluye el número de mensajes no leídos para el rol actual.
   */
  listThreads: permissionProcedure('comms:read')
    .input(ListThreadsInput)
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const familiar = isFamiliarRole(role);

      let residentIdFilter: string[] | undefined;

      if (familiar) {
        const links = await ctx.db.familyLink.findMany({
          where: { userId },
          select: { residentId: true },
        });
        if (links.length === 0) return [];
        residentIdFilter = links.map((l) => l.residentId);
      }

      const threads = await ctx.db.messageThread.findMany({
        where: {
          ...(residentIdFilter ? { residentId: { in: residentIdFilter } } : {}),
          ...(input?.status     ? { status: input.status }     : {}),
          ...(input?.category   ? { category: input.category } : {}),
          ...(input?.residentId ? { residentId: input.residentId } : {}),
        },
        orderBy: { lastMessageAt: 'desc' },
        include: {
          resident:  { select: { id: true, firstName: true, lastName: true } },
          createdBy: { select: { id: true, name: true } },
          _count:    { select: { messages: true } },
        },
      });

      // Calcular mensajes no leídos para el rol actual
      const threadIds = threads.map((t) => t.id);
      const unreadField = familiar ? 'readByFamilyAt' : 'readByStaffAt';

      const unreadCounts = await ctx.db.message.groupBy({
        by: ['threadId'],
        where: {
          threadId:    { in: threadIds },
          [unreadField]: null,
          // No contar los mensajes propios (el familiar no lee sus propios)
          authorId: { not: userId },
        },
        _count: { _all: true },
      });

      const unreadMap = new Map(unreadCounts.map((u) => [u.threadId, u._count._all]));

      return threads.map((t) => ({
        ...t,
        messageCount: t._count.messages,
        unreadCount:  unreadMap.get(t.id) ?? 0,
      }));
    }),

  /**
   * Obtener un hilo con sus mensajes (COM-002).
   * Verifica vínculo si es familiar.
   * Al leer, marca los mensajes del otro lado como leídos.
   */
  getThread: permissionProcedure('comms:read')
    .input(z.object({ threadId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const familiar = isFamiliarRole(role);

      const thread = await ctx.db.messageThread.findUnique({
        where: { id: input.threadId },
        include: {
          resident:  { select: { id: true, firstName: true, lastName: true } },
          createdBy: { select: { id: true, name: true } },
          messages: {
            orderBy: { createdAt: 'asc' },
            include: { author: { select: { id: true, name: true } } },
          },
        },
      });

      if (!thread) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hilo no encontrado.' });
      }

      // Si es familiar, verificar vínculo con el residente del hilo
      if (familiar) {
        await assertFamilyAccess(ctx.db, userId, thread.residentId);
      }

      // Marcar como leídos los mensajes del otro lado
      const now = new Date();
      const updateField = familiar ? 'readByFamilyAt' : 'readByStaffAt';
      // Solo actualizar mensajes que no son del usuario actual y aún no leídos
      await ctx.db.message.updateMany({
        where: {
          threadId:    input.threadId,
          authorId:    { not: userId },
          [updateField]: null,
        },
        data: { [updateField]: now },
      });

      return thread;
    }),

  /**
   * Añadir un mensaje a un hilo (COM-002).
   * Verifica acceso (vínculo si familiar).
   * Actualiza lastMessageAt del hilo.
   * Envía email no-throw a la otra parte.
   *
   * NOTA Q-004: adjuntos de fichero intencionadamente ausentes.
   * Implementar cuando se resuelva Q-004 (object storage EU).
   */
  postMessage: permissionProcedure('comms:read')
    .input(PostMessageInput)
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;
      const userId = ctx.session.user.id;
      const familiar = isFamiliarRole(role);

      const thread = await ctx.db.messageThread.findUnique({
        where: { id: input.threadId },
        select: {
          id:          true,
          residentId:  true,
          subject:     true,
          status:      true,
          createdById: true,
          resident:    { select: { firstName: true, lastName: true } },
          createdBy:   { select: { id: true, name: true, email: true } },
        },
      });
      if (!thread) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hilo no encontrado.' });
      }
      if (thread.status === MessageThreadStatus.CERRADO) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'El hilo está cerrado. Reabre el hilo antes de enviar un nuevo mensaje.',
        });
      }

      if (familiar) {
        await assertFamilyAccess(ctx.db, userId, thread.residentId);
      }

      const now = new Date();
      const residentName = `${thread.resident.firstName} ${thread.resident.lastName}`;

      const message = await ctx.db.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            tenantId:          ctx.tenantId,
            threadId:          input.threadId,
            authorId:          userId,
            body:              input.body,
            readByStaffAt:     familiar ? null : now,
            readByFamilyAt:    familiar ? now  : null,
          },
        });
        await tx.messageThread.update({
          where: { id: input.threadId },
          data:  { lastMessageAt: now },
        });
        return msg;
      });

      await ctx.audit({
        action:   'CREATE',
        entity:   'Message',
        entityId: message.id,
        summary:  `Mensaje enviado en hilo "${thread.subject}"`,
        metadata: { threadId: input.threadId, residentId: thread.residentId },
      });

      // Email no-throw a la otra parte
      // Si es familiar quien escribe → avisar al creador del hilo si es staff
      // Si es staff quien escribe → avisar al familiar que creó el hilo
      if (familiar) {
        // Familiar → staff: no hay email de centro disponible todavía.
        // TODO: cuando haya email genérico del centro en Tenant, enviarlo aquí.
        // Por ahora se omite el email al staff (no hay email individual claro).
      } else {
        // Staff → familiar: avisar al creador del hilo
        if (thread.createdBy.email) {
          await sendEmailSafe(
            {
              to: thread.createdBy.email,
              ...newMessageEmail({ threadSubject: thread.subject, threadId: input.threadId, residentName }),
            },
            { context: 'comms.postMessage', threadId: input.threadId },
          );
        }
      }

      return message;
    }),

  /**
   * Cerrar un hilo de mensajería (staff).
   * Permiso: comms:read con rol no familiar (staff solo).
   */
  closeThread: tenantProcedure
    .input(z.object({ threadId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;

      if (!hasPermission(role, 'comms:read') || isFamiliarRole(role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el staff puede cerrar hilos.' });
      }

      const thread = await ctx.db.messageThread.findUnique({
        where: { id: input.threadId },
        select: { id: true, status: true, subject: true },
      });
      if (!thread) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hilo no encontrado.' });
      }
      if (thread.status === MessageThreadStatus.CERRADO) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El hilo ya está cerrado.' });
      }

      const updated = await ctx.db.messageThread.update({
        where: { id: input.threadId },
        data:  { status: MessageThreadStatus.CERRADO },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'MessageThread',
        entityId: input.threadId,
        summary:  `Hilo cerrado: "${thread.subject}"`,
        metadata: { threadId: input.threadId },
      });

      return updated;
    }),

  /**
   * Reabrir un hilo cerrado (staff).
   * Permiso: staff (comms:read + no familiar).
   */
  reopenThread: tenantProcedure
    .input(z.object({ threadId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role;

      if (!hasPermission(role, 'comms:read') || isFamiliarRole(role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Solo el staff puede reabrir hilos.' });
      }

      const thread = await ctx.db.messageThread.findUnique({
        where: { id: input.threadId },
        select: { id: true, status: true, subject: true },
      });
      if (!thread) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hilo no encontrado.' });
      }
      if (thread.status === MessageThreadStatus.ABIERTO) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'El hilo ya está abierto.' });
      }

      const updated = await ctx.db.messageThread.update({
        where: { id: input.threadId },
        data:  { status: MessageThreadStatus.ABIERTO },
      });

      await ctx.audit({
        action:   'UPDATE',
        entity:   'MessageThread',
        entityId: input.threadId,
        summary:  `Hilo reabierto: "${thread.subject}"`,
        metadata: { threadId: input.threadId },
      });

      return updated;
    }),
});
