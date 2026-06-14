/**
 * Router de facturación (RF-ECO-001..005).
 *
 * Facturación que el CENTRO emite a RESIDENTES/familias (cuota mensual de plaza,
 * copagos, extras). NO es el pricing de suscripción SaaS de Vetlla.
 *
 * Aislamiento:
 *   1. RLS por tenant_id a nivel de BD (todas las tablas — tariffs, invoices, etc.).
 *   2. Para endpoints del FAMILIAR (listMine/getMine): verificación explícita
 *      de FamilyLink vía assertFamilyAccess.
 *
 * Permisos:
 * ┌─────────────────────────────────┬──────────┬───────────┬──────────┬──────────┐
 * │ Endpoint                        │ DIRECTOR │ SANITARIO │ AUXILIAR │ FAMILIAR │
 * ├─────────────────────────────────┼──────────┼───────────┼──────────┼──────────┤
 * │ tariffs.list                    │    ✓     │     ✗     │    ✗     │    ✗     │
 * │ tariffs.create                  │    ✓     │     ✗     │    ✗     │    ✗     │
 * │ tariffs.update                  │    ✓     │     ✗     │    ✗     │    ✗     │
 * │ tariffs.archive                 │    ✓     │     ✗     │    ✗     │    ✗     │
 * ├─────────────────────────────────┼──────────┼───────────┼──────────┼──────────┤
 * │ residentBillingProfile.get      │    ✓     │     ✗     │    ✗     │    ✗     │
 * │ residentBillingProfile.upsert   │    ✓     │     ✗     │    ✗     │    ✗     │
 * ├─────────────────────────────────┼──────────┼───────────┼──────────┼──────────┤
 * │ invoices.list                   │    ✓     │     ✗     │    ✗     │    ✗     │
 * │ invoices.get                    │    ✓     │     ✗     │    ✗     │    ✗     │
 * │ invoices.createDraft            │    ✓     │     ✗     │    ✗     │    ✗     │
 * │ invoices.issue                  │    ✓     │     ✗     │    ✗     │    ✗     │
 * │ invoices.markPaid               │    ✓     │     ✗     │    ✗     │    ✗     │
 * │ invoices.void                   │    ✓     │     ✗     │    ✗     │    ✗     │
 * ├─────────────────────────────────┼──────────┼───────────┼──────────┼──────────┤
 * │ invoices.listMine               │    ✗     │     ✗     │    ✗     │    ✓     │
 * │ invoices.getMine                │    ✗     │     ✗     │    ✗     │    ✓     │
 * └─────────────────────────────────┴──────────┴───────────┴──────────┴──────────┘
 *
 * FUERA DE ALCANCE (bloqueado):
 *   Cobro digital / pasarela de pago → TODO Q-007
 *   Remesas SEPA XML reales → TODO Q-007
 *   Verifactu / factura electrónica AEAT → TODO Q-012
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma, InvoiceStatus, PayerType, BillingUnit, prisma as basePrisma } from '@vetlla/db';
import { createTRPCRouter, permissionProcedure } from '@/server/trpc';
import { assertFamilyAccess } from '@/server/family-access';
import {
  calcInvoiceTotals,
  prorateMonthly,
  stayDaysInPeriod,
  firstDayOfMonth,
  lastDayOfMonth,
  type InvoiceLineInput,
} from '@/lib/facturacion';

// ---------------------------------------------------------------------------
// Esquemas Zod reutilizables
// ---------------------------------------------------------------------------

const TariffCreateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  baseAmount: z.number().nonnegative(),
  unit: z.nativeEnum(BillingUnit),
  vatPct: z.number().min(0).max(100).default(0),
  vatExempt: z.boolean().default(true),
  validFrom: z.date().optional(),
  validUntil: z.date().optional(),
});

const TariffUpdateSchema = TariffCreateSchema.partial().extend({
  id: z.string().cuid(),
});

const ResidentBillingProfileSchema = z.object({
  residentId: z.string().cuid(),
  tariffId: z.string().cuid().optional().nullable(),
  publicCopayPct: z.number().min(0).max(100).default(0),
  privatePct: z.number().min(0).max(100).default(100),
  payerType: z.nativeEnum(PayerType).default('FAMILIAR'),
  payerName: z.string().max(255).optional().nullable(),
  sepaMandate: z.string().max(35).optional().nullable(),  // ref SEPA ISO 20022 max 35 chars
  notes: z.string().max(1000).optional().nullable(),
});

const InvoiceListFilterSchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  residentId: z.string().cuid().optional(),
  unitId: z.string().cuid().optional(),
  periodYear: z.number().int().min(2000).max(2100).optional(),
  periodMonth: z.number().int().min(1).max(12).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const InvoiceCreateDraftSchema = z.object({
  residentId: z.string().cuid(),
  /** Año del periodo a facturar (p. ej. 2026). */
  periodYear: z.number().int().min(2000).max(2100),
  /** Mes del periodo a facturar (1–12). */
  periodMonth: z.number().int().min(1).max(12),
  series: z.string().max(10).default('A'),
  dueAt: z.date().optional(),
  notes: z.string().max(1000).optional(),
  /** Líneas manuales adicionales (opcionales; las automáticas vienen del perfil+tarifa). */
  extraLines: z.array(z.object({
    description: z.string().min(1).max(255),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    vatPct: z.number().min(0).max(100).default(0),
    vatExempt: z.boolean().default(true),
    tariffId: z.string().cuid().optional(),
  })).default([]),
});

