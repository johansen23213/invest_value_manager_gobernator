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
import { UserRole } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

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
      select: { id: true, email: true, name: true, role: true, jobTitle: true },
      orderBy: { email: 'asc' },
    }),
  ),

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
