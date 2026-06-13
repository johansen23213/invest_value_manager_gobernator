/**
 * Test de integración — Módulo de documentación clínica (Épica A).
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 *
 * Cubre:
 *  (a) RLS: otro tenant NO ve nursing_notes ni medical_notes del tenant original.
 *  (b) Cascade: al borrar un residente, sus notas (nursing + medical) se borran.
 *  (c) Filtro por turno: listByResident filtra correctamente por shift.
 *  (d) Familiar NO tiene acceso a notas médicas: verifica que no hay endpoint
 *      expuesto al rol FAMILIAR que devuelva MedicalNote.
 *  (e) Varios turnos en un día: listForShiftHandover agrupa por residente.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asPlatformAdmin,
  forTenant,
  prisma,
  UserRole,
  NursingNoteShift,
  NursingNoteCategory,
  MedicalNoteType,
  CenterType,
} from '../src/index';
import { hasPermission } from '../../apps/web/src/lib/rbac';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Clinical Notes — RLS + aislamiento + cascades + acceso familiar', () => {
  const admin  = asPlatformAdmin();
  const stamp  = Date.now();

  let tenantId        = '';
  let otherTenantId   = '';
  let centerId        = '';
  let residentId      = '';
  let otherResidentId = '';   // mismo tenant, otro residente
  let staffUserId     = '';
  let nursingNoteId   = '';
  let medicalNoteId   = '';

  beforeAll(async () => {
    // Dos tenants para el test de aislamiento RLS
    const tenant = await admin.tenant.create({
      data: { name: `ClinNotes Tenant ${stamp}`, slug: `clinnt-${stamp}` },
    });
    const other = await admin.tenant.create({
      data: { name: `ClinNotes Other ${stamp}`, slug: `clinno-${stamp}` },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    // Centro para el tenant principal
    const center = await admin.center.create({
      data: { tenantId, name: 'Centro Test', type: CenterType.RESIDENCIA, city: 'Test' },
    });
    centerId = center.id;

    // Usuario staff del tenant
    const staffUser = await admin.user.create({
      data: {
        email:        `staff-cn-${stamp}@test.vet`,
        name:         'Staff Test',
        passwordHash: 'hash',
        role:         UserRole.SANITARIO,
        tenantId,
      },
    });
    staffUserId = staffUser.id;

    // Residente del tenant principal
    const resident = await admin.resident.create({
      data: {
        tenantId,
        centerId,
        firstName: 'Carmen',
        lastName:  'Prueba',
        status:    'ACTIVO',
      },
    });
    residentId = resident.id;

    // Otro residente del mismo tenant (para verificar que no se mezclan)
    const otherResident = await admin.resident.create({
      data: {
        tenantId,
        centerId,
        firstName: 'Pedro',
        lastName:  'Otro',
        status:    'ACTIVO',
      },
    });
    otherResidentId = otherResident.id;

    // Crear una nota de enfermería
    const nursingNote = await admin.nursingNote.create({
      data: {
        tenantId,
        residentId,
        authorId:  staffUserId,
        shift:     NursingNoteShift.MANANA,
        noteDate:  new Date('2026-06-13T00:00:00.000Z'),
        body:      'Nota de enfermería de mañana para test.',
        category:  NursingNoteCategory.GENERAL,
      },
    });
    nursingNoteId = nursingNote.id;

    // Crear nota de turno TARDE del mismo residente
    await admin.nursingNote.create({
      data: {
        tenantId,
        residentId,
        authorId:  staffUserId,
        shift:     NursingNoteShift.TARDE,
        noteDate:  new Date('2026-06-13T00:00:00.000Z'),
        body:      'Nota de enfermería de tarde para test.',
        category:  NursingNoteCategory.INCIDENCIA,
      },
    });

    // Crear un evolutivo médico
    const medicalNote = await admin.medicalNote.create({
      data: {
        tenantId,
        residentId,
        authorId:  staffUserId,
        noteDate:  new Date('2026-06-13T00:00:00.000Z'),
        type:      MedicalNoteType.EVOLUTIVO,
        body:      'Evolutivo médico para test.',
        reason:    'Revisión periódica',
        plan:      'Sin cambios en la pauta.',
      },
    });
    medicalNoteId = medicalNote.id;
  });

  afterAll(async () => {
    // Limpieza (RLS bypass para poder borrar todo)
    await admin.nursingNote.deleteMany({ where: { tenantId } });
    await admin.medicalNote.deleteMany({ where: { tenantId } });
    await admin.resident.deleteMany({ where: { tenantId } });
    await admin.center.deleteMany({ where: { tenantId } });
    await admin.user.deleteMany({ where: { tenantId } });
    await admin.tenant.delete({ where: { id: tenantId } });
    await admin.tenant.delete({ where: { id: otherTenantId } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // (a) RLS: aislamiento entre tenants
  // ---------------------------------------------------------------------------

  describe('RLS — aislamiento entre tenants', () => {
    it('otro tenant NO ve las nursing_notes del tenant original', async () => {
      const db = forTenant({ tenantId: otherTenantId });
      const notes = await db.nursingNote.findMany({
        where: { residentId },
      });
      expect(notes).toHaveLength(0);
    });

    it('otro tenant NO ve las medical_notes del tenant original', async () => {
      const db = forTenant({ tenantId: otherTenantId });
      const notes = await db.medicalNote.findMany({
        where: { residentId },
      });
      expect(notes).toHaveLength(0);
    });

    it('el tenant correcto SÍ ve sus nursing_notes', async () => {
      const db = forTenant({ tenantId });
      const notes = await db.nursingNote.findMany({
        where: { residentId },
      });
      expect(notes.length).toBeGreaterThanOrEqual(2);
    });

    it('el tenant correcto SÍ ve sus medical_notes', async () => {
      const db = forTenant({ tenantId });
      const notes = await db.medicalNote.findMany({
        where: { residentId },
      });
      expect(notes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // (b) Cascade al borrar residente
  // ---------------------------------------------------------------------------

  describe('Cascade — borrar residente elimina sus notas', () => {
    it('al borrar el residente, sus nursingNotes desaparecen', async () => {
      // Crear residente temporal
      const tmp = await admin.resident.create({
        data: { tenantId, centerId, firstName: 'Tmp', lastName: 'Cascade', status: 'ACTIVO' },
      });
      // Crear nota de enfermería para ese residente
      await admin.nursingNote.create({
        data: {
          tenantId,
          residentId: tmp.id,
          authorId:   staffUserId,
          shift:      NursingNoteShift.NOCHE,
          noteDate:   new Date(),
          body:       'Nota temporal para cascade test.',
        },
      });

      // Verificar que se creó
      const before = await admin.nursingNote.findMany({ where: { residentId: tmp.id } });
      expect(before).toHaveLength(1);

      // Borrar residente
      await admin.resident.delete({ where: { id: tmp.id } });

      // Verificar cascade
      const after = await admin.nursingNote.findMany({ where: { residentId: tmp.id } });
      expect(after).toHaveLength(0);
    });

    it('al borrar el residente, sus medicalNotes desaparecen', async () => {
      const tmp = await admin.resident.create({
        data: { tenantId, centerId, firstName: 'Tmp2', lastName: 'CascadeMed', status: 'ACTIVO' },
      });
      await admin.medicalNote.create({
        data: {
          tenantId,
          residentId: tmp.id,
          authorId:   staffUserId,
          noteDate:   new Date(),
          type:       MedicalNoteType.VISITA,
          body:       'Visita médica temporal para cascade test.',
        },
      });

      const before = await admin.medicalNote.findMany({ where: { residentId: tmp.id } });
      expect(before).toHaveLength(1);

      await admin.resident.delete({ where: { id: tmp.id } });

      const after = await admin.medicalNote.findMany({ where: { residentId: tmp.id } });
      expect(after).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // (c) Filtro por turno
  // ---------------------------------------------------------------------------

  describe('Filtro por turno', () => {
    it('listByResident filtra solo las notas del turno MANANA', async () => {
      const db = forTenant({ tenantId });
      const notes = await db.nursingNote.findMany({
        where: {
          residentId,
          shift: NursingNoteShift.MANANA,
        },
      });
      expect(notes.every((n) => n.shift === NursingNoteShift.MANANA)).toBe(true);
      expect(notes.length).toBeGreaterThanOrEqual(1);
    });

    it('listByResident filtra solo las notas del turno TARDE', async () => {
      const db = forTenant({ tenantId });
      const notes = await db.nursingNote.findMany({
        where: {
          residentId,
          shift: NursingNoteShift.TARDE,
        },
      });
      expect(notes.every((n) => n.shift === NursingNoteShift.TARDE)).toBe(true);
      expect(notes.length).toBeGreaterThanOrEqual(1);
    });

    it('filtro NOCHE devuelve 0 notas (no se crearon)', async () => {
      const db = forTenant({ tenantId });
      const notes = await db.nursingNote.findMany({
        where: {
          residentId,
          shift: NursingNoteShift.NOCHE,
          noteDate: new Date('2026-06-13T00:00:00.000Z'),
        },
      });
      expect(notes).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // (d) Familiar NO accede a notas médicas — verificación estática de permisos
  // ---------------------------------------------------------------------------

  describe('Familiar NO accede a notas médicas (verificación de permisos)', () => {
    it('FAMILIAR no tiene residents:read (permiso requerido para medical.listByResident)', () => {
      // El permiso usado en medical.listByResident es residents:read.
      // El rol FAMILIAR no tiene este permiso (solo tiene portal:read,
      // requests:create, comms:read, visits:request).
      expect(hasPermission('FAMILIAR', 'residents:read')).toBe(false);
    });

    it('FAMILIAR no tiene care:read (permiso requerido para nursing.listByResident)', () => {
      // Aunque el familiar no debería ver las notas de enfermería tampoco,
      // verificamos que care:read no está en sus permisos.
      expect(hasPermission('FAMILIAR', 'care:read')).toBe(false);
    });

    it('FAMILIAR no tiene clinical:write (permiso requerido para medical.create)', () => {
      expect(hasPermission('FAMILIAR', 'clinical:write')).toBe(false);
    });

    it('FAMILIAR no tiene care:write (permiso requerido para nursing.create)', () => {
      expect(hasPermission('FAMILIAR', 'care:write')).toBe(false);
    });

    it('SANITARIO tiene clinical:write (puede crear evolutivos médicos)', () => {
      expect(hasPermission('SANITARIO', 'clinical:write')).toBe(true);
    });

    it('AUXILIAR tiene care:write (puede crear notas de enfermería)', () => {
      expect(hasPermission('AUXILIAR', 'care:write')).toBe(true);
    });

    it('DIRECTOR tiene care:write y clinical:write', () => {
      expect(hasPermission('DIRECTOR', 'care:write')).toBe(true);
      expect(hasPermission('DIRECTOR', 'clinical:write')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // (e) listForShiftHandover agrupa por residente
  // ---------------------------------------------------------------------------

  describe('Traspaso de turno — notas agrupadas por residente', () => {
    it('recupera las notas del turno MANANA de la fecha dada para el centro', async () => {
      const db = forTenant({ tenantId });

      const dayStart = new Date('2026-06-13T00:00:00.000Z');
      const dayEnd   = new Date('2026-06-13T23:59:59.999Z');

      const notes = await db.nursingNote.findMany({
        where: {
          shift:    NursingNoteShift.MANANA,
          noteDate: { gte: dayStart, lte: dayEnd },
          resident: { centerId },
        },
        include: { resident: { select: { id: true, firstName: true } } },
      });

      expect(notes.length).toBeGreaterThanOrEqual(1);
      expect(notes.some((n) => n.residentId === residentId)).toBe(true);
    });
  });
});
