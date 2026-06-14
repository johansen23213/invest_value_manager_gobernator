/**
 * Schemas Zod para el dominio de Baja/Exitus — CLIENT-SAFE.
 *
 * Este módulo SOLO importa `zod`. No importa `@vetlla/db`, `@prisma/client`,
 * ni nada que instancie PrismaClient.
 *
 * Los valores de los enums se declaran aquí como constantes (espejo de los
 * enums Prisma) para que el cliente pueda usarlos sin riesgo de bundling.
 * Si cambia el schema Prisma, actualizar aquí también.
 *
 * El router `@/server/routers/discharge` importa desde aquí (única fuente de verdad).
 * Los formularios cliente también importan desde aquí.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum mirrors (sin dependencia de @prisma/client ni @vetlla/db)
// ---------------------------------------------------------------------------

export const DischargeType = {
  DEFUNCION:         'DEFUNCION',
  VOLUNTARIA:        'VOLUNTARIA',
  TRASLADO_CENTRO:   'TRASLADO_CENTRO',
  TRASLADO_HOSPITAL: 'TRASLADO_HOSPITAL',
  FIN_ESTANCIA:      'FIN_ESTANCIA',
  OTRO:              'OTRO',
} as const;
export type DischargeType = (typeof DischargeType)[keyof typeof DischargeType];

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const DischargeTypeSchema = z.enum([
  'DEFUNCION', 'VOLUNTARIA', 'TRASLADO_CENTRO', 'TRASLADO_HOSPITAL', 'FIN_ESTANCIA', 'OTRO',
]);

/** Input para registrar una baja. Exportado para el formulario de confirmación. */
export const RegisterDischargeInput = z.object({
  residentId: z.string().min(1),
  type: DischargeTypeSchema,
  dischargedAt: z.coerce.date(),
  reason: z.string().trim().max(2000).optional(),
  /**
   * Solo para DEFUNCION: nombre del médico certificante.
   * NO es la causa de muerte (esa información no se guarda en el audit summary).
   */
  certifiedBy: z.string().trim().max(200).optional(),
  /** Para TRASLADO_CENTRO / TRASLADO_HOSPITAL: nombre del destino. */
  destination: z.string().trim().max(300).optional(),
  familyNotifiedAt: z.coerce.date().optional(),
  belongingsReturned: z.boolean().optional().default(false),
  /**
   * Checklist extendida en JSON. Cada centro puede definir sus propios campos
   * de protocolo sin necesitar una migración nueva.
   * Ej: { "documentacion_entregada": true, "llaves_devueltas": true }
   */
  checklist: z.record(z.unknown()).optional(),
  notes: z.string().trim().max(5000).optional(),
});
export type RegisterDischargeInput = z.infer<typeof RegisterDischargeInput>;

export const ListDischargesByResidentInput = z.object({
  residentId: z.string().min(1),
});
export type ListDischargesByResidentInput = z.infer<typeof ListDischargesByResidentInput>;
