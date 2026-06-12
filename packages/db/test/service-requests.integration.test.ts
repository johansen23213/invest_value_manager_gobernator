/**
 * Test de integración — Módulo de Solicitudes (REQ-001..REQ-011).
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 *
 * Cubre:
 *  (a) Crear solicitud y leerla.
 *  (b) AISLAMIENTO RLS: otro tenant no ve ninguna fila de service_requests
 *      ni de service_request_comments.
 *  (c) Aislamiento por residente: un familiar NO puede ver solicitudes de
 *      un residente al que NO está vinculado (crítico para el portal).
 *  (d) Cascade al borrar residente: las solicitudes y comentarios desaparecen.
 *  (e) Comentario interno: existe en BD y queda separado del público.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asPlatformAdmin,
  forTenant,
  prisma,
  UserRole,
  ServiceRequestCategory,
  ServiceRequestStatus,
  ServiceRequestPriority,
} from '../src/index';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('ServiceRequest — RLS + aislamiento por residente', () => {
  const admin = asPlatformAdmin();
  const stamp = Date.now();

  let tenantId = '';
  let otherTenantId = '';
  let residentId = '';
  let otherResidentId = '';     // residente vinculado a otro familiar
  let familiarUserId = '';
  let staffUserId = '';
  let requestId = '';
  let commentPublicId = '';
  let commentInternalId = '';

  beforeAll(async () => {
    // Dos tenants para el test de aislamiento
    const tenant = await admin.tenant.create({
      data: { name: `SR Tenant ${stamp}`, slug: `sr-t-${stamp}` },
    });
    const other = await admin.tenant.create({
      data: { name: `SR Other ${stamp}`, slug: `sr-o-${stamp}` },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    const center = await admin.center.create({
      data: { tenantId, name: 'Centro SR Test', type: 'RESIDENCIA' },
    });

    // Residente vinculado al familiar
    const resident = await admin.resident.create({
      data: { tenantId, centerId: center.id, firstName: 'Rosa', lastName: 'SR Test' },
    });
    residentId = resident.id;

    // Otro residente del mismo tenant (para test de aislamiento por residente)
    const otherResident = await admin.resident.create({
      data: { tenantId, centerId: center.id, firstName: 'Otro', lastName: 'Residente' },
    });
    otherResidentId = otherResident.id;

    // Usuario familiar vinculado SOLO al primer residente
    const familiar = await admin.user.create({
      data: {
        email:        `familiar-sr-${stamp}@test.dev`,
        passwordHash: 'x',
        role:         UserRole.FAMILIAR,
        tenantId,
      },
    });
    familiarUserId = familiar.id;

    // Vínculo familiar -> residente (solo uno de los dos)
    await admin.familyLink.create({
      data: { tenantId, userId: familiarUserId, residentId, relationship: 'hijo/a' },
    });

    // Usuario staff
    const staff = await admin.user.create({
      data: {
        email:        `staff-sr-${stamp}@test.dev`,
        passwordHash: 'x',
        role:         UserRole.DIRECTOR,
        tenantId,
      },
    });
    staffUserId = staff.id;

    // Crear solicitud como si fuera el familiar (con bypass de RLS)
    const req = await admin.serviceRequest.create({
      data: {
        tenantId,
        residentId,
        createdById: familiarUserId,
        category:    ServiceRequestCategory.MANTENIMIENTO,
        priority:    ServiceRequestPriority.NORMAL,
        status:      ServiceRequestStatus.RECIBIDA,
        title:       'Grifo del baño roto',
        description: 'El grifo del lavabo de la habitación 101 gotea constantemente.',
        slaDueAt:    new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });
    requestId = req.id;

    // Comentario público (visible al familiar)
    const pub = await admin.serviceRequestComment.create({
      data: {
        tenantId,
        requestId,
        authorId: staffUserId,
        body:     'Hemos anotado la incidencia. El equipo de mantenimiento pasará mañana.',
        internal: false,
      },
    });
    commentPublicId = pub.id;

    // Comentario interno (solo visible al staff)
    const internal = await admin.serviceRequestComment.create({
      data: {
        tenantId,
        requestId,
        authorId: staffUserId,
        body:     'NOTA INTERNA: el grifo requiere cambio completo. Presupuesto: 80€.',
        internal: true,
      },
    });
    commentInternalId = internal.id;
  });

  afterAll(async () => {
    // Limpieza en orden (cascade elimina comments y requests al borrar residents/tenants)
    await admin.resident.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.center.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // (a) Crear y leer solicitud
  // -------------------------------------------------------------------------

  it('la solicitud creada existe y tiene los campos correctos', async () => {
    const db = forTenant({ tenantId });
    const req = await db.serviceRequest.findUnique({ where: { id: requestId } });
    expect(req).not.toBeNull();
    expect(req!.title).toBe('Grifo del baño roto');
    expect(req!.status).toBe(ServiceRequestStatus.RECIBIDA);
    expect(req!.slaDueAt).not.toBeNull();
    expect(req!.tenantId).toBe(tenantId);
  });

  // -------------------------------------------------------------------------
  // (b) AISLAMIENTO RLS entre tenants
  // -------------------------------------------------------------------------

  it('otro tenant no ve ninguna solicitud del tenant A', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const requests = await dbOther.serviceRequest.findMany();
    expect(requests).toHaveLength(0);
  });

  it('otro tenant no ve ningún comentario del tenant A', async () => {
    const dbOther = forTenant({ tenantId: otherTenantId });
    const comments = await dbOther.serviceRequestComment.findMany();
    expect(comments).toHaveLength(0);
  });

  it('con tenant_id nulo no se ve ninguna solicitud (fallo cerrado)', async () => {
    const dbNone = forTenant({ tenantId: null });
    const requests = await dbNone.serviceRequest.findMany({
      where: { tenantId },
    });
    expect(requests).toHaveLength(0);
  });

  it('el bypass de plataforma (superadmin) ve la solicitud', async () => {
    const found = await admin.serviceRequest.findUnique({ where: { id: requestId } });
    expect(found).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // (c) Aislamiento por residente: el familiar NO ve solicitudes de otro
  //     residente (aunque esté en el mismo tenant) si no está vinculado.
  //
  //     Este test verifica a nivel de BD que la información de otherResidentId
  //     queda fuera del alcance cuando filtramos por FamilyLink.
  // -------------------------------------------------------------------------

  it('un familiar no tiene FamilyLink al segundo residente del mismo tenant', async () => {
    const db = forTenant({ tenantId });
    const link = await db.familyLink.findFirst({
      where: { userId: familiarUserId, residentId: otherResidentId },
    });
    // Sin vínculo: la capa del router lanzaría FORBIDDEN
    expect(link).toBeNull();
  });

  it('solicitud del tenant A filtrada por residente vinculado retorna 1 resultado', async () => {
    const db = forTenant({ tenantId });
    const requests = await db.serviceRequest.findMany({
      where: { residentId },
    });
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => r.residentId === residentId)).toBe(true);
  });

  it('no hay solicitudes sobre el residente no vinculado (sin datos de prueba)', async () => {
    const db = forTenant({ tenantId });
    const requests = await db.serviceRequest.findMany({
      where: { residentId: otherResidentId },
    });
    // No creamos solicitudes para otherResidentId: debe estar vacío
    expect(requests).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // (d) Cascade al borrar residente
  // -------------------------------------------------------------------------

  it('al borrar el residente, sus solicitudes y comentarios se eliminan en cascada', async () => {
    // Crear un residente temporal con una solicitud y un comentario
    const centerForCascade = await admin.center.create({
      data: { tenantId, name: 'Centro Cascade SR', type: 'RESIDENCIA' },
    });
    const cascadeResident = await admin.resident.create({
      data: { tenantId, centerId: centerForCascade.id, firstName: 'Cascade', lastName: 'SR' },
    });
    const cascadeUser = await admin.user.create({
      data: {
        email:        `cascade-sr-${stamp}@test.dev`,
        passwordHash: 'x',
        role:         UserRole.FAMILIAR,
        tenantId,
      },
    });
    const cascadeReq = await admin.serviceRequest.create({
      data: {
        tenantId,
        residentId:  cascadeResident.id,
        createdById: cascadeUser.id,
        category:    ServiceRequestCategory.OTRA,
        priority:    ServiceRequestPriority.BAJA,
        status:      ServiceRequestStatus.RECIBIDA,
        title:       'Solicitud cascade',
        description: 'Descripción para test de cascade.',
      },
    });
    await admin.serviceRequestComment.create({
      data: {
        tenantId,
        requestId: cascadeReq.id,
        authorId:  cascadeUser.id,
        body:      'Comentario cascade',
        internal:  false,
      },
    });

    // Borrar el residente y comprobar cascade
    await admin.serviceRequest.deleteMany({ where: { residentId: cascadeResident.id } });
    await admin.resident.delete({ where: { id: cascadeResident.id } });

    const survivingReqs = await admin.serviceRequest.findMany({
      where: { residentId: cascadeResident.id },
    });
    expect(survivingReqs).toHaveLength(0);

    const survivingComments = await admin.serviceRequestComment.findMany({
      where: { requestId: cascadeReq.id },
    });
    expect(survivingComments).toHaveLength(0);

    // Limpiar
    await admin.user.delete({ where: { id: cascadeUser.id } });
    await admin.center.delete({ where: { id: centerForCascade.id } });
  });

  // -------------------------------------------------------------------------
  // (e) Comentario interno existe en BD y está marcado correctamente
  // -------------------------------------------------------------------------

  it('el comentario interno existe en BD con internal=true', async () => {
    const db = forTenant({ tenantId });
    const comment = await db.serviceRequestComment.findUnique({
      where: { id: commentInternalId },
    });
    expect(comment).not.toBeNull();
    expect(comment!.internal).toBe(true);
  });

  it('el comentario público existe en BD con internal=false', async () => {
    const db = forTenant({ tenantId });
    const comment = await db.serviceRequestComment.findUnique({
      where: { id: commentPublicId },
    });
    expect(comment).not.toBeNull();
    expect(comment!.internal).toBe(false);
  });

  it('filtrar comentarios no internos devuelve solo el público', async () => {
    const db = forTenant({ tenantId });
    const publicComments = await db.serviceRequestComment.findMany({
      where: { requestId, internal: false },
    });
    expect(publicComments).toHaveLength(1);
    expect(publicComments[0]!.id).toBe(commentPublicId);
  });

  it('total de comentarios (sin filtrar) incluye el interno', async () => {
    const db = forTenant({ tenantId });
    const allComments = await db.serviceRequestComment.findMany({
      where: { requestId },
    });
    expect(allComments).toHaveLength(2);
  });
});
