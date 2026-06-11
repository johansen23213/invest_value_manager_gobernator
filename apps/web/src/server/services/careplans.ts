/**
 * services/careplans.ts — Lógica de persistencia compartida de PIA/PAI.
 *
 * Extraída para que tanto `carePlans.create` + `addGoal` (entrada manual) como el
 * copiloto (`copilot.confirmCarePlan`, tras confirmación humana) creen un PIA con sus
 * objetivos de forma idéntica: mismo `tenantId`, `createdById`, validación de residente
 * y aislamiento por RLS (el cliente Prisma ya viene acotado al tenant).
 *
 * No abre transacción explícita en este slice (coherente con el resto del código), pero
 * concentra la creación plan+objetivos en un único punto reutilizable.
 */

import type { TenantPrisma } from '@vetlla/db';

/** Un objetivo a crear dentro del PIA (descripción + fecha objetivo opcional). */
export interface CarePlanGoalInput {
  description: string;
  targetDate?: Date;
}

export interface CreateCarePlanInput {
  residentId: string;
  title: string;
  notes?: string;
  goals?: CarePlanGoalInput[];
}

/**
 * Crea un PIA y, si se pasan, sus objetivos. Devuelve el plan con los objetivos
 * incluidos (orden de creación). Lanza si el residente no existe / no es del tenant
 * (la RLS del `db` acotado garantiza que solo se ve el tenant actual).
 */
export async function createCarePlanWithGoals(
  db: TenantPrisma,
  args: { tenantId: string; createdById: string; input: CreateCarePlanInput },
) {
  const { tenantId, createdById, input } = args;

  const resident = await db.resident.findUnique({ where: { id: input.residentId } });
  if (!resident) {
    // El llamante traduce esto al código tRPC adecuado (NOT_FOUND).
    throw new Error('RESIDENT_NOT_FOUND');
  }

  const plan = await db.carePlan.create({
    data: {
      tenantId,
      residentId: input.residentId,
      title: input.title,
      notes: input.notes,
      createdById,
    },
  });

  for (const goal of input.goals ?? []) {
    await db.carePlanGoal.create({
      data: {
        tenantId,
        carePlanId: plan.id,
        description: goal.description,
        targetDate: goal.targetDate,
      },
    });
  }

  // Relee el plan con sus objetivos para devolver el agregado completo.
  return db.carePlan.findUniqueOrThrow({
    where: { id: plan.id },
    include: { goals: { orderBy: { createdAt: 'asc' } } },
  });
}
