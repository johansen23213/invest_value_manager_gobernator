import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  tenantProcedure,
} from '@/server/trpc';
import { permissionsFor } from '@/lib/rbac';
import { centersRouter } from '@/server/routers/centers';
import { unitsRouter } from '@/server/routers/units';
import { bedsRouter } from '@/server/routers/beds';
import { residentsRouter } from '@/server/routers/residents';
import { careRouter } from '@/server/routers/care';
import { copilotRouter } from '@/server/routers/copilot';
import { medicationsRouter } from '@/server/routers/medications';
import { carePlansRouter } from '@/server/routers/careplans';
import { familyRouter } from '@/server/routers/family';
import { auditRouter } from '@/server/routers/audit';
import { usersRouter } from '@/server/routers/users';
import { overviewRouter } from '@/server/routers/overview';

// Router raíz de la API tipada. Cada hito añade sus routers
// (centros, residentes, atención, medicación, copiloto...).
export const appRouter = createTRPCRouter({
  /** Healthcheck público. */
  health: publicProcedure.query(() => ({
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
  })),

  /** Datos del usuario autenticado y sus permisos efectivos. */
  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.session.user.id,
    email: ctx.session.user.email,
    name: ctx.session.user.name,
    role: ctx.session.user.role,
    tenantId: ctx.session.user.tenantId,
    permissions: permissionsFor(ctx.session.user.role),
  })),

  tenant: createTRPCRouter({
    /** Tenant actual (RLS garantiza que solo se ve el propio). */
    current: tenantProcedure.query(({ ctx }) => ctx.db.tenant.findFirst()),
  }),

  users: usersRouter,

  centers: centersRouter,
  units: unitsRouter,
  beds: bedsRouter,
  residents: residentsRouter,
  care: careRouter,
  copilot: copilotRouter,
  medications: medicationsRouter,
  carePlans: carePlansRouter,
  family: familyRouter,
  audit: auditRouter,
  overview: overviewRouter,
});

export type AppRouter = typeof appRouter;
