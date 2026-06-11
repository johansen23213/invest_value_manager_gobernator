/**
 * Router de usuarios del tenant (R-04, R-01, R-03 Wave B).
 *
 * Incluye:
 * - `list`: devuelve también jobTitle (R-01) y excluye FAMILIAR por defecto.
 * - `listJobTitles`: devuelve los jobTitle únicos del tenant (mitigación R4).
 * - `updateRole`: mutación auditada (R-04).
 * - `updateProfile`: cambia jobTitle con auditoría (R-01, R-03).
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { UserRole } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { createAuthToken } from '@/server/account/tokens';
import { invitationEmail } from '@/server/account/emails';
import { sendEmail } from '@/server/email';
import { logger } from '@/server/logger';

// Roles que se pueden dar de alta desde /equipo (los del equipo del centro).
// FAMILIAR se gestiona en /equipo/familias (R-05); SUPERADMIN es de plataforma.
const TEAM_ROLES = [UserRole.DIRECTOR, UserRole.SANITARIO, UserRole.AUXILIAR] as const;

export const usersRouter = createTRPCRouter({
  /**
   * Usuarios del equipo del tenant.
   * - Aislados por RLS; requiere permiso users:read.
   * - Excluye FAMILIAR por defecto (tienen su propia sección en R-05).
   * - Devuelve jobTitle (R-01) para la pantalla de gestión de equipo (R-03).
   */
  list: permissionProcedure('users:read').query(({ ctx }) =>
    ctx.db.user.findMany({
      where: { role: { not: UserRole.FAMILIAR } },
      select: { id: true, email: true, name: true, role: true, jobTitle: true, lastLoginAt: true },
      orderBy: { email: 'asc' },
    }),
  ),

  /**
   * Alta de un miembro del equipo (DIRECTOR/SANITARIO/AUXILIAR) con una contraseña
   * provisional que la dirección comunica. Sin email transaccional en el MVP: se
   * muestra la credencial al crearla. Auditado (CREATE User).
   */
  invite: permissionProcedure('users:write')
    .input(
      z.object({
        email: z.string().trim().email(),
        name: z.string().trim().max(120).optional(),
        role: z.enum(TEAM_ROLES),
        jobTitle: z.string().trim().max(100).optional(),
        password: z.string().min(8).max(72),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase();
      const passwordHash = await bcrypt.hash(input.password, 10);
      let created;
      try {
        created = await ctx.db.user.create({
          data: {
            email,
            name: input.name ?? null,
            role: input.role,
            jobTitle: input.jobTitle ?? null,
            passwordHash,
            tenantId: ctx.tenantId,
          },
          select: { id: true, email: true, name: true, role: true, jobTitle: true },
        });
      } catch {
        throw new TRPCError({ code: 'CONFLICT', message: 'Ese email ya está en uso.' });
      }
      await ctx.audit({
        action: 'CREATE',
        entity: 'User',
        entityId: created.id,
        summary: `Alta de usuario ${email} con rol ${input.role} por ${ctx.session.user.email}`,
        metadata: { email, role: input.role, jobTitle: input.jobTitle ?? null },
      });
      return created;
    }),

  /**
   * Envía (o reenvía) a un usuario del equipo un enlace de "establece tu
   * contraseña" por email. Sustituye a comunicar contraseñas provisionales a
   * mano: el usuario fija su propia contraseña con un token de un solo uso.
   */
  sendAccessLink: permissionProcedure('users:write')
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, role: true },
      });
      if (!user || user.role === UserRole.FAMILIAR) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      }
      const tenant = await ctx.db.tenant.findFirst({ select: { name: true } });
      const token = await createAuthToken(user.id, 'INVITATION');
      const mail = invitationEmail(token, tenant?.name ?? 'tu centro');
      try {
        await sendEmail({ to: user.email, subject: mail.subject, text: mail.text });
      } catch {
        logger.error('users.access_link_failed', { userId: user.id });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'No se pudo enviar el correo. Revisa la configuración de email.',
        });
      }
      await ctx.audit({
        action: 'INVITE',
        entity: 'User',
        entityId: user.id,
        summary: `Enlace de acceso enviado a ${user.email} por ${ctx.session.user.email}`,
      });
      return { ok: true as const };
    }),

  /**
   * Devuelve los jobTitle únicos ya en uso en el tenant.
   * Usado para el Combobox de sugerencias al crear/editar usuarios (mitigación R4).
   */
  listJobTitles: permissionProcedure('users:read').query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { jobTitle: { not: null } },
      select: { jobTitle: true },
    });
    const unique = [...new Set(users.map((u) => u.jobTitle).filter(Boolean))] as string[];
    return unique.sort();
  }),

  /**
   * Cambia el rol de un usuario del tenant (R-04).
   *
   * Requiere permiso users:write (solo DIRECTOR y SUPERADMIN).
   * Registra en AuditLog: action UPDATE, entity User, con prevRole y newRole.
   *
   * NOTA R-03: la UI de gestión de usuarios que invoca esta mutación
   * se implementa en el Sprint siguiente (R-03). Este endpoint ya está
   * listo y auditado para cuando se conecte la pantalla.
   */
  updateRole: permissionProcedure('users:write')
    .input(
      z.object({
        userId: z.string(),
        newRole: z.nativeEnum(UserRole),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, role: true },
      });
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      }
      if (user.role === input.newRole) {
        // Idempotente: no hay cambio real, no auditamos.
        return user;
      }

      const prevRole = user.role;
      const updated = await ctx.db.user.update({
        where: { id: input.userId },
        data: { role: input.newRole },
        select: { id: true, email: true, role: true },
      });

      // R-04 — Auditoría RGPD: queda traza de quién cambió el rol de quién.
      await ctx.audit({
        action: 'UPDATE',
        entity: 'User',
        entityId: input.userId,
        summary: `Rol cambiado de ${prevRole} a ${input.newRole} en usuario ${user.email} por ${ctx.session.user.email}`,
        metadata: {
          prevRole,
          newRole: input.newRole,
          targetUserEmail: user.email,
        },
      });

      return updated;
    }),

  /**
   * Actualiza el jobTitle (etiqueta de función) de un usuario (R-01, R-03).
   *
   * Requiere users:write. Registra en AuditLog con prev/new jobTitle.
   * El campo es libre (String?) pero la UI lo sugiere desde presets del tenant.
   */
  updateProfile: permissionProcedure('users:write')
    .input(
      z.object({
        userId: z.string(),
        jobTitle: z.string().max(100).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, jobTitle: true },
      });
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado.' });
      }

      const prevJobTitle = user.jobTitle;
      const newJobTitle = input.jobTitle ?? null;

      if (prevJobTitle === newJobTitle) {
        return user;
      }

      const updated = await ctx.db.user.update({
        where: { id: input.userId },
        data: { jobTitle: newJobTitle },
        select: { id: true, email: true, jobTitle: true },
      });

      await ctx.audit({
        action: 'UPDATE',
        entity: 'User',
        entityId: input.userId,
        summary: `Función cambiada de "${prevJobTitle ?? '—'}" a "${newJobTitle ?? '—'}" en usuario ${user.email} por ${ctx.session.user.email}`,
        metadata: {
          prevJobTitle,
          newJobTitle,
          targetUserEmail: user.email,
        },
      });

      return updated;
    }),
});
