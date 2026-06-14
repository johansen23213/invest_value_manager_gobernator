/**
 * Router de inventario / almacén / lavandería / pertenencias de residente.
 *
 * ---------------------------------------------------------------------------
 * Matriz RBAC
 * ---------------------------------------------------------------------------
 *
 * inventory:read   → DIRECTOR, SANITARIO, AUXILIAR, SUPERADMIN
 *   Lectura de artículos, movimientos, alertas de bajo stock y pertenencias.
 *
 * inventory:manage → DIRECTOR, AUXILIAR, SUPERADMIN
 *   Alta/modificación de artículos, registro de movimientos (entrada/salida/
 *   ajuste) y gestión de pertenencias del residente.
 *
 * FAMILIAR → solo lectura de pertenencias de SU residente vinculado
 *   (belongings.listMine con assertFamilyAccess — sin permiso inventory:read).
 *
 * ---------------------------------------------------------------------------
 * Sub-routers y endpoints
 * ---------------------------------------------------------------------------
 *
 * inventario.items
 *   list({ category?, active?, onlyLowStock? })  → inventory:read
 *   create(input)                                 → inventory:manage
 *   update({ id, ...campos })                     → inventory:manage
 *   archive({ id })          → active=false        → inventory:manage
 *
 * inventario.movements
 *   list({ itemId })                              → inventory:manage
 *   record({ itemId, type, quantity, reason? })   → inventory:manage
 *     SALIDA: valida stock con validateOutbound + applyMovement (sin negativo).
 *     AJUSTE: permite stock absoluto; registra AuditLog.
 *     Actualiza InventoryItem.stock en la misma transacción.
 *
 * inventario.lowStock (sin input)                 → inventory:read
 *   Items activos con stock ≤ stockMin.
 *
 * inventario.belongings
 *   listForResident({ residentId })               → inventory:read + assertResident
 *   create(input)                                 → inventory:manage + assertResident
 *   update({ id, ...campos })                     → inventory:manage + assertBelonging
 *   setStatus({ id, status })                     → inventory:manage + assertBelonging
 *     AuditLog cuando status → PERDIDO.
 *
 * inventario.belongings.listMine({ residentId })  → assertFamilyAccess (FAMILIAR)
 *   Solo lectura, sin permiso inventory:read.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  InventoryCategory,
  MovementType,
  BelongingCategory,
  BelongingStatus,
  type TenantPrisma,
} from '@vetlla/db';
import { createTRPCRouter, permissionProcedure, tenantProcedure } from '@/server/trpc';
import { assertFamilyAccess } from '@/server/family-access';
import { isLowStock, applyMovement } from '@/lib/inventario';

// ---------------------------------------------------------------------------
// Guards internos
// ---------------------------------------------------------------------------

/** Verifica que el residente existe en el tenant (vía RLS) o lanza NOT_FOUND. */
async function assertResident(db: TenantPrisma, residentId: string) {
  const found = await db.resident.findUnique({ where: { id: residentId } });
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });
  }
}

/** Verifica que una pertenencia existe y pertenece al residente indicado. */
async function assertBelonging(
  db: TenantPrisma,
  belongingId: string,
  residentId: string,
) {
  const b = await db.residentBelonging.findUnique({ where: { id: belongingId } });
  if (!b || b.residentId !== residentId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'La pertenencia no pertenece a este residente.',
    });
  }
  return b;
}

// ---------------------------------------------------------------------------
// Esquemas Zod (exportados — reutilizables en el frontend)
// ---------------------------------------------------------------------------

export const createItemSchema = z.object({
  name:     z.string().min(1).max(200),
  category: z.nativeEnum(InventoryCategory).default('OTRO'),
  unit:     z.string().min(1).max(50),
  stock:    z.number().int().min(0).default(0),
  stockMin: z.number().int().min(0).default(0),
  location: z.string().max(200).optional(),
});

export const updateItemSchema = z.object({
  id:       z.string().min(1),
  name:     z.string().min(1).max(200).optional(),
  category: z.nativeEnum(InventoryCategory).optional(),
  unit:     z.string().min(1).max(50).optional(),
  stockMin: z.number().int().min(0).optional(),
  location: z.string().max(200).optional(),
});