const InvoiceVoidSchema = z.object({
  id: z.string().cuid(),
  voidReason: z.string().min(1).max(500),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convierte Decimal de Prisma a number de JS para la lógica pura. */
function decToNum(d: Prisma.Decimal): number {
  return d.toNumber();
}

/** Convierte number de JS a Decimal de Prisma para persistencia. */
function numToDec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

// ---------------------------------------------------------------------------
// Router de tariffs
// ---------------------------------------------------------------------------

const tariffsMutations = permissionProcedure('billing:manage');
const tariffsRead      = permissionProcedure('billing:read');

const tariffsRouter = createTRPCRouter({
  /** Lista las tarifas del tenant (activas o todas). */
  list: tariffsRead.input(z.object({ includeInactive: z.boolean().default(false) }))
    .query(({ ctx, input }) =>
      ctx.db.tariff.findMany({
        where: {
          ...(input.includeInactive ? {} : { active: true }),
        },
        orderBy: [{ active: 'desc' }, { code: 'asc' }],
      }),
    ),

  /** Crea una nueva tarifa. */
  create: tariffsMutations.input(TariffCreateSchema).mutation(async ({ ctx, input }) => {
    return ctx.db.tariff.create({
      data: {
        tenantId:   ctx.tenantId,
        code:       input.code,
        name:       input.name,
        baseAmount: numToDec(input.baseAmount),
        unit:       input.unit,
        vatPct:     numToDec(input.vatPct),
        vatExempt:  input.vatExempt,
        validFrom:  input.validFrom,
        validUntil: input.validUntil,
      },
    });
  }),

  /** Actualiza campos de una tarifa existente. */
  update: tariffsMutations.input(TariffUpdateSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    // Verificar que la tarifa pertenece al tenant (RLS ya lo hace, pero es buena práctica)
    const existing = await ctx.db.tariff.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });

    return ctx.db.tariff.update({
      where: { id },
      data: {
        ...(data.code       !== undefined && { code:       data.code }),
        ...(data.name       !== undefined && { name:       data.name }),
        ...(data.baseAmount !== undefined && { baseAmount: numToDec(data.baseAmount) }),
        ...(data.unit       !== undefined && { unit:       data.unit }),
        ...(data.vatPct     !== undefined && { vatPct:     numToDec(data.vatPct) }),
        ...(data.vatExempt  !== undefined && { vatExempt:  data.vatExempt }),
        ...(data.validFrom  !== undefined && { validFrom:  data.validFrom }),
        ...(data.validUntil !== undefined && { validUntil: data.validUntil }),
      },
    });
  }),

  /** Archiva (desactiva) una tarifa. No la borra para mantener trazabilidad histórica. */
  archive: tariffsMutations.input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.tariff.findFirst({
        where: { id: input.id },
        select: { id: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      return ctx.db.tariff.update({ where: { id: input.id }, data: { active: false } });
    }),
});

