/**
 * Schemas Zod para el dominio de Nutrición — CLIENT-SAFE.
 *
 * Este módulo SOLO importa `zod`. No importa `@vetlla/db`, `@prisma/client`,
 * ni nada que instancie PrismaClient.
 *
 * Los valores de los enums se declaran aquí como constantes (espejo de los
 * enums Prisma) para que el cliente pueda usarlos sin riesgo de bundling.
 * Si cambia el schema Prisma, actualizar aquí también.
 *
 * El router `@/server/routers/nutrition` importa desde aquí (única fuente de verdad).
 * Los formularios cliente también importan desde aquí.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum mirrors (sin dependencia de @prisma/client ni @vetlla/db)
// ---------------------------------------------------------------------------

export const MealType = {
  DESAYUNO: 'DESAYUNO',
  COMIDA:   'COMIDA',
  MERIENDA: 'MERIENDA',
  CENA:     'CENA',
} as const;
export type MealType = (typeof MealType)[keyof typeof MealType];

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const MealTypeSchema = z.enum(['DESAYUNO', 'COMIDA', 'MERIENDA', 'CENA']);

/** Alérgenos válidos. Se usa como valor de string porque Allergen no es un
 *  enum Prisma estándar en el cliente — está almacenado como JSON array. */
export const AllergenValueSchema = z.enum([
  'GLUTEN', 'CRUSTACEOS', 'HUEVOS', 'PESCADO', 'CACAHUETES', 'SOJA',
  'LACTEOS', 'FRUTOS_CASCARA', 'APIO', 'MOSTAZA', 'SESAMO', 'SULFITOS',
  'ALTRAMUCES', 'MOLUSCOS',
]);
export type AllergenValue = z.infer<typeof AllergenValueSchema>;

/** Input para upsert de un ítem del menú (RF-NUT-003). */
export const UpsertMenuItemInput = z.object({
  /** Si se proporciona id, es un update; si no, es un create. */
  id:            z.string().min(1).optional(),
  centerId:      z.string().min(1),
  date:          z.coerce.date(),
  meal:          MealTypeSchema,
  dishName:      z.string().trim().min(1).max(200),
  description:   z.string().trim().max(1000).optional(),
  allergens:     z.array(AllergenValueSchema).default([]),
  isAlternative: z.boolean().default(false),
});
export type UpsertMenuItemInput = z.infer<typeof UpsertMenuItemInput>;

/** Input para listar el menú de un centro en una fecha. */
export const ListMenuInput = z.object({
  centerId: z.string().min(1),
  date:     z.coerce.date(),
});
export type ListMenuInput = z.infer<typeof ListMenuInput>;

/** Input para borrar un ítem del menú. */
export const DeleteMenuItemInput = z.object({
  id: z.string().min(1),
});
export type DeleteMenuItemInput = z.infer<typeof DeleteMenuItemInput>;

/** Input para que el familiar consulte el menú (RF-NUT-005). */
export const MenuForFamilyInput = z.object({
  residentId: z.string().min(1),
  date:       z.coerce.date(),
});
export type MenuForFamilyInput = z.infer<typeof MenuForFamilyInput>;

/** Input para registrar una ingesta (RF-NUT-006). */
export const RecordIntakeInput = z.object({
  residentId:  z.string().min(1),
  date:        z.coerce.date(),
  meal:        MealTypeSchema,
  foodPct:     z.number().int().min(0).max(100),
  hydrationMl: z.number().int().min(0).optional(),
  notes:       z.string().trim().max(1000).optional(),
});
export type RecordIntakeInput = z.infer<typeof RecordIntakeInput>;

/** Input para listar ingestas de un residente. */
export const ListIntakeByResidentInput = z.object({
  residentId: z.string().min(1),
  dateFrom:   z.coerce.date().optional(),
  dateTo:     z.coerce.date().optional(),
});
export type ListIntakeByResidentInput = z.infer<typeof ListIntakeByResidentInput>;

/** Input para el listado de alertas de baja ingesta del centro. */
export const LowIntakeAlertsInput = z.object({
  centerId:   z.string().min(1),
  windowSize: z.number().int().min(1).max(100).optional().default(14),
});
export type LowIntakeAlertsInput = z.infer<typeof LowIntakeAlertsInput>;

/** Input para el listado de dieta/cocina del centro (RF-NUT-008). */
export const DietListingInput = z.object({
  centerId: z.string().min(1),
  date:     z.coerce.date().optional(),
});
export type DietListingInput = z.infer<typeof DietListingInput>;

/** Input para el listado por comedor (RF-NUT-009). */
export const MealListingInput = z.object({
  centerId: z.string().min(1),
  meal:     MealTypeSchema,
  unitId:   z.string().min(1).optional(),
});
export type MealListingInput = z.infer<typeof MealListingInput>;
