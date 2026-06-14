/**
 * Schemas Zod para el dominio de Informe Social y Bienestar ACP — CLIENT-SAFE.
 *
 * Este módulo SOLO importa `zod`.
 * NO importa `@vetlla/db`, `@/server/`, ni nada que instancie PrismaClient.
 * (Este dominio no usa enums de Prisma en sus schemas de input.)
 *
 * El router `@/server/routers/social` importa desde aquí (única fuente de verdad).
 * Los formularios cliente también importan desde aquí.
 */

import { z } from 'zod';

/** Input para crear/actualizar el informe social. */
export const UpsertSocialReportInput = z.object({
  residentId:        z.string().min(1),
  reportDate:        z.coerce.date(),
  familySituation:   z.string().trim().max(5000).optional(),
  supportNetwork:    z.string().trim().max(5000).optional(),
  economicSituation: z.string().trim().max(5000).optional(),
  benefits:          z.string().trim().max(5000).optional(),
  workHistory:       z.string().trim().max(5000).optional(),
  socialAssessment:  z.string().trim().max(5000).optional(),
  agreements:        z.string().trim().max(5000).optional(),
  nextReviewDate:    z.coerce.date().optional(),
});
export type UpsertSocialReportInput = z.infer<typeof UpsertSocialReportInput>;

/** Input para obtener el informe social de un residente. */
export const GetSocialReportInput = z.object({
  residentId: z.string().min(1),
});
export type GetSocialReportInput = z.infer<typeof GetSocialReportInput>;

/** Input para crear/actualizar el perfil de bienestar ACP. */
export const UpsertWellbeingProfileInput = z.object({
  residentId:             z.string().min(1),
  // 8 dimensiones ACP (UNE 158101)
  emotionalWellbeing:     z.string().trim().max(5000).optional(),
  physicalWellbeing:      z.string().trim().max(5000).optional(),
  materialWellbeing:      z.string().trim().max(5000).optional(),
  personalDevelopment:    z.string().trim().max(5000).optional(),
  selfDetermination:      z.string().trim().max(5000).optional(),
  interpersonalRelations: z.string().trim().max(5000).optional(),
  socialInclusion:        z.string().trim().max(5000).optional(),
  rights:                 z.string().trim().max(5000).optional(),
  // RF-SOC-005
  importantToThePerson:   z.string().trim().max(5000).optional(),
  importantForThePerson:  z.string().trim().max(5000).optional(),
  // RF-SOC-007: fecha de próxima revisión periódica
  nextReviewDate:         z.coerce.date().optional(),
});
export type UpsertWellbeingProfileInput = z.infer<typeof UpsertWellbeingProfileInput>;

/** Input para el panel de revisiones ACP vencidas. */
export const ListOverdueReviewsInput = z.object({
  /** Si se especifica, filtra solo los residentes de este centro. */
  centerId: z.string().min(1).optional(),
  /** Fecha de referencia para calcular vencimiento (default: now en el servidor). */
  asOf: z.coerce.date().optional(),
});
export type ListOverdueReviewsInput = z.infer<typeof ListOverdueReviewsInput>;
