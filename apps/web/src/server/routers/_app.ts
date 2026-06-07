import { createTRPCRouter, protectedProcedure, publicProcedure } from '@/server/trpc';

// Router raíz de la API tipada. Cada hito añade sus routers
// (centros, residentes, atención, medicación, copiloto...).
export const appRouter = createTRPCRouter({
  /** Healthcheck público. */
  health: publicProcedure.query(() => ({
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
  })),

  /** Datos del usuario autenticado (requiere sesión). */
  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.session.user.id,
    email: ctx.session.user.email,
    name: ctx.session.user.name,
    role: ctx.session.user.role,
    tenantId: ctx.session.user.tenantId,
  })),
});

export type AppRouter = typeof appRouter;
