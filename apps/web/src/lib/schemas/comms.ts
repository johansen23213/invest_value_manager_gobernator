/**
 * Schemas Zod para el dominio de Comunicaciones — CLIENT-SAFE.
 *
 * Este módulo SOLO importa `zod`. No importa `@vetlla/db`, `@prisma/client`,
 * ni nada que instancie PrismaClient.
 *
 * Los valores de los enums se declaran aquí como constantes (espejo de los
 * enums Prisma) para que el cliente pueda usarlos sin riesgo de bundling.
 * Si cambia el schema Prisma, actualizar aquí también.
 *
 * El router `@/server/routers/comms` importa desde aquí (única fuente de verdad).
 * Los formularios cliente también importan desde aquí.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum mirrors (sin dependencia de @prisma/client ni @vetlla/db)
// ---------------------------------------------------------------------------

export const AnnouncementAudience = {
  TODO_EL_CENTRO: 'TODO_EL_CENTRO',
  POR_UNIDAD:     'POR_UNIDAD',
  RESIDENTE:      'RESIDENTE',
} as const;
export type AnnouncementAudience = (typeof AnnouncementAudience)[keyof typeof AnnouncementAudience];

export const AnnouncementCategory = {
  ADMINISTRACION: 'ADMINISTRACION',
  VISITAS:        'VISITAS',
  BIENESTAR:      'BIENESTAR',
  DOCUMENTACION:  'DOCUMENTACION',
  EVENTOS:        'EVENTOS',
  GENERAL:        'GENERAL',
} as const;
export type AnnouncementCategory = (typeof AnnouncementCategory)[keyof typeof AnnouncementCategory];

export const MessageThreadCategory = {
  ADMINISTRACION: 'ADMINISTRACION',
  VISITAS:        'VISITAS',
  BIENESTAR:      'BIENESTAR',
  DOCUMENTACION:  'DOCUMENTACION',
  PAGOS:          'PAGOS',
  GENERAL:        'GENERAL',
} as const;
export type MessageThreadCategory = (typeof MessageThreadCategory)[keyof typeof MessageThreadCategory];

export const MessageThreadStatus = {
  ABIERTO: 'ABIERTO',
  CERRADO: 'CERRADO',
} as const;
export type MessageThreadStatus = (typeof MessageThreadStatus)[keyof typeof MessageThreadStatus];

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

export const AnnouncementAudienceSchema = z.enum(['TODO_EL_CENTRO', 'POR_UNIDAD', 'RESIDENTE']);
export const AnnouncementCategorySchema = z.enum(['ADMINISTRACION', 'VISITAS', 'BIENESTAR', 'DOCUMENTACION', 'EVENTOS', 'GENERAL']);
export const MessageThreadCategorySchema = z.enum(['ADMINISTRACION', 'VISITAS', 'BIENESTAR', 'DOCUMENTACION', 'PAGOS', 'GENERAL']);
export const MessageThreadStatusSchema = z.enum(['ABIERTO', 'CERRADO']);

export const PublishAnnouncementInput = z.object({
  title:      z.string().trim().min(3).max(160),
  body:       z.string().trim().min(10).max(10000),
  category:   AnnouncementCategorySchema.default('GENERAL'),
  audience:   AnnouncementAudienceSchema,
  unitId:     z.string().min(1).optional().nullable(),
  residentId: z.string().min(1).optional().nullable(),
  requiresAck: z.boolean().default(false),
  publishedAt: z.coerce.date().optional(), // permite programar la publicación
});
export type PublishAnnouncementInput = z.infer<typeof PublishAnnouncementInput>;

export const CreateThreadInput = z.object({
  residentId: z.string().min(1),
  subject:    z.string().trim().min(3).max(200),
  category:   MessageThreadCategorySchema.default('GENERAL'),
  body:       z.string().trim().min(1).max(5000), // primer mensaje
});
export type CreateThreadInput = z.infer<typeof CreateThreadInput>;

export const PostMessageInput = z.object({
  threadId: z.string().min(1),
  body:     z.string().trim().min(1).max(5000),
  // NOTA Q-004: campo `attachments` intencionadamente ausente.
  // Implementar cuando se resuelva Q-004 (object storage EU).
});
export type PostMessageInput = z.infer<typeof PostMessageInput>;

export const ListThreadsInput = z.object({
  status:     MessageThreadStatusSchema.optional(),
  category:   MessageThreadCategorySchema.optional(),
  residentId: z.string().optional(),
}).optional();
export type ListThreadsInput = z.infer<typeof ListThreadsInput>;
