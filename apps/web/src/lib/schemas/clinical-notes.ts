/**
 * Schemas Zod para el dominio de Documentación Clínica — CLIENT-SAFE.
 *
 * Este módulo SOLO importa `zod`. No importa `@vetlla/db`, `@prisma/client`,
 * ni nada que instancie PrismaClient.
 *
 * Los valores de los enums se declaran aquí como constantes (espejo de los
 * enums Prisma) para que el cliente pueda usarlos sin riesgo de bundling.
 * Si cambia el schema Prisma, actualizar aquí también.
 *
 * El router `@/server/routers/clinical-notes` importa desde aquí (única fuente de verdad).
 * Los formularios cliente también importan desde aquí.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum mirrors (sin dependencia de @prisma/client ni @vetlla/db)
// ---------------------------------------------------------------------------

export const NursingNoteShift = {
  MANANA: 'MANANA',
  TARDE:  'TARDE',
  NOCHE:  'NOCHE',
} as const;
export type NursingNoteShift = (typeof NursingNoteShift)[keyof typeof NursingNoteShift];

export const NursingNoteCategory = {
  GENERAL:      'GENERAL',
  INCIDENCIA:   'INCIDENCIA',
  CURA:         'CURA',
  CONDUCTA:     'CONDUCTA',
  SUENO:        'SUENO',
  DOLOR:        'DOLOR',
  ALIMENTACION: 'ALIMENTACION',
} as const;
export type NursingNoteCategory = (typeof NursingNoteCategory)[keyof typeof NursingNoteCategory];

export const MedicalNoteType = {
  EVOLUTIVO:   'EVOLUTIVO',
  EXPLORACION: 'EXPLORACION',
  DERIVACION:  'DERIVACION',
  VISITA:      'VISITA',
} as const;
export type MedicalNoteType = (typeof MedicalNoteType)[keyof typeof MedicalNoteType];

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const NursingNoteShiftSchema    = z.enum(['MANANA', 'TARDE', 'NOCHE']);
export const NursingNoteCategorySchema = z.enum(['GENERAL', 'INCIDENCIA', 'CURA', 'CONDUCTA', 'SUENO', 'DOLOR', 'ALIMENTACION']);
export const MedicalNoteTypeSchema     = z.enum(['EVOLUTIVO', 'EXPLORACION', 'DERIVACION', 'VISITA']);

/** Input para crear una nota de enfermería. Exportado para el formulario del cliente. */
export const CreateNursingNoteInput = z.object({
  residentId: z.string().min(1),
  shift:      NursingNoteShiftSchema,
  noteDate:   z.coerce.date(),
  body:       z.string().trim().min(1).max(10000),
  category:   NursingNoteCategorySchema.optional().default('GENERAL'),
});
export type CreateNursingNoteInput = z.infer<typeof CreateNursingNoteInput>;

/** Input para listar notas por residente. */
export const ListNursingNotesByResidentInput = z.object({
  residentId: z.string().min(1),
  shift:      NursingNoteShiftSchema.optional(),
  dateFrom:   z.coerce.date().optional(),
  dateTo:     z.coerce.date().optional(),
});
export type ListNursingNotesByResidentInput = z.infer<typeof ListNursingNotesByResidentInput>;

/** Input para el traspaso de turno: notas de un turno/fecha para un centro completo. */
export const ListForShiftHandoverInput = z.object({
  centerId: z.string().min(1),
  unitId:   z.string().min(1).optional(), // filtrar por unidad si se especifica
  shift:    NursingNoteShiftSchema,
  noteDate: z.coerce.date(),
});
export type ListForShiftHandoverInput = z.infer<typeof ListForShiftHandoverInput>;

/** Input para crear un evolutivo médico. */
export const CreateMedicalNoteInput = z.object({
  residentId: z.string().min(1),
  noteDate:   z.coerce.date(),
  type:       MedicalNoteTypeSchema,
  reason:     z.string().trim().max(500).optional(),
  body:       z.string().trim().min(1).max(20000),
  plan:       z.string().trim().max(5000).optional(),
});
export type CreateMedicalNoteInput = z.infer<typeof CreateMedicalNoteInput>;

/** Input para listar evolutivos médicos por residente. */
export const ListMedicalNotesByResidentInput = z.object({
  residentId: z.string().min(1),
  type:       MedicalNoteTypeSchema.optional(),
  dateFrom:   z.coerce.date().optional(),
  dateTo:     z.coerce.date().optional(),
});
export type ListMedicalNotesByResidentInput = z.infer<typeof ListMedicalNotesByResidentInput>;
