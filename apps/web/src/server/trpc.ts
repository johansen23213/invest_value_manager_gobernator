import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { forTenant, logAudit, type AuditEntry } from '@vetlla/db';
import { auth } from '@/auth';
import { hasPermission, type Permission } from '@/lib/rbac';
import { logger, requestLogger } from '@/server/logger';

export type AuditInput = Omit<AuditEntry, 'tenantId' | 'actorId' | 'actorEmail'>;

/**
 * Contexto de cada request tRPC: incluye la sesión de Auth.js y el logger
 * con correlation ID (x-request-id) propagado desde el middleware.
 * El requestId nunca contiene PII — es un UUID opaco generado por el middleware.
 */
export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth();
  // El middleware inyecta x-request-id en cada request (genera UUID si el
  // cliente no lo envía). Lo propagamos al logger de contexto para que todas
  // las líneas de log de esta petición compartan el mismo ID (OPS-A10).
  const requestId = opts.headers.get('x-request-id') ?? undefined;
  const log = requestId != null ? requestLogger(requestId) : logger;
  return { session, headers: opts.headers, requestId, log };
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

// INC-6 — Observabilidad: duración de cada procedure como log JSON sin PII
// (ruta, ok, ms). Umbral para no ensuciar: solo las lentas (>500 ms); los
// errores ya los traza el onError del route handler.
// OPS-A10: se usa ctx.log (con requestId) para correlacionar con otros logs.
const timingMiddleware = t.middleware(async ({ path, ctx, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;
  if (durationMs > 500) {
    ctx.log.warn('trpc.slow', { path, ok: result.ok, durationMs });
  }
  return result;
});

export const publicProcedure = t.procedure.use(timingMiddleware);

/** Exige sesión iniciada. */
export const protectedProcedure = t.procedure.use(timingMiddleware).use(({ ctx, next }) => {
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
  // Helper de trazabilidad: registra la acción con el actor y el tenant actuales.
  const audit = (entry: AuditInput) =>
    logAudit(db, {
      tenantId,
      actorId: ctx.session.user.id,
      actorEmail: ctx.session.user.email,
      ...entry,
    });
  return next({ ctx: { ...ctx, tenantId, db, audit } });
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

/**
 * Como `tenantProcedure` pero exige que el rol tenga AL MENOS UNO de los permisos
 * indicados (OR lógico). Útil cuando un mismo endpoint sirve a dos roles con permisos
 * distintos (p. ej. `requests:create` para FAMILIAR y `requests:manage` para staff).
 * SEC-A01: reemplaza el patrón `tenantProcedure` + `if (!hasPermission(...))` manual.
 */
export function anyPermissionProcedure(permissions: readonly Permission[]) {
  return tenantProcedure.use(({ ctx, next }) => {
    const role = ctx.session.user.role;
    const hasAny = permissions.some((p) => hasPermission(role, p));
    if (!hasAny) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Falta alguno de los permisos: ${permissions.join(', ')}.`,
      });
    }
    return next({ ctx });
  });
}
