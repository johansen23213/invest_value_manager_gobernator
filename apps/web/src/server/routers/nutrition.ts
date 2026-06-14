/**
 * Router de Nutrición, Menús y Comedor (Épica C — RF-NUT-001..009).
 *
 * Tres sub-routers:
 *
 *   nutrition.menu.*   — Menús del centro (RF-NUT-003/004/005)
 *     - menu.upsert     (centers:write)  — crear/actualizar ítem del menú
 *     - menu.list       (care:read)      — listar menú de un centro por fecha
 *     - menu.delete     (centers:write)  — borrar un ítem del menú
 *     - menu.forFamily  (portal:read)    — menú del centro del residente vinculado (RF-NUT-005)
 *       El familiar no necesita saber el centerId: el router resuelve el centro
 *       a partir del FamilyLink (igual que en family.ts). Verifica el vínculo
 *       antes de devolver datos.
 *
 *   nutrition.intake.* — Registros de ingesta (RF-NUT-006/007)
 *     - intake.record       (care:write)  — registrar ingesta de un residente
 *     - intake.listByResident (care:read) — listar ingestas de un residente
 *     - intake.lowIntakeAlerts (care:read) — residentes con riesgo baja ingesta (RF-NUT-007)
 *
 *   nutrition.kitchen.* — Listados de cocina (RF-NUT-008/009)
 *     - kitchen.dietListing  (care:read) — lista dieta/alergias de residentes activos (RF-NUT-008)
 *     - kitchen.mealListing  (care:read) — residentes por comedor/unidad para una comida (RF-NUT-009)
 *
 * DISEÑO — menú para el familiar (RF-NUT-005):
 *   El familiar tiene portal:read y NO tiene care:read ni centers:read.
 *   Para evitar crear un permiso nuevo, se añade menu.forFamily bajo portal:read.
 *   El endpoint recibe solo el residentId (de quien el familiar tiene FamilyLink).
 *   El router resuelve el centerId y devuelve el menú de ese centro para la fecha.
 *   El familiar nunca puede ver menús de centros que no correspondan a sus residentes.
 *
 * RELACIÓN CON CareRecord/INGESTA:
 *   CareRecord(type=INGESTA) es el flujo offline-first genérico. IntakeRecord es
 *   el registro estructurado del comedor. Son complementarios; este router solo
 *   toca IntakeRecord. El router care.ts sigue sin cambios.
 *
 * PERMISOS:
 *   - centers:write → DIRECTOR (configuración del menú del centro)
 *   - care:read / care:write → AUXILIAR, SANITARIO, DIRECTOR (atención)
 *   - portal:read → FAMILIAR (menú del centro de su residente vinculado)
 *
 * AUDITORÍA:
 *   - menu.upsert: RECORD/CREATE/UPDATE sobre MenuItem.
 *   - menu.delete: DELETE sobre MenuItem.
 *   - intake.record: RECORD sobre IntakeRecord (dato de salud nutricional).
 */

import { TRPCError } from '@trpc/server';
import { type TenantPrisma } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { isLowIntakeRisk } from '@/lib/nutrition';

// ---------------------------------------------------------------------------
// Constantes de umbrales documentadas (RF-NUT-007)
// ---------------------------------------------------------------------------

const DEFAULT_AVG_THRESHOLD  = 50; // media < 50% → riesgo
const DEFAULT_CONSEC_LOW_THR = 25; // foodPct ≤ 25% cuenta como "muy baja"
const DEFAULT_CONSEC_LOW_CNT = 3;  // 3 comidas consecutivas ≤ 25% → riesgo inmediato

// ---------------------------------------------------------------------------
// Schemas Zod — importados desde el módulo CLIENT-SAFE (única fuente de verdad).
// Re-exportados para compatibilidad con módulos de servidor que los importen
// desde este router. Los ficheros CLIENTE deben importar directamente desde
// '@/lib/schemas/nutrition'.
// ---------------------------------------------------------------------------

import {
  MealTypeSchema,
  AllergenValueSchema,
  UpsertMenuItemInput,
  ListMenuInput,
  DeleteMenuItemInput,
  MenuForFamilyInput,
  RecordIntakeInput,
  ListIntakeByResidentInput,
  LowIntakeAlertsInput,
  DietListingInput,
  MealListingInput,
  type AllergenValue,
} from '@/lib/schemas/nutrition';

