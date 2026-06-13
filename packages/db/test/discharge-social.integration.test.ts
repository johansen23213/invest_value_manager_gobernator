/**
 * Test de integración — Épica B: Exitus/Baja, Informe Social, Perfil ACP.
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 *
 * Cubre:
 *  (a) RLS: otro tenant NO ve discharge_records, social_reports ni wellbeing_profiles.
 *  (b) Transacción exitus: registrar baja libera la cama y pone Resident.status=BAJA.
 *  (c) Cascade: al borrar un residente, sus 3 tablas nuevas desaparecen.
 *  (d) FAMILIAR sin acceso: verifica que no tiene residents:write ni residents:read (staff).
 *  (e) WellbeingProfile upsert: un solo perfil por residente (segunda llamada actualiza).
 *  (f) SocialReport: permite múltiples informes por residente (histórico).
 *  (g) listOverdueReviews: devuelve solo los perfiles con nextReviewDate vencida.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asPlatformAdmin,
  forTenant,
  prisma,
  DischargeType,
  UserRole,
  CenterType,
  ResidentStatus,
} from '../src/index';
import { hasPermission } from '../../apps/web/src/lib/rbac';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Épica B — RLS + transacción + cascades + acceso familiar', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();

  let tenantId       = '';
  let otherTenantId  = '';
  let centerId       = '';
  let bedId          = '';
  let residentId     = '';
  let staffUserId    = '';

  beforeAll(async () => {
    // Dos tenants para el test de aislamiento RLS
    const tenant = await admin.tenant.create({
      data: { name: `Épica B Tenant ${stamp}`, slug: `epicab-${stamp}` },
    });
    const other = await admin.tenant.create({
      data: { name: `Épica B Other ${stamp}`, slug: `epicabo-${stamp}` },
    });
    tenantId      = tenant.id;
    otherTenantId = other.id;

    const center = await admin.center.create({
      data: { tenantId, name: 'Centro Épica B', type: CenterType.RESIDENCIA, city: 'Test' },
    });
    centerId = center.id;

    const unit = await admin.unit.create({
      data: { tenantId, centerId, name: 'Planta Test' },
    });
    const bed = await admin.bed.create({
      data: { tenantId, unitId: unit.id, code: 'T-01' },
    });
    bedId = bed.id;

    const staffUser = await admin.user.create({
      data: {
        email:        `staff-eb-${stamp}@test.vet`,
        name:         'Staff ÉpicaB',
        passwordHash: 'hash',
        role:         UserRole.SANITARIO,
        tenantId,
      },
    });
    staffUserId = staffUser.id;

    const resident = await admin.resident.create({
      data: {
        tenantId,
        centerId,
        bedId,
        firstName: 'Pepita',
        lastName:  'TestBaja',
        status:    ResidentStatus.ACTIVO,
      },
    });
    residentId = resident.id;
  });

  afterAll(async () => {
    // Limpieza en orden (respeta FKs — cascade por BD, pero limpiamos explícitamente)
    await admin.dischargeRecord.deleteMany({ where: { tenantId } });
    await admin.socialReport.deleteMany({ where: { tenantId } });
    await admin.wellbeingProfile.deleteMany({ where: { tenantId } });
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
  // (a) RLS — aislamiento entre tenants
  // ---------------------------------------------------------------------------

  describe('RLS — otro tenant no ve los datos', () => {
    beforeAll(async () => {
      // Crear datos de prueba en el tenant original
      await admin.dischargeRecord.create({
        data: {
          tenantId,
          residentId,
          type:        DischargeType.VOLUNTARIA,
          dischargedAt: new Date(),
          recordedById: staffUserId,
        },
      });
      await admin.socialReport.create({
        data: {
          tenantId,
          residentId,
          authorId:    staffUserId,
          reportDate:  new Date(),
          familySituation: 'Familia numerosa, muy implicada.',
        },
      });
      await admin.wellbeingProfile.upsert({
        where:  { residentId },
        update: { emotionalWellbeing: 'Estado emocional estable.' },
        create: {
          tenantId,
          residentId,
          emotionalWellbeing: 'Estado emocional estable.',
        },
      });
    });

    it('otro tenant NO ve discharge_records del tenant original', async () => {
      const db = forTenant({ tenantId: otherTenantId });
      const records = await db.dischargeRecord.findMany({ where: { residentId } });
      expect(records).toHaveLength(0);
    });

    it('otro tenant NO ve social_reports del tenant original', async () => {
      const db = forTenant({ tenantId: otherTenantId });
      const reports = await db.socialReport.findMany({ where: { residentId } });
      expect(reports).toHaveLength(0);
    });

    it('otro tenant NO ve wellbeing_profiles del tenant original', async () => {
      const db = forTenant({ tenantId: otherTenantId });
      const profile = await db.wellbeingProfile.findUnique({ where: { residentId } });
      expect(profile).toBeNull();
    });

    it('el tenant correcto SÍ ve sus discharge_records', async () => {
      const db = forTenant({ tenantId });
      const records = await db.dischargeRecord.findMany({ where: { residentId } });
      expect(records.length).toBeGreaterThanOrEqual(1);
    });

    it('el tenant correcto SÍ ve sus social_reports', async () => {
      const db = forTenant({ tenantId });
      const reports = await db.socialReport.findMany({ where: { residentId } });
      expect(reports.length).toBeGreaterThanOrEqual(1);
    });

    it('el tenant correcto SÍ ve su wellbeing_profile', async () => {
      const db = forTenant({ tenantId });
      const profile = await db.wellbeingProfile.findUnique({ where: { residentId } });
      expect(profile).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // (b) Transacción exitus — libera cama y pone status BAJA
  // ---------------------------------------------------------------------------

  describe('Transacción exitus — libera cama y actualiza status', () => {
    it('crear un ResidenteTemp, darle baja y verificar que la cama queda libre y status=BAJA', async () => {
      // Crear unidad + cama + residente temporal para este test
      const tmpUnit = await admin.unit.create({
        data: { tenantId, centerId, name: 'Planta Temp Exitus' },
      });
      const tmpBed = await admin.bed.create({
        data: { tenantId, unitId: tmpUnit.id, code: 'T-EX-01' },
      });
      const tmpResident = await admin.resident.create({
        data: {
          tenantId,
          centerId,
          bedId:     tmpBed.id,
          firstName: 'Tmp',
          lastName:  'Exitus',
          status:    ResidentStatus.ACTIVO,
        },
      });

      // Verificar que la cama está asignada
      const beforeResident = await admin.resident.findUnique({ where: { id: tmpResident.id } });
      expect(beforeResident?.bedId).toBe(tmpBed.id);
      expect(beforeResident?.status).toBe(ResidentStatus.ACTIVO);

      const dischargedAt = new Date();

      // Ejecutar la transacción de baja (misma lógica que el router)
      const db = forTenant({ tenantId });
      await db.$transaction([
        db.dischargeRecord.create({
          data: {
            tenantId,
            residentId:   tmpResident.id,
            type:         DischargeType.TRASLADO_HOSPITAL,
            dischargedAt,
            destination:  'Hospital Universitario La Fe',
            recordedById: staffUserId,
          },
        }),
        db.resident.update({
          where: { id: tmpResident.id },
          data: {
            status:         'BAJA',
            dischargeDate:  dischargedAt,
            dischargeReason: 'TRASLADO_HOSPITAL',
            bedId:          null,
          },
        }),
      ]);

      // Verificar resultado
      const afterResident = await admin.resident.findUnique({ where: { id: tmpResident.id } });
      expect(afterResident?.status).toBe(ResidentStatus.BAJA);
      expect(afterResident?.bedId).toBeNull();  // cama liberada

      // La cama debe estar disponible (sin residente)
      const bedAfter = await admin.bed.findUnique({
        where:   { id: tmpBed.id },
        include: { resident: true },
      });
      expect(bedAfter?.resident).toBeNull();

      // El DischargeRecord fue creado
      const records = await admin.dischargeRecord.findMany({
        where: { residentId: tmpResident.id },
      });
      expect(records).toHaveLength(1);
      expect(records[0]?.type).toBe(DischargeType.TRASLADO_HOSPITAL);
    });
  });

  // ---------------------------------------------------------------------------
  // (c) Cascade — borrar residente elimina discharge_records, social_reports, wellbeing_profiles
  // ---------------------------------------------------------------------------

  describe('Cascade — borrar residente elimina sus registros Épica B', () => {
    it('al borrar el residente, sus discharge_records desaparecen', async () => {
      const tmp = await admin.resident.create({
        data: { tenantId, centerId, firstName: 'Tmp', lastName: 'CascDr', status: 'ACTIVO' },
      });
      await admin.dischargeRecord.create({
        data: {
          tenantId,
          residentId:   tmp.id,
          type:         DischargeType.FIN_ESTANCIA,
          dischargedAt: new Date(),
          recordedById: staffUserId,
        },
      });

      const before = await admin.dischargeRecord.findMany({ where: { residentId: tmp.id } });
      expect(before).toHaveLength(1);

      await admin.resident.delete({ where: { id: tmp.id } });

      const after = await admin.dischargeRecord.findMany({ where: { residentId: tmp.id } });
      expect(after).toHaveLength(0);
    });

    it('al borrar el residente, sus social_reports desaparecen', async () => {
      const tmp = await admin.resident.create({
        data: { tenantId, centerId, firstName: 'Tmp', lastName: 'CascSr', status: 'ACTIVO' },
      });
      await admin.socialReport.create({
        data: {
          tenantId,
          residentId:  tmp.id,
          authorId:    staffUserId,
          reportDate:  new Date(),
          socialAssessment: 'Test cascade social report.',
        },
      });

      const before = await admin.socialReport.findMany({ where: { residentId: tmp.id } });
      expect(before).toHaveLength(1);

      await admin.resident.delete({ where: { id: tmp.id } });

      const after = await admin.socialReport.findMany({ where: { residentId: tmp.id } });
      expect(after).toHaveLength(0);
    });

    it('al borrar el residente, su wellbeing_profile desaparece', async () => {
      const tmp = await admin.resident.create({
        data: { tenantId, centerId, firstName: 'Tmp', lastName: 'CascWp', status: 'ACTIVO' },
      });
      await admin.wellbeingProfile.create({
        data: {
          tenantId,
          residentId: tmp.id,
          selfDetermination: 'Muy autónoma para decisiones personales.',
        },
      });

      const before = await admin.wellbeingProfile.findUnique({ where: { residentId: tmp.id } });
      expect(before).not.toBeNull();

      await admin.resident.delete({ where: { id: tmp.id } });

      const after = await admin.wellbeingProfile.findUnique({ where: { residentId: tmp.id } });
      expect(after).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // (d) FAMILIAR sin acceso — verificación estática de permisos
  // ---------------------------------------------------------------------------

  describe('FAMILIAR NO accede a ningún endpoint de Épica B (verificación de permisos)', () => {
    it('FAMILIAR no tiene residents:write (requerido para registrar baja, social.upsert, wellbeing.upsert)', () => {
      expect(hasPermission('FAMILIAR', 'residents:write')).toBe(false);
    });

    it('FAMILIAR no tiene residents:read (requerido para ver bajas, informes, perfiles ACP)', () => {
      expect(hasPermission('FAMILIAR', 'residents:read')).toBe(false);
    });

    it('DIRECTOR tiene residents:write y residents:read', () => {
      expect(hasPermission('DIRECTOR', 'residents:write')).toBe(true);
      expect(hasPermission('DIRECTOR', 'residents:read')).toBe(true);
    });

    it('SANITARIO tiene residents:write y residents:read', () => {
      expect(hasPermission('SANITARIO', 'residents:write')).toBe(true);
      expect(hasPermission('SANITARIO', 'residents:read')).toBe(true);
    });

    it('AUXILIAR tiene residents:read pero NO residents:write', () => {
      expect(hasPermission('AUXILIAR', 'residents:read')).toBe(true);
      expect(hasPermission('AUXILIAR', 'residents:write')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // (e) WellbeingProfile upsert — 1 perfil por residente
  // ---------------------------------------------------------------------------

  describe('WellbeingProfile upsert — 1 perfil por residente', () => {
    it('crear perfil por primera vez y actualizar con segunda llamada (upsert)', async () => {
      const tmp = await admin.resident.create({
        data: { tenantId, centerId, firstName: 'Tmp', lastName: 'UpsertWp', status: 'ACTIVO' },
      });

      // Primera creación
      await admin.wellbeingProfile.upsert({
        where:  { residentId: tmp.id },
        update: { emotionalWellbeing: 'Actualizado' },
        create: {
          tenantId,
          residentId: tmp.id,
          emotionalWellbeing: 'Estado inicial estable.',
          selfDetermination: 'Alta autodeterminación.',
        },
      });

      // Segunda actualización
      await admin.wellbeingProfile.upsert({
        where:  { residentId: tmp.id },
        update: { emotionalWellbeing: 'Estado mejorado tras intervención.' },
        create: { tenantId, residentId: tmp.id },
      });

      // Solo debe haber 1 perfil
      const profiles = await admin.wellbeingProfile.findMany({ where: { residentId: tmp.id } });
      expect(profiles).toHaveLength(1);
      expect(profiles[0]?.emotionalWellbeing).toBe('Estado mejorado tras intervención.');
      // El campo que no se tocó en el update debe mantenerse
      expect(profiles[0]?.selfDetermination).toBe('Alta autodeterminación.');

      // Limpieza
      await admin.resident.delete({ where: { id: tmp.id } });
    });
  });

  // ---------------------------------------------------------------------------
  // (f) SocialReport — múltiples informes por residente (histórico)
  // ---------------------------------------------------------------------------

  describe('SocialReport — múltiples informes por residente', () => {
    it('crear dos informes para el mismo residente y listar ambos', async () => {
      const tmp = await admin.resident.create({
        data: { tenantId, centerId, firstName: 'Tmp', lastName: 'MultiSr', status: 'ACTIVO' },
      });

      await admin.socialReport.create({
        data: {
          tenantId,
          residentId:  tmp.id,
          authorId:    staffUserId,
          reportDate:  new Date('2026-01-10'),
          familySituation: 'Informe inicial enero 2026.',
        },
      });
      await admin.socialReport.create({
        data: {
          tenantId,
          residentId:  tmp.id,
          authorId:    staffUserId,
          reportDate:  new Date('2026-06-10'),
          familySituation: 'Actualización semestral junio 2026.',
        },
      });

      const reports = await admin.socialReport.findMany({
        where:   { residentId: tmp.id },
        orderBy: { reportDate: 'asc' },
      });
      expect(reports).toHaveLength(2);
      expect(reports[0]?.familySituation).toContain('enero');
      expect(reports[1]?.familySituation).toContain('junio');

      // Limpieza
      await admin.resident.delete({ where: { id: tmp.id } });
    });
  });

  // ---------------------------------------------------------------------------
  // (g) listOverdueReviews — perfiles con nextReviewDate vencida
  // ---------------------------------------------------------------------------

  describe('listOverdueReviews — devuelve solo perfiles con revisión vencida', () => {
    it('filtra correctamente por nextReviewDate <= asOf', async () => {
      const db = forTenant({ tenantId });

      const tmpA = await admin.resident.create({
        data: { tenantId, centerId, firstName: 'TmpA', lastName: 'OverdueWp', status: 'ACTIVO' },
      });
      const tmpB = await admin.resident.create({
        data: { tenantId, centerId, firstName: 'TmpB', lastName: 'FutureWp', status: 'ACTIVO' },
      });

      const pastDate   = new Date('2026-01-01T00:00:00.000Z'); // vencida
      const futureDate = new Date('2026-12-31T00:00:00.000Z'); // no vencida

      await admin.wellbeingProfile.upsert({
        where:  { residentId: tmpA.id },
        update: { nextReviewDate: pastDate },
        create: { tenantId, residentId: tmpA.id, nextReviewDate: pastDate },
      });
      await admin.wellbeingProfile.upsert({
        where:  { residentId: tmpB.id },
        update: { nextReviewDate: futureDate },
        create: { tenantId, residentId: tmpB.id, nextReviewDate: futureDate },
      });

      const asOf = new Date('2026-06-13T00:00:00.000Z');
      const overdue = await db.wellbeingProfile.findMany({
        where: { nextReviewDate: { lte: asOf } },
      });

      const overdueResidentIds = overdue.map((p) => p.residentId);
      expect(overdueResidentIds).toContain(tmpA.id);
      expect(overdueResidentIds).not.toContain(tmpB.id);

      // Limpieza
      await admin.resident.delete({ where: { id: tmpA.id } });
      await admin.resident.delete({ where: { id: tmpB.id } });
    });
  });
});
