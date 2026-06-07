import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { forTenant } from '@vetlla/db';
import { auth } from '@/auth';
import { hasPermission, type Permission } from '@/lib/rbac';

// Contexto de cada request: incluye la sesión de Auth.js.
export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth();
  return { session, headers: opts.headers };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

/** Exige sesión iniciada. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/**
 * Exige sesión + tenant e inyecta `ctx.db`, un cliente Prisma con RLS fijada al
 * tenant del usuario. Toda query a través de `ctx.db` queda aislada por la base
 * de datos, no solo por el código. SUPERADMIN opera con bypass de RLS.
 */
export const tenantProcedure = protectedProcedure.use(({ ctx, next }) => {
  const { tenantId, role } = ctx.session.user;
  if (!tenantId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'El usuario no pertenece a ningún tenant.' });
  }
  const db = forTenant({ tenantId, bypassRls: role === 'SUPERADMIN' });
  return next({ ctx: { ...ctx, tenantId, db } });
});

/** Como `tenantProcedure` pero exige además un permiso concreto (RBAC). */
export function permissionProcedure(permission: Permission) {
  return tenantProcedure.use(({ ctx, next }) => {
    if (!hasPermission(ctx.session.user.role, permission)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `Falta el permiso "${permission}".` });
    }
    return next({ ctx });
  });
}