export {
  MealTypeSchema,
  AllergenValueSchema,
  UpsertMenuItemInput,
  ListMenuInput,
  DeleteMenuItemInput,
  MenuForFamilyInput,
  RecordIntakeInput,
  ListIntakeByResidentInput,
  LowIntakeAlertsInput,
  DietListingInput,
  MealListingInput,
};
export type { AllergenValue };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verifica que el center pertenece al tenant (RLS lo garantiza, pero damos error claro). */
async function assertCenter(db: TenantPrisma, centerId: string) {
  const center = await db.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true },
  });
  if (!center) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Centro no encontrado.' });
  }
  return center;
}

/** Verifica que el residente pertenece al tenant. */
async function assertResident(db: TenantPrisma, residentId: string) {
  const resident = await db.resident.findUnique({
    where: { id: residentId },
    select: { id: true, centerId: true, firstName: true, lastName: true },
  });
  if (!resident) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
  }
  return resident;
}

/**
 * Normaliza una fecha a medianoche UTC para comparar solo el día.
 * Se usa para filtrar menús por día (la hora de `date` se ignora).
 */
function dayRange(date: Date): { gte: Date; lt: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
}

// ---------------------------------------------------------------------------
// Router raíz de nutrición
// ---------------------------------------------------------------------------

export const nutritionRouter = createTRPCRouter({

  // =========================================================================
  // menu.* — Menús del centro (RF-NUT-003/004/005)
  // =========================================================================

  menu: createTRPCRouter({

    /**
     * Crear o actualizar un ítem del menú (RF-NUT-003).
     * Si se pasa `id` → update; si no → create.
     * Permiso: centers:write → solo DIRECTOR.
     * Audita: RECORD sobre MenuItem.
     */
    upsert: permissionProcedure('centers:write')
      .input(UpsertMenuItemInput)
      .mutation(async ({ ctx, input }) => {
        await assertCenter(ctx.db, input.centerId);

        const data = {
          tenantId:      ctx.tenantId,
          centerId:      input.centerId,
          date:          input.date,
          meal:          input.meal,
          dishName:      input.dishName,
          description:   input.description ?? null,
          allergens:     input.allergens as unknown as import('@vetlla/db').Prisma.InputJsonValue,
          isAlternative: input.isAlternative,
          createdById:   ctx.session.user.id,
        };

        let item;
        if (input.id) {
          // Update — verificar que el ítem existe y pertenece al tenant (RLS lo garantiza)
          const existing = await ctx.db.menuItem.findUnique({
            where: { id: input.id },
            select: { id: true },
          });
          if (!existing) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Ítem de menú no encontrado.' });
          }
          item = await ctx.db.menuItem.update({
            where: { id: input.id },
            data,
          });
          await ctx.audit({
            action:   'UPDATE',
            entity:   'MenuItem',
            entityId: item.id,
            summary:  `Menú actualizado: ${input.meal} — ${input.dishName} (${input.date.toISOString().split('T')[0]})`,
            metadata: { centerId: input.centerId, meal: input.meal, date: input.date.toISOString() },
          });
        } else {
          item = await ctx.db.menuItem.create({ data });
          await ctx.audit({
            action:   'CREATE',
            entity:   'MenuItem',
            entityId: item.id,
            summary:  `Menú creado: ${input.meal} — ${input.dishName} (${input.date.toISOString().split('T')[0]})`,
            metadata: { centerId: input.centerId, meal: input.meal, date: input.date.toISOString() },
          });
        }

        return item;
      }),

    /**
     * Listar el menú de un centro para un día concreto (RF-NUT-004).
     * Devuelve todos los ítems (estándar + alternativos) ordenados por comida.
     * Permiso: care:read → AUXILIAR, SANITARIO, DIRECTOR.
     */
    list: permissionProcedure('care:read')
      .input(ListMenuInput)
      .query(({ ctx, input }) => {
        const range = dayRange(input.date);
        return ctx.db.menuItem.findMany({
          where: {
            centerId: input.centerId,
            date:     range,
          },
          include: {
            createdBy: { select: { id: true, name: true } },
          },
          orderBy: [{ meal: 'asc' }, { isAlternative: 'asc' }, { dishName: 'asc' }],
        });
      }),

    /**
     * Borrar un ítem del menú.
     * Permiso: centers:write → solo DIRECTOR.
     */
    delete: permissionProcedure('centers:write')
      .input(DeleteMenuItemInput)
      .mutation(async ({ ctx, input }) => {
        const item = await ctx.db.menuItem.findUnique({
          where:  { id: input.id },
          select: { id: true, centerId: true, meal: true, dishName: true },
        });
        if (!item) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ítem de menú no encontrado.' });
        }
        await ctx.db.menuItem.delete({ where: { id: input.id } });
        await ctx.audit({
          action:   'DELETE',
          entity:   'MenuItem',
          entityId: input.id,
          summary:  `Menú eliminado: ${item.meal} — ${item.dishName}`,
          metadata: { centerId: item.centerId },
        });
        return { ok: true };
      }),

    /**
     * El FAMILIAR consulta el menú del centro de su residente vinculado (RF-NUT-005).
     *
     * DISEÑO:
     *   El familiar no conoce el centerId directamente. El router resuelve el
     *   centro a partir del FamilyLink del residente solicitado. Si el usuario
     *   no tiene FamilyLink para ese residente → NOT_FOUND (no revela que el
     *   residente existe en otro vínculo).
     *
     *   El familiar nunca puede consultar el menú de un centro que no corresponda
     *   a un residente suyo vinculado. El doble aislamiento:
     *     1. RLS: el familiar solo accede a datos de su tenant (GUC app.tenant_id).
     *     2. FamilyLink check: solo puede ver el menú del centro de SU residente.
     *
     * Permiso: portal:read → solo FAMILIAR.
     */
    forFamily: permissionProcedure('portal:read')
      .input(MenuForFamilyInput)
      .query(async ({ ctx, input }) => {
        // Verificar que el usuario tiene FamilyLink para este residente
        const link = await ctx.db.familyLink.findFirst({
          where: {
            userId:     ctx.session.user.id,
            residentId: input.residentId,
          },
          select: {
            residentId: true,
            resident: { select: { centerId: true } },
          },
        });
        if (!link) {
          throw new TRPCError({
            code:    'NOT_FOUND',
            message: 'No tienes un residente vinculado con ese identificador.',
          });
        }

        const centerId = link.resident.centerId;
        const range    = dayRange(input.date);

        return ctx.db.menuItem.findMany({
          where: {
            centerId,
            date:          range,
            isAlternative: false, // el familiar solo ve el menú estándar (no los platos especiales internos)
          },
          select: {
            id:          true,
            meal:        true,
            dishName:    true,
            description: true,
            allergens:   true,
            date:        true,
          },
          orderBy: [{ meal: 'asc' }, { dishName: 'asc' }],
        });
      }),
  }),

  // =========================================================================
  // intake.* — Registros de ingesta (RF-NUT-006/007)
  // =========================================================================

  intake: createTRPCRouter({

    /**
     * Registrar la ingesta de un residente en una comida (RF-NUT-006).
     * Permiso: care:write → AUXILIAR, SANITARIO, DIRECTOR.
     * Audita: RECORD sobre IntakeRecord (dato de salud nutricional).
     */
    record: permissionProcedure('care:write')
      .input(RecordIntakeInput)
      .mutation(async ({ ctx, input }) => {
        await assertResident(ctx.db, input.residentId);

        const record = await ctx.db.intakeRecord.create({
          data: {
            tenantId:    ctx.tenantId,
            residentId:  input.residentId,
            date:        input.date,
            meal:        input.meal,
            foodPct:     input.foodPct,
            hydrationMl: input.hydrationMl ?? null,
            notes:       input.notes ?? null,
            recordedById: ctx.session.user.id,
          },
        });

        await ctx.audit({
          action:   'RECORD',
          entity:   'IntakeRecord',
          entityId: input.residentId,
          summary:  `Ingesta registrada: ${input.meal} — ${input.foodPct}% (${input.date.toISOString().split('T')[0]})`,
          metadata: {
            intakeRecordId: record.id,
            meal:           input.meal,
            foodPct:        input.foodPct,
            hydrationMl:    input.hydrationMl ?? null,
            date:           input.date.toISOString(),
          },
        });

        return record;
      }),

    /**
     * Listar ingestas de un residente (filtro opcional por rango de fechas).
     * Permiso: care:read → AUXILIAR, SANITARIO, DIRECTOR.
     */
    listByResident: permissionProcedure('care:read')
      .input(ListIntakeByResidentInput)
      .query(({ ctx, input }) => {
        const dateFilter =
          input.dateFrom || input.dateTo
            ? {
                date: {
                  ...(input.dateFrom ? { gte: input.dateFrom } : {}),
                  ...(input.dateTo   ? { lte: input.dateTo   } : {}),
                },
              }
            : {};

        return ctx.db.intakeRecord.findMany({
          where: {
            residentId: input.residentId,
            ...dateFilter,
          },
          include: {
            recordedBy: { select: { id: true, name: true, jobTitle: true } },
          },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        });
      }),

    /**
     * Residentes con riesgo de baja ingesta en un centro (RF-NUT-007).
     * Panel de alertas para el equipo sanitario.
     *
     * Lógica:
     *   1. Obtiene todos los residentes ACTIVOS del centro.
     *   2. Para cada residente, carga sus últimos `windowSize` registros de ingesta.
     *   3. Aplica isLowIntakeRisk() (lógica pura, testeable sin BD).
     *   4. Devuelve solo los residentes con riesgo, con la razón del riesgo.
     *
     * Permiso: care:read → AUXILIAR, SANITARIO, DIRECTOR.
     */
    lowIntakeAlerts: permissionProcedure('care:read')
      .input(LowIntakeAlertsInput)
      .query(async ({ ctx, input }) => {
        await assertCenter(ctx.db, input.centerId);

        // Obtener residentes activos del centro con sus últimas ingestas
        const residents = await ctx.db.resident.findMany({
          where: {
            centerId: input.centerId,
            status:   'ACTIVO',
          },
          select: {
            id:        true,
            firstName: true,
            lastName:  true,
            dietType:  true,
            bed: { select: { code: true, unit: { select: { id: true, name: true } } } },
            intakeRecords: {
              orderBy: { date: 'desc' },
              take:    input.windowSize * 2, // margen para la ventana deslizante
              select:  { date: true, foodPct: true },
            },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });

        const alerts = residents
          .map((r) => {
            const risk = isLowIntakeRisk(r.intakeRecords, {
              windowSize:              input.windowSize,
              averageThreshold:        DEFAULT_AVG_THRESHOLD,
              consecutiveLowThreshold: DEFAULT_CONSEC_LOW_THR,
              consecutiveLowCount:     DEFAULT_CONSEC_LOW_CNT,
            });
            return { resident: r, risk };
          })
          .filter((item) => item.risk.isRisk);

        return alerts.map(({ resident, risk }) => ({
          residentId: resident.id,
          firstName:  resident.firstName,
          lastName:   resident.lastName,
          dietType:   resident.dietType,
          bed:        resident.bed,
          avgFoodPct: risk.avg,
          reasons:    risk.reasons,
        }));
      }),
  }),

  // =========================================================================
  // kitchen.* — Listados de cocina/comedor (RF-NUT-008/009)
  // No son tablas: son queries derivadas.
  // =========================================================================

  kitchen: createTRPCRouter({

    /**
     * Listado de dieta para cocina (RF-NUT-008).
     * Devuelve todos los residentes ACTIVOS del centro con:
     *   - dietType, liquidTexture, nutritionSupplements (de Resident)
     *   - alergias alimentarias (Allergy con allergyType=ALIMENTARIA)
     * Agrupables por unidad desde el frontend.
     *
     * Permiso: care:read → AUXILIAR, SANITARIO, DIRECTOR.
     */
    dietListing: permissionProcedure('care:read')
      .input(DietListingInput)
      .query(async ({ ctx, input }) => {
        await assertCenter(ctx.db, input.centerId);

        return ctx.db.resident.findMany({
          where: {
            centerId: input.centerId,
            status:   'ACTIVO',
          },
          select: {
            id:                  true,
            firstName:           true,
            lastName:            true,
            dietType:            true,
            liquidTexture:       true,
            nutritionSupplements: true,
            bed: {
              select: {
                code: true,
                unit: { select: { id: true, name: true } },
              },
            },
            allergies: {
              where: { allergyType: 'ALIMENTARIA' },
              select: {
                id:        true,
                substance: true,
                severity:  true,
              },
            },
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });
      }),

    /**
     * Listado de residentes por comedor para una comida (RF-NUT-009).
     * Filtra por centro (obligatorio) y opcionalmente por unidad.
     * El frontend puede usarlo para marcar asistencia al comedor.
     *
     * Permiso: care:read → AUXILIAR, SANITARIO, DIRECTOR.
     */
    mealListing: permissionProcedure('care:read')
      .input(MealListingInput)
      .query(async ({ ctx, input }) => {
        await assertCenter(ctx.db, input.centerId);

        return ctx.db.resident.findMany({
          where: {
            centerId: input.centerId,
            status:   'ACTIVO',
            ...(input.unitId
              ? { bed: { unitId: input.unitId } }
              : {}),
          },
          select: {
            id:           true,
            firstName:    true,
            lastName:     true,
            dietType:     true,
            liquidTexture: true,
            bed: {
              select: {
                code: true,
                unit: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [
            // Ordenar por unidad → habitación → apellido
            { bed: { unit: { name: 'asc' } } },
            { bed: { code: 'asc' } },
            { lastName: 'asc' },
          ],
        });
      }),
  }),
});