// ---------------------------------------------------------------------------
// Router de residentBillingProfile
// ---------------------------------------------------------------------------

const billingProfileRouter = createTRPCRouter({
  /** Obtiene el perfil de facturación de un residente (o null si no existe). */
  get: permissionProcedure('billing:read')
    .input(z.object({ residentId: z.string().cuid() }))
    .query(({ ctx, input }) =>
      ctx.db.residentBillingProfile.findUnique({
        where: { residentId: input.residentId },
        include: { tariff: true },
      }),
    ),

  /** Crea o actualiza el perfil de facturación de un residente. */
  upsert: permissionProcedure('billing:manage')
    .input(ResidentBillingProfileSchema)
    .mutation(async ({ ctx, input }) => {
      // Verificar que el residente pertenece al tenant (RLS lo garantiza a nivel BD,
      // pero la excepción 404 es más amigable que un error de FK vacío).
      const resident = await ctx.db.resident.findFirst({
        where: { id: input.residentId },
        select: { id: true },
      });
      if (!resident) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });

      return ctx.db.residentBillingProfile.upsert({
        where: { residentId: input.residentId },
        create: {
          tenantId:       ctx.tenantId,
          residentId:     input.residentId,
          tariffId:       input.tariffId ?? null,
          publicCopayPct: numToDec(input.publicCopayPct),
          privatePct:     numToDec(input.privatePct),
          payerType:      input.payerType,
          payerName:      input.payerName ?? null,
          sepaMandate:    input.sepaMandate ?? null,
          notes:          input.notes ?? null,
        },
        update: {
          tariffId:       input.tariffId ?? null,
          publicCopayPct: numToDec(input.publicCopayPct),
          privatePct:     numToDec(input.privatePct),
          payerType:      input.payerType,
          payerName:      input.payerName ?? null,
          sepaMandate:    input.sepaMandate ?? null,
          notes:          input.notes ?? null,
        },
        include: { tariff: true },
      });
    }),
});

// ---------------------------------------------------------------------------
// Router de invoices
// ---------------------------------------------------------------------------