export const recordMovementSchema = z.object({
  itemId:   z.string().min(1),
  type:     z.nativeEnum(MovementType),
  quantity: z.number().int().min(1),
  reason:   z.string().max(500).optional(),
});

export const createBelongingSchema = z.object({
  residentId:  z.string().min(1),
  description: z.string().min(1).max(300),
  category:    z.nativeEnum(BelongingCategory).default('OTRO'),
  quantity:    z.number().int().min(1).default(1),
  label:       z.string().max(100).optional(),
  status:      z.nativeEnum(BelongingStatus).default('EN_USO'),
  notes:       z.string().max(1000).optional(),
});

export const updateBelongingSchema = z.object({
  id:          z.string().min(1),
  residentId:  z.string().min(1),
  description: z.string().min(1).max(300).optional(),
  category:    z.nativeEnum(BelongingCategory).optional(),
  quantity:    z.number().int().min(1).optional(),
  label:       z.string().max(100).optional(),
  notes:       z.string().max(1000).optional(),
});

export const setStatusSchema = z.object({
  id:         z.string().min(1),
  residentId: z.string().min(1),
  status:     z.nativeEnum(BelongingStatus),
});

// ---------------------------------------------------------------------------
// Sub-router: items
// ---------------------------------------------------------------------------

const itemsRouter = createTRPCRouter({

  list: permissionProcedure('inventory:read')
    .input(z.object({
      category:     z.nativeEnum(InventoryCategory).optional(),
      active:       z.boolean().optional(),
      onlyLowStock: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.inventoryItem.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.category ? { category: input.category } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      });
      if (input.onlyLowStock) {
        return items.filter(isLowStock);
      }
      return items;
    }),

  create: permissionProcedure('inventory:manage')
    .input(createItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.inventoryItem.create({
        data: {
          ...input,
          tenantId: ctx.tenantId,
        },
      });
    }),

  update: permissionProcedure('inventory:manage')
    .input(updateItemSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Verificar que el item pertenece al tenant (RLS ya lo garantiza, pero
      // queremos un NOT_FOUND claro si no existe).
      const existing = await ctx.db.inventoryItem.findUnique({ where: { id } });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Artículo no encontrado.' });
      }

      return ctx.db.inventoryItem.update({ where: { id }, data });
    }),

  archive: permissionProcedure('inventory:manage')
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.inventoryItem.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Artículo no encontrado.' });
      }
      return ctx.db.inventoryItem.update({
        where: { id: input.id },
        data:  { active: false },
      });
    }),
});

// ---------------------------------------------------------------------------
// Sub-router: movements
// ---------------------------------------------------------------------------

