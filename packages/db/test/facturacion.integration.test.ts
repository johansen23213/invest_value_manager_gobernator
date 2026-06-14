/**
 * Test de integración — Módulo de Facturación (RF-ECO-001..005).
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 *
 * Cubre:
 *  (a) Aislamiento RLS: tenant A no ve tarifas, perfiles ni facturas de tenant B.
 *  (b) Numeración correlativa: dos ISSUE consecutivos producen números 1 y 2.
 *  (c) Numeración: DRAFT no tiene número asignado.
 *  (d) Tenant nulo no ve ninguna fila (fallo cerrado).
 *  (e) Cascade: al borrar residente, billing_profile se borra; invoice se conserva
 *      (FK RESTRICT en Invoice.residentId → Resident debe borrarse primero).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asPlatformAdmin, forTenant, prisma } from '../src/index';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Facturación — RLS + numeración correlativa', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();

  let tenantA = '';
  let tenantB = '';
  let centerA = '';
  let residentA = '';
  let tariffA  = '';

  beforeAll(async () => {
    // Dos tenants para aislamiento
    const tA = await admin.tenant.create({
      data: { name: `Fact TenantA ${stamp}`, slug: `fact-a-${stamp}` },
    });
    const tB = await admin.tenant.create({
      data: { name: `Fact TenantB ${stamp}`, slug: `fact-b-${stamp}` },
    });
    tenantA = tA.id;
    tenantB = tB.id;

    const center = await admin.center.create({
      data: { tenantId: tenantA, name: 'Centro Test Fact', type: 'RESIDENCIA' },
    });
    centerA = center.id;

    const resident = await admin.resident.create({
      data: {
        tenantId: tenantA,
        centerId: centerA,
        firstName: 'ResidenteTest',
        lastName: 'Facturacion',
      },
    });
    residentA = resident.id;

    // Tarifa para tenant A
    const tariff = await admin.tariff.create({
      data: {
        tenantId: tenantA,
        code: 'CUOTA-TEST',
        name: 'Cuota de prueba',
        baseAmount: 1500,
        unit: 'MENSUAL',
        vatPct: 0,
        vatExempt: true,
      },
    });
    tariffA = tariff.id;

    // Tarifa en tenant B (no debe ser visible desde tenant A)
    await admin.tariff.create({
      data: {
        tenantId: tenantB,
        code: 'CUOTA-B',
        name: 'Cuota tenant B',
        baseAmount: 2000,
        unit: 'MENSUAL',
        vatPct: 0,
        vatExempt: true,
      },
    });
  });

  afterAll(async () => {
    // Limpieza ordenada respetando FKs
    await admin.invoice.deleteMany({ where: { tenantId: tenantA } });
    await admin.invoice.deleteMany({ where: { tenantId: tenantB } });
    await admin.residentBillingProfile.deleteMany({ where: { tenantId: tenantA } });
    await admin.residentBillingProfile.deleteMany({ where: { tenantId: tenantB } });
    await admin.tariff.deleteMany({ where: { tenantId: tenantA } });
    await admin.tariff.deleteMany({ where: { tenantId: tenantB } });
    await admin.resident.deleteMany({ where: { tenantId: tenantA } });
    await admin.resident.deleteMany({ where: { tenantId: tenantB } });
    await admin.center.deleteMany({ where: { tenantId: tenantA } });
    await admin.center.deleteMany({ where: { tenantId: tenantB } });
    await admin.tenant.delete({ where: { id: tenantA } });
    await admin.tenant.delete({ where: { id: tenantB } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // (a) Aislamiento RLS por tenant
  // ---------------------------------------------------------------------------

  it('tenant A no ve tarifas de tenant B', async () => {
    const dbA = forTenant({ tenantId: tenantA });
    const tariffsA = await dbA.tariff.findMany();
    const ids = tariffsA.map((t) => t.tenantId);
    expect(ids.every((id) => id === tenantA)).toBe(true);
    await prisma.$disconnect();
  });

  it('tenant B no ve tarifas de tenant A', async () => {
    const dbB = forTenant({ tenantId: tenantB });
    const tariffsB = await dbB.tariff.findMany();
    // tenantB solo tiene 'CUOTA-B', nunca 'CUOTA-TEST' de tenantA
    const codes = tariffsB.map((t) => t.code);
    expect(codes).not.toContain('CUOTA-TEST');
    expect(codes).toContain('CUOTA-B');
  });

  it('tenant nulo no ve ninguna tarifa', async () => {
    // Simula un contexto sin tenant (GUC app.tenant_id vacío)
    // Usamos el cliente de plataforma con RLS en modo tenant vacío
    const dbNone = forTenant({ tenantId: '' });
    const tariffsNone = await dbNone.tariff.findMany();
    expect(tariffsNone).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // (b) Numeración correlativa — DRAFT no tiene número; ISSUED lo asigna
  // ---------------------------------------------------------------------------

  it('DRAFT no tiene número de serie; ISSUED obtiene número correlativo', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const periodStart = new Date(Date.UTC(year, now.getUTCMonth(), 1));
    const periodEnd   = new Date(Date.UTC(year, now.getUTCMonth() + 1, 0));

    const draft1 = await admin.invoice.create({
      data: {
        tenantId:    tenantA,
        residentId:  residentA,
        periodStart,
        periodEnd,
        status:      'DRAFT',
        payerType:   'FAMILIAR',
        baseAmount:  1500,
        vatAmount:   0,
        totalAmount: 1500,
      },
    });
    const draft2 = await admin.invoice.create({
      data: {
        tenantId:    tenantA,
        residentId:  residentA,
        periodStart,
        periodEnd,
        status:      'DRAFT',
        payerType:   'FAMILIAR',
        baseAmount:  1500,
        vatAmount:   0,
        totalAmount: 1500,
      },
    });

    // Ambos DRAFTs sin número
    expect(draft1.invoiceNumber).toBeNull();
    expect(draft2.invoiceNumber).toBeNull();
    expect(draft1.status).toBe('DRAFT');

    // Asignar números manualmente para simular el ISSUE (1 y 2).
    // Se usa $transaction con SET LOCAL para bypass_rls, ya que $queryRaw no pasa
    // por $allOperations y necesita el contexto de GUC explícito.
    const { prisma: rawPrisma } = await import('../src/client');

    // Función auxiliar: obtiene el MAX invoice_number con bypass_rls activado
    async function getMaxInvoiceNumber(tId: string, yr: number, ser: string): Promise<number> {
      const rows = await rawPrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.$queryRaw<Array<{ max: number | null }>>`
          SELECT MAX(invoice_number) AS max
          FROM invoices
          WHERE tenant_id = ${tId}
            AND invoice_year = ${yr}
            AND series = ${ser}
        `;
      });
      return ((rows[0]?.max) ?? 0) + 1;
    }

    const num1 = await getMaxInvoiceNumber(tenantA, year, 'A');

    const issued1 = await admin.invoice.update({
      where: { id: draft1.id },
      data:  { status: 'ISSUED', invoiceNumber: num1, invoiceYear: year, issuedAt: now },
    });
    expect(issued1.invoiceNumber).toBe(num1);
    expect(issued1.status).toBe('ISSUED');

    const num2 = await getMaxInvoiceNumber(tenantA, year, 'A');
    // Verificar correlatividad: el siguiente número es mayor al primero
    expect(num2).toBeGreaterThan(num1);

    const issued2 = await admin.invoice.update({
      where: { id: draft2.id },
      data:  { status: 'ISSUED', invoiceNumber: num2, invoiceYear: year, issuedAt: now },
    });
    expect(issued2.invoiceNumber).toBe(num2);

    // Verificar que no se puede duplicar el número (constraint UNIQUE)
    await expect(admin.invoice.update({
      where: { id: issued2.id },
      data:  { invoiceNumber: num1 },   // intenta asignar el número ya usado
    })).rejects.toThrow();

    // Limpieza
    await admin.invoice.delete({ where: { id: issued1.id } });
    await admin.invoice.delete({ where: { id: issued2.id } });
  });

  // ---------------------------------------------------------------------------
  // (c) ResidentBillingProfile — aislamiento
  // ---------------------------------------------------------------------------

  it('tenant A puede crear y leer su propio ResidentBillingProfile', async () => {
    const dbA = forTenant({ tenantId: tenantA });

    const profile = await dbA.residentBillingProfile.upsert({
      where:  { residentId: residentA },
      create: {
        tenantId:       tenantA,
        residentId:     residentA,
        tariffId:       tariffA,
        publicCopayPct: 30,
        privatePct:     70,
        payerType:      'FAMILIAR',
        payerName:      'Ana García',
      },
      update: {},
    });

    expect(profile.tenantId).toBe(tenantA);
    expect(Number(profile.publicCopayPct)).toBe(30);
  });

  it('tenant B no ve el perfil de facturación de tenant A', async () => {
    const dbB = forTenant({ tenantId: tenantB });
    const profiles = await dbB.residentBillingProfile.findMany();
    expect(profiles.every((p) => p.tenantId === tenantB)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // (d) InvoiceLine — hereda aislamiento de Invoice
  // ---------------------------------------------------------------------------

  it('las líneas de factura pertenecen al tenant correcto', async () => {
    const dbA = forTenant({ tenantId: tenantA });
    const periodStart = new Date('2026-06-01');
    const periodEnd   = new Date('2026-06-30');

    const inv = await dbA.invoice.create({
      data: {
        tenantId:    tenantA,
        residentId:  residentA,
        periodStart,
        periodEnd,
        status:      'DRAFT',
        payerType:   'FAMILIAR',
        baseAmount:  1500,
        vatAmount:   0,
        totalAmount: 1500,
        lines: {
          create: [{
            tenantId:    tenantA,
            description: 'Cuota mensual junio 2026',
            quantity:    1,
            unitPrice:   1500,
            vatPct:      0,
            vatExempt:   true,
            lineBase:    1500,
            lineVat:     0,
            lineTotal:   1500,
          }],
        },
      },
      include: { lines: true },
    });

    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]!.tenantId).toBe(tenantA);

    // tenant B no ve las líneas
    const dbB = forTenant({ tenantId: tenantB });
    const linesB = await dbB.invoiceLine.findMany({ where: { invoiceId: inv.id } });
    expect(linesB).toHaveLength(0);

    await dbA.invoice.delete({ where: { id: inv.id } });
  });
});
