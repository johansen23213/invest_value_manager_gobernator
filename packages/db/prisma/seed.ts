import bcrypt from 'bcryptjs';
import {
  AllergySeverity,
  AssessmentType,
  CenterType,
  ContactRelation,
  DependencyGrade,
  ResidentStatus,
  Sex,
  asPlatformAdmin,
  prisma,
  UserRole,
} from '../src/index';

// Seed demo (§13): tenant + un usuario por rol, una residencia (~30 plazas) y una
// vivienda tutelada (8 plazas) con residentes ficticios y expediente de ejemplo.
// Usa el cliente con bypass de RLS (operación de plataforma).
const db = asPlatformAdmin();
const DEMO_PASSWORD = 'vetlla1234';

const FIRST_NAMES = [
  'Dolores', 'Antonio', 'Carmen', 'José', 'María', 'Francisco', 'Josefa', 'Manuel',
  'Pilar', 'Juan', 'Rosario', 'Pedro', 'Teresa', 'Ángel', 'Concepción', 'Rafael',
  'Encarnación', 'Miguel', 'Mercedes', 'Joaquín', 'Isabel', 'Andrés', 'Amparo', 'Vicente',
];
const LAST_NAMES = [
  'García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez',
  'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández', 'Díaz', 'Moreno', 'Muñoz',
  'Álvarez', 'Romero', 'Alonso', 'Gutiérrez', 'Navarro', 'Torres', 'Domínguez', 'Gil',
];
const GRADES = [
  DependencyGrade.SIN_VALORAR,
  DependencyGrade.GRADO_I,
  DependencyGrade.GRADO_II,
  DependencyGrade.GRADO_III,
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length] as T;
}

async function seedUsers(tenantId: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [
    { email: 'superadmin@vetlla.dev', name: 'Plataforma', role: UserRole.SUPERADMIN, tenantId: null },
    { email: 'direccion@demo.vetlla.dev', name: 'Dirección Demo', role: UserRole.DIRECTOR, tenantId },
    { email: 'sanitario@demo.vetlla.dev', name: 'Enfermería Demo', role: UserRole.SANITARIO, tenantId },
    { email: 'auxiliar@demo.vetlla.dev', name: 'Auxiliar Demo', role: UserRole.AUXILIAR, tenantId },
    { email: 'familiar@demo.vetlla.dev', name: 'Familiar Demo', role: UserRole.FAMILIAR, tenantId },
  ];
  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, tenantId: u.tenantId },
      create: { ...u, passwordHash },
    });
  }
  return users.length;
}

/** Crea un centro con sus unidades y plazas; devuelve los ids de plaza en orden. */
async function seedCenter(
  tenantId: string,
  name: string,
  type: CenterType,
  units: Array<{ name: string; floor?: string; bedPrefix: string; beds: number }>,
) {
  const center = await db.center.create({ data: { tenantId, name, type, city: 'Valencia' } });
  const bedIds: string[] = [];
  for (const u of units) {
    const unit = await db.unit.create({
      data: { tenantId, centerId: center.id, name: u.name, floor: u.floor ?? null },
    });
    for (let i = 1; i <= u.beds; i++) {
      const bed = await db.bed.create({
        data: { tenantId, unitId: unit.id, code: `${u.bedPrefix}-${String(i).padStart(2, '0')}` },
      });
      bedIds.push(bed.id);
    }
  }
  return { center, bedIds };
}

async function seedResidents(
  tenantId: string,
  centerId: string,
  bedIds: string[],
  count: number,
  startIdx: number,
) {
  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    const bedId = bedIds[i] ?? null;
    const resident = await db.resident.create({
      data: {
        tenantId,
        centerId,
        bedId,
        firstName: pick(FIRST_NAMES, idx),
        lastName: `${pick(LAST_NAMES, idx)} ${pick(LAST_NAMES, idx + 7)}`,
        sex: idx % 2 === 0 ? Sex.MUJER : Sex.HOMBRE,
        dependencyGrade: pick(GRADES, idx),
        status: ResidentStatus.ACTIVO,
        birthDate: new Date(1935 + (idx % 15), idx % 12, (idx % 27) + 1),
        admissionDate: new Date(2023, idx % 12, (idx % 27) + 1),
      },
    });

    // Expediente de ejemplo en una parte de los residentes.
    if (idx % 2 === 0) {
      await db.assessment.create({
        data: {
          tenantId,
          residentId: resident.id,
          type: AssessmentType.BARTHEL,
          score: [20, 40, 60, 85][idx % 4] ?? 60,
          assessedAt: new Date(2024, idx % 12, 10),
        },
      });
    }
    if (idx % 3 === 0) {
      await db.assessment.create({
        data: {
          tenantId,
          residentId: resident.id,
          type: AssessmentType.TINETTI,
          score: [12, 19, 24][idx % 3] ?? 19,
          assessedAt: new Date(2024, idx % 12, 12),
        },
      });
    }
    if (idx % 4 === 0) {
      await db.allergy.create({
        data: { tenantId, residentId: resident.id, substance: 'Penicilina', severity: AllergySeverity.GRAVE },
      });
    }
    if (idx % 3 === 1) {
      await db.diagnosis.create({
        data: { tenantId, residentId: resident.id, code: 'F03', description: 'Demencia no especificada' },
      });
    }
    await db.emergencyContact.create({
      data: {
        tenantId,
        residentId: resident.id,
        name: `${pick(FIRST_NAMES, idx + 3)} ${pick(LAST_NAMES, idx)}`,
        relation: ContactRelation.HIJO_A,
        phone: `6${String(10000000 + idx * 137).slice(0, 8)}`,
        isPrimary: true,
      },
    });
  }
}

async function main() {
  const tenant = await db.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Residencias Demo S.L.', slug: 'demo' },
  });

  const userCount = await seedUsers(tenant.id);

  // Reinicia la estructura/residentes demo para que el seed sea idempotente.
  await db.resident.deleteMany({ where: { tenantId: tenant.id } });
  await db.center.deleteMany({ where: { tenantId: tenant.id } });

  const residencia = await seedCenter(tenant.id, 'Residencia Los Olivos', CenterType.RESIDENCIA, [
    { name: 'Planta 1', floor: '1', bedPrefix: '1', beds: 10 },
    { name: 'Planta 2', floor: '2', bedPrefix: '2', beds: 10 },
    { name: 'Planta 3', floor: '3', bedPrefix: '3', beds: 10 },
  ]);
  const vivienda = await seedCenter(
    tenant.id,
    'Vivienda Tutelada El Roble',
    CenterType.VIVIENDA_TUTELADA,
    [{ name: 'Vivienda', bedPrefix: 'R', beds: 8 }],
  );

  await seedResidents(tenant.id, residencia.center.id, residencia.bedIds, 22, 0);
  await seedResidents(tenant.id, vivienda.center.id, vivienda.bedIds, 6, 22);

  console.log(`Seed OK.`);
  console.log(`  Tenant: ${tenant.name}`);
  console.log(`  Usuarios: ${userCount} (password demo: ${DEMO_PASSWORD})`);
  console.log(`  Centros: Residencia Los Olivos (30 plazas) + Vivienda Tutelada El Roble (8 plazas)`);
  console.log(`  Residentes: 28 con expediente de ejemplo`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
