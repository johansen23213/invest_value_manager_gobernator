/**
 * Test de integración — Expediente sociosanitario Fase 1.
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 *
 * Cubre:
 *  (a) Crear residente con los campos nuevos de Fase 1 y leerlos.
 *  (b) Crear al menos un registro de cada tabla nueva y leerlo.
 *  (c) AISLAMIENTO RLS: otro tenant no ve NINGUNA de las tablas nuevas.
 *  (d) Cascade al borrar residente: los registros relacionados desaparecen.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asPlatformAdmin,
  forTenant,
  prisma,
  DietType,
  LiquidTexture,
  PlaceRegime,
  DeviceType,
  UPPOrigin,
  RestraintType,
  ConsentType,
  AllergyType,
  AssessmentType,
} from '../src/index';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Expediente Fase 1 — campos nuevos + RLS', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();

  let tenantId = '';
  let otherTenantId = '';
  let residentId = '';
  let ulcerId = '';

  beforeAll(async () => {
    // Crear dos tenants para el test de aislamiento
    const tenant = await admin.tenant.create({
      data: { name: `Fase1 T ${stamp}`, slug: `fase1-t-${stamp}` },
    });
    const other = await admin.tenant.create({
      data: { name: `Fase1 O ${stamp}`, slug: `fase1-o-${stamp}` },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    const center = await admin.center.create({
      data: { tenantId, name: 'Centro Test F1', type: 'RESIDENCIA' },
    });

    const resident = await admin.resident.create({
      data: {
        tenantId,
        centerId: center.id,
        firstName: 'María',
        lastName: 'Test Fase1',
        // Nuevos campos Bloque A
        cip: 'CAT123456789',
        socialSecurityNo: '123456789012',
        internalRecordNo: 'EXP-2026-001',
        placeRegime: PlaceRegime.CONCERTADA,
        judicialCapacity: false,
        legalRepName: 'Pedro Tutor',
        legalRepPhone: '600111222',
        advanceDirectives: true,
        advanceDirLocation: 'Notaría García, Valencia',
        preferredLanguage: 'ca',
        bloodGroup: 'A+',
        consentImage: true,
        consentAdmission: new Date('2026-01-15'),
        // Ficha de cuidados
        dietType: DietType.TRITURADA,
        liquidTexture: LiquidTexture.NECTAR,
        nutritionSupplements: 'Fortimel 200ml x2/día',
        continenceType: 'pañal',
        absorbentSize: 'M',
        wanderingRisk: true,
        fallRisk: true,
      },
    });
    residentId = resident.id;
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // (a) Campos nuevos en Resident
  // ---------------------------------------------------------------------------

  it('(a) el residente tiene todos los campos nuevos correctamente persistidos', async () => {
    const db = forTenant({ tenantId });
    const r = await db.resident.findUniqueOrThrow({ where: { id: residentId } });

    expect(r.cip).toBe('CAT123456789');
    expect(r.socialSecurityNo).toBe('123456789012');
    expect(r.internalRecordNo).toBe('EXP-2026-001');
    expect(r.placeRegime).toBe(PlaceRegime.CONCERTADA);
    expect(r.judicialCapacity).toBe(false);
    expect(r.legalRepName).toBe('Pedro Tutor');
    expect(r.advanceDirectives).toBe(true);
    expect(r.advanceDirLocation).toBe('Notaría García, Valencia');
    expect(r.preferredLanguage).toBe('ca');
    expect(r.bloodGroup).toBe('A+');
    expect(r.consentImage).toBe(true);
    expect(r.dietType).toBe(DietType.TRITURADA);
    expect(r.liquidTexture).toBe(LiquidTexture.NECTAR);
    expect(r.nutritionSupplements).toBe('Fortimel 200ml x2/día');
    expect(r.wanderingRisk).toBe(true);
    expect(r.fallRisk).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // (b) Crear y leer cada tabla nueva
  // ---------------------------------------------------------------------------

  it('(b) ResidentDevice: crea un dispositivo y lo lee', async () => {
    const db = forTenant({ tenantId });
    const device = await db.residentDevice.create({
      data: {
        tenantId,
        residentId,
        type: DeviceType.SONDA_VESICAL,
        description: 'Sonda Foley 16F',
        active: true,
      },
    });
    expect(device.type).toBe(DeviceType.SONDA_VESICAL);

    const list = await db.residentDevice.findMany({ where: { residentId } });
    expect(list.length).toBeGreaterThan(0);
  });

  it('(b) Vaccine: crea una vacuna y la lee', async () => {
    const db = forTenant({ tenantId });
    const vaccine = await db.vaccine.create({
      data: {
        tenantId,
        residentId,
        type: 'gripe',
        date: new Date('2025-10-01'),
        lot: 'LOT-GR-2025',
      },
    });
    expect(vaccine.type).toBe('gripe');

    const list = await db.vaccine.findMany({ where: { residentId } });
    expect(list.length).toBeGreaterThan(0);
  });

  it('(b) WeightRecord: crea un registro de peso con BMI y lo lee', async () => {
    const db = forTenant({ tenantId });
    const wr = await db.weightRecord.create({
      data: {
        tenantId,
        residentId,
        weightKg: 62.5,
        heightCm: 158,
        bmi: 25.1,
        recordedAt: new Date('2026-01-10'),
      },
    });
    expect(wr.weightKg).toBe(62.5);
    expect(wr.bmi).toBe(25.1);

    const list = await db.weightRecord.findMany({ where: { residentId } });
    expect(list.length).toBeGreaterThan(0);
  });

  it('(b) PressureUlcer + UPPCuring: crea UPP activa con cura y la lee', async () => {
    const db = forTenant({ tenantId });
    const ulcer = await db.pressureUlcer.create({
      data: {
        tenantId,
        residentId,
        location: 'Sacro',
        stage: 2,
        onsetDate: new Date('2026-01-05'),
        acquired: UPPOrigin.CENTRO,
      },
    });
    ulcerId = ulcer.id;
    expect(ulcer.stage).toBe(2);
    expect(ulcer.active).toBe(true);

    const curing = await db.uPPCuring.create({
      data: {
        tenantId,
        pressureUlcerId: ulcer.id,
        date: new Date('2026-01-06'),
        treatment: 'Apósito hidrocoloide',
        evolution: 'igual',
      },
    });
    expect(curing.treatment).toBe('Apósito hidrocoloide');

    const loaded = await db.pressureUlcer.findUnique({
      where: { id: ulcerId },
      include: { curings: true },
    });
    expect(loaded?.curings).toHaveLength(1);
  });

  it('(b) FallRecord: crea una caída y la lee', async () => {
    const db = forTenant({ tenantId });
    const fall = await db.fallRecord.create({
      data: {
        tenantId,
        residentId,
        occurredAt: new Date('2026-01-08T10:30:00'),
        location: 'Baño habitación 12',
        injuries: 'Contusión en rodilla izquierda',
        witnessed: true,
        measures: 'Vendaje + notificación a médico',
      },
    });
    expect(fall.injuries).toBe('Contusión en rodilla izquierda');

    const list = await db.fallRecord.findMany({ where: { residentId } });
    expect(list.length).toBeGreaterThan(0);
  });

  it('(b) Restraint: crea una sujeción con consentimiento y la lee', async () => {
    const db = forTenant({ tenantId });
    const restraint = await db.restraint.create({
      data: {
        tenantId,
        residentId,
        type: RestraintType.BARANDILLAS,
        justification: 'Riesgo de caída nocturna por deambulación con demencia moderada (GDS-4)',
        prescribedAt: new Date('2026-01-09'),
        consentObtained: true,
        consentDate: new Date('2026-01-09'),
        consentBy: 'Pedro Tutor (representante legal)',
      },
    });
    expect(restraint.type).toBe(RestraintType.BARANDILLAS);
    expect(restraint.consentObtained).toBe(true);
    expect(restraint.active).toBe(true);

    const list = await db.restraint.findMany({ where: { residentId } });
    expect(list.length).toBeGreaterThan(0);
  });

  it('(b) ConsentRecord: registra consentimiento RGPD y lo lee', async () => {
    const db = forTenant({ tenantId });
    const consent = await db.consentRecord.create({
      data: {
        tenantId,
        residentId,
        type: ConsentType.IMAGEN,
        granted: true,
        grantedBy: 'Pedro Tutor',
        date: new Date('2026-01-15'),
      },
    });
    expect(consent.granted).toBe(true);
    expect(consent.type).toBe(ConsentType.IMAGEN);

    const list = await db.consentRecord.findMany({ where: { residentId } });
    expect(list.length).toBeGreaterThan(0);
  });

  it('(b) LifeStory: crea la historia de vida y la lee', async () => {
    const db = forTenant({ tenantId });
    const story = await db.lifeStory.upsert({
      where: { residentId },
      update: {},
      create: {
        tenantId,
        residentId,
        profession: 'Maestra de primaria',
        hobbies: 'Lectura, punto de cruz, jardín',
        music: 'Zarzuela, Juanito Valderrama',
        religion: 'Católica — respeta horario de misa dominical',
      },
    });
    expect(story.profession).toBe('Maestra de primaria');
    expect(story.residentId).toBe(residentId);

    const loaded = await db.lifeStory.findUnique({ where: { residentId } });
    expect(loaded?.hobbies).toBe('Lectura, punto de cruz, jardín');
  });

  it('(b) Allergy con tipo: campo allergyType retrocompatible', async () => {
    const db = forTenant({ tenantId });
    const allergy = await db.allergy.create({
      data: {
        tenantId,
        residentId,
        substance: 'Lactosa',
        allergyType: AllergyType.ALIMENTARIA,
      },
    });
    expect(allergy.allergyType).toBe(AllergyType.ALIMENTARIA);
  });

  it('(b) Assessment Norton: escala nueva válida con el enum ampliado', async () => {
    const db = forTenant({ tenantId });
    const assessment = await db.assessment.create({
      data: {
        tenantId,
        residentId,
        type: AssessmentType.NORTON,
        score: 12,
        assessedAt: new Date('2026-01-10'),
      },
    });
    expect(assessment.type).toBe(AssessmentType.NORTON);
    expect(assessment.score).toBe(12);
  });

  it('(b) Assessment Pfeiffer: escala nueva válida', async () => {
    const db = forTenant({ tenantId });
    const assessment = await db.assessment.create({
      data: {
        tenantId,
        residentId,
        type: AssessmentType.PFEIFFER,
        score: 5,
        assessedAt: new Date('2026-01-10'),
      },
    });
    expect(assessment.type).toBe(AssessmentType.PFEIFFER);
  });

  // ---------------------------------------------------------------------------
  // (c) AISLAMIENTO RLS: otro tenant no ve NINGUNA tabla nueva
  // ---------------------------------------------------------------------------

  it('(c) otro tenant no ve los resident_devices del primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const devices = await dbOther.residentDevice.findMany();
    expect(devices).toHaveLength(0);
  });

  it('(c) otro tenant no ve las vacunas del primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const vaccines = await dbOther.vaccine.findMany();
    expect(vaccines).toHaveLength(0);
  });

  it('(c) otro tenant no ve los registros de peso del primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const weights = await dbOther.weightRecord.findMany();
    expect(weights).toHaveLength(0);
  });

  it('(c) otro tenant no ve las UPP del primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const ulcers = await dbOther.pressureUlcer.findMany();
    expect(ulcers).toHaveLength(0);
  });

  it('(c) otro tenant no ve las curas UPP del primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const curings = await dbOther.uPPCuring.findMany();
    expect(curings).toHaveLength(0);
  });

  it('(c) otro tenant no ve las caídas del primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const falls = await dbOther.fallRecord.findMany();
    expect(falls).toHaveLength(0);
  });

  it('(c) otro tenant no ve las sujeciones del primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const restraints = await dbOther.restraint.findMany();
    expect(restraints).toHaveLength(0);
  });

  it('(c) otro tenant no ve los consentimientos del primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const consents = await dbOther.consentRecord.findMany();
    expect(consents).toHaveLength(0);
  });

  it('(c) otro tenant no ve la historia de vida del primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const stories = await dbOther.lifeStory.findMany();
    expect(stories).toHaveLength(0);
  });

  it('(c) WITH CHECK: otro tenant no puede escribir un dispositivo en el primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    await expect(
      dbOther.residentDevice.create({
        data: {
          tenantId,        // <-- tenant ajeno: debe fallar por RLS
          residentId,
          type: DeviceType.MARCAPASOS,
        },
      }),
    ).rejects.toThrow();
  });

  it('(c) WITH CHECK: otro tenant no puede escribir una sujeción en el primer tenant', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    await expect(
      dbOther.restraint.create({
        data: {
          tenantId,        // <-- tenant ajeno
          residentId,
          type: RestraintType.CHALECO,
          justification: 'Intrusión de test',
          prescribedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // (d) Cascade al borrar el residente
  // ---------------------------------------------------------------------------

  it('(d) al borrar el residente, todos los registros relacionados se eliminan en cascade', async () => {
    // Crear un residente de prueba solo para el cascade
    const center = await admin.center.findFirst({ where: { tenantId } });
    const tempResident = await admin.resident.create({
      data: { tenantId, centerId: center!.id, firstName: 'Cascade', lastName: 'Test' },
    });
    const tempId = tempResident.id;

    // Crear registros en cada tabla nueva
    await admin.residentDevice.create({ data: { tenantId, residentId: tempId, type: DeviceType.CPAP } });
    await admin.vaccine.create({ data: { tenantId, residentId: tempId, type: 'COVID', date: new Date() } });
    await admin.weightRecord.create({ data: { tenantId, residentId: tempId, weightKg: 70, recordedAt: new Date() } });
    const ulcer = await admin.pressureUlcer.create({
      data: { tenantId, residentId: tempId, location: 'Talón', stage: 1, onsetDate: new Date(), acquired: UPPOrigin.INGRESO },
    });
    await admin.uPPCuring.create({ data: { tenantId, pressureUlcerId: ulcer.id, date: new Date(), treatment: 'Apósito' } });
    await admin.fallRecord.create({ data: { tenantId, residentId: tempId, occurredAt: new Date() } });
    await admin.restraint.create({ data: { tenantId, residentId: tempId, type: RestraintType.MUNEQUERAS, justification: 'Test cascade', prescribedAt: new Date() } });
    await admin.consentRecord.create({ data: { tenantId, residentId: tempId, type: ConsentType.INGRESO, granted: true, date: new Date() } });
    await admin.lifeStory.create({ data: { tenantId, residentId: tempId, profession: 'Agricultor' } });

    // Borrar el residente
    await admin.resident.delete({ where: { id: tempId } });

    // Verificar cascade total
    expect(await admin.residentDevice.findMany({ where: { residentId: tempId } })).toHaveLength(0);
    expect(await admin.vaccine.findMany({ where: { residentId: tempId } })).toHaveLength(0);
    expect(await admin.weightRecord.findMany({ where: { residentId: tempId } })).toHaveLength(0);
    expect(await admin.pressureUlcer.findMany({ where: { residentId: tempId } })).toHaveLength(0);
    expect(await admin.uPPCuring.findMany({ where: { pressureUlcerId: ulcer.id } })).toHaveLength(0);
    expect(await admin.fallRecord.findMany({ where: { residentId: tempId } })).toHaveLength(0);
    expect(await admin.restraint.findMany({ where: { residentId: tempId } })).toHaveLength(0);
    expect(await admin.consentRecord.findMany({ where: { residentId: tempId } })).toHaveLength(0);
    expect(await admin.lifeStory.findMany({ where: { residentId: tempId } })).toHaveLength(0);
  });
});
