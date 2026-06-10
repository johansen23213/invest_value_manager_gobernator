import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { MedAdminStatus, MedicationRoute, MedicationType } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { computeAlerts, computePrn, computeSchedule, type AdminForSchedule, type MedForSchedule } from '@/lib/mar';

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
        include: { diagnosis: { select: { id: true, code: true, description: true } } },
      }),
    ),

  prescribe: permissionProcedure('medication:prescribe')
    .input(
      z.object({
        residentId: z.string(),
        name: z.string().min(1).max(160),
        dose: z.string().min(1).max(80),
        route: z.nativeEnum(MedicationRoute).optional(),
        unit: z.string().max(80).optional(),
        times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).max(12),
        // M-11: dosis por franja (opcional). Si una hora figura aquí, prevalece sobre `dose`.
        momentDoses: z
          .array(z.object({ time: z.string().regex(/^\d{2}:\d{2}$/), dose: z.string().min(1).max(80) }))
          .max(12)
          .optional(),
        daysOfWeek: z
          .array(z.number().int().min(0).max(6))
          .min(1)
          .max(7)
          .optional(),
        type: z.nativeEnum(MedicationType).optional(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date().optional(),
        instructions: z.string().max(500).optional(),
        // M-10: vínculo opcional a un diagnóstico del residente.
        diagnosisId: z.string().optional(),
        /**
         * M-08 cierre: override de alergia GRAVE.
         * Si el sanitario confirma la prescripción sobre una alergia GRAVE,
         * el cliente envía este objeto con sustancia, severidad y motivo clínico.
         * El router registra un AuditLog adicional con action OVERRIDE_ALLERGY.
         */
        allergyOverride: z
          .object({
            substance: z.string().min(1).max(160),
            severity: z.string().min(1).max(40),
            reason: z.string().min(1).max(500),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const resident = await ctx.db.resident.findUnique({ where: { id: input.residentId } });
      if (!resident) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
      // PRN no requiere horas fijas; otros tipos necesitan al menos 1 hora
      if (input.type !== MedicationType.PRN && input.times.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Indica al menos una hora de pauta o selecciona el tipo A demanda (PRN).' });
      }
      // M-10: el diagnóstico vinculado debe ser del mismo residente (integridad + RLS).
      if (input.diagnosisId) {
        const dx = await ctx.db.diagnosis.findUnique({
          where: { id: input.diagnosisId },
          select: { residentId: true },
        });
        if (!dx || dx.residentId !== input.residentId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'El diagnóstico no pertenece a este residente.' });
        }
      }
      const medication = await ctx.db.medication.create({
        data: {
          tenantId: ctx.tenantId,
          residentId: input.residentId,
          name: input.name,
          dose: input.dose,
          route: input.route,
          unit: input.unit,
          times: input.times,
          // null en Prisma Json? requiere Prisma.DbNull; undefined omite el campo
          // y deja el DEFAULT (null) de la columna. Ambos son equivalentes aquí.
          momentDoses: input.momentDoses ?? undefined,
          daysOfWeek: input.daysOfWeek ?? undefined,
          type: input.type,
          startDate: input.startDate,
          endDate: input.endDate,
          instructions: input.instructions,
          diagnosisId: input.diagnosisId,
          prescribedById: ctx.session.user.id,
        },
      });
      await ctx.audit({
        action: 'CREATE',
        entity: 'Medication',
        entityId: input.residentId,
        summary: `Prescripción: ${input.name} ${input.dose}`,
        metadata: { route: input.route, type: input.type, unit: input.unit },
      });

      // M-08 cierre: si hubo override de alergia GRAVE, registrar audit adicional.
      if (input.allergyOverride) {
        await ctx.audit({
          action: 'OVERRIDE_ALLERGY',
          entity: 'Medication',
          entityId: medication.id,
          summary: `Override de alergia ${input.allergyOverride.severity} (${input.allergyOverride.substance}) para prescripción de ${input.name}`,
          metadata: {
            substance: input.allergyOverride.substance,
            severity: input.allergyOverride.severity,
            reason: input.allergyOverride.reason,
            medicationName: input.name,
            medicationDose: input.dose,
          },
        });
      }

      return medication;
    }),

  setActive: permissionProcedure('medication:prescribe')
    .input(z.object({ id: z.string(), active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.db.medication.update({ where: { id: input.id }, data: { active: input.active } }),
    ),

  /** Pauta del día para un residente, con el estado de cada dosis. Excluye PRN. */
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

  /** Medicaciones PRN (a demanda) activas para un residente en la fecha dada. */
  prnMeds: permissionProcedure('medication:read')
    .input(z.object({ residentId: z.string(), date: z.coerce.date().optional() }))
    .query(async ({ ctx, input }) => {
      const date = input.date ?? new Date();
      const meds = await ctx.db.medication.findMany({
        where: { residentId: input.residentId, active: true },
      });
      return computePrn(meds.map(toMedForSchedule), date);
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
      const administration = await ctx.db.medicationAdministration.upsert({
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
      await ctx.audit({
        action: 'ADMINISTER',
        entity: 'MedicationAdministration',
        entityId: med.residentId,
        summary: `${med.name}: ${input.status}`,
        metadata: { medicationId: input.medicationId, scheduledAt: input.scheduledAt.toISOString() },
      });
      return administration;
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
  momentDoses?: unknown;
  daysOfWeek?: unknown;
  type?: string | null;
  startDate: Date;
  endDate: Date | null;
}): MedForSchedule {
  return {
    id: m.id,
    name: m.name,
    dose: m.dose,
    times: Array.isArray(m.times) ? (m.times as string[]) : [],
    momentDoses: Array.isArray(m.momentDoses)
      ? (m.momentDoses as { time: string; dose: string }[])
      : null,
    daysOfWeek: Array.isArray(m.daysOfWeek) ? (m.daysOfWeek as number[]) : null,
    type: m.type ?? null,
    startDate: m.startDate,
    endDate: m.endDate,
  };
}

function toAdminForSchedule(a: {
  medicationId: string;
  scheduledAt: Date;
  status: MedForScheduleStatus;
  notes?: string | null;
}): AdminForSchedule {
  return { medicationId: a.medicationId, scheduledAt: a.scheduledAt, status: a.status, notes: a.notes };
}

type MedForScheduleStatus = 'ADMINISTRADO' | 'NO_ADMINISTRADO' | 'RECHAZADO';
