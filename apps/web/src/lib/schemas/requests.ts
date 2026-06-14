/**
 * Schemas Zod para el dominio de Solicitudes del portal de familias — CLIENT-SAFE.
 *
 * Este módulo SOLO importa `zod`. No importa `@vetlla/db`, `@prisma/client`,
 * ni nada que instancie PrismaClient.
 *
 * Los valores de los enums se declaran aquí como constantes (espejo de los
 * enums Prisma) para que el cliente pueda usarlos sin riesgo de bundling.
 * Si cambia el schema Prisma, actualizar aquí también.
 *
 * El router `@/server/routers/requests` importa desde aquí (única fuente de verdad).
 * Los formularios cliente también importan desde aquí.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum mirrors (sin dependencia de @prisma/client ni @vetlla/db)
// ---------------------------------------------------------------------------

export const ServiceRequestCategory = {
  ADMINISTRACION:      'ADMINISTRACION',
  DOCUMENTACION:       'DOCUMENTACION',
  VISITAS:             'VISITAS',
  ACTIVIDADES:         'ACTIVIDADES',
  MANTENIMIENTO:       'MANTENIMIENTO',
  ALIMENTACION:        'ALIMENTACION',
  COMUNICACION:        'COMUNICACION',
  OBJETOS_PERSONALES:  'OBJETOS_PERSONALES',
  INCIDENCIA_APP:      'INCIDENCIA_APP',
  OTRA:                'OTRA',
} as const;
export type ServiceRequestCategory = (typeof ServiceRequestCategory)[keyof typeof ServiceRequestCategory];

export const ServiceRequestStatus = {
  RECIBIDA:       'RECIBIDA',
  ASIGNADA:       'ASIGNADA',
  EN_CURSO:       'EN_CURSO',
  PENDIENTE_INFO: 'PENDIENTE_INFO',
  RESUELTA:       'RESUELTA',
  CERRADA:        'CERRADA',
  REABIERTA:      'REABIERTA',
} as const;
export type ServiceRequestStatus = (typeof ServiceRequestStatus)[keyof typeof ServiceRequestStatus];

export const ServiceRequestPriority = {
  BAJA:    'BAJA',
  NORMAL:  'NORMAL',
  ALTA:    'ALTA',
  URGENTE: 'URGENTE',
} as const;
export type ServiceRequestPriority = (typeof ServiceRequestPriority)[keyof typeof ServiceRequestPriority];

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const ServiceRequestCategorySchema = z.enum([
  'ADMINISTRACION', 'DOCUMENTACION', 'VISITAS', 'ACTIVIDADES',
  'MANTENIMIENTO', 'ALIMENTACION', 'COMUNICACION', 'OBJETOS_PERSONALES',
  'INCIDENCIA_APP', 'OTRA',
]);

export const ServiceRequestStatusSchema = z.enum([
  'RECIBIDA', 'ASIGNADA', 'EN_CURSO', 'PENDIENTE_INFO',
  'RESUELTA', 'CERRADA', 'REABIERTA',
]);

export const ServiceRequestPrioritySchema = z.enum([
  'BAJA', 'NORMAL', 'ALTA', 'URGENTE',
]);

export const CreateRequestInput = z.object({
  residentId:  z.string().min(1),
  category:    ServiceRequestCategorySchema,
  priority:    ServiceRequestPrioritySchema.default('NORMAL'),
  title:       z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
});
export type CreateRequestInput = z.infer<typeof CreateRequestInput>;

export const AddCommentInput = z.object({
  requestId: z.string().min(1),
  body:      z.string().trim().min(1).max(5000),
  internal:  z.boolean().default(false), // solo staff puede poner true; familiar siempre false
});
export type AddCommentInput = z.infer<typeof AddCommentInput>;
