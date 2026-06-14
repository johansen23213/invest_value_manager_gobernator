/**
 * Router de actividades — animación sociocultural / terapia ocupacional.
 *
 * RBAC (ver lib/rbac.ts):
 *   activities:manage → DIRECTOR, AUXILIAR (TASOC/animador), SUPERADMIN
 *   activities:read   → DIRECTOR, AUXILIAR, SANITARIO, SUPERADMIN
 *   FAMILIAR → endpoint participationForResident (portal:read + assertFamilyAccess)
 *
 * Matriz RBAC de actividades:
 *   SUPERADMIN → manage + read (todos los permisos)
 *   DIRECTOR   → manage + read (responsable del programa de actividades)
 *   AUXILIAR   → manage + read (el TASOC/animador realiza la animación sociocultural)
 *   SANITARIO  → read (consulta la participación del residente como dato de bienestar)
 *   FAMILIAR   → participationForResident (lectura de actividades de SU residente)
 *
 * Contrato de endpoints (para la UI posterior):
 *   actividades.catalog.list        — catálogo de actividades (activas/todas)
 *   actividades.catalog.create      — nueva actividad en el catálogo
 *   actividades.catalog.update      — actualizar datos de una actividad
 *   actividades.catalog.archive     — desactivar una actividad (soft delete)
 *   actividades.sessions.list       — sesiones (filtro por actividad / fecha / estado)
 *   actividades.sessions.create     — programar sesión
 *   actividades.sessions.update     — actualizar horario o notas de la sesión
 *   actividades.sessions.cancel     — cancelar sesión (con motivo en notas) + AuditLog
 *   actividades.enrollments.enroll  — inscribir residente (con control de aforo + espera)
 *   actividades.enrollments.cancel  — cancelar inscripción (promueve primero en espera)
 *   actividades.enrollments.list    — inscripciones de una sesión
 *   actividades.attendance.record   — registrar asistencia (attended + observation)
 *   actividades.attendance.list     — listar asistencia de una sesión
 *   actividades.participationForResident — portal de familias (portal:read + FamilyLink)
 *
 * AuditLog:
 *   - Cancelación de sesión: action=CANCEL, entity=ActivitySession
 *   - Cancelación de inscripción: action=CANCEL, entity=ActivityEnrollment
 *   - Registro de asistencia: action=RECORD, entity=ActivityEnrollment
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { ActivitySessionStatus } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { prisma as basePrisma } from '@vetlla/db';
import { assertFamilyAccess } from '@/server/family-access';
import {
  canEnroll,
  canRecord,
  estadoInscripcion,
  primeroEnEspera,
  type InscripcionInfo,
} from '@/lib/actividades';

// ---------------------------------------------------------------------------
// Schemas Zod — importados desde el módulo CLIENT-SAFE (única fuente de verdad).
// Re-exportados para compatibilidad con módulos de servidor que los importen
// desde este router. Los ficheros CLIENTE deben importar directamente desde
// '@/lib/schemas/actividades'.
// ---------------------------------------------------------------------------

import {
  activityCreateSchema,
  activityUpdateSchema,
  sessionCreateSchema,
  sessionUpdateSchema,
  enrollSchema,
  attendanceSchema,
} from '@/lib/schemas/actividades';

export {
  activityCreateSchema,
  activityUpdateSchema,
  sessionCreateSchema,
  sessionUpdateSchema,
  enrollSchema,
  attendanceSchema,
};

// ---------------------------------------------------------------------------
// Sub-routers
// ---------------------------------------------------------------------------

const catalogRouter = createTRPCRouter({
  list: permissionProcedure('activities:read').input(z.object({
    onlyActive: z.boolean().default(true),
  })).query(async ({ ctx, input }) => {
    return ctx.db.activity.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(input.onlyActive ? { active: true } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }),

  create: permissionProcedure('activities:manage').input(activityCreateSchema).mutation(async ({ ctx, input }) => {
    return ctx.db.activity.create({
      data: {
        tenantId:     ctx.tenantId,
        name:         input.name,
        description:  input.description,
        category:     input.category,
        location:     input.location,
        responsibleId: input.responsibleId,
        maxCapacity:  input.maxCapacity,
        durationMin:  input.durationMin,
      },
    });
  }),

  update: permissionProcedure('activities:manage').input(z.object({
    id:   z.string(),
    data: activityUpdateSchema,
  })).mutation(async ({ ctx, input }) => {
    // RLS garantiza que solo se ve la actividad del propio tenant
    return ctx.db.activity.update({
      where: { id: input.id },
      data:  input.data,
    });
  }),

  archive: permissionProcedure('activities:manage').input(z.object({
    id: z.string(),
  })).mutation(async ({ ctx, input }) => {
    return ctx.db.activity.update({
      where: { id: input.id },
      data:  { active: false },
    });
  }),
});

const sessionsRouter = createTRPCRouter({
  list: permissionProcedure('activities:read').input(z.object({
    activityId: z.string().optional(),
    centerId:   z.string().optional(),
    from:       z.coerce.date().optional(),
    to:         z.coerce.date().optional(),
    status:     z.nativeEnum(ActivitySessionStatus).optional(),
  })).query(async ({ ctx, input }) => {
    return ctx.db.activitySession.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(input.activityId ? { activityId: input.activityId } : {}),
        ...(input.centerId   ? { centerId:   input.centerId }   : {}),
        ...(input.status     ? { status:     input.status }     : {}),
        ...(input.from || input.to ? {
          startsAt: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to   ? { lte: input.to }   : {}),
          },
        } : {}),
      },
      include: {
        activity: { select: { id: true, name: true, category: true, maxCapacity: true } },
        _count:   { select: { enrollments: { where: { status: 'INSCRITO' } } } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }),

  create: permissionProcedure('activities:manage').input(sessionCreateSchema).mutation(async ({ ctx, input }) => {
    if (input.endsAt <= input.startsAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'La sesión debe terminar después de empezar.' });
    }
    return ctx.db.activitySession.create({
      data: {
        tenantId:   ctx.tenantId,
        activityId: input.activityId,
        centerId:   input.centerId,
        unitId:     input.unitId,
        startsAt:   input.startsAt,
        endsAt:     input.endsAt,
        notes:      input.notes,
      },
    });
  }),

  update: permissionProcedure('activities:manage').input(z.object({
    id:   z.string(),
    data: sessionUpdateSchema,
  })).mutation(async ({ ctx, input }) => {
    if (input.data.startsAt && input.data.endsAt && input.data.endsAt <= input.data.startsAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'La sesión debe terminar después de empezar.' });
    }
    return ctx.db.activitySession.update({
      where: { id: input.id },
      data:  input.data,
    });
  }),

  cancel: permissionProcedure('activities:manage').input(z.object({
    id:    z.string(),
    notes: z.string().max(2000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const session = await ctx.db.activitySession.findUnique({ where: { id: input.id } });
    if (!session) throw new TRPCError({ code: 'NOT_FOUND' });
    if (session.status === 'CANCELADA') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'La sesión ya está cancelada.' });
    }

    const updated = await ctx.db.activitySession.update({
      where: { id: input.id },
      data:  { status: 'CANCELADA', notes: input.notes ?? session.notes },
    });

    await ctx.audit({
      action:   'CANCEL',
      entity:   'ActivitySession',
      entityId: input.id,
      summary:  `Sesión cancelada: ${session.id}`,
    });

    return updated;
  }),
});

const enrollmentsRouter = createTRPCRouter({
  list: permissionProcedure('activities:read').input(z.object({
    sessionId: z.string(),
  })).query(async ({ ctx, input }) => {
    return ctx.db.activityEnrollment.findMany({
      where:   { sessionId: input.sessionId },
      include: { resident: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { enrolledAt: 'asc' },
    });
  }),

  enroll: permissionProcedure('activities:manage').input(enrollSchema).mutation(async ({ ctx, input }) => {
    // 1. Verificar que la sesión existe y está en estado enrollable (lectura previa,
    //    fuera de la transacción: solo queremos el estado y el aforo máximo).
    const session = await ctx.db.activitySession.findUnique({
      where:   { id: input.sessionId },
      include: { activity: { select: { maxCapacity: true } } },
    });
    if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sesión no encontrada.' });
    if (!canEnroll(session)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `No se puede inscribir en una sesión con estado ${session.status}.`,
      });
    }

    // 2. Verificar que el residente no está ya inscrito (idempotencia, pre-check).
    //    Se vuelve a comprobar dentro de la transacción para ser estrictos.
    const existingPre = await ctx.db.activityEnrollment.findUnique({
      where: { sessionId_residentId: { sessionId: input.sessionId, residentId: input.residentId } },
    });
    if (existingPre && existingPre.status !== 'CANCELADO') {
      throw new TRPCError({ code: 'CONFLICT', message: 'El residente ya está inscrito en esta sesión.' });
    }

    // 3. Determinar estado (INSCRITO / LISTA_ESPERA) y crear la inscripción dentro de
    //    una transacción SERIALIZABLE (DAT-C02). Sin serialización, dos peticiones
    //    concurrentes leerían el mismo aforo libre y ambas se inscribirían como
    //    INSCRITO superando maxCapacity. Con Serializable, Postgres detecta el conflicto
    //    de lectura (SSI) y aborta una de las dos (P2034 / código 40001). Patrón
    //    idéntico al de visits.ts:355.
    //
    //    Usamos basePrisma para poder pasar isolationLevel; dentro de la transacción
    //    el GUC app.tenant_id ya fue fijado por forTenant antes de llegar aquí, pero
    //    basePrisma opera como vetlla_app con RLS activa. Fijamos el GUC
    //    explícitamente dentro de la transacción para que las queries al modelo
    //    Prisma queden filtradas por RLS igualmente.
    const maxCapacity = session.activity.maxCapacity;
    const tenantId    = ctx.tenantId;

    async function runEnroll() {
      return basePrisma.$transaction(
        async (tx) => {
          // Fijar el GUC de tenant dentro de la transacción (RLS activa para vetlla_app)
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`;

          // Re-comprobar idempotencia dentro de la transacción
          const existing = await tx.activityEnrollment.findUnique({
            where: { sessionId_residentId: { sessionId: input.sessionId, residentId: input.residentId } },
          });
          if (existing && existing.status !== 'CANCELADO') {
            throw new TRPCError({ code: 'CONFLICT', message: 'El residente ya está inscrito en esta sesión.' });
          }

          // Re-contar inscripciones activas dentro de la transacción (lectura serializable)
          const inscripciones = await tx.activityEnrollment.findMany({
            where: { sessionId: input.sessionId },
          });
          const inscripcionesInfo: InscripcionInfo[] = inscripciones.map((i) => ({
            id:         i.id,
            residentId: i.residentId,
            status:     i.status,
            enrolledAt: i.enrolledAt,
          }));

          const estado = estadoInscripcion({ maxCapacity }, inscripcionesInfo);

          // 4. Crear o restaurar inscripción
          if (existing) {
            return tx.activityEnrollment.update({
              where: { id: existing.id },
              data:  { status: estado, attended: null, observation: null, enrolledAt: new Date() },
            });
          }

          return tx.activityEnrollment.create({
            data: {
              tenantId:   tenantId,
              sessionId:  input.sessionId,
              residentId: input.residentId,
              status:     estado,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    }

    try {
      return await runEnroll();
    } catch (err) {
      // Reintento ante error de serialización de Postgres (código P2034 en Prisma
      // o el código Postgres 40001 serialization_failure). Mismo patrón que visits.ts.
      const isSerializationError =
        err instanceof Error &&
        (err.message.includes('P2034') ||
          err.message.includes('40001') ||
          err.message.includes('serializ'));
      if (isSerializationError) {
        return await runEnroll();
      }
      throw err;
    }
  }),

  cancel: permissionProcedure('activities:manage').input(z.object({
    enrollmentId: z.string(),
  })).mutation(async ({ ctx, input }) => {
    const enrollment = await ctx.db.activityEnrollment.findUnique({
      where: { id: input.enrollmentId },
    });
    if (!enrollment) throw new TRPCError({ code: 'NOT_FOUND' });
    if (enrollment.status === 'CANCELADO') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'La inscripción ya está cancelada.' });
    }

    const eraMayorInscrito = enrollment.status === 'INSCRITO';

    // 1. Cancelar inscripción
    const updated = await ctx.db.activityEnrollment.update({
      where: { id: input.enrollmentId },
      data:  { status: 'CANCELADO' },
    });

    await ctx.audit({
      action:   'CANCEL',
      entity:   'ActivityEnrollment',
      entityId: input.enrollmentId,
      summary:  `Inscripción cancelada para residente ${enrollment.residentId}`,
    });

    // 2. Si era INSCRITO, promover al primero en lista de espera
    if (eraMayorInscrito) {
      const restantes = await ctx.db.activityEnrollment.findMany({
        where: { sessionId: enrollment.sessionId },
      });
      const enEsperaInfo: InscripcionInfo[] = restantes.map((i) => ({
        id:         i.id,
        residentId: i.residentId,
        status:     i.status,
        enrolledAt: i.enrolledAt,
      }));
      const promoResidentId = primeroEnEspera(enEsperaInfo);
      if (promoResidentId) {
        await ctx.db.activityEnrollment.updateMany({
          where: { sessionId: enrollment.sessionId, residentId: promoResidentId, status: 'LISTA_ESPERA' },
          data:  { status: 'INSCRITO' },
        });
      }
    }

    return updated;
  }),
});

const attendanceRouter = createTRPCRouter({
  list: permissionProcedure('activities:read').input(z.object({
    sessionId: z.string(),
  })).query(async ({ ctx, input }) => {
    return ctx.db.activityEnrollment.findMany({
      where:   { sessionId: input.sessionId, status: { not: 'CANCELADO' } },
      include: { resident: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { enrolledAt: 'asc' },
    });
  }),

  record: permissionProcedure('activities:manage').input(attendanceSchema).mutation(async ({ ctx, input }) => {
    const enrollment = await ctx.db.activityEnrollment.findUnique({
      where:   { id: input.enrollmentId },
      include: { session: { select: { status: true } } },
    });
    if (!enrollment) throw new TRPCError({ code: 'NOT_FOUND' });
    if (enrollment.status === 'CANCELADO') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No se puede registrar asistencia en una inscripción cancelada.' });
    }
    if (!canRecord(enrollment.session)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `No se puede registrar asistencia en una sesión ${enrollment.session.status}.`,
      });
    }

    const updated = await ctx.db.activityEnrollment.update({
      where: { id: input.enrollmentId },
      data:  { attended: input.attended, observation: input.observation },
    });

    await ctx.audit({
      action:   'RECORD',
      entity:   'ActivityEnrollment',
      entityId: input.enrollmentId,
      summary:  `Asistencia registrada: ${input.attended ? 'asistió' : 'no asistió'} (residente ${enrollment.residentId})`,
    });

    return updated;
  }),
});

// ---------------------------------------------------------------------------
// Portal de familias — participación del residente vinculado
// ---------------------------------------------------------------------------

const portalRouter = createTRPCRouter({
  // SEC-A04: el endpoint exige explícitamente uno de los dos permisos válidos:
  //   • activities:read → staff (DIRECTOR, AUXILIAR, SANITARIO, SUPERADMIN)
  //   • portal:read     → FAMILIAR (solo su residente vinculado, via assertFamilyAccess)
  // Cualquier rol sin ninguno de los dos recibe FORBIDDEN antes de llegar a la BD.
  participationForResident: permissionProcedure('activities:read').input(z.object({
    residentId: z.string(),
  })).query(async ({ ctx, input }) => {
    return ctx.db.activityEnrollment.findMany({
      where: {
        residentId: input.residentId,
        status:     { not: 'CANCELADO' },
      },
      include: {
        session: {
          include: {
            activity: { select: { id: true, name: true, category: true, location: true } },
          },
        },
      },
      orderBy: { session: { startsAt: 'desc' } },
    });
  }),

  // Endpoint exclusivo para el FAMILIAR: portal:read + assertFamilyAccess.
  // Se separa del endpoint de staff para mantener el contrato de permissionProcedure
  // sin check manual. SEC-A04: el FAMILIAR usa este endpoint; el staff usa el de arriba.
  participationForResidentFamiliar: permissionProcedure('portal:read').input(z.object({
    residentId: z.string(),
  })).query(async ({ ctx, input }) => {
    // Verificar vínculo: el FAMILIAR solo puede ver el residente vinculado (aislamiento doble)
    await assertFamilyAccess(ctx.db, ctx.session.user.id, input.residentId);

    return ctx.db.activityEnrollment.findMany({
      where: {
        residentId: input.residentId,
        status:     { not: 'CANCELADO' },
      },
      include: {
        session: {
          include: {
            activity: { select: { id: true, name: true, category: true, location: true } },
          },
        },
      },
      orderBy: { session: { startsAt: 'desc' } },
    });
  }),
});

// ---------------------------------------------------------------------------
// Router raíz del módulo
// ---------------------------------------------------------------------------

export const actividadesRouter = createTRPCRouter({
  catalog:     catalogRouter,
  sessions:    sessionsRouter,
  enrollments: enrollmentsRouter,
  attendance:  attendanceRouter,
  portal:      portalRouter,
});