const movementsRouter = createTRPCRouter({

  list: permissionProcedure('inventory:manage')
    .input(z.object({ itemId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.db.inventoryMovement.findMany({
        where:   { itemId: input.itemId },
        orderBy: { movedAt: 'desc' },
      }),
    ),

  record: permissionProcedure('inventory:manage')
    .input(recordMovementSchema)
    .mutation(async ({ ctx, input }) => {
      // 1) Cargar el item (la RLS garantiza que es del tenant).
      const item = await ctx.db.inventoryItem.findUnique({ where: { id: input.itemId } });
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Artículo no encontrado.' });
      }
      if (!item.active) {
        throw new TRPCError({
          code:    'BAD_REQUEST',
          message: 'No se pueden registrar movimientos en un artículo archivado.',
        });
      }

      // 2) Calcular nuevo stock con la lógica pura (lanza Error si SALIDA deja negativo).
      let newStock: number;
      try {
        newStock = applyMovement(item.stock, { type: input.type, quantity: input.quantity });
      } catch (err: unknown) {
        throw new TRPCError({
          code:    'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Movimiento no válido.',
        });
      }

      // 3) Persiste movimiento + actualiza stock en una transacción.
      const [movement] = await ctx.db.$transaction([
        ctx.db.inventoryMovement.create({
          data: {
            tenantId: ctx.tenantId,
            itemId:   input.itemId,
            type:     input.type,
            quantity: input.quantity,
            reason:   input.reason ?? null,
            userId:   ctx.session.user.id,
          },
        }),
        ctx.db.inventoryItem.update({
          where: { id: input.itemId },
          data:  { stock: newStock },
        }),
      ]);

      // 4) AuditLog solo para AJUSTE (corrección de diferencia de inventario físico).
      if (input.type === 'AJUSTE') {
        await ctx.audit({
          action:   'UPDATE',
          entity:   'InventoryItem',
          entityId: input.itemId,
          summary:  `Ajuste de stock: "${item.name}" → ${newStock} ${item.unit}${input.reason ? ` (${input.reason})` : ''}`,
          metadata: {
            itemId:   input.itemId,
            from:     item.stock,
            to:       newStock,
            quantity: input.quantity,
            reason:   input.reason ?? null,
          },
        });
      }

      return movement;
    }),
});

// ---------------------------------------------------------------------------
// Sub-router: lowStock
// ---------------------------------------------------------------------------

const lowStockRouter = createTRPCRouter({

  list: permissionProcedure('inventory:read')
    .query(async ({ ctx }) => {
      const items = await ctx.db.inventoryItem.findMany({
        where:   { tenantId: ctx.tenantId, active: true },
        orderBy: { name: 'asc' },
      });
      return items.filter(isLowStock);
    }),
});

// ---------------------------------------------------------------------------
// Sub-router: belongings
// ---------------------------------------------------------------------------

const belongingsRouter = createTRPCRouter({

  listForResident: permissionProcedure('inventory:read')
    .input(z.object({ residentId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      return ctx.db.residentBelonging.findMany({
        where:   { residentId: input.residentId },
        orderBy: [{ status: 'asc' }, { registeredAt: 'desc' }],
      });
    }),

  create: permissionProcedure('inventory:manage')
    .input(createBelongingSchema)
    .mutation(async ({ ctx, input }) => {
      await assertResident(ctx.db, input.residentId);
      const { residentId, ...rest } = input;
      return ctx.db.residentBelonging.create({
        data: {
          ...rest,
          residentId,
          tenantId: ctx.tenantId,
        },
      });
    }),

  update: permissionProcedure('inventory:manage')
    .input(updateBelongingSchema)
    .mutation(async ({ ctx, input }) => {
      await assertBelonging(ctx.db, input.id, input.residentId);
      const { id, residentId: _residentId, ...data } = input;
      return ctx.db.residentBelonging.update({ where: { id }, data });
    }),

  setStatus: permissionProcedure('inventory:manage')
    .input(setStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await assertBelonging(ctx.db, input.id, input.residentId);

      const updated = await ctx.db.residentBelonging.update({
        where: { id: input.id },
        data:  { status: input.status },
      });

      // AuditLog cuando una pertenencia se marca como perdida.
      if (input.status === 'PERDIDO') {
        await ctx.audit({
          action:   'UPDATE',
          entity:   'ResidentBelonging',
          entityId: input.residentId,
          summary:  `Pertenencia marcada como PERDIDA: "${existing.description}"${existing.label ? ` [${existing.label}]` : ''}`,
          metadata: {
            belongingId:  input.id,
            description:  existing.description,
            category:     existing.category,
            previousStatus: existing.status,
          },
        });
      }

      return updated;
    }),

  /** Portal de familias: solo el residente vinculado al FAMILIAR. */
  listMine: tenantProcedure
    .input(z.object({ residentId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertFamilyAccess(ctx.db, ctx.session.user.id, input.residentId);
      return ctx.db.residentBelonging.findMany({
        where:   { residentId: input.residentId },
        orderBy: [{ status: 'asc' }, { registeredAt: 'desc' }],
      });
    }),
});

// ---------------------------------------------------------------------------
// Router raíz del dominio
// ---------------------------------------------------------------------------

export const inventarioRouter = createTRPCRouter({
  items:     itemsRouter,
  movements: movementsRouter,
  lowStock:  lowStockRouter,
  belongings: belongingsRouter,
});
