/**
 * Schemas Zod para el dominio de Admisiones — CLIENT-SAFE.
 *
 * Este módulo SOLO importa `zod`. No importa `@vetlla/db`, `@prisma/client`,
 * ni nada que instancie PrismaClient.
 *
 * Los valores de los enums se declaran aquí como constantes (espejo de los
 * enums Prisma) para que el cliente pueda usarlos sin riesgo de bundling.
 * Si cambia el schema Prisma, actualizar aquí también.
 *
 * El router `@/server/routers/admisiones` importa desde aquí (única fuente de verdad).
 * Los formularios cliente también importan desde aquí.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum mirrors (sin dependencia de @prisma/client ni @vetlla/db)
// ---------------------------------------------------------------------------

export const AdmissionStatus = {
  LEAD:       'LEAD',
  WAITLIST:   'WAITLIST',
  EVALUATION: 'EVALUATION',
  OFFERED:    'OFFERED',
  ADMITTED:   'ADMITTED',
  REJECTED:   'REJECTED',
  WITHDRAWN:  'WITHDRAWN',
} as const;
export type AdmissionStatus = (typeof AdmissionStatus)[keyof typeof AdmissionStatus];

export const AdmissionOrigin = {
  DERIVACION_HOSPITAL:    'DERIVACION_HOSPITAL',
  DERIVACION_SS:          'DERIVACION_SS',
  INICIATIVA_PROPIA:      'INICIATIVA_PROPIA',
  TRASLADO_OTRO_CENTRO:   'TRASLADO_OTRO_CENTRO',
  OTRO:                   'OTRO',
} as const;
export type AdmissionOrigin = (typeof AdmissionOrigin)[keyof typeof AdmissionOrigin];

export const DependencyGrade = {
  SIN_VALORAR: 'SIN_VALORAR',
  GRADO_I:     'GRADO_I',
  GRADO_II:    'GRADO_II',
  GRADO_III:   'GRADO_III',
} as const;
export type DependencyGrade = (typeof DependencyGrade)[keyof typeof DependencyGrade];

export const PlaceRegime = {
  PRIVADA:              'PRIVADA',
  CONCERTADA:           'CONCERTADA',
  PRESTACION_VINCULADA: 'PRESTACION_VINCULADA',
} as const;
export type PlaceRegime = (typeof PlaceRegime)[keyof typeof PlaceRegime];

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const admissionRequestCreateSchema = z.object({
  centerId:        z.string(),
  unitId:          z.string().optional(),
  firstName:       z.string().min(1).max(80),
  lastName:        z.string().min(1).max(120),
  birthDate:       z.coerce.date().optional(),
  contactPhone:    z.string().max(30).optional(),
  contactEmail:    z.string().email().optional().or(z.literal('')),
  contactName:     z.string().max(120).optional(),
  dependencyGrade: z.enum(['SIN_VALORAR', 'GRADO_I', 'GRADO_II', 'GRADO_III']).optional(),
  placeRegime:     z.enum(['PRIVADA', 'CONCERTADA', 'PRESTACION_VINCULADA']).optional(),
  origin:          z.enum(['DERIVACION_HOSPITAL', 'DERIVACION_SS', 'INICIATIVA_PROPIA', 'TRASLADO_OTRO_CENTRO', 'OTRO']).optional(),
  // priority: 1=alta, 2=media, 3=baja (matching the schema Int default 2)
  priority:        z.number().int().min(1).max(3).default(2),
  expectedAdmissionDate: z.coerce.date().optional(),
  notes:           z.string().max(2000).optional(),
});
export type AdmissionRequestCreateInput = z.infer<typeof admissionRequestCreateSchema>;

export const admissionRequestUpdateSchema = admissionRequestCreateSchema.partial().extend({
  id: z.string(),
});
export type AdmissionRequestUpdateInput = z.infer<typeof admissionRequestUpdateSchema>;

export const admissionTransitionSchema = z.object({
  id:            z.string(),
  to:            z.enum(['LEAD', 'WAITLIST', 'EVALUATION', 'OFFERED', 'ADMITTED', 'REJECTED', 'WITHDRAWN']),
  notes:         z.string().max(2000).optional(),
  // Solo para ADMITTED: fecha de ingreso efectivo
  admissionDate: z.coerce.date().optional(),
});
export type AdmissionTransitionInput = z.infer<typeof admissionTransitionSchema>;

export const admissionCloseSchema = z.object({
  id:           z.string(),
  status:       z.enum(['REJECTED', 'WITHDRAWN']),
  outcomeReason: z.string().max(2000).optional(),
});
export type AdmissionCloseInput = z.infer<typeof admissionCloseSchema>;
