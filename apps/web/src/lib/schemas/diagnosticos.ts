/**
 * Schemas Zod para el dominio de Diagnósticos y Ayudas Técnicas — CLIENT-SAFE.
 *
 * Este módulo SOLO importa `zod`. No importa `@vetlla/db`, `@prisma/client`,
 * ni nada que instancie PrismaClient.
 *
 * Los valores de los enums se declaran aquí como constantes (espejo de los
 * enums Prisma) para que el cliente pueda usarlos sin riesgo de bundling.
 * Si cambia el schema Prisma, actualizar aquí también.
 *
 * El router `@/server/routers/diagnosticos` importa desde aquí (única fuente de verdad).
 * Los formularios cliente también importan desde aquí.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum mirrors (sin dependencia de @prisma/client ni @vetlla/db)
// ---------------------------------------------------------------------------

export const DiagnosisType = {
  PRINCIPAL:   'PRINCIPAL',
  SECUNDARIO:  'SECUNDARIO',
} as const;
export type DiagnosisType = (typeof DiagnosisType)[keyof typeof DiagnosisType];

export const DiagnosisStatus = {
  ACTIVO:   'ACTIVO',
  CRONICO:  'CRONICO',
  RESUELTO: 'RESUELTO',
} as const;
export type DiagnosisStatus = (typeof DiagnosisStatus)[keyof typeof DiagnosisStatus];

export const AssistiveDeviceType = {
  SILLA_RUEDAS:        'SILLA_RUEDAS',
  ANDADOR:             'ANDADOR',
  GRUA:                'GRUA',
  CAMA_ARTICULADA:     'CAMA_ARTICULADA',
  AUDIFONO:            'AUDIFONO',
  OXIGENO:             'OXIGENO',
  MULETAS:             'MULETAS',
  ORTESIS:             'ORTESIS',
  SILLA_DUCHA:         'SILLA_DUCHA',
  COLCHON_ANTIESCARAS: 'COLCHON_ANTIESCARAS',
  OTRO:                'OTRO',
} as const;
export type AssistiveDeviceType = (typeof AssistiveDeviceType)[keyof typeof AssistiveDeviceType];

export const AssistiveDeviceStatus = {
  ACTIVO:   'ACTIVO',
  RETIRADO: 'RETIRADO',
} as const;
export type AssistiveDeviceStatus = (typeof AssistiveDeviceStatus)[keyof typeof AssistiveDeviceStatus];

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const createDiagnosisSchema = z.object({
  residentId:  z.string().min(1),
  code:        z.string().max(20).optional(),
  description: z.string().min(1).max(500),
  type:        z.enum(['PRINCIPAL', 'SECUNDARIO']).default('PRINCIPAL'),
  status:      z.enum(['ACTIVO', 'CRONICO', 'RESUELTO']).default('ACTIVO'),
  diagnosedAt: z.coerce.date().optional(),
  resolvedAt:  z.coerce.date().optional(),
  notes:       z.string().max(1000).optional(),
});
export type CreateDiagnosisInput = z.infer<typeof createDiagnosisSchema>;

export const updateDiagnosisSchema = z.object({
  id:          z.string().min(1),
  residentId:  z.string().min(1),
  code:        z.string().max(20).optional(),
  description: z.string().min(1).max(500).optional(),
  type:        z.enum(['PRINCIPAL', 'SECUNDARIO']).optional(),
  diagnosedAt: z.coerce.date().optional(),
  notes:       z.string().max(1000).optional(),
});
export type UpdateDiagnosisInput = z.infer<typeof updateDiagnosisSchema>;

export const transitionDiagnosisSchema = z.object({
  id:         z.string().min(1),
  residentId: z.string().min(1),
  next:       z.enum(['ACTIVO', 'CRONICO', 'RESUELTO']),
  resolvedAt: z.coerce.date().optional(),
});
export type TransitionDiagnosisInput = z.infer<typeof transitionDiagnosisSchema>;

export const createAssistiveDeviceSchema = z.object({
  residentId:    z.string().min(1),
  type:          z.enum(['SILLA_RUEDAS', 'ANDADOR', 'GRUA', 'CAMA_ARTICULADA', 'AUDIFONO', 'OXIGENO', 'MULETAS', 'ORTESIS', 'SILLA_DUCHA', 'COLCHON_ANTIESCARAS', 'OTRO']),
  description:   z.string().max(300).optional(),
  prescribedAt:  z.coerce.date(),
  ownedByCenter: z.boolean().default(false),
  notes:         z.string().max(500).optional(),
});
export type CreateAssistiveDeviceInput = z.infer<typeof createAssistiveDeviceSchema>;

export const updateAssistiveDeviceSchema = z.object({
  id:            z.string().min(1),
  residentId:    z.string().min(1),
  description:   z.string().max(300).optional(),
  ownedByCenter: z.boolean().optional(),
  notes:         z.string().max(500).optional(),
});
export type UpdateAssistiveDeviceInput = z.infer<typeof updateAssistiveDeviceSchema>;

export const retireAssistiveDeviceSchema = z.object({
  id:         z.string().min(1),
  residentId: z.string().min(1),
  retiredAt:  z.coerce.date(),
  notes:      z.string().max(500).optional(),
});
export type RetireAssistiveDeviceInput = z.infer<typeof retireAssistiveDeviceSchema>;
