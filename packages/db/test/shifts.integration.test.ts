/**
 * Test de integración — Épica D: Cuadrantes/Turnos + Cierre de turno firmado.
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 *
 * Cubre:
 *  (a) RLS shift_templates: otro tenant NO ve las plantillas del tenant original.
 *  (b) RLS shift_assignments: otro tenant NO ve las asignaciones del tenant original.
 *  (c) RLS shift_handovers: otro tenant NO ve los cierres del tenant original.
 *  (d) @@unique shift_assignments: no se puede duplicar (tenantId, userId, date, shift).
 *  (e) Cierre de turno firmado: closedById + closedAt registrados correctamente.
 *  (f) FAMILIAR sin acceso a shifts:read ni shifts:manage ni care:write (estático).
 *  (g) Cascade: al borrar centro, se borran sus shift_templates y shift_handovers.
 *  (h) Cascade: al borrar usuario, se borran sus shift_assignments.
 *  (i) Las 3 tablas NO están en dsar-registry (sin residentId).
 *  (j) AUSENTE con sustituto vs sin sustituto — correcta persistencia.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asPlatformAdmin,
  forTenant,
  prisma,
  NursingNoteShift,
  AssignmentStatus,
  CenterType,
  UserRole,
} from '../src/index';
import { hasPermission } from '../../apps/web/src/lib/rbac';
import { RESIDENT_DATA_TABLE_MAP } from '../src/dsar-registry';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Épica D — RLS + unique + cascade + permisos + DSAR (shifts)', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();

  let tenantId       = '';
  let otherTenantId  = '';
  let centerId       = '';
  let unitId         = '';
  let staffUserId    = '';
  let staff2UserId   = '';

  const testDate = new Date('2026-06-20T00:00:00.000Z'); // viernes

  beforeAll(async () => {
    // Dos tenants para el test de aislamiento RLS
    const tenant = await admin.tenant.create({
      data: { name: `Shifts Tenant ${stamp}`, slug: `shifts-${stamp}` },
    });
    const other = await admin.tenant.create({
      data: { name: `Shifts Other ${stamp}`, slug: `shifts-o-${stamp}` },
    });
    tenantId      = tenant.id;
    otherTenantId = other.id;

    const center = await admin.center.create({
      data: { tenantId, name: 'Centro Turnos', type: CenterType.RESIDENCIA, city: 'Test' },
    });
    centerId = center.id;

    const unit = await admin.unit.create({
      data: { tenantId, centerId, name: 'Planta Test Turnos' },
    });
    unitId = unit.id;

    const staffUser = await admin.user.create({
      data: {
        email:        `staff-shifts-${stamp}@test.vet`,
        name:         'Staff Turnos',
        passwordHash: 'hash',
        role:         UserRole.AUXILIAR,
        tenantId,
      },
    });
    staffUserId = staffUser.id;

    const staffUser2 = await admin.user.create({
      data: {
        email:        `staff2-shifts-${stamp}@test.vet`,
        name:         'Staff Turnos 2',
        passwordHash: 'hash',
        role:         UserRole.AUXILIAR,
        tenantId,
      },
    });
    staff2UserId = staffUser2.id;
  });

  afterAll(async () => {
    // Limpiar en orden (FK cascade debería manejarlo, pero ayudamos)
    await admin.shiftHandover.deleteMany({ where: { tenantId } });
    await admin.shiftAssignment.deleteMany({ where: { tenantId } });
    await admin.shiftTemplate.deleteMany({ where: { tenantId } });
    await admin.unit.deleteMany({ where: { tenantId } });
    await admin.center.deleteMany({ where: { tenantId } });
    await admin.user.deleteMany({ where: { tenantId } });
    await admin.tenant.delete({ where: { id: tenantId } });
    await admin.tenant.delete({ where: { id: otherTenantId } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // (a) RLS — shift_templates
  // ---------------------------------------------------------------------------

  describe('RLS — shift_templates: otro tenant no ve las plantillas', () => {
    let templateId = '';

    beforeAll(async () => {
      const t = await admin.shiftTemplate.create({
        data: {
          tenantId,
          centerId,
          name:        'Mañana Planta',
          shift:       NursingNoteShift.MANANA,
          startTime:   '06:00',
          endTime:     '14:00',
          minStaff:    2,
          createdById: staffUserId,
        },
      });
      templateId = t.id;
    });

    it('otro tenant NO ve shift_templates del tenant original', async () => {
      const db = forTenant({ tenantId: otherTenantId });
      const items = await db.shiftTemplate.findMany({ where: { centerId } });
      expect(items).toHaveLength(0);
    });

    it('el tenant correcto SÍ ve sus shift_templates', async () => {
      const db = forTenant({ tenantId });
      const items = await db.shiftTemplate.findMany({ where: { centerId } });
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.some((t) => t.id === templateId)).toBe(true);
    });

    it('plantilla tiene los campos correctos', async () => {
      const db = forTenant({ tenantId });
      const t = await db.shiftTemplate.findUnique({ where: { id: templateId } });
      expect(t?.minStaff).toBe(2);
      expect(t?.shift).toBe(NursingNoteShift.MANANA);
      expect(t?.startTime).toBe('06:00');
      expect(t?.endTime).toBe('14:00');
    });
  });

  // ---------------------------------------------------------------------------
  // (b) RLS — shift_assignments
  // ---------------------------------------------------------------------------

  describe('RLS — shift_assignments: otro tenant no ve las asignaciones', () => {
    let assignmentId = '';

    beforeAll(async () => {
      const a = await admin.shiftAssignment.create({
        data: {
          tenantId,
          userId:      staffUserId,
          date:        testDate,
          shift:       NursingNoteShift.MANANA,
          unitId,
          status:      AssignmentStatus.CONFIRMADO,
          createdById: staffUserId,
        },
      });
      assignmentId = a.id;
    });

    it('otro tenant NO ve shift_assignments del tenant original', async () => {
      const db = forTenant({ tenantId: otherTenantId });
      const items = await db.shiftAssignment.findMany({ where: { unitId } });
      expect(items).toHaveLength(0);
    });

    it('el tenant correcto SÍ ve sus shift_assignments', async () => {
      const db = forTenant({ tenantId });
      const items = await db.shiftAssignment.findMany({ where: { unitId } });
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.some((a) => a.id === assignmentId)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // (c) RLS — shift_handovers
  // ---------------------------------------------------------------------------

  describe('RLS — shift_handovers: otro tenant no ve los cierres', () => {
    let handoverId = '';

    beforeAll(async () => {
      const h = await admin.shiftHandover.create({
        data: {
          tenantId,
          centerId,
          unitId,
          date:        testDate,
          shift:       NursingNoteShift.MANANA,
          summary:     'Turno sin incidencias. Todos los residentes estables.',
          closedById:  staffUserId,
          closedAt:    new Date(),
        },
      });
      handoverId = h.id;
    });

    it('otro tenant NO ve shift_handovers del tenant original', async () => {
      const db = forTenant({ tenantId: otherTenantId });
      const items = await db.shiftHandover.findMany({ where: { centerId } });
      expect(items).toHaveLength(0);
    });

    it('el tenant correcto SÍ ve sus shift_handovers', async () => {
      const db = forTenant({ tenantId });
      const items = await db.shiftHandover.findMany({ where: { centerId } });
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.some((h) => h.id === handoverId)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // (d) @@unique shift_assignments: no se duplica (tenantId, userId, date, shift)
  // ---------------------------------------------------------------------------

  describe('@@unique shift_assignments — evita duplicados', () => {
    const uniqueDate = new Date('2026-06-21T00:00:00.000Z');

    beforeAll(async () => {
      await admin.shiftAssignment.create({
        data: {
          tenantId,
          userId:      staffUserId,
          date:        uniqueDate,
          shift:       NursingNoteShift.TARDE,
          status:      AssignmentStatus.PLANIFICADO,
          createdById: staffUserId,
        },
      });
    });

    it('crear la misma asignación (mismo userId+date+shift) lanza error de unicidad', async () => {
      await expect(
        admin.shiftAssignment.create({
          data: {
            tenantId,
            userId:      staffUserId,
            date:        uniqueDate,
            shift:       NursingNoteShift.TARDE,
            status:      AssignmentStatus.CONFIRMADO, // distinto status, misma clave
            createdById: staffUserId,
          },
        }),
      ).rejects.toThrow();
    });

    it('la misma persona en distinto turno SÍ es válida', async () => {
      const a = await admin.shiftAssignment.create({
        data: {
          tenantId,
          userId:      staffUserId,
          date:        uniqueDate,
          shift:       NursingNoteShift.NOCHE,  // turno distinto
          status:      AssignmentStatus.PLANIFICADO,
          createdById: staffUserId,
        },
      });
      expect(a.id).toBeDefined();
      await admin.shiftAssignment.delete({ where: { id: a.id } });
    });

    it('distinto usuario en el mismo turno+día SÍ es válido', async () => {
      const a = await admin.shiftAssignment.create({
        data: {
          tenantId,
          userId:      staff2UserId, // otro usuario
          date:        uniqueDate,
          shift:       NursingNoteShift.TARDE,
          status:      AssignmentStatus.PLANIFICADO,
          createdById: staffUserId,
        },
      });
      expect(a.id).toBeDefined();
      await admin.shiftAssignment.delete({ where: { id: a.id } });
    });
  });

  // ---------------------------------------------------------------------------
  // (e) Cierre de turno firmado: closedById + closedAt registrados
  // ---------------------------------------------------------------------------

  describe('Firma del cierre de turno: closedById + closedAt', () => {
    const signDate = new Date('2026-06-22T00:00:00.000Z');

    it('crea cierre con closedById y closedAt del firmante', async () => {
      const before = new Date();
      const h = await admin.shiftHandover.create({
        data: {
          tenantId,
          centerId,
          date:        signDate,
          shift:       NursingNoteShift.TARDE,
          summary:     'Resumen del turno de tarde.',
          closedById:  staffUserId,
          closedAt:    new Date(),
        },
      });

      expect(h.closedById).toBe(staffUserId);
      expect(h.closedAt).toBeDefined();
      expect(h.closedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(h.closedAt.getTime()).toBeLessThanOrEqual(new Date().getTime());

      await admin.shiftHandover.delete({ where: { id: h.id } });
    });

    it('puede incluir incidentsSummary y pendingTasks', async () => {
      const signDate2 = new Date('2026-06-23T00:00:00.000Z');
      const h = await admin.shiftHandover.create({
        data: {
          tenantId,
          centerId,
          date:             signDate2,
          shift:            NursingNoteShift.NOCHE,
          summary:          'Noche tranquila.',
          incidentsSummary: 'Caída residente hab. 205 a las 02:30h. Sin lesiones.',
          pendingTasks:     'Revisar medicación pendiente de residente 3.',
          closedById:       staffUserId,
          closedAt:         new Date(),
        },
      });

      expect(h.incidentsSummary).toBe('Caída residente hab. 205 a las 02:30h. Sin lesiones.');
      expect(h.pendingTasks).toBe('Revisar medicación pendiente de residente 3.');

      await admin.shiftHandover.delete({ where: { id: h.id } });
    });
  });

  // ---------------------------------------------------------------------------
  // (f) FAMILIAR sin acceso a shifts:read, shifts:manage, care:write (estático)
  // ---------------------------------------------------------------------------

  describe('FAMILIAR — verificación estática de permisos (sin BD)', () => {
    it('FAMILIAR no tiene shifts:read', () => {
      expect(hasPermission('FAMILIAR', 'shifts:read')).toBe(false);
    });

    it('FAMILIAR no tiene shifts:manage', () => {
      expect(hasPermission('FAMILIAR', 'shifts:manage')).toBe(false);
    });

    it('FAMILIAR no tiene care:write (no puede firmar el cierre)', () => {
      expect(hasPermission('FAMILIAR', 'care:write')).toBe(false);
    });

    it('FAMILIAR no tiene care:read (no puede leer el cierre)', () => {
      expect(hasPermission('FAMILIAR', 'care:read')).toBe(false);
    });

    it('AUXILIAR tiene shifts:read (puede ver su cuadrante)', () => {
      expect(hasPermission('AUXILIAR', 'shifts:read')).toBe(true);
    });

    it('AUXILIAR NO tiene shifts:manage (no puede planificar cuadrante)', () => {
      expect(hasPermission('AUXILIAR', 'shifts:manage')).toBe(false);
    });

    it('AUXILIAR tiene care:write (puede firmar el cierre de turno)', () => {
      expect(hasPermission('AUXILIAR', 'care:write')).toBe(true);
    });

    it('DIRECTOR tiene shifts:read y shifts:manage', () => {
      expect(hasPermission('DIRECTOR', 'shifts:read')).toBe(true);
      expect(hasPermission('DIRECTOR', 'shifts:manage')).toBe(true);
    });

    it('SANITARIO tiene shifts:read pero no shifts:manage', () => {
      expect(hasPermission('SANITARIO', 'shifts:read')).toBe(true);
      expect(hasPermission('SANITARIO', 'shifts:manage')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // (g) Cascade — borrar centro elimina shift_templates y shift_handovers
  // ---------------------------------------------------------------------------

  describe('Cascade — borrar centro elimina shift_templates y shift_handovers', () => {
    it('al borrar un centro temporal, sus shift_templates desaparecen', async () => {
      const tmpCenter = await admin.center.create({
        data: { tenantId, name: 'Centro Tmp Cascade', type: CenterType.RESIDENCIA, city: 'Test' },
      });
      const tmpTemplate = await admin.shiftTemplate.create({
        data: {
          tenantId,
          centerId:    tmpCenter.id,
          name:        'Template Tmp',
          shift:       NursingNoteShift.MANANA,
          startTime:   '06:00',
          endTime:     '14:00',
          createdById: staffUserId,
        },
      });
      const tmpHandover = await admin.shiftHandover.create({
        data: {
          tenantId,
          centerId:   tmpCenter.id,
          date:       new Date('2026-06-25T00:00:00.000Z'),
          shift:      NursingNoteShift.TARDE,
          summary:    'Turno de prueba.',
          closedById: staffUserId,
          closedAt:   new Date(),
        },
      });

      await admin.center.delete({ where: { id: tmpCenter.id } });

      const templates = await admin.shiftTemplate.findMany({ where: { id: tmpTemplate.id } });
      expect(templates).toHaveLength(0);

      const handovers = await admin.shiftHandover.findMany({ where: { id: tmpHandover.id } });
      expect(handovers).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // (h) Cascade — borrar usuario elimina sus shift_assignments
  // ---------------------------------------------------------------------------

  describe('Cascade — borrar usuario elimina sus shift_assignments', () => {
    it('al borrar un usuario temporal, sus shift_assignments desaparecen', async () => {
      const tmpUser = await admin.user.create({
        data: {
          email:        `tmp-cascade-${stamp}@test.vet`,
          name:         'Tmp Cascade User',
          passwordHash: 'hash',
          role:         UserRole.AUXILIAR,
          tenantId,
        },
      });

      const tmpAssignment = await admin.shiftAssignment.create({
        data: {
          tenantId,
          userId:      tmpUser.id,
          date:        new Date('2026-06-26T00:00:00.000Z'),
          shift:       NursingNoteShift.MANANA,
          status:      AssignmentStatus.PLANIFICADO,
          createdById: staffUserId,
        },
      });

      await admin.user.delete({ where: { id: tmpUser.id } });

      const assignments = await admin.shiftAssignment.findMany({ where: { id: tmpAssignment.id } });
      expect(assignments).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // (i) Las 3 tablas NO están en dsar-registry (sin residentId)
  // ---------------------------------------------------------------------------

  describe('DSAR — las 3 tablas de turnos NO están en dsar-registry', () => {
    it('ShiftTemplate no está en RESIDENT_DATA_TABLE_MAP (no tiene residentId)', () => {
      expect(RESIDENT_DATA_TABLE_MAP.get('ShiftTemplate')).toBeUndefined();
    });

    it('ShiftAssignment no está en RESIDENT_DATA_TABLE_MAP (dato del trabajador, no del residente)', () => {
      expect(RESIDENT_DATA_TABLE_MAP.get('ShiftAssignment')).toBeUndefined();
    });

    it('ShiftHandover no está en RESIDENT_DATA_TABLE_MAP (dato organizacional, no del residente)', () => {
      expect(RESIDENT_DATA_TABLE_MAP.get('ShiftHandover')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // (j) AUSENTE con sustituto vs sin sustituto — persistencia correcta
  // ---------------------------------------------------------------------------

  describe('AUSENTE con y sin sustituto — persistencia', () => {
    const ausentDate = new Date('2026-06-27T00:00:00.000Z');

    it('AUSENTE sin sustituto: substituteUserId es null', async () => {
      const a = await admin.shiftAssignment.create({
        data: {
          tenantId,
          userId:           staffUserId,
          date:             ausentDate,
          shift:            NursingNoteShift.NOCHE,
          status:           AssignmentStatus.AUSENTE,
          substituteUserId: null,
          notes:            'Baja por enfermedad.',
          createdById:      staffUserId,
        },
      });
      expect(a.status).toBe(AssignmentStatus.AUSENTE);
      expect(a.substituteUserId).toBeNull();
      await admin.shiftAssignment.delete({ where: { id: a.id } });
    });

    it('AUSENTE con sustituto: substituteUserId es el id del sustituto', async () => {
      const a = await admin.shiftAssignment.create({
        data: {
          tenantId,
          userId:           staffUserId,
          date:             new Date('2026-06-28T00:00:00.000Z'),
          shift:            NursingNoteShift.TARDE,
          status:           AssignmentStatus.SUSTITUIDO,
          substituteUserId: staff2UserId,
          notes:            'Cubierta por staff2.',
          createdById:      staffUserId,
        },
      });
      expect(a.status).toBe(AssignmentStatus.SUSTITUIDO);
      expect(a.substituteUserId).toBe(staff2UserId);
      await admin.shiftAssignment.delete({ where: { id: a.id } });
    });
  });
});