const invoicesRouter = createTRPCRouter({
  /**
   * Lista facturas del tenant con filtros opcionales.
   * Permisos: billing:read (DIRECTOR).
   */
  list: permissionProcedure('billing:read')
    .input(InvoiceListFilterSchema)
    .query(async ({ ctx, input }) => {
      const { page, pageSize, status, residentId, unitId, periodYear, periodMonth } = input;

      // Si se filtra por unidad, necesitamos resolver los residentes de esa unidad
      let residentIdsFromUnit: string[] | undefined;
      if (unitId) {
        const beds = await ctx.db.bed.findMany({
          where:  { unitId },
          select: { resident: { select: { id: true } } },
        });
        residentIdsFromUnit = beds
          .flatMap((b) => (b.resident ? [b.resident.id] : []));
      }

      const where = {
        ...(status      && { status }),
        ...(residentId  && { residentId }),
        ...(residentIdsFromUnit && { residentId: { in: residentIdsFromUnit } }),
        ...(periodYear  && { invoiceYear: periodYear }),
        ...(periodYear && periodMonth && {
          periodStart: {
            gte: firstDayOfMonth(periodYear, periodMonth - 1),
            lte: lastDayOfMonth(periodYear, periodMonth - 1),
          },
        }),
      };

      const [total, items] = await Promise.all([
        ctx.db.invoice.count({ where }),
        ctx.db.invoice.findMany({
          where,
          orderBy: [{ invoiceYear: 'desc' }, { invoiceNumber: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            resident: { select: { id: true, firstName: true, lastName: true } },
            lines: { orderBy: { sortOrder: 'asc' } },
          },
        }),
      ]);

      return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }),

  /** Obtiene una factura con sus líneas. */
  get: permissionProcedure('billing:read')
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.id },
        include: {
          resident: { select: { id: true, firstName: true, lastName: true } },
          lines: { orderBy: { sortOrder: 'asc' }, include: { tariff: true } },
        },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      return invoice;
    }),

  /**
   * Crea un borrador de factura a partir del perfil de facturación del residente.
   * Genera automáticamente las líneas desde la tarifa del perfil (con prorrateo
   * si el residente ingresó o causó baja a mitad del periodo).
   */
  createDraft: permissionProcedure('billing:manage')
    .input(InvoiceCreateDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const { residentId, periodYear, periodMonth, series, dueAt, notes, extraLines } = input;

      // Cargar residente y perfil de facturación
      const resident = await ctx.db.resident.findFirst({
        where: { id: residentId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionDate: true,
          dischargeDate: true,
          billingProfile: {
            include: { tariff: true },
          },
        },
      });
      if (!resident) throw new TRPCError({ code: 'NOT_FOUND', message: 'Residente no encontrado.' });

      const profile = resident.billingProfile;
      const periodStart = firstDayOfMonth(periodYear, periodMonth - 1);
      const periodEnd   = lastDayOfMonth(periodYear, periodMonth - 1);

      // Construir líneas de factura
      const lines: InvoiceLineInput[] = [];

      // Línea automática desde tarifa del perfil
      if (profile?.tariff) {
        const tariff = profile.tariff;
        let amount = decToNum(tariff.baseAmount);

        // Aplicar porcentaje privado (descuenta la aportación pública)
        const publicPct = decToNum(profile.publicCopayPct);
        amount = amount * (1 - publicPct / 100);

        // Prorrateo para tarifa MENSUAL
        if (tariff.unit === 'MENSUAL') {
          const days = stayDaysInPeriod(
            periodStart,
            periodEnd,
            resident.admissionDate ?? periodStart,
            resident.dischargeDate,
          );
          amount = prorateMonthly(amount, days, periodStart);
        }

        lines.push({
          description: `${tariff.name} — ${periodYear}/${String(periodMonth).padStart(2, '0')}`,
          quantity:    tariff.unit === 'MENSUAL' ? 1 : 1,
          unitPrice:   amount,
          vatPct:      decToNum(tariff.vatPct),
          vatExempt:   tariff.vatExempt,
          sortOrder:   0,
          tariffId:    tariff.id,
        });
      }

      // Añadir líneas manuales extras
      for (const [idx, extra] of extraLines.entries()) {
        lines.push({
          description: extra.description,
          quantity:    extra.quantity,
          unitPrice:   extra.unitPrice,
          vatPct:      extra.vatPct,
          vatExempt:   extra.vatExempt,
          sortOrder:   100 + idx,
          tariffId:    extra.tariffId,
        });
      }

      // Calcular totales
      const totals = calcInvoiceTotals(lines);

      // Crear borrador en BD (sin número de serie, sin fecha de emisión)
      return ctx.db.invoice.create({
        data: {
          tenantId:    ctx.tenantId,
          residentId,
          series,
          periodStart,
          periodEnd,
          dueAt:       dueAt ?? null,
          status:      'DRAFT',
          payerType:   profile?.payerType ?? 'FAMILIAR',
          payerName:   profile?.payerName ?? null,
          baseAmount:  numToDec(totals.baseAmount),
          vatAmount:   numToDec(totals.vatAmount),
          totalAmount: numToDec(totals.totalAmount),
          notes:       notes ?? null,
          lines: {
            create: totals.lines.map((l) => ({
              tenantId:    ctx.tenantId,
              tariffId:    l.tariffId ?? null,
              description: l.description,
              quantity:    numToDec(l.quantity),
              unitPrice:   numToDec(l.unitPrice),
              vatPct:      numToDec(l.vatPct),
              vatExempt:   l.vatExempt,
              lineBase:    numToDec(l.lineBase),
              lineVat:     numToDec(l.lineVat),
              lineTotal:   numToDec(l.lineTotal),
              sortOrder:   l.sortOrder ?? 0,
            })),
          },
        },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
      });
    }),

  /**
   * Pasa una factura de DRAFT a ISSUED, asignando número correlativo.
   *
   * La asignación de número se hace dentro de una transacción SERIALIZABLE para
   * evitar la carrera "dos ISSUE simultáneos para el mismo tenant+año".
   * El UNIQUE (tenant_id, invoice_year, series, invoice_number) actúa como
   * red de seguridad adicional.
   *
   * AuditLog: acción ISSUE — dato económico sensible.
   */
  issue: permissionProcedure('billing:manage')
    .input(z.object({
      id:       z.string().cuid(),
      issuedAt: z.date().optional(),
      dueAt:    z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.id },
        select: { id: true, status: true, series: true, residentId: true, totalAmount: true },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      if (invoice.status !== 'DRAFT') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Solo se puede emitir una factura en estado DRAFT. Estado actual: ${invoice.status}.`,
        });
      }

      const now         = input.issuedAt ?? new Date();
      const invoiceYear = now.getFullYear();
      const series      = invoice.series;

      // Transacción SERIALIZABLE para asignar número correlativo sin huecos.
      // Usamos basePrisma directamente (cliente sin extensión) para poder pasar
      // isolationLevel: 'Serializable'. Dentro de la transacción activamos bypass_rls
      // para que la UPDATE pase RLS (el acceso ya está validado arriba con findFirst).
      // Si hay colisión (P2034), la capa de aplicación puede reintentar.
      const issued = await basePrisma.$transaction(
        async (tx) => {
          // Activar bypass_rls local para la transacción (el acceso ya está verificado)
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          // Bloquear el máximo actual para este tenant+año+serie (FOR UPDATE)
          const maxRow = await tx.$queryRaw<Array<{ max: number | null }>>`
            SELECT MAX(invoice_number) AS max
            FROM invoices
            WHERE tenant_id = ${ctx.tenantId}
              AND invoice_year = ${invoiceYear}
              AND series = ${series}
            FOR UPDATE
          `;
          const nextNumber = ((maxRow[0]?.max) ?? 0) + 1;

          return tx.invoice.update({
            where: { id: input.id },
            data: {
              status:        'ISSUED',
              invoiceNumber: nextNumber,
              invoiceYear,
              issuedAt:      now,
              ...(input.dueAt && { dueAt: input.dueAt }),
            },
            include: { lines: { orderBy: { sortOrder: 'asc' } } },
          });
        },
        { isolationLevel: 'Serializable' },
      );

      // AuditLog — acción económica sensible
      await ctx.audit({
        action:   'ISSUE',
        entity:   'Invoice',
        entityId: issued.id,
        summary:  `Factura emitida: ${series}-${issued.invoiceYear}-${issued.invoiceNumber} (${decToNum(issued.totalAmount).toFixed(2)} EUR)`,
      });

      return issued;
    }),

  /**
   * Registra el cobro manual de una factura ISSUED → PAID.
   *
   * TODO Q-007: cuando se active la pasarela de pago, este endpoint marcará
   * automáticamente las facturas cobradas y el cobro manual quedará para
   * excepciones (cheque, transferencia manual, etc.).
   *
   * AuditLog: acción económica sensible.
   */
  markPaid: permissionProcedure('billing:manage')
    .input(z.object({
      id:     z.string().cuid(),
      paidAt: z.date().optional(),
      notes:  z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.id },
        select: { id: true, status: true, invoiceNumber: true, invoiceYear: true, series: true, totalAmount: true },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      if (invoice.status !== 'ISSUED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Solo se puede marcar como cobrada una factura en estado ISSUED. Estado actual: ${invoice.status}.`,
        });
      }

      const paid = await ctx.db.invoice.update({
        where: { id: input.id },
        data: {
          status: 'PAID',
          paidAt: input.paidAt ?? new Date(),
          ...(input.notes && { notes: input.notes }),
        },
      });

      // AuditLog — cobro registrado
      await ctx.audit({
        action:   'MARK_PAID',
        entity:   'Invoice',
        entityId: paid.id,
        summary:  `Cobro registrado: ${invoice.series}-${invoice.invoiceYear}-${invoice.invoiceNumber} (${decToNum(invoice.totalAmount).toFixed(2)} EUR)`,
      });

      return paid;
    }),

  /**
   * Anula una factura (ISSUED o PAID → VOID) con motivo obligatorio.
   *
   * La factura anulada queda en el histórico con status VOID. No se borra
   * (obligación legal de conservación contable — art. 30 Cód. Comercio).
   *
   * AuditLog: acción económica sensible.
   */
  void: permissionProcedure('billing:manage')
    .input(InvoiceVoidSchema)
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.db.invoice.findFirst({
        where: { id: input.id },
        select: { id: true, status: true, invoiceNumber: true, invoiceYear: true, series: true, totalAmount: true },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      if (invoice.status === 'DRAFT' || invoice.status === 'VOID') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No se puede anular una factura en estado ${invoice.status}. Solo se pueden anular facturas ISSUED o PAID.`,
        });
      }

      const voided = await ctx.db.invoice.update({
        where: { id: input.id },
        data: {
          status:     'VOID',
          voidReason: input.voidReason,
        },
      });

      // AuditLog — anulación registrada
      await ctx.audit({
        action:   'VOID',
        entity:   'Invoice',
        entityId: voided.id,
        summary:  `Factura anulada: ${invoice.series}-${invoice.invoiceYear}-${invoice.invoiceNumber}. Motivo: ${input.voidReason}`,
      });

      return voided;
    }),

  // ---------------------------------------------------------------------------
  // Portal de familias — solo lectura de sus propias facturas
  // ---------------------------------------------------------------------------

  /**
   * Lista las facturas del residente vinculado al familiar autenticado.
   * Solo facturas ISSUED y PAID (no DRAFT ni VOID).
   */
  listMine: permissionProcedure('portal:read')
    .input(z.object({
      residentId: z.string().cuid(),
      page:       z.number().int().min(1).default(1),
      pageSize:   z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      await assertFamilyAccess(ctx.db, ctx.session.user.id, input.residentId);

      const { page, pageSize } = input;
      const [total, items] = await Promise.all([
        ctx.db.invoice.count({
          where: { residentId: input.residentId, status: { in: ['ISSUED', 'PAID'] } },
        }),
        ctx.db.invoice.findMany({
          where: { residentId: input.residentId, status: { in: ['ISSUED', 'PAID'] } },
          orderBy: [{ invoiceYear: 'desc' }, { invoiceNumber: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            invoiceNumber: true,
            invoiceYear: true,
            series: true,
            periodStart: true,
            periodEnd: true,
            issuedAt: true,
            dueAt: true,
            status: true,
            paidAt: true,
            payerType: true,
            payerName: true,
            baseAmount: true,
            vatAmount: true,
            totalAmount: true,
          },
        }),
      ]);

      return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }),

  /**
   * Obtiene una factura específica del residente vinculado al familiar autenticado.
   * Solo devuelve facturas ISSUED o PAID.
   */
  getMine: permissionProcedure('portal:read')
    .input(z.object({
      id:         z.string().cuid(),
      residentId: z.string().cuid(),
    }))
    .query(async ({ ctx, input }) => {
      await assertFamilyAccess(ctx.db, ctx.session.user.id, input.residentId);

      const invoice = await ctx.db.invoice.findFirst({
        where: {
          id:         input.id,
          residentId: input.residentId,
          status:     { in: ['ISSUED', 'PAID'] },
        },
        include: {
          lines: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              description: true,
              quantity: true,
              unitPrice: true,
              vatPct: true,
              vatExempt: true,
              lineBase: true,
              lineVat: true,
              lineTotal: true,
              sortOrder: true,
            },
          },
        },
      });
      if (!invoice) throw new TRPCError({ code: 'NOT_FOUND' });
      return invoice;
    }),
});

// ---------------------------------------------------------------------------
// Router raíz de facturación
// ---------------------------------------------------------------------------

export const facturacionRouter = createTRPCRouter({
  tariffs:               tariffsRouter,
  residentBillingProfile: billingProfileRouter,
  invoices:              invoicesRouter,
});
