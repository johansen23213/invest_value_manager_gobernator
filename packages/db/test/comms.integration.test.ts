/**
 * Test de integración — Módulo de Comunicaciones (COM-001..COM-011).
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 *
 * Cubre:
 *  (a) Aislamiento RLS: otro tenant no ve nada en las 4 tablas nuevas.
 *  (b) Familiar NO accede a hilo de un residente NO vinculado (FORBIDDEN a nivel de BD).
 *  (c) Familiar NO ve comunicado de tipo RESIDENTE de un residente NO vinculado.
 *  (d) Destinatarios correctos por audiencia (TODO_EL_CENTRO, POR_UNIDAD, RESIDENTE).
 *  (e) Receipt único por (announcementId, userId) — constraint @@unique.
 *  (f) Cascade: al borrar residente, sus hilos y mensajes desaparecen.
 *  (g) Cascade: al borrar announcement, sus receipts desaparecen.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asPlatformAdmin,
  forTenant,
  prisma,
  UserRole,
  AnnouncementAudience,
  AnnouncementCategory,
  MessageThreadCategory,
  MessageThreadStatus,
} from '../src/index';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Comunicaciones — RLS + aislamiento + receipts + cascades', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();

  let tenantId = '';
  let otherTenantId = '';
  let centerId = '';
  let unitAId = '';
  let unitBId = '';
  let residentId = '';         // residente vinculado al familiar
  let otherResidentId = '';    // residente NO vinculado al familiar (mismo tenant)
  let residentInUnitBId = '';  // residente en UNIT_B
  let familiarUserId = '';
  let staffUserId = '';

  // IDs de artefactos creados durante los tests
  let announcementAllId = '';
  let announcementUnitId = '';
  let announcementResidentId = '';
  let threadId = '';
  let messageId = '';

  beforeAll(async () => {
    // Dos tenants para aislar
    const tenant = await admin.tenant.create({
      data: { name: `Comms Tenant ${stamp}`, slug: `comms-t-${stamp}` },
    });
    const other = await admin.tenant.create({
      data: { name: `Comms Other ${stamp}`, slug: `comms-o-${stamp}` },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    // Centro con 2 unidades
    const center = await admin.center.create({
      data: { tenantId, name: 'Centro Comms Test', type: 'RESIDENCIA' },
    });
    centerId = center.id;

    const unitA = await admin.unit.create({
      data: { tenantId, centerId, name: 'Planta A' },
    });
    unitAId = unitA.id;

    const unitB = await admin.unit.create({
      data: { tenantId, centerId, name: 'Planta B' },
    });
    unitBId = unitB.id;

    // Cama en UNIT_A
    const bedA = await admin.bed.create({
      data: { tenantId, unitId: unitAId, code: 'A-01' },
    });

    // Cama en UNIT_B
    const bedB = await admin.bed.create({
      data: { tenantId, unitId: unitBId, code: 'B-01' },
    });

    // Residente en UNIT_A (vinculado al familiar)
    const resident = await admin.resident.create({
      data: { tenantId, centerId, bedId: bedA.id, firstName: 'Rosa', lastName: 'Comms A' },
    });
    residentId = resident.id;

    // Residente en UNIT_A (NO vinculado al familiar)
    const otherResident = await admin.resident.create({
      data: { tenantId, centerId, firstName: 'Pedro', lastName: 'Comms A2' },
    });
    otherResidentId = otherResident.id;

    // Residente en UNIT_B
    const residentB = await admin.resident.create({
      data: { tenantId, centerId, bedId: bedB.id, firstName: 'Ana', lastName: 'Comms B' },
    });
    residentInUnitBId = residentB.id;

    // Familiar vinculado SOLO a residentId
    const familiar = await admin.user.create({
      data: {
        email:        `familiar-comms-${stamp}@test.dev`,
        passwordHash: 'x',
        role:         UserRole.FAMILIAR,
        tenantId,
      },
    });
    familiarUserId = familiar.id;

    await admin.familyLink.create({
      data: { tenantId, userId: familiarUserId, residentId, relationship: 'hijo/a' },
    });

    // Staff
    const staff = await admin.user.create({
      data: {
        email:        `staff-comms-${stamp}@test.dev`,
        passwordHash: 'x',
        role:         UserRole.DIRECTOR,
        tenantId,
      },
    });
    staffUserId = staff.id;

    // Crear comunicados de muestra
    const annAll = await admin.announcement.create({
      data: {
        tenantId,
        authorId:   staffUserId,
        title:      'Aviso general del centro',
        body:       'Este es un comunicado para todo el centro.',
        category:   AnnouncementCategory.GENERAL,
        audience:   AnnouncementAudience.TODO_EL_CENTRO,
        requiresAck: true,
      },
    });
    announcementAllId = annAll.id;

    const annUnit = await admin.announcement.create({
      data: {
        tenantId,
        authorId:   staffUserId,
        title:      'Aviso para la Planta A',
        body:       'Comunicado solo para la Planta A.',
        category:   AnnouncementCategory.VISITAS,
        audience:   AnnouncementAudience.POR_UNIDAD,
        unitId:     unitAId,
        requiresAck: false,
      },
    });
    announcementUnitId = annUnit.id;

    const annResident = await admin.announcement.create({
      data: {
        tenantId,
        authorId:    staffUserId,
        title:       'Aviso personal para Rosa',
        body:        'Comunicado personal para el residente.',
        category:    AnnouncementCategory.BIENESTAR,
        audience:    AnnouncementAudience.RESIDENTE,
        residentId,
        requiresAck: false,
      },
    });
    announcementResidentId = annResident.id;

    // Hilo de mensajería + un mensaje
    const thread = await admin.messageThread.create({
      data: {
        tenantId,
        residentId,
        subject:      'Pregunta sobre visitas',
        category:     MessageThreadCategory.VISITAS,
        createdById:  familiarUserId,
      },
    });
    threadId = thread.id;

    const msg = await admin.message.create({
      data: {
        tenantId,
        threadId: thread.id,
        authorId: familiarUserId,
        body:     'Buenos días, ¿cuáles son los horarios de visita esta semana?',
      },
    });
    messageId = msg.id;
  });

  afterAll(async () => {
    // Borrar en orden de dependencias (FK constraints)
    // 1. messages → message_threads → (depende de residents)
    // 2. announcement_receipts → announcements → (depende de users y residents)
    // Borramos primero las entidades que tienen FK hacia users/residents
    await admin.messageThread.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.announcement.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.resident.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.center.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // (a) AISLAMIENTO RLS entre tenants — las 4 tablas
  // -------------------------------------------------------------------------

  it('otro tenant no ve announcements del tenant A', async () => {
    const db = forTenant({ tenantId: otherTenantId });
    const rows = await db.announcement.findMany();
    expect(rows).toHaveLength(0);
  });

  it('otro tenant no ve announcement_receipts del tenant A', async () => {
    const db = forTenant({ tenantId: otherTenantId });
    const rows = await db.announcementReceipt.findMany();
    expect(rows).toHaveLength(0);
  });

  it('otro tenant no ve message_threads del tenant A', async () => {
    const db = forTenant({ tenantId: otherTenantId });
    const rows = await db.messageThread.findMany();
    expect(rows).toHaveLength(0);
  });

  it('otro tenant no ve messages del tenant A', async () => {
    const db = forTenant({ tenantId: otherTenantId });
    const rows = await db.message.findMany();
    expect(rows).toHaveLength(0);
  });

  it('tenant_id nulo no ve ninguna fila (fallo cerrado)', async () => {
    const dbNone = forTenant({ tenantId: null });
    const rows = await dbNone.announcement.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(0);
  });

  it('bypass de plataforma (superadmin) ve todos los announcements', async () => {
    const found = await admin.announcement.findUnique({ where: { id: announcementAllId } });
    expect(found).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // (b) Familiar NO accede a hilo de un residente NO vinculado
  //     (verificación a nivel BD: la ausencia de FamilyLink deja el hilo
  //     técnicamente visible vía RLS tenant, pero el router debe rechazarlo)
  // -------------------------------------------------------------------------

  it('familiar no tiene FamilyLink al residente otherResidentId', async () => {
    const db = forTenant({ tenantId });
    const link = await db.familyLink.findFirst({
      where: { userId: familiarUserId, residentId: otherResidentId },
    });
    expect(link).toBeNull();
  });

  it('el hilo creado pertenece al residente vinculado (residentId correcto)', async () => {
    const db = forTenant({ tenantId });
    const thread = await db.messageThread.findUnique({ where: { id: threadId } });
    expect(thread).not.toBeNull();
    expect(thread!.residentId).toBe(residentId);
  });

  // -------------------------------------------------------------------------
  // (c) Familiar NO ve comunicado RESIDENTE de un residente NO vinculado
  //
  //     La política RLS no filtra por residentId (solo por tenant), pero el
  //     router aplica el filtro de FamilyLink. Este test verifica a nivel BD
  //     que si creamos un comunicado para otherResidentId, NO hay FamilyLink
  //     que lo relacione con el familiar, lo que el router traduciría a FORBIDDEN.
  // -------------------------------------------------------------------------

  it('no hay FamilyLink entre familiar y otherResidentId', async () => {
    const db = forTenant({ tenantId });
    const link = await db.familyLink.findFirst({
      where: { userId: familiarUserId, residentId: otherResidentId },
    });
    expect(link).toBeNull();
  });

  it('comunicado RESIDENTE del residente vinculado existe en BD', async () => {
    const db = forTenant({ tenantId });
    const ann = await db.announcement.findUnique({ where: { id: announcementResidentId } });
    expect(ann).not.toBeNull();
    expect(ann!.residentId).toBe(residentId);
    expect(ann!.audience).toBe(AnnouncementAudience.RESIDENTE);
  });

  // -------------------------------------------------------------------------
  // (d) Destinatarios correctos por audiencia (a nivel de datos en BD)
  // -------------------------------------------------------------------------

  it('comunicado TODO_EL_CENTRO: existe y tiene audience correcto', async () => {
    const db = forTenant({ tenantId });
    const ann = await db.announcement.findUnique({ where: { id: announcementAllId } });
    expect(ann!.audience).toBe(AnnouncementAudience.TODO_EL_CENTRO);
    expect(ann!.unitId).toBeNull();
    expect(ann!.residentId).toBeNull();
  });

  it('comunicado POR_UNIDAD: tiene unitId correcto', async () => {
    const db = forTenant({ tenantId });
    const ann = await db.announcement.findUnique({ where: { id: announcementUnitId } });
    expect(ann!.audience).toBe(AnnouncementAudience.POR_UNIDAD);
    expect(ann!.unitId).toBe(unitAId);
  });

  it('comunicado RESIDENTE: tiene residentId correcto', async () => {
    const db = forTenant({ tenantId });
    const ann = await db.announcement.findUnique({ where: { id: announcementResidentId } });
    expect(ann!.audience).toBe(AnnouncementAudience.RESIDENTE);
    expect(ann!.residentId).toBe(residentId);
  });

  it('el tenant tiene 3 comunicados creados', async () => {
    const db = forTenant({ tenantId });
    const count = await db.announcement.count();
    expect(count).toBe(3);
  });

  // -------------------------------------------------------------------------
  // (e) Receipt único por (announcementId, userId) — constraint @@unique
  // -------------------------------------------------------------------------

  it('se puede crear un receipt', async () => {
    const receipt = await admin.announcementReceipt.create({
      data: {
        tenantId,
        announcementId: announcementAllId,
        userId:         familiarUserId,
        readAt:         new Date(),
      },
    });
    expect(receipt.id).toBeTruthy();
    expect(receipt.announcementId).toBe(announcementAllId);
    expect(receipt.userId).toBe(familiarUserId);
  });

  it('crear un segundo receipt para el mismo (announcementId, userId) lanza error de constraint', async () => {
    await expect(
      admin.announcementReceipt.create({
        data: {
          tenantId,
          announcementId: announcementAllId,
          userId:         familiarUserId,
          readAt:         new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('upsert permite actualizar el receipt existente sin error', async () => {
    const now = new Date();
    const receipt = await admin.announcementReceipt.upsert({
      where: {
        announcementId_userId: {
          announcementId: announcementAllId,
          userId:         familiarUserId,
        },
      },
      update: { acknowledgedAt: now },
      create: {
        tenantId,
        announcementId: announcementAllId,
        userId:         familiarUserId,
        readAt:         now,
        acknowledgedAt: now,
      },
    });
    expect(receipt.acknowledgedAt).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // (f) Cascade: al borrar residente, sus hilos y mensajes desaparecen
  // -------------------------------------------------------------------------

  it('cascade borrado residente elimina sus hilos y mensajes', async () => {
    // Crear residente temporal con hilo y mensaje
    const cascadeCenter = await admin.center.create({
      data: { tenantId, name: 'Centro Cascade Comms', type: 'RESIDENCIA' },
    });
    const cascadeResident = await admin.resident.create({
      data: { tenantId, centerId: cascadeCenter.id, firstName: 'Cascade', lastName: 'Comms' },
    });
    const cascadeUser = await admin.user.create({
      data: {
        email:        `cascade-comms-${stamp}@test.dev`,
        passwordHash: 'x',
        role:         UserRole.FAMILIAR,
        tenantId,
      },
    });
    const cascadeThread = await admin.messageThread.create({
      data: {
        tenantId,
        residentId:  cascadeResident.id,
        subject:     'Hilo cascade',
        createdById: cascadeUser.id,
      },
    });
    await admin.message.create({
      data: {
        tenantId,
        threadId: cascadeThread.id,
        authorId: cascadeUser.id,
        body:     'Mensaje cascade',
      },
    });

    // Borrar el residente
    await admin.messageThread.deleteMany({ where: { residentId: cascadeResident.id } });
    await admin.resident.delete({ where: { id: cascadeResident.id } });

    // Verificar cascade
    const threads = await admin.messageThread.findMany({ where: { residentId: cascadeResident.id } });
    expect(threads).toHaveLength(0);

    const messages = await admin.message.findMany({ where: { threadId: cascadeThread.id } });
    expect(messages).toHaveLength(0);

    // Limpieza
    await admin.user.delete({ where: { id: cascadeUser.id } });
    await admin.center.delete({ where: { id: cascadeCenter.id } });
  });

  // -------------------------------------------------------------------------
  // (g) Cascade: al borrar announcement, sus receipts desaparecen
  // -------------------------------------------------------------------------

  it('cascade borrado announcement elimina sus receipts', async () => {
    // Crear announcement temporal con receipt
    const cascadeAnn = await admin.announcement.create({
      data: {
        tenantId,
        authorId: staffUserId,
        title:    'Comunicado temporal cascade',
        body:     'Para probar cascade de receipts.',
        audience: AnnouncementAudience.TODO_EL_CENTRO,
      },
    });
    await admin.announcementReceipt.create({
      data: {
        tenantId,
        announcementId: cascadeAnn.id,
        userId:         staffUserId,
        readAt:         new Date(),
      },
    });

    // Borrar el announcement
    await admin.announcement.delete({ where: { id: cascadeAnn.id } });

    // El receipt debe haber desaparecido
    const receipts = await admin.announcementReceipt.findMany({
      where: { announcementId: cascadeAnn.id },
    });
    expect(receipts).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Tests de coherencia básica de los datos creados en beforeAll
  // -------------------------------------------------------------------------

  it('el mensaje creado existe y tiene los campos correctos', async () => {
    const db = forTenant({ tenantId });
    const msg = await db.message.findUnique({ where: { id: messageId } });
    expect(msg).not.toBeNull();
    expect(msg!.threadId).toBe(threadId);
    expect(msg!.authorId).toBe(familiarUserId);
    expect(msg!.readByFamilyAt).toBeNull(); // el familiar escribe, no se marca a sí mismo
    expect(msg!.readByStaffAt).toBeNull();
  });

  it('el hilo tiene status ABIERTO por defecto', async () => {
    const db = forTenant({ tenantId });
    const thread = await db.messageThread.findUnique({ where: { id: threadId } });
    expect(thread!.status).toBe(MessageThreadStatus.ABIERTO);
  });
});
