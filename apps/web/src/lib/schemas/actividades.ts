/**
 * Schemas Zod para el dominio de Actividades — CLIENT-SAFE.
 *
 * Este módulo SOLO importa `zod`. No importa `@vetlla/db`, `@prisma/client`,
 * ni nada que instancie PrismaClient.
 *
 * Los valores de los enums se declaran aquí como constantes (espejo de los
 * enums Prisma) para que el cliente pueda usarlos sin riesgo de bundling.
 * Si cambia el schema Prisma, actualizar aquí también.
 *
 * El router `@/server/routers/actividades` importa desde aquí (única fuente de verdad).
 * Los formularios cliente también importan desde aquí.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum mirrors (sin dependencia de @prisma/client ni @vetlla/db)
// ---------------------------------------------------------------------------

export const ActivityCategory = {
  COGNITIVA: 'COGNITIVA',
  FISICA:    'FISICA',
  SOCIAL:    'SOCIAL',
  CREATIVA:  'CREATIVA',
  SALIDA:    'SALIDA',
  OTRA:      'OTRA',
} as const;
export type ActivityCategory = (typeof ActivityCategory)[keyof typeof ActivityCategory];

export const ActivitySessionStatus = {
  PROGRAMADA: 'PROGRAMADA',
  REALIZADA:  'REALIZADA',
  CANCELADA:  'CANCELADA',
} as const;
export type ActivitySessionStatus = (typeof ActivitySessionStatus)[keyof typeof ActivitySessionStatus];

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const activityCreateSchema = z.object({
  name:          z.string().min(1).max(120),
  description:   z.string().max(2000).optional(),
  category:      z.enum(['COGNITIVA', 'FISICA', 'SOCIAL', 'CREATIVA', 'SALIDA', 'OTRA']).default('OTRA'),
  location:      z.string().max(120).optional(),
  responsibleId: z.string().optional(),
  maxCapacity:   z.number().int().min(1).max(500).default(20),
  durationMin:   z.number().int().min(5).max(480).default(60),
});
export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;

export const activityUpdateSchema = activityCreateSchema.partial();
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;

export const sessionCreateSchema = z.object({
  activityId: z.string(),
  centerId:   z.string().optional(),
  unitId:     z.string().optional(),
  startsAt:   z.coerce.date(),
  endsAt:     z.coerce.date(),
  notes:      z.string().max(2000).optional(),
});
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;

export const sessionUpdateSchema = sessionCreateSchema.partial().omit({ activityId: true });
export type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>;

export const enrollSchema = z.object({
  sessionId:  z.string(),
  residentId: z.string(),
});
export type EnrollInput = z.infer<typeof enrollSchema>;

export const attendanceSchema = z.object({
  enrollmentId: z.string(),
  attended:     z.boolean(),
  observation:  z.string().max(2000).optional(),
});
export type AttendanceInput = z.infer<typeof attendanceSchema>;
