import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { computeAlerts, type AdminForSchedule, type MedForSchedule } from '@/lib/mar';
import { summarizeOccupancy, type CenterNode } from '@/lib/occupancy';
import { buildAlertFeed, type IncidentInput, type MedicationAlertInput } from '@/lib/alerts';

function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Mapea una medicación de Prisma a la entrada del cálculo del MAR. */
function toMedForSchedule(m: {
  id: string;
  name: string;
  dose: string;
  times: unknown;
  daysOfWeek: unknown;
  type: string | null;
  startDate: Date;
  endDate: Date | null;
}): MedForSchedule {
  return {
    id: m.id,
    name: m.name,
    dose: m.dose,
    times: Array.isArray(m.times) ? (m.times as string[]) : [],
    daysOfWeek: Array.isArray(m.daysOfWeek) ? (m.daysOfWeek as number[]) : null,
    type: m.type ?? null,
    startDate: m.startDate,
    endDate: m.endDate,
  };
}

/** Lee el campo `descripcion` del payload de una incidencia (CareRecord). */
function incidentDescription(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'descripcion' in payload) {
    const d = (payload as Record<string, unknown>).descripcion;
    if (typeof d === 'string') return d;
  }
  return 'Incidencia registrada';
}

/**
 * Router de Dirección: vistas agregadas tenant-wide (ocupación + alertas).
 * Todo respeta RLS (ctx.db aislado por tenant) y RBAC por procedimiento.
 */
export const overviewRouter = createTRPCRouter({
  /** Plano de ocupación: árbol de centros/unidades/camas resumido (UX-19). */
  occupancy: permissionProcedure('centers:read').query(async ({ ctx }) => {
    const centers = await ctx.db.center.findMany({
      orderBy: { name: 'asc' },
      include: {
        units: {
          orderBy: { name: 'asc' },
          include: {
            beds: {
              orderBy: { code: 'asc' },
              select: { status: true, resident: { select: { id: true } } },
            },
          },
        },
      },
    });
    return summarizeOccupancy(centers as unknown as CenterNode[]);
  }),

  /** Centro de alertas priorizado del día: medicación no administrada + incidencias (UX-18). */
  alerts: permissionProcedure('care:read').query(async ({ ctx }) => {
    const now = new Date();
    const { start, end } = dayBounds(now);

    const [meds, admins, incidents] = await Promise.all([
      ctx.db.medication.findMany({
        where: { active: true },
        include: { resident: { select: { id: true, firstName: true, lastName: true } } },
      }),
      ctx.db.medicationAdministration.findMany({
        where: { scheduledAt: { gte: start, lte: end } },
        select: { medicationId: true, scheduledAt: true, status: true, notes: true },
      }),
      ctx.db.careRecord.findMany({
        where: { type: 'INCIDENCIA', recordedAt: { gte: start, lte: end } },
        orderBy: { recordedAt: 'desc' },
        include: { resident: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    const medSchedule = computeAlerts(
      meds.map((m) => ({
        ...toMedForSchedule(m),
        residentId: m.resident.id,
        residentName: `${m.resident.firstName} ${m.resident.lastName}`,
      })),
      admins.map((a): AdminForSchedule => ({
        medicationId: a.medicationId,
        scheduledAt: a.scheduledAt,
        status: a.status,
        notes: a.notes,
      })),
      now,
      now,
    );

    const medicationAlerts: MedicationAlertInput[] = medSchedule.map((d) => ({
      medicationId: d.medicationId,
      medicationName: d.medicationName,
      dose: d.dose,
      scheduledAt: d.scheduledAt,
      residentId: d.residentId,
      residentName: d.residentName,
    }));

    const incidentInputs: IncidentInput[] = incidents.map((i) => ({
      id: i.id,
      description: incidentDescription(i.payload),
      recordedAt: i.recordedAt.toISOString(),
      residentId: i.resident.id,
      residentName: `${i.resident.firstName} ${i.resident.lastName}`,
    }));

    return buildAlertFeed({ medicationAlerts, incidents: incidentInputs });
  }),
});
