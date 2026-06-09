/**
 * Router de usuarios del tenant (R-04).
 *
 * Incluye la mutación `updateRole` con auditoría RGPD completa:
 * action: 'UPDATE', entity: 'User', summary con prev/new role,
 * metadata con prevRole, newRole y actorEmail.
 *
 * La pantalla de gestión de usuarios (/usuarios) es R-03, fuera del
 * alcance de la Semana 1. Esta mutación queda lista para cuando R-03
 * se implemente; mientras tanto es alcanzable vía tRPC directamente.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { UserRole } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';

export const usersRouter = createTRPCRouter({
  /** Usuarios del tenant. Aislados por RLS; requiere permiso users:read. */
  list: permissionProcedure('users:read').query(({ ctx }) =>
    ctx.db.user.findMany({
      select: { id: true, email: true, name: true, role: true },
      orderBy: { email: 'asc' },
    }),
  ),

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
});
