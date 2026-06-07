import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { MedAdminStatus } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { computeAlerts, computeSchedule, type AdminForSchedule, type MedForSchedule } from '@/lib/mar';

function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export const medicationsRouter = createTRPCRouter({
  listByResident: permissionProcedure('medication:read')
    .input(z.object({ residentId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.medication.findMany({
        where: { residentId: input.residentId },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
    ),

  prescribe: permissionProcedure('medication:prescribe')
    .input(
      z.object({
        residentId: z.string(),
        name: z.string().min(1).max(160),
        dose: z.string().min(1).max(80),
        route: z.string().max(60).optional(),
        times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(12),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().optional(),
        instructions: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const resident = await ctx.db.resident.findUnique({ where: { id: input.residentId } });
      if (!resident) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
      return ctx.db.medication.create({
        data: {
          tenantId: ctx.tenantId,
          residentId: input.residentId,
          name: input.name,
          dose: input.dose,
          route: input.route,
          times: input.times,
          startDate: input.startDate,
          endDate: input.endDate,
          instructions: input.instructions,
          prescribedById: ctx.session.user.id,
        },
      });
    }),

  setActive: permissionProcedure('medication:prescribe')
    .input(z.object({ id: z.string(), active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.db.medication.update({ where: { id: input.id }, data: { active: input.active } }),
    ),

  /** Pauta del día para un residente, con el estado de cada dosis. */
  schedule: permissionProcedure('medication:read')
    .input(z.object({ residentId: z.string(), date: z.coerce.date().optional() }))
    .query(async ({ ctx, input }) => {
      const date = input.date ?? new Date();
      const { start, end } = dayBounds(date);
      const meds = await ctx.db.medication.findMany({ where: { residentId: input.residentId } });
      const admins = await ctx.db.medicationAdministration.findMany({
        where: { residentId: input.residentId, scheduledAt: { gte: start, lte: end } },
      });
      return computeSchedule(
        meds.map(toMedForSchedule),
        admins.map(toAdminForSchedule),
        date,
        new Date(),
      );
    }),

  /** Registra (o corrige) la administración de una dosis. Idempotente por dosis. */
  record: permissionProcedure('medication:administer')
    .input(
      z.object({
        medicationId: z.string(),
        scheduledAt: z.coerce.date(),
        status: z.nativeEnum(MedAdminStatus),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const med = await ctx.db.medication.findUnique({ where: { id: input.medicationId } });
      if (!med) throw new TRPCError({ code: 'NOT_FOUND', message: 'Medicación no encontrada.' });
      const administeredAt = input.status === MedAdminStatus.ADMINISTRADO ? new Date() : null;
      return ctx.db.medicationAdministration.upsert({
        where: {
          tenantId_medicationId_scheduledAt: {
            tenantId: ctx.tenantId,
            medicationId: input.medicationId,
            scheduledAt: input.scheduledAt,
          },
        },
        update: {
          status: input.status,
          notes: input.notes,
          administeredAt,
          administeredById: ctx.session.user.id,
        },
        create: {
          tenantId: ctx.tenantId,
          residentId: med.residentId,
          medicationId: input.medicationId,
          scheduledAt: input.scheduledAt,
          status: input.status,
          notes: input.notes,
          administeredAt,
          administeredById: ctx.session.user.id,
        },
      });
    }),

  /** Alertas de no-administrado de hoy en todo el tenant (para el panel). */
  alertsToday: permissionProcedure('medication:read').query(async ({ ctx }) => {
    const now = new Date();
    const { start, end } = dayBounds(now);
    const meds = await ctx.db.medication.findMany({
      where: { active: true },
      include: { resident: { select: { id: true, firstName: true, lastName: true } } },
    });
    const admins = await ctx.db.medicationAdministration.findMany({
      where: { scheduledAt: { gte: start, lte: end } },
    });
    return computeAlerts(
      meds.map((m) => ({
        ...toMedForSchedule(m),
        residentId: m.resident.id,
        residentName: `${m.resident.firstName} ${m.resident.lastName}`,
      })),
      admins.map(toAdminForSchedule),
      now,
      now,
    );
  }),
});

function toMedForSchedule(m: {
  id: string;
  name: string;
  dose: string;
  times: unknown;
  startDate: Date;
  endDate: Date | null;
}): MedForSchedule {
  return {
    id: m.id,
    name: m.name,
    dose: m.dose,
    times: Array.isArray(m.times) ? (m.times as string[]) : [],
    startDate: m.startDate,
    endDate: m.endDate,
  };
}

function toAdminForSchedule(a: {
  medicationId: string;
  scheduledAt: Date;
  status: MedForScheduleStatus;
}): AdminForSchedule {
  return { medicationId: a.medicationId, scheduledAt: a.scheduledAt, status: a.status };
}

type MedForScheduleStatus = 'ADMINISTRADO' | 'NO_ADMINISTRADO' | 'RECHAZADO';
