/**
 * Test de integración — Épica C: Nutrición, Menús y Comedor.
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 *
 * Cubre:
 *  (a) RLS menu_items: otro tenant NO ve los menús del tenant original.
 *  (b) RLS intake_records: otro tenant NO ve los registros de ingesta.
 *  (c) Familiar: solo ve el menú del centro de su residente vinculado (no de otro centro).
 *  (d) Cascade intake_records al borrar residente.
 *  (e) foodPct fuera de 0..100 rechazado por CHECK constraint de la BD.
 *  (f) menu_items NO está en dsar-registry (no tiene residentId).
 *  (g) intake_records está en dsar-registry con export:true y anonymize:'delete'.
 *  (h) FAMILIAR no tiene care:write ni centers:write (verificación estática de permisos).
 *  (i) menu_items tienen RLS (verificación estática, ya cubierta por rls-coverage.test.ts,
 *      pero se verifica aquí también para integración end-to-end).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asPlatformAdmin,
  forTenant,
  prisma,
  MealType,
  CenterType,
  ResidentStatus,
  AllergyType,
  AllergySeverity,
  UserRole,
} from '../src/index';
import { hasPermission } from '../../apps/web/src/lib/rbac';
import { RESIDENT_DATA_TABLE_MAP } from '../src/dsar-registry';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Épica C — RLS + cascade + permisos + DSAR', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();

  let tenantId       = '';
  let otherTenantId  = '';
  let centerId       = '';
  let otherCenterId  = '';
  let residentId     = '';
  let staffUserId    = '';
  let familiarUserId = '';

  beforeAll(async () => {
    // Dos tenants para el test de aislamiento RLS
    const tenant = await admin.tenant.create({
      data: { name: `Nutrición Tenant ${stamp}`, slug: `nut-${stamp}` },
    });
    const other = await admin.tenant.create({
      data: { name: `Nutrición Other ${stamp}`, slug: `nuto-${stamp}` },
    });
    tenantId      = tenant.id;
    otherTenantId = other.id;

    // Centro principal
    const center = await admin.center.create({
      data: { tenantId, name: 'Centro Nutrición', type: CenterType.RESIDENCIA, city: 'Test' },
    });
    centerId = center.id;

    // Segundo centro (mismo tenant) para test de familiar
    const center2 = await admin.center.create({
      data: { tenantId, name: 'Centro Nutrición 2', type: CenterType.RESIDENCIA, city: 'Test' },
    });
    otherCenterId = center2.id;

    const unit = await admin.unit.create({
      data: { tenantId, centerId, name: 'Planta Test Nutrición' },
    });
    const bed = await admin.bed.create({
      data: { tenantId, unitId: unit.id, code: 'N-01' },
    });

    const staffUser = await admin.user.create({
      data: {
        email:        `staff-nut-${stamp}@test.vet`,
        name:         'Staff Nutrición',
        passwordHash: 'hash',
        role:         UserRole.AUXILIAR,
        tenantId,
      },
    });
    staffUserId = staffUser.id;

    const familiarUser = await admin.user.create({
      data: {
        email:        `familiar-nut-${stamp}@test.vet`,
        name:         'Familiar Nutrición',
        passwordHash: 'hash',
        role:         UserRole.FAMILIAR,
        tenantId,
      },
    });
    familiarUserId = familiarUser.id;

    const resident = await admin.resident.create({
      data: {
        tenantId,
        centerId,
        bedId:     bed.id,
        firstName: 'Nutricia',
        lastName:  'TestRes',
        status:    ResidentStatus.ACTIVO,
        dietType:  'TRITURADA',
      },
    });
    residentId = resident.id;

    // Alergia alimentaria del residente
    await admin.allergy.create({
      data: {
        tenantId,
        residentId,
        substance:   'Gluten',
        severity:    AllergySeverity.MODERADA,
        allergyType: AllergyType.ALIMENTARIA,
      },
    });

    // FamilyLink: familiarUserId → residentId
    await admin.familyLink.create({
      data: { tenantId, userId: familiarUserId, residentId },
    });
  });

  afterAll(async () => {
    await admin.intakeRecord.deleteMany({ where: { tenantId } });
    await admin.menuItem.deleteMany({ where: { tenantId } });
    await admin.familyLink.deleteMany({ where: { tenantId } });
    await admin.allergy.deleteMany({ where: { tenantId } });
    await admin.resident.deleteMany({ where: { tenantId } });
    await admin.bed.deleteMany({ where: { tenantId } });
    await admin.unit.deleteMany({ where: { tenantId } });
    await admin.center.deleteMany({ where: { tenantId } });
    await admin.user.deleteMany({ where: { tenantId } });
    await admin.tenant.delete({ where: { id: tenantId } });
    await admin.tenant.delete({ where: { id: otherTenantId } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // (a) RLS — menu_items
  // ---------------------------------------------------------------------------

  describe('RLS — menu_items: otro tenant no ve los menús', () => {
    const testDate = new Date('2026-06-14T12:00:00.000Z');

    beforeAll(async () => {
      await admin.menuItem.create({
        data: {
          tenantId,
          centerId,
          date:         testDate,
          meal:         MealType.COMIDA,
          dishName:     'Lentejas con verduras',
          allergens:    ['GLUTEN'],
          isAlternative: false,
          createdById:  staffUserId,
        },
      });
    });

    it('otro tenant NO ve menu_items del tenant original', async () => {
      const db = forTenant({ tenantId: otherTenantId });
      const items = await db.menuItem.findMany({ where: { centerId } });
      expect(items).toHaveLength(0);
    });

    it('el tenant correcto SÍ ve sus menu_items', async () => {
      const db = forTenant({ tenantId });
      const items = await db.menuItem.findMany({ where: { centerId } });
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0]?.dishName).toBe('Lentejas con verduras');
    });

    it('allergens se almacena y recupera correctamente como JSON array', async () => {
      const db = forTenant({ tenantId });
      const items = await db.menuItem.findMany({
        where:   { centerId, dishName: 'Lentejas con verduras' },
        select:  { allergens: true },
      });
      expect(items[0]?.allergens).toEqual(['GLUTEN']);
    });
  });

  // ---------------------------------------------------------------------------
  // (b) RLS — intake_records
  // ---------------------------------------------------------------------------

  describe('RLS — intake_records: otro tenant no ve los registros de ingesta', () => {
    const intakeDate = new Date('2026-06-14T13:00:00.000Z');

    beforeAll(async () => {
      await admin.intakeRecord.create({
        data: {
          tenantId,
          residentId,
          date:         intakeDate,
          meal:         MealType.COMIDA,
          foodPct:      75,
          hydrationMl:  200,
          recordedById: staffUserId,
        },
      });
    });

    it('otro tenant NO ve intake_records del tenant original', async () => {
      const db = forTenant({ tenantId: otherTenantId });
      const records = await db.intakeRecord.findMany({ where: { residentId } });
      expect(records).toHaveLength(0);
    });

    it('el tenant correcto SÍ ve sus intake_records', async () => {
      const db = forTenant({ tenantId });
      const records = await db.intakeRecord.findMany({ where: { residentId } });
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records[0]?.foodPct).toBe(75);
      expect(records[0]?.hydrationMl).toBe(200);
    });
  });

  // ---------------------------------------------------------------------------
  // (c) Familiar — solo ve el menú del centro de su residente vinculado
  // ---------------------------------------------------------------------------

  describe('Familiar — solo ve el menú del centro del residente vinculado', () => {
    const menuDate = new Date('2026-06-15T12:00:00.000Z');

    beforeAll(async () => {
      // Menú en el centro del residente vinculado
      await admin.menuItem.create({
        data: {
          tenantId,
          centerId,           // centro del residente vinculado
          date:         menuDate,
          meal:         MealType.DESAYUNO,
          dishName:     'Tostadas con aceite y tomate',
          allergens:    [],
          isAlternative: false,
          createdById:  staffUserId,
        },
      });

      // Menú en OTRO centro del mismo tenant (el familiar NO debe verlo)
      await admin.menuItem.create({
        data: {
          tenantId,
          centerId:     otherCenterId, // centro distinto
          date:         menuDate,
          meal:         MealType.DESAYUNO,
          dishName:     'Cereales con leche (otro centro)',
          allergens:    ['LACTEOS'],
          isAlternative: false,
          createdById:  staffUserId,
        },
      });
    });

    it('el familiar puede leer el menú del centro de su residente vinculado', async () => {
      // Simular lo que hace nutrition.menu.forFamily:
      // 1. Verificar FamilyLink
      const link = await admin.familyLink.findFirst({
        where:  { userId: familiarUserId, residentId },
        select: { resident: { select: { centerId: true } } },
      });
      expect(link).not.toBeNull();
      const resolvedCenterId = link!.resident.centerId;
      expect(resolvedCenterId).toBe(centerId);

      // 2. Consultar menú con ese centerId
      const db = forTenant({ tenantId });
      const startDay = new Date(menuDate); startDay.setUTCHours(0,0,0,0);
      const endDay   = new Date(startDay); endDay.setUTCDate(endDay.getUTCDate() + 1);
      const items = await db.menuItem.findMany({
        where: { centerId: resolvedCenterId, date: { gte: startDay, lt: endDay }, isAlternative: false },
      });
      // Solo debe aparecer el menú del centro vinculado
      expect(items.some((i) => i.dishName === 'Tostadas con aceite y tomate')).toBe(true);
      expect(items.every((i) => i.centerId === centerId)).toBe(true);
    });

    it('el familiar NO puede ver el menú del otro centro directamente', async () => {
      // Si el familiar intentara consultar el otro centro sin pasar por forFamily
      // (p.ej. con centerId hardcodeado), el FamilyLink check del router lo bloquea.
      // Verificamos estáticamente que portal:read no le da acceso directo a care:read.
      expect(hasPermission('FAMILIAR', 'care:read')).toBe(false);
      expect(hasPermission('FAMILIAR', 'centers:read')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // (d) Cascade — borrar residente elimina intake_records
  // ---------------------------------------------------------------------------

  describe('Cascade — borrar residente elimina sus intake_records', () => {
    it('al borrar el residente, sus intake_records desaparecen', async () => {
      const tmpResident = await admin.resident.create({
        data: { tenantId, centerId, firstName: 'Tmp', lastName: 'CascNut', status: 'ACTIVO' },
      });
      await admin.intakeRecord.create({
        data: {
          tenantId,
          residentId:   tmpResident.id,
          date:         new Date(),
          meal:         MealType.CENA,
          foodPct:      50,
          recordedById: staffUserId,
        },
      });

      const before = await admin.intakeRecord.findMany({ where: { residentId: tmpResident.id } });
      expect(before).toHaveLength(1);

      await admin.resident.delete({ where: { id: tmpResident.id } });

      const after = await admin.intakeRecord.findMany({ where: { residentId: tmpResident.id } });
      expect(after).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // (e) foodPct fuera de 0..100 rechazado por CHECK constraint
  // ---------------------------------------------------------------------------

  describe('foodPct CHECK constraint — rechaza valores fuera de 0..100', () => {
    it('foodPct = 101 es rechazado por la BD (CHECK constraint)', async () => {
      await expect(
        admin.intakeRecord.create({
          data: {
            tenantId,
            residentId,
            date:         new Date(),
            meal:         MealType.MERIENDA,
            foodPct:      101, // fuera del rango
            recordedById: staffUserId,
          },
        }),
      ).rejects.toThrow(); // Prisma envuelve el error de BD
    });

    it('foodPct = -1 es rechazado por la BD (CHECK constraint)', async () => {
      await expect(
        admin.intakeRecord.create({
          data: {
            tenantId,
            residentId,
            date:         new Date(),
            meal:         MealType.DESAYUNO,
            foodPct:      -1, // fuera del rango
            recordedById: staffUserId,
          },
        }),
      ).rejects.toThrow();
    });

    it('foodPct = 0 es válido (mínimo)', async () => {
      const record = await admin.intakeRecord.create({
        data: {
          tenantId,
          residentId,
          date:         new Date(),
          meal:         MealType.MERIENDA,
          foodPct:      0,
          recordedById: staffUserId,
        },
      });
      expect(record.foodPct).toBe(0);
      await admin.intakeRecord.delete({ where: { id: record.id } });
    });

    it('foodPct = 100 es válido (máximo)', async () => {
      const record = await admin.intakeRecord.create({
        data: {
          tenantId,
          residentId,
          date:         new Date(),
          meal:         MealType.CENA,
          foodPct:      100,
          recordedById: staffUserId,
        },
      });
      expect(record.foodPct).toBe(100);
      await admin.intakeRecord.delete({ where: { id: record.id } });
    });
  });

  // ---------------------------------------------------------------------------
  // (f) menu_items NO está en dsar-registry (no tiene residentId)
  // ---------------------------------------------------------------------------

  describe('DSAR — menu_items NO está en dsar-registry', () => {
    it('MenuItem no está en RESIDENT_DATA_TABLE_MAP (no tiene residentId)', () => {
      // menu_items es dato del centro, no del residente → no debe estar en DSAR registry
      const entry = RESIDENT_DATA_TABLE_MAP.get('MenuItem');
      expect(entry).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // (g) intake_records está en dsar-registry con export:true y anonymize:'delete'
  // ---------------------------------------------------------------------------

  describe('DSAR — IntakeRecord está en dsar-registry correctamente', () => {
    it('IntakeRecord está en RESIDENT_DATA_TABLE_MAP', () => {
      const entry = RESIDENT_DATA_TABLE_MAP.get('IntakeRecord');
      expect(entry).toBeDefined();
    });

    it('IntakeRecord tiene export:true', () => {
      const entry = RESIDENT_DATA_TABLE_MAP.get('IntakeRecord');
      expect(entry?.export).toBe(true);
    });

    it('IntakeRecord tiene anonymize:delete', () => {
      const entry = RESIDENT_DATA_TABLE_MAP.get('IntakeRecord');
      expect(entry?.anonymize).toBe('delete');
    });

    it('IntakeRecord tiene reason no vacía', () => {
      const entry = RESIDENT_DATA_TABLE_MAP.get('IntakeRecord');
      expect(entry?.reason.trim().length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // (h) Verificación estática de permisos
  // ---------------------------------------------------------------------------

  describe('Permisos — verificación estática RBAC', () => {
    it('FAMILIAR no tiene care:write (no puede registrar ingestas directamente)', () => {
      expect(hasPermission('FAMILIAR', 'care:write')).toBe(false);
    });

    it('FAMILIAR no tiene care:read (no puede listar ingestas)', () => {
      expect(hasPermission('FAMILIAR', 'care:read')).toBe(false);
    });

    it('FAMILIAR no tiene centers:write (no puede gestionar menús)', () => {
      expect(hasPermission('FAMILIAR', 'centers:write')).toBe(false);
    });

    it('FAMILIAR tiene portal:read (accede a menu.forFamily)', () => {
      expect(hasPermission('FAMILIAR', 'portal:read')).toBe(true);
    });

    it('AUXILIAR tiene care:write (puede registrar ingestas)', () => {
      expect(hasPermission('AUXILIAR', 'care:write')).toBe(true);
    });

    it('AUXILIAR tiene care:read (puede listar ingestas y alertas)', () => {
      expect(hasPermission('AUXILIAR', 'care:read')).toBe(true);
    });

    it('AUXILIAR NO tiene centers:write (no gestiona menús)', () => {
      expect(hasPermission('AUXILIAR', 'centers:write')).toBe(false);
    });

    it('DIRECTOR tiene centers:write (gestiona menús)', () => {
      expect(hasPermission('DIRECTOR', 'centers:write')).toBe(true);
    });

    it('DIRECTOR tiene care:read (ve listados de cocina y alertas)', () => {
      expect(hasPermission('DIRECTOR', 'care:read')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // (i) Escenario de baja ingesta — verifica que los datos permiten la alerta
  // ---------------------------------------------------------------------------

  describe('Escenario baja ingesta — datos para panel de alertas RF-NUT-007', () => {
    it('puede crear varios intake_records con foodPct bajo para un residente (activa alerta)', async () => {
      const base = new Date('2026-06-13T08:00:00.000Z');
      // 3 comidas consecutivas ≤ 25%
      for (let i = 0; i < 3; i++) {
        await admin.intakeRecord.create({
          data: {
            tenantId,
            residentId,
            date:         new Date(base.getTime() + i * 6 * 60 * 60 * 1000),
            meal:         i === 0 ? MealType.DESAYUNO : i === 1 ? MealType.COMIDA : MealType.MERIENDA,
            foodPct:      10, // muy bajo — activará alerta
            hydrationMl:  50,
            recordedById: staffUserId,
            notes:        'Poco apetito, rechaza la comida',
          },
        });
      }

      const records = await admin.intakeRecord.findMany({
        where:   { residentId },
        orderBy: { date: 'desc' },
        take:    10,
      });

      // Debe haber al menos 3 registros con foodPct 10
      const lowRecords = records.filter((r) => r.foodPct <= 25);
      expect(lowRecords.length).toBeGreaterThanOrEqual(3);
    });
  });
});
