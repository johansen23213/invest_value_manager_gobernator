/**
 * Test de integración — indicadores de calidad asistencial (aislamiento RLS).
 *
 * Requiere DATABASE_URL (Postgres con migraciones aplicadas).
 *
 * Propósito:
 *   Verificar que las queries del router `indicadores` (dashboard) SOLO agregan
 *   datos del tenant con contexto activo, nunca de otro tenant.
 *
 *   El test simula el comportamiento de `ctx.db` del router: usa `forTenant`
 *   (el mismo cliente que usa el router) para cargar los datos, y comprueba
 *   que los conteos no se cruzan entre tenants A y B.
 *
 * Por qué está en `packages/db/test` y no en `apps/web/src`:
 *   - Los tests de integración RLS requieren Postgres y se ejecutan con
 *     DATABASE_URL definida. El package `@vetlla/db` tiene el setup de vitest
 *     que carga dotenv y el cliente Prisma. La suite `apps/web` no levanta BD.
 *   - Este test es análogo a `rls.test.ts` y `expediente-fase1.integration.test.ts`,
 *     que también verifican aislamiento RLS de tablas clínicas.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asPlatformAdmin,
  forTenant,
  prisma,
  AssessmentType,
  UPPOrigin,
  RestraintType,
} from '../src/index';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)(
  'indicadores de calidad — aislamiento RLS entre tenants',
  () => {
    const admin = asPlatformAdmin();
    const stamp = Date.now();

    let tenantAId = '';
    let tenantBId = '';

    // IDs de los datos creados para el tenant A
    let centerAId = '';
    let residentAId = '';

    beforeAll(async () => {
      // Crear dos tenants independientes
      const tenantA = await admin.tenant.create({
        data: { name: `Calidad A ${stamp}`, slug: `calidad-a-${stamp}` },
      });
      const tenantB = await admin.tenant.create({
        data: { name: `Calidad B ${stamp}`, slug: `calidad-b-${stamp}` },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      // -------------------------------------------------------------------
      // Tenant A: 1 centro + 1 residente + datos clínicos
      // -------------------------------------------------------------------
      const centerA = await admin.center.create({
        data: { tenantId: tenantAId, name: 'Centro Calidad A', type: 'RESIDENCIA' },
      });
      centerAId = centerA.id;

      const residentA = await admin.resident.create({
        data: {
          tenantId: tenantAId,
          centerId: centerAId,
          firstName: 'Ana',
          lastName: 'CalidadTest',
          status: 'ACTIVO',
          admissionDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        },
      });
      residentAId = residentA.id;

      // UPP en tenant A
      await admin.pressureUlcer.create({
        data: {
          tenantId: tenantAId,
          residentId: residentAId,
          location: 'Sacro',
          stage: 2,
          onsetDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          acquired: UPPOrigin.CENTRO,
          active: true,
        },
      });

      // Caída en tenant A
      await admin.fallRecord.create({
        data: {
          tenantId: tenantAId,
          residentId: residentAId,
          occurredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          injuries: null,
        },
      });

      // Valoración Norton en tenant A
      await admin.assessment.create({
        data: {
          tenantId: tenantAId,
          residentId: residentAId,
          type: AssessmentType.NORTON,
          score: 12, // alto riesgo
          assessedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      });

      // Sujeción en tenant A
      await admin.restraint.create({
        data: {
          tenantId: tenantAId,
          residentId: residentAId,
          type: RestraintType.BARANDILLAS,
          justification: 'Test de seguridad',
          prescribedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          active: true,
        },
      });

      // -------------------------------------------------------------------
      // Tenant B: 1 centro + 1 residente, SIN datos clínicos
      // (para verificar que el tenant B no ve los datos del tenant A)
      // -------------------------------------------------------------------
      const centerB = await admin.center.create({
        data: { tenantId: tenantBId, name: 'Centro Calidad B', type: 'RESIDENCIA' },
      });

      await admin.resident.create({
        data: {
          tenantId: tenantBId,
          centerId: centerB.id,
          firstName: 'Bernardo',
          lastName: 'CalidadTestB',
          status: 'ACTIVO',
          admissionDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      });
    });

    afterAll(async () => {
      // Limpieza en orden inverso a las FK (los cascade se encargan de los hijos)
      // Borramos por tenant para no interferir con otros tests en paralelo
      await admin.resident.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await admin.center.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await admin.tenant.deleteMany({
        where: { id: { in: [tenantAId, tenantBId] } },
      });
      await prisma.$disconnect();
    });

    // -----------------------------------------------------------------------
    // Test 1: Tenant A ve sus propios residentes y datos clínicos
    // -----------------------------------------------------------------------

    it('tenant A ve su propio residente activo', async () => {
      const dbA = forTenant({ tenantId: tenantAId });
      const residents = await dbA.resident.findMany({
        where: { status: { in: ['ACTIVO', 'BAJA'] } },
      });
      expect(residents.length).toBeGreaterThanOrEqual(1);
      expect(residents.every((r) => r.tenantId === tenantAId)).toBe(true);
    });

    it('tenant A ve sus UPPs', async () => {
      const dbA = forTenant({ tenantId: tenantAId });
      const upps = await dbA.pressureUlcer.findMany();
      expect(upps.length).toBeGreaterThanOrEqual(1);
      expect(upps.every((u) => u.tenantId === tenantAId)).toBe(true);
    });

    it('tenant A ve sus caídas', async () => {
      const dbA = forTenant({ tenantId: tenantAId });
      const falls = await dbA.fallRecord.findMany();
      expect(falls.length).toBeGreaterThanOrEqual(1);
      expect(falls.every((f) => f.tenantId === tenantAId)).toBe(true);
    });

    it('tenant A ve sus valoraciones Norton', async () => {
      const dbA = forTenant({ tenantId: tenantAId });
      const assessments = await dbA.assessment.findMany({
        where: { type: { in: [AssessmentType.NORTON, AssessmentType.BRADEN] } },
      });
      expect(assessments.length).toBeGreaterThanOrEqual(1);
      expect(assessments.every((a) => a.tenantId === tenantAId)).toBe(true);
    });

    it('tenant A ve sus sujeciones', async () => {
      const dbA = forTenant({ tenantId: tenantAId });
      const restraints = await dbA.restraint.findMany();
      expect(restraints.length).toBeGreaterThanOrEqual(1);
      expect(restraints.every((s) => s.tenantId === tenantAId)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // Test 2: Tenant B NO ve los datos del tenant A (aislamiento RLS real)
    // -----------------------------------------------------------------------

    it('tenant B no ve los residentes del tenant A', async () => {
      const dbB = forTenant({ tenantId: tenantBId });
      const residents = await dbB.resident.findMany();
      // Tenant B solo tiene su propio residente, no el de A
      expect(residents.every((r) => r.tenantId === tenantBId)).toBe(true);
      expect(residents.find((r) => r.tenantId === tenantAId)).toBeUndefined();
    });

    it('tenant B no ve las UPPs del tenant A', async () => {
      const dbB = forTenant({ tenantId: tenantBId });
      const upps = await dbB.pressureUlcer.findMany();
      // Tenant B no tiene UPPs propias ni puede ver las de A
      expect(upps).toHaveLength(0);
    });

    it('tenant B no ve las caídas del tenant A', async () => {
      const dbB = forTenant({ tenantId: tenantBId });
      const falls = await dbB.fallRecord.findMany();
      expect(falls).toHaveLength(0);
    });

    it('tenant B no ve las valoraciones Norton/Braden del tenant A', async () => {
      const dbB = forTenant({ tenantId: tenantBId });
      const assessments = await dbB.assessment.findMany({
        where: { type: { in: [AssessmentType.NORTON, AssessmentType.BRADEN] } },
      });
      expect(assessments).toHaveLength(0);
    });

    it('tenant B no ve las sujeciones del tenant A', async () => {
      const dbB = forTenant({ tenantId: tenantBId });
      const restraints = await dbB.restraint.findMany();
      expect(restraints).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // Test 3: Intentar forzar lectura cross-tenant (con WHERE explícito)
    //         RLS lo bloquea igualmente.
    // -----------------------------------------------------------------------

    it('tenant B no puede ver datos del tenant A aunque fuerce el where', async () => {
      const dbB = forTenant({ tenantId: tenantBId });
      const upps = await dbB.pressureUlcer.findMany({
        where: { tenantId: tenantAId }, // intento explícito de cross-tenant
      });
      // RLS filtra el resultado: devuelve vacío (no es un error, simplemente 0 filas)
      expect(upps).toHaveLength(0);
    });

    it('tenant B no puede ver residentes del tenant A forzando el where', async () => {
      const dbB = forTenant({ tenantId: tenantBId });
      const residents = await dbB.resident.findMany({
        where: { tenantId: tenantAId },
      });
      expect(residents).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // Test 4: Los conteos del dashboard no se cruzan entre tenants
    // -----------------------------------------------------------------------

    it('los datos de tenant A no inflyen en los conteos de tenant B', async () => {
      const dbA = forTenant({ tenantId: tenantAId });
      const dbB = forTenant({ tenantId: tenantBId });

      // Tenant A tiene UPPs, tenant B no
      const uppCountA = await dbA.pressureUlcer.count();
      const uppCountB = await dbB.pressureUlcer.count();

      expect(uppCountA).toBeGreaterThan(0);
      expect(uppCountB).toBe(0);
    });

    it('los residentes de tenant A no se suman a los de tenant B', async () => {
      const dbA = forTenant({ tenantId: tenantAId });
      const dbB = forTenant({ tenantId: tenantBId });

      const resCountA = await dbA.resident.count({ where: { status: { in: ['ACTIVO', 'BAJA'] } } });
      const resCountB = await dbB.resident.count({ where: { status: { in: ['ACTIVO', 'BAJA'] } } });

      // Ambos tienen residentes, pero cada uno solo ve los suyos
      expect(resCountA).toBeGreaterThanOrEqual(1);
      expect(resCountB).toBeGreaterThanOrEqual(1);
      // Total visto por B debe ser sus propios únicamente
      expect(resCountB).toBeLessThan(resCountA + resCountB); // no se suman los de A
    });
  },
);
