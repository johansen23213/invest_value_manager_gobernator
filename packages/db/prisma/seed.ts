import bcrypt from 'bcryptjs';
import {
  AllergySeverity,
  AllergyType,
  AnnouncementAudience,
  AnnouncementCategory,
  AssessmentType,
  AssignmentStatus,
  CenterType,
  ConsentType,
  ContactRelation,
  DependencyGrade,
  DeviceType,
  DietType,
  DischargeType,
  LiquidTexture,
  MealType,
  MedicalNoteType,
  MessageThreadCategory,
  MedicationRoute,
  MedicationType,
  NursingNoteCategory,
  NursingNoteShift,
  PlaceRegime,
  Prisma,
  RestraintType,
  ResidentStatus,
  ServiceRequestCategory,
  ServiceRequestPriority,
  ServiceRequestStatus,
  Sex,
  UPPOrigin,
  VisitStatus,
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
  // R-01: jobTitle coherente por usuario demo para que la pantalla de equipo se vea poblada.
  const users = [
    { email: 'superadmin@vetlla.dev',   name: 'Plataforma',      role: UserRole.SUPERADMIN, tenantId: null,    jobTitle: null },
    { email: 'direccion@demo.vetlla.dev', name: 'Dirección Demo', role: UserRole.DIRECTOR,   tenantId,          jobTitle: 'Director/a' },
    { email: 'sanitario@demo.vetlla.dev', name: 'Enfermería Demo',role: UserRole.SANITARIO,  tenantId,          jobTitle: 'Enfermero/a (DUE)' },
    { email: 'auxiliar@demo.vetlla.dev',  name: 'Auxiliar Demo',  role: UserRole.AUXILIAR,   tenantId,          jobTitle: 'Auxiliar de atención directa' },
    { email: 'familiar@demo.vetlla.dev',  name: 'Familiar Demo',  role: UserRole.FAMILIAR,   tenantId,          jobTitle: null },
  ];
  for (const u of users) {
    await db.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, tenantId: u.tenantId, jobTitle: u.jobTitle },
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

    // Medicación (parte de los residentes). Pauta con dosis de mañana para que
    // se generen alertas de no-administrado durante el día.
    // Sprint M: se usan los nuevos enums route, type y daysOfWeek.
    if (idx % 2 === 0) {
      const medNames = ['Paracetamol', 'Omeprazol', 'Enalapril', 'Metformina'];
      const medDoses = ['1g', '20mg', '10mg', '850mg'];
      const medRoutes: MedicationRoute[] = [
        MedicationRoute.ORAL,
        MedicationRoute.ORAL,
        MedicationRoute.ORAL,
        MedicationRoute.ORAL,
      ];
      const medUnits = ['comprimido', 'comprimido', 'comprimido', 'comprimido'];
      // Mayoría crónicas; índice 2 (Enalapril) → aguda con fin; índice 3 → PRN
      const medTypes: MedicationType[] = [
        MedicationType.CRONICO,
        MedicationType.CRONICO,
        MedicationType.AGUDO,
        MedicationType.PRN,
      ];
      const medDaysOfWeek: (number[] | null)[] = [
        null,         // todos los días
        null,         // todos los días
        [1, 3, 5],    // lunes, miércoles, viernes
        null,         // PRN — sin pauta fija de días
      ];
      const medEndDate: (Date | null)[] = [
        null,
        null,
        new Date(2026, 11, 31), // fin de año
        null,
      ];
      // idx siempre es par aquí (idx % 2 === 0), así que idx/2 da secuencia 0,1,2,3,4…
      // para que los 4 tipos (CRONICO, CRONICO, AGUDO, PRN) roten correctamente.
      const typeIdx = Math.floor(idx / 2) % 4;
      // PRN no lleva horas fijas en el MAR; times vacío se admite para PRN
      const times = medTypes[typeIdx] === MedicationType.PRN ? [] : ['08:00', '20:00'];
      await db.medication.create({
        data: {
          tenantId,
          residentId: resident.id,
          name: pick(medNames, idx),
          dose: pick(medDoses, idx),
          route: medRoutes[typeIdx],
          unit: medUnits[typeIdx],
          times,
          type: medTypes[typeIdx],
          // Prisma Json? nullable: null de JS no es InputJsonValue; usar DbNull o undefined.
          // undefined omite el campo y deja el default de la columna (NULL en BD).
          daysOfWeek: medDaysOfWeek[typeIdx] !== null
            ? (medDaysOfWeek[typeIdx] as Prisma.InputJsonValue)
            : Prisma.DbNull,
          startDate: new Date(2024, 0, 1),
          endDate: medEndDate[typeIdx],
        },
      });
    }

    // PIA con objetivos y una revisión, en algunos residentes.
    if (idx % 4 === 0) {
      const plan = await db.carePlan.create({
        data: { tenantId, residentId: resident.id, title: 'Plan de atención 2026' },
      });
      await db.carePlanGoal.create({
        data: { tenantId, carePlanId: plan.id, description: 'Mantener la deambulación autónoma' },
      });
      await db.carePlanGoal.create({
        data: { tenantId, carePlanId: plan.id, description: 'Mejorar la hidratación diaria' },
      });
      await db.carePlanReview.create({
        data: { tenantId, carePlanId: plan.id, summary: 'Evolución estable. Continuar pauta.' },
      });
    }

    // --- Fase 1: expediente ampliado en los 4 primeros residentes del lote ---

    // Residente 0: disfagia con textura néctar + sonda nasogástrica + Norton en riesgo
    if (idx === startIdx) {
      await db.resident.update({
        where: { id: resident.id },
        data: {
          cip: `CAT${String(10000000 + idx).slice(0, 9)}`,
          internalRecordNo: `EXP-2026-${String(idx + 1).padStart(3, '0')}`,
          placeRegime: PlaceRegime.CONCERTADA,
          judicialCapacity: false,
          legalRepName: 'Ana García (hija)',
          legalRepPhone: '600100200',
          advanceDirectives: true,
          advanceDirLocation: 'Notaría Martínez, c/ Mayor 1, Valencia',
          preferredLanguage: 'ca',
          bloodGroup: 'A+',
          consentImage: true,
          consentAdmission: new Date('2023-01-15'),
          dietType: DietType.TRITURADA,
          liquidTexture: LiquidTexture.NECTAR,
          nutritionSupplements: 'Fortimel Energy 200ml × 2/día',
          continenceType: 'pañal',
          absorbentSize: 'M',
          wanderingRisk: false,
          fallRisk: true,
        },
      });
      // Dispositivo: sonda nasogástrica
      await db.residentDevice.create({
        data: {
          tenantId,
          residentId: resident.id,
          type: DeviceType.SONDA_NASOGASTRICA,
          description: 'Sonda Levin 16F — nutrición enteral nocturna',
          since: new Date('2025-11-01'),
          active: true,
        },
      });
      // Vacuna gripe
      await db.vaccine.create({
        data: { tenantId, residentId: resident.id, type: 'gripe', date: new Date('2025-10-15'), lot: 'FLU-2025-A' },
      });
      // Vacuna COVID
      await db.vaccine.create({
        data: { tenantId, residentId: resident.id, type: 'COVID', date: new Date('2025-09-01'), lot: 'COV-2025-B' },
      });
      // Peso
      await db.weightRecord.create({
        data: { tenantId, residentId: resident.id, weightKg: 54.2, heightCm: 158, bmi: 21.7, recordedAt: new Date('2026-01-10') },
      });
      await db.weightRecord.create({
        data: { tenantId, residentId: resident.id, weightKg: 52.8, recordedAt: new Date('2026-02-10') },
      });
      // Norton en riesgo alto (score 12)
      await db.assessment.create({
        data: { tenantId, residentId: resident.id, type: AssessmentType.NORTON, score: 12, assessedAt: new Date('2026-01-10'), notes: 'Riesgo alto: inmovilidad parcial + disfagia' },
      });
      // UPP activa con cura
      const ulcer = await db.pressureUlcer.create({
        data: { tenantId, residentId: resident.id, location: 'Sacro', stage: 2, onsetDate: new Date('2026-01-08'), acquired: UPPOrigin.CENTRO, active: true },
      });
      await db.uPPCuring.create({
        data: { tenantId, pressureUlcerId: ulcer.id, date: new Date('2026-01-09'), treatment: 'Apósito hidrocoloide Mepillex 10×10 cm', evolution: 'igual' },
      });
      await db.uPPCuring.create({
        data: { tenantId, pressureUlcerId: ulcer.id, date: new Date('2026-01-12'), treatment: 'Renovación apósito + desbridamiento mecánico', evolution: 'mejor' },
      });
      // Historia de vida
      await db.lifeStory.upsert({
        where: { residentId: resident.id },
        update: {},
        create: {
          tenantId,
          residentId: resident.id,
          profession: 'Maestra de escuela primaria',
          hobbies: 'Lectura, punto de cruz, huerta',
          music: 'Zarzuela, Joselito, Marifé de Triana',
          religion: 'Católica — misa dominical, rosario por las noches',
          preferences: 'Ducha mañanas, pelo corto, no le gustan las comidas muy frías',
          notes: 'Familia muy implicada. Hija Ana visita cada día a mediodía.',
        },
      });
      // Consentimientos
      await db.consentRecord.create({
        data: { tenantId, residentId: resident.id, type: ConsentType.INGRESO, granted: true, grantedBy: 'Ana García (representante legal)', date: new Date('2023-01-15') },
      });
      await db.consentRecord.create({
        data: { tenantId, residentId: resident.id, type: ConsentType.IMAGEN, granted: true, grantedBy: 'Ana García', date: new Date('2023-01-15') },
      });
    }

    // Residente 1: sujeción activa con consentimiento firmado + escala Pfeiffer
    if (idx === startIdx + 1) {
      await db.resident.update({
        where: { id: resident.id },
        data: {
          cip: `CAT${String(20000000 + idx).slice(0, 9)}`,
          internalRecordNo: `EXP-2026-${String(idx + 1).padStart(3, '0')}`,
          placeRegime: PlaceRegime.PRIVADA,
          preferredLanguage: 'es',
          bloodGroup: 'O-',
          dietType: DietType.BLANDA,
          liquidTexture: LiquidTexture.MIEL,
          wanderingRisk: true,
          fallRisk: true,
        },
      });
      // Escala Pfeiffer con deterioro moderado
      await db.assessment.create({
        data: { tenantId, residentId: resident.id, type: AssessmentType.PFEIFFER, score: 6, assessedAt: new Date('2026-01-15'), notes: 'Deterioro cognitivo moderado (demencia tipo Alzheimer)' },
      });
      // Escala GDS-Reisberg
      await db.assessment.create({
        data: { tenantId, residentId: resident.id, type: AssessmentType.GDS_REISBERG, score: 4, assessedAt: new Date('2026-01-15') },
      });
      // Dispositivo: marcapasos
      await db.residentDevice.create({
        data: { tenantId, residentId: resident.id, type: DeviceType.MARCAPASOS, description: 'Marcapasos Medtronic VVIR — revisión cardiología junio 2026', since: new Date('2020-03-10'), active: true },
      });
      // Sujeción activa con consentimiento
      await db.restraint.create({
        data: {
          tenantId,
          residentId: resident.id,
          type: RestraintType.BARANDILLAS,
          justification: 'Deambulación nocturna sin control con riesgo de caída grave. Demencia moderada-grave (GDS-4). Fractura de cadera previa en 2024.',
          prescribedAt: new Date('2026-01-16'),
          consentObtained: true,
          consentDate: new Date('2026-01-16'),
          consentBy: 'Miguel López (hijo — representante legal)',
          reviewedAt: new Date('2026-02-01'),
          active: true,
        },
      });
      // Consentimiento de sujeción
      await db.consentRecord.create({
        data: { tenantId, residentId: resident.id, type: ConsentType.INGRESO, granted: true, grantedBy: 'Miguel López', date: new Date('2024-06-01') },
      });
      // Caída previa
      await db.fallRecord.create({
        data: { tenantId, residentId: resident.id, occurredAt: new Date('2025-12-20T03:15:00'), location: 'Habitación 205', circumstances: 'Deambulación nocturna sin supervisión', injuries: 'Contusión en cadera derecha sin fractura', witnessed: false, measures: 'Valoración médica inmediata. Radiografía. Inicio protocolo de caídas.' },
      });
      // Peso + MNA
      await db.weightRecord.create({
        data: { tenantId, residentId: resident.id, weightKg: 67, heightCm: 168, bmi: 23.7, recordedAt: new Date('2026-01-20') },
      });
      await db.assessment.create({
        data: { tenantId, residentId: resident.id, type: AssessmentType.MNA, score: 19, assessedAt: new Date('2026-01-20'), notes: 'Riesgo de desnutrición — seguimiento mensual' },
      });
      // Historia de vida
      await db.lifeStory.upsert({
        where: { residentId: resident.id },
        update: {},
        create: {
          tenantId,
          residentId: resident.id,
          profession: 'Agricultor. Viticultori en la comarca de Requena.',
          hobbies: 'Dominó, fútbol (valencianista), televisión',
          music: 'Copla española, pasodobles',
          importantPeople: 'Esposa fallecida 2019. Hijo Miguel vive en Valencia.',
          religion: 'Católico poco practicante',
          preferences: 'Ducha por las tardes. No le gusta que le corten el bigote.',
        },
      });
    }

    // Residente 2: alergia alimentaria + Braden en riesgo + escala DOWNTON
    if (idx === startIdx + 2) {
      await db.resident.update({
        where: { id: resident.id },
        data: {
          cip: `CAT${String(30000000 + idx).slice(0, 9)}`,
          internalRecordNo: `EXP-2026-${String(idx + 1).padStart(3, '0')}`,
          placeRegime: PlaceRegime.CONCERTADA,
          preferredLanguage: 'es',
          dietType: DietType.DIABETICA,
          nutritionSupplements: null,
          fallRisk: true,
        },
      });
      // Alergia alimentaria
      await db.allergy.create({
        data: { tenantId, residentId: resident.id, substance: 'Gluten (celiaquía)', allergyType: AllergyType.ALIMENTARIA, severity: AllergySeverity.GRAVE, reaction: 'Síntomas gastrointestinales graves' },
      });
      // Braden en riesgo (score 15 → riesgo moderado)
      await db.assessment.create({
        data: { tenantId, residentId: resident.id, type: AssessmentType.BRADEN, score: 15, assessedAt: new Date('2026-01-12'), notes: 'Riesgo moderado UPP — inmovilidad parcial + humedad' },
      });
      // Downton
      await db.assessment.create({
        data: { tenantId, residentId: resident.id, type: AssessmentType.DOWNTON, score: 4, assessedAt: new Date('2026-01-12'), notes: 'Riesgo alto caídas: fármacos + deficit visual + historia de caídas' },
      });
      // Dispositivo: oxígeno domiciliario
      await db.residentDevice.create({
        data: { tenantId, residentId: resident.id, type: DeviceType.OXIGENO_DOMICILIARIO, description: 'Concentrador O2 2 l/min en reposo, 3 l/min en esfuerzo', since: new Date('2024-08-01'), active: true },
      });
      // Vacunas
      await db.vaccine.create({
        data: { tenantId, residentId: resident.id, type: 'neumococo', date: new Date('2024-09-15'), lot: 'PNV-2024-C' },
      });
      await db.vaccine.create({
        data: { tenantId, residentId: resident.id, type: 'gripe', date: new Date('2025-10-20') },
      });
      // Peso
      await db.weightRecord.create({
        data: { tenantId, residentId: resident.id, weightKg: 78.5, heightCm: 165, bmi: 28.8, recordedAt: new Date('2026-01-05') },
      });
      // Historia de vida
      await db.lifeStory.upsert({
        where: { residentId: resident.id },
        update: {},
        create: {
          tenantId,
          residentId: resident.id,
          profession: 'Funcionaria de correos (30 años)',
          hobbies: 'Bordado, series de televisión, paseos por el parque',
          music: 'Peret, Raffaella Carrà, Rocío Jurado',
          importantPeople: 'Hijas Marta y Eva. Nietos. Amiga Paquita (también residente en planta 2).',
          preferences: 'Siempre con el pelo recogido. Desayuno temprano (7h). No le gusta el café.',
        },
      });
    }

    // Residente 3: historia de vida completa + escala Lawton-Brody (centro de día)
    if (idx === startIdx + 3) {
      await db.resident.update({
        where: { id: resident.id },
        data: {
          cip: `CAT${String(40000000 + idx).slice(0, 9)}`,
          internalRecordNo: `EXP-2026-${String(idx + 1).padStart(3, '0')}`,
          placeRegime: PlaceRegime.PRIVADA,
          preferredLanguage: 'ca',
          bloodGroup: 'B+',
          dietType: DietType.NORMAL,
        },
      });
      // Lawton-Brody (AIVD)
      await db.assessment.create({
        data: { tenantId, residentId: resident.id, type: AssessmentType.LAWTON_BRODY, score: 5, assessedAt: new Date('2026-01-08'), notes: 'Independencia parcial — necesita supervisión para gestión económica y medicación' },
      });
      // MEC-Lobo (estado cognitivo)
      await db.assessment.create({
        data: { tenantId, residentId: resident.id, type: AssessmentType.MEC_LOBO, score: 26, assessedAt: new Date('2026-01-08'), notes: 'Sin deterioro cognitivo significativo' },
      });
      // Peso
      await db.weightRecord.create({
        data: { tenantId, residentId: resident.id, weightKg: 71, heightCm: 172, bmi: 24.0, recordedAt: new Date('2026-01-15') },
      });
      // Historia de vida
      await db.lifeStory.upsert({
        where: { residentId: resident.id },
        update: {},
        create: {
          tenantId,
          residentId: resident.id,
          profession: 'Ingeniero industrial. Director de fábrica de cerámica.',
          hobbies: 'Ajedrez, lectura de prensa (El País), bricolaje, pesca',
          music: 'Música clásica (Beethoven, Falla), jazz',
          importantPeople: 'Esposa Carmen. Tres hijos. Nietos. Amigos del club de ajedrez.',
          religion: 'Agnóstico',
          preferences: 'Ducha a las 8h. Café solo sin azúcar. Lee el periódico cada mañana. Muy independiente, no le gusta que le ayuden si puede hacerlo solo.',
          notes: 'Habla catalán en casa. Muy activo mentalmente. Buen candidato para actividades de estimulación cognitiva.',
        },
      });
      // Consentimiento portal familias
      await db.consentRecord.create({
        data: { tenantId, residentId: resident.id, type: ConsentType.PORTAL_FAMILIAS, granted: true, grantedBy: 'El propio residente', date: new Date('2026-01-10') },
      });
    }
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

  // Vincula el usuario familiar demo a un residente (portal de familias).
  const familiar = await db.user.findUnique({ where: { email: 'familiar@demo.vetlla.dev' } });
  const firstResident = await db.resident.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { lastName: 'asc' },
  });
  if (familiar && firstResident) {
    await db.familyLink.upsert({
      where: { userId_residentId: { userId: familiar.id, residentId: firstResident.id } },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: familiar.id,
        residentId: firstResident.id,
        relationship: 'Hijo/a',
      },
    });

    // Demo solicitudes para que el portal de familias tenga contenido
    // (borramos primero para que el seed sea idempotente)
    await db.serviceRequest.deleteMany({ where: { createdById: familiar.id } });

    // Director demo para responder solicitudes
    const director = await db.user.findUnique({ where: { email: 'direccion@demo.vetlla.dev' } });

    // 1) Solicitud RECIBIDA (nueva, sin respuesta)
    await db.serviceRequest.create({
      data: {
        tenantId:    tenant.id,
        residentId:  firstResident.id,
        createdById: familiar.id,
        category:    ServiceRequestCategory.MANTENIMIENTO,
        priority:    ServiceRequestPriority.NORMAL,
        status:      ServiceRequestStatus.RECIBIDA,
        title:       'Grifo del lavabo con pequeña fuga',
        description: 'El grifo del lavabo de la habitación tiene una pequeña fuga desde ayer. No es urgente pero me gustaría que lo revisaran cuando puedan.',
        slaDueAt:    new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
    });

    // 2) Solicitud EN_CURSO con comentario público y respuesta del staff
    const req2 = await db.serviceRequest.create({
      data: {
        tenantId:       tenant.id,
        residentId:     firstResident.id,
        createdById:    familiar.id,
        category:       ServiceRequestCategory.ALIMENTACION,
        priority:       ServiceRequestPriority.ALTA,
        status:         ServiceRequestStatus.EN_CURSO,
        title:          'Revisión de la dieta — preferencias nuevas',
        description:    'Mi madre me ha comentado que le cuesta tragar los alimentos desde hace unos días. Me gustaría que la dietista la valorara.',
        slaDueAt:       new Date(Date.now() + 24 * 60 * 60 * 1000),
        firstResponseAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        assignedToId:   director?.id ?? null,
      },
    });
    if (director) {
      await db.serviceRequestComment.create({
        data: {
          tenantId:  tenant.id,
          requestId: req2.id,
          authorId:  director.id,
          body:      'Hola. Hemos trasladado su preocupación a la enfermería. La dietista la valorará esta tarde y le enviaremos una actualización. Gracias por avisarnos.',
          internal:  false,
        },
      });
    }

    // 3) Solicitud RESUELTA con CSAT (4/5)
    const req3 = await db.serviceRequest.create({
      data: {
        tenantId:         tenant.id,
        residentId:       firstResident.id,
        createdById:      familiar.id,
        category:         ServiceRequestCategory.DOCUMENTACION,
        priority:         ServiceRequestPriority.NORMAL,
        status:           ServiceRequestStatus.RESUELTA,
        title:            'Copia del contrato de ingreso',
        description:      'Necesito una copia del contrato de ingreso para el trámite de dependencia de la Seguridad Social.',
        slaDueAt:         new Date(Date.now() - 10 * 60 * 60 * 1000), // ya pasó el SLA
        firstResponseAt:  new Date(Date.now() - 48 * 60 * 60 * 1000),
        resolvedAt:       new Date(Date.now() - 12 * 60 * 60 * 1000),
        satisfactionScore: 4,
        assignedToId:     director?.id ?? null,
      },
    });
    if (director) {
      await db.serviceRequestComment.create({
        data: {
          tenantId:  tenant.id,
          requestId: req3.id,
          authorId:  director.id,
          body:      'Le hemos enviado la copia del contrato al email que tiene registrado. Si necesita algo más, no dude en escribirnos.',
          internal:  false,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Seed de comunicaciones (COM-001..COM-011)
  // ---------------------------------------------------------------------------

  const director = await db.user.findUnique({ where: { email: 'direccion@demo.vetlla.dev' } });

  if (director && familiar && firstResident) {
    // Limpiar comunicados y hilos previos para idempotencia
    await db.announcement.deleteMany({ where: { tenantId: tenant.id } });
    await db.messageThread.deleteMany({ where: { tenantId: tenant.id } });

    // Obtener la primera unidad del tenant para el comunicado POR_UNIDAD
    const firstUnit = await db.unit.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
    });

    // 1) Comunicado TODO_EL_CENTRO con acuse de recibo obligatorio
    await db.announcement.create({
      data: {
        tenantId:    tenant.id,
        authorId:    director.id,
        title:       'Bienvenidos al portal de familias de Vetlla',
        body:        [
          'Estimadas familias,',
          '',
          'Con mucho gusto os comunicamos que desde hoy podéis gestionar vuestras solicitudes, ',
          'leer comunicados del centro y mantener conversaciones con nuestro equipo desde este portal.',
          '',
          'Por favor, confirmad la recepción de este mensaje pulsando el botón de acuse de recibo.',
          '',
          'El equipo de Residencias Demo.',
        ].join('\n'),
        category:    AnnouncementCategory.GENERAL,
        audience:    AnnouncementAudience.TODO_EL_CENTRO,
        requiresAck: true,
      },
    });

    // 2) Comunicado POR_UNIDAD (Planta 1) sin acuse
    if (firstUnit) {
      await db.announcement.create({
        data: {
          tenantId:    tenant.id,
          authorId:    director.id,
          title:       `Cambio de horario de visitas — ${firstUnit.name}`,
          body:        [
            `Estimadas familias de la ${firstUnit.name},`,
            '',
            'Os informamos de que a partir del próximo lunes el horario de visitas ',
            'pasará a ser de 10:00 a 13:00 y de 16:00 a 19:00.',
            '',
            'Disculpad las molestias.',
            'Administración.',
          ].join('\n'),
          category:    AnnouncementCategory.VISITAS,
          audience:    AnnouncementAudience.POR_UNIDAD,
          unitId:      firstUnit.id,
          requiresAck: false,
        },
      });
    }

    // 3) Hilo de mensajería con 2-3 mensajes entre familiar y centro
    const thread = await db.messageThread.create({
      data: {
        tenantId:     tenant.id,
        residentId:   firstResident.id,
        subject:      'Consulta sobre medicación de la semana',
        category:     MessageThreadCategory.BIENESTAR,
        createdById:  familiar.id,
        lastMessageAt: new Date(),
      },
    });

    // Mensaje inicial del familiar
    await db.message.create({
      data: {
        tenantId:  tenant.id,
        threadId:  thread.id,
        authorId:  familiar.id,
        body:      'Buenos días. Quería saber si se ha revisado la pauta de medicación de mi madre esta semana. Gracias.',
        readByFamilyAt: new Date(),
      },
    });

    // Respuesta del staff
    await db.message.create({
      data: {
        tenantId:      tenant.id,
        threadId:      thread.id,
        authorId:      director.id,
        body:          'Buenos días. Sí, la enfermería revisó la pauta ayer. Todo está correcto. Si tiene alguna duda específica, no dude en escribirnos.',
        readByStaffAt: new Date(),
      },
    });

    // Segunda respuesta del familiar
    await db.message.create({
      data: {
        tenantId:       tenant.id,
        threadId:       thread.id,
        authorId:       familiar.id,
        body:           'Muchas gracias por la respuesta tan rápida. Hasta pronto.',
        readByFamilyAt: new Date(),
      },
    });

    // Actualizar lastMessageAt del hilo
    await db.messageThread.update({
      where: { id: thread.id },
      data:  { lastMessageAt: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // Seed de visitas (VIS-001..VIS-010)
  // ---------------------------------------------------------------------------

  // Limpiar datos previos para idempotencia
  await db.visit.deleteMany({ where: { tenantId: tenant.id } });
  await db.visitSlotConfig.deleteMany({ where: { tenantId: tenant.id } });

  // Obtener la residencia (primer centro del tenant)
  const residenciaCenter = await db.center.findFirst({
    where:   { tenantId: tenant.id, name: 'Residencia Los Olivos' },
    select:  { id: true },
  });

  if (residenciaCenter && familiar && firstResident) {
    const centerId = residenciaCenter.id;

    // 1) Franja sábado 11:00-12:00, capacity 3, autoApprove true (VIS-003)
    await db.visitSlotConfig.create({
      data: {
        tenantId:    tenant.id,
        centerId,
        dayOfWeek:   6, // sábado
        startTime:   '11:00',
        endTime:     '12:00',
        capacity:    3,
        autoApprove: true,
        active:      true,
      },
    });

    // 2) Franja domingo 11:00-12:00, capacity 3, autoApprove true
    await db.visitSlotConfig.create({
      data: {
        tenantId:    tenant.id,
        centerId,
        dayOfWeek:   0, // domingo
        startTime:   '11:00',
        endTime:     '12:00',
        capacity:    3,
        autoApprove: true,
        active:      true,
      },
    });

    // 3) Franja sábado 17:00-18:00, capacity 3, autoApprove true
    await db.visitSlotConfig.create({
      data: {
        tenantId:    tenant.id,
        centerId,
        dayOfWeek:   6, // sábado
        startTime:   '17:00',
        endTime:     '18:00',
        capacity:    3,
        autoApprove: true,
        active:      true,
      },
    });

    // 4) Franja domingo 17:00-18:00, capacity 2, autoApprove FALSE (aprobación manual)
    await db.visitSlotConfig.create({
      data: {
        tenantId:    tenant.id,
        centerId,
        dayOfWeek:   0, // domingo
        startTime:   '17:00',
        endTime:     '18:00',
        capacity:    2,
        autoApprove: false,
        active:      true,
      },
    });

    // Próximo sábado (o siguiente): buscar la fecha del próximo sábado a partir de hoy
    const now = new Date();
    const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7; // al menos 7 días si hoy es sábado
    const nextSat = new Date(now);
    nextSat.setDate(now.getDate() + daysUntilSat);

    // 5) Visita CONFIRMADA futura (con QR visible para demo)
    // qrCode de ejemplo legible para que la pantalla del portal tenga contenido
    const demoQrCode = 'DEMOQR01';
    const confirmedVisitDate = new Date(nextSat);
    confirmedVisitDate.setUTCHours(11, 0, 0, 0);

    await db.visit.create({
      data: {
        tenantId:       tenant.id,
        residentId:     firstResident.id,
        requestedById:  familiar.id,
        scheduledAt:    confirmedVisitDate,
        durationMin:    60,
        visitorNames:   ['Ana García', 'Pedro García'],
        status:         VisitStatus.CONFIRMADA,
        qrCode:         demoQrCode,
        notes:          'Visita de fin de semana con los hijos.',
      },
    });

    // 6) Visita COMPLETADA en el pasado (para el historial del portal)
    const pastSat = new Date(now);
    pastSat.setDate(now.getDate() - 7); // sábado pasado
    const pastVisitDate = new Date(pastSat);
    pastVisitDate.setUTCHours(11, 0, 0, 0);
    const pastCheckIn = new Date(pastVisitDate.getTime() + 2 * 60 * 1000); // +2 min
    const pastCheckOut = new Date(pastVisitDate.getTime() + 62 * 60 * 1000); // +62 min

    await db.visit.create({
      data: {
        tenantId:       tenant.id,
        residentId:     firstResident.id,
        requestedById:  familiar.id,
        scheduledAt:    pastVisitDate,
        durationMin:    60,
        visitorNames:   ['Ana García'],
        status:         VisitStatus.COMPLETADA,
        qrCode:         'OLDQR001',
        checkInAt:      pastCheckIn,
        checkOutAt:     pastCheckOut,
        notes:          'Visita sin incidencias.',
      },
    });

    console.log(`  Visitas: 4 franjas configuradas + 1 visita confirmada futura (QR: ${demoQrCode}) + 1 visita completada pasada`);
  }

  // ---------------------------------------------------------------------------
  // Seed de documentación clínica (Épica A)
  // Notas de enfermería + evolutivos médicos del residente demo
  // ---------------------------------------------------------------------------

  // Limpieza idempotente
  await db.nursingNote.deleteMany({ where: { tenantId: tenant.id } });
  await db.medicalNote.deleteMany({ where: { tenantId: tenant.id } });

  const sanitario = await db.user.findUnique({ where: { email: 'sanitario@demo.vetlla.dev' } });
  const auxiliar  = await db.user.findUnique({ where: { email: 'auxiliar@demo.vetlla.dev' } });
  const directorSeed = await db.user.findUnique({ where: { email: 'direccion@demo.vetlla.dev' } });

  // Primer residente del tenant (por nombre)
  const seedResident = await db.resident.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { lastName: 'asc' },
  });

  if (seedResident && auxiliar && sanitario && directorSeed) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // 1) Nota de enfermería turno MANANA — GENERAL
    await db.nursingNote.create({
      data: {
        tenantId:   tenant.id,
        residentId: seedResident.id,
        authorId:   auxiliar.id,
        shift:      NursingNoteShift.MANANA,
        noteDate:   today,
        category:   NursingNoteCategory.GENERAL,
        body:       'Residente tranquila. Ha desayunado bien (zumo, tostada y café con leche). Ha realizado higiene completa sin incidencias. Buena orientación temporal. Humor estable.',
      },
    });

    // 2) Nota de enfermería turno TARDE — DOLOR (del día anterior)
    await db.nursingNote.create({
      data: {
        tenantId:   tenant.id,
        residentId: seedResident.id,
        authorId:   sanitario.id,
        shift:      NursingNoteShift.TARDE,
        noteDate:   yesterday,
        category:   NursingNoteCategory.DOLOR,
        body:       'Residente refiere dolor en rodilla izquierda EVA 4/10. Se administra Paracetamol 1g según pauta. Reevaluación en 60 minutos: dolor reducido a EVA 2/10. Queda en reposo relativo. Se comunica a la enfermera de guardia.',
      },
    });

    // 3) Nota de enfermería turno NOCHE — SUENO (del día anterior)
    await db.nursingNote.create({
      data: {
        tenantId:   tenant.id,
        residentId: seedResident.id,
        authorId:   auxiliar.id,
        shift:      NursingNoteShift.NOCHE,
        noteDate:   yesterday,
        category:   NursingNoteCategory.SUENO,
        body:       'Sueño discontinuo. Se levanta dos veces durante la noche (02:15 y 04:40) para ir al baño. No presenta confusión nocturna. Vuelve a dormir sin incidencias. Constantes en rango normal.',
      },
    });

    // 4) Evolutivo médico — EVOLUTIVO (seguimiento periódico)
    await db.medicalNote.create({
      data: {
        tenantId:   tenant.id,
        residentId: seedResident.id,
        authorId:   sanitario.id,
        noteDate:   today,
        type:       MedicalNoteType.EVOLUTIVO,
        reason:     'Revisión mensual del estado de salud',
        body:       'Residente en buen estado general. TA 130/80 mmHg. FC 72 lpm. Peso estable (67 kg). No refiere dolor en el momento de la exploración. Herida en rodilla izquierda cicatrizando correctamente. Pauta medicamentosa sin cambios. Familia informada.',
        plan:       'Mantener pauta actual. Control tensional en 2 semanas. Revisión geriátrica en 3 meses.',
      },
    });

    console.log(`  Documentación clínica (Épica A): 3 notas de enfermería + 1 evolutivo médico para residente ${seedResident.firstName} ${seedResident.lastName}`);
  }

  // ---------------------------------------------------------------------------
  // Seed de Épica B — Exitus/Baja, Informe Social, Perfil de Bienestar ACP
  // ---------------------------------------------------------------------------

  // Limpieza idempotente
  await db.dischargeRecord.deleteMany({ where: { tenantId: tenant.id } });
  await db.socialReport.deleteMany({ where: { tenantId: tenant.id } });
  await db.wellbeingProfile.deleteMany({ where: { tenantId: tenant.id } });

  // Necesitamos un residente para los datos demo; usamos los dos primeros
  const [firstDemoResident, secondDemoResident] = await Promise.all([
    db.resident.findFirst({
      where:   { tenantId: tenant.id },
      orderBy: { lastName: 'asc' },
    }),
    db.resident.findFirst({
      where:   { tenantId: tenant.id, status: ResidentStatus.ACTIVO },
      orderBy: { lastName: 'desc' },
    }),
  ]);

  if (sanitario && firstDemoResident) {
    // 1) Baja histórica: traslado a hospital (el residente puede haber reingresado)
    //    Se asocia al primer residente demo con status ACTIVO actual, pero se
    //    registra la baja como historial (sin cambiar su status en seed, para no
    //    romper los datos demo de atención directa).
    await db.dischargeRecord.create({
      data: {
        tenantId:          tenant.id,
        residentId:        firstDemoResident.id,
        type:              DischargeType.TRASLADO_HOSPITAL,
        dischargedAt:      new Date('2025-03-15T10:30:00.000Z'),
        reason:            'Agudización de insuficiencia cardíaca. Ingreso hospitalario urgente.',
        certifiedBy:       null,
        destination:       'Hospital Universitario La Fe, Valencia',
        familyNotifiedAt:  new Date('2025-03-15T11:00:00.000Z'),
        belongingsReturned: false,
        notes:             'Residente reingresó el 2025-04-02 tras alta hospitalaria. Baja temporal.',
        recordedById:      sanitario.id,
      },
    });

    // 2) Informe social del primer residente demo
    await db.socialReport.create({
      data: {
        tenantId:          tenant.id,
        residentId:        firstDemoResident.id,
        authorId:          sanitario.id,
        reportDate:        new Date('2026-01-20'),
        familySituation:   'Vive con el cónyuge hasta el ingreso. Hijos en Valencia. Familia muy implicada en el seguimiento.',
        supportNetwork:    'Red familiar sólida. Hija visita cada día. Participación en actividades grupales del centro.',
        economicSituation: 'Pensión de jubilación de 1.200€/mes. Copago de Dependencia aprobado (Grado III). Plaza concertada.',
        benefits:          'Prestación Vinculada al Servicio (PVS) aprobada. Solicitud de ampliación de prestación en trámite.',
        workHistory:       'Funcionaria de Correos durante 30 años. Jubilada a los 65.',
        socialAssessment:  'Buena adaptación al centro. Red de apoyo familiar estable. Sin conflictos relacionales. Se recomienda mantener participación en actividades de estimulación cognitiva.',
        agreements:        'Acuerdo con la familia: residente no desea información sobre cambios de medicación sin presencia del médico. Visitas abiertas en horario de tarde.',
        nextReviewDate:    new Date('2026-07-20'),
      },
    });

    // 3) Perfil de bienestar ACP del primer residente demo
    await db.wellbeingProfile.upsert({
      where:  { residentId: firstDemoResident.id },
      update: {},
      create: {
        tenantId:               tenant.id,
        residentId:             firstDemoResident.id,
        updatedById:            sanitario.id,
        // 8 dimensiones ACP (UNE 158101)
        emotionalWellbeing:     'Estado emocional generalmente positivo. Algo de tristeza los domingos cuando los hijos no pueden visitar. Responde bien a la música de zarzuela.',
        physicalWellbeing:      'Control del dolor adecuado con pauta actual. Disfagia nivel 2 (néctar). Movilidad reducida; usa andador. Sin dolor crónico significativo.',
        materialWellbeing:      'Habitación individual adaptada. Efectos personales propios (fotos familiares, colcha de casa). Pensión cubre gastos del centro con holgura.',
        personalDevelopment:    'Participa en taller de lectura los martes. Interés por las actividades manuales (punto de cruz). Mantiene capacidad de aprendizaje social.',
        selfDetermination:      'Expresa claramente sus preferencias. Decide sobre su higiene y rutinas. Firme en sus convicciones religiosas. Quiere participar en decisiones de su cuidado.',
        interpersonalRelations:  'Buena relación con compañeros de planta. Amistad estrecha con la Sra. González (hab. 202). Familia muy presente.',
        socialInclusion:        'Participa en actividades del centro. Sale al jardín a diario cuando el tiempo lo permite. Comparte mesa en el comedor.',
        rights:                 'Documentos de voluntades anticipadas firmados y depositados en notaría. Representación legal por hija Ana. Consentimiento informado de ingreso firmado.',
        // RF-SOC-005
        importantToThePerson:   'La familia es lo más importante. La misa dominical (se organiza visita a la parroquia mensualmente). Su gato (fotos en la mesita). Estar informada de su salud.',
        importantForThePerson:  'Evitar la textura de líquidos claros (riesgo de aspiración). No hablar de la muerte del marido sin ella sacar el tema. Mantener la rutina matutina (desayuno a las 8h exactas).',
        nextReviewDate:         new Date('2026-12-20'),
      },
    });
  }

  // 4) Perfil ACP del segundo residente demo (sin nextReviewDate → pendiente de planificar)
  if (sanitario && secondDemoResident && secondDemoResident.id !== firstDemoResident?.id) {
    await db.wellbeingProfile.upsert({
      where:  { residentId: secondDemoResident.id },
      update: {},
      create: {
        tenantId:               tenant.id,
        residentId:             secondDemoResident.id,
        updatedById:            sanitario.id,
        emotionalWellbeing:     'Pendiente de evaluación completa. Primera entrevista ACP realizada.',
        selfDetermination:      'Muy autónomo en sus decisiones. Prefiere no recibir ayuda si puede hacerlo solo.',
        importantToThePerson:   'La lectura del periódico cada mañana. El ajedrez. La independencia.',
        importantForThePerson:  'Respetar su ritmo. No anticiparse a sus necesidades sin que las exprese.',
        // Sin nextReviewDate: pendiente de planificar (aparecerá en panel "sin fecha")
      },
    });
  }

  console.log(`  Épica B: 1 baja histórica (traslado) + 1 informe social + 2 perfiles de bienestar ACP`);

  // ---------------------------------------------------------------------------
  // Seed de Épica C — Nutrición, Menús y Comedor
  // ---------------------------------------------------------------------------

  // Limpieza idempotente
  await db.intakeRecord.deleteMany({ where: { tenantId: tenant.id } });
  await db.menuItem.deleteMany({ where: { tenantId: tenant.id } });

  const residenciaSeed = await db.center.findFirst({
    where:   { tenantId: tenant.id, name: 'Residencia Los Olivos' },
    select:  { id: true },
  });

  const auxiliarSeed = await db.user.findUnique({ where: { email: 'auxiliar@demo.vetlla.dev' } });
  const directorSeedNut = await db.user.findUnique({ where: { email: 'direccion@demo.vetlla.dev' } });

  // Primeros 3 residentes activos para las ingestas
  const demoResidents = await db.resident.findMany({
    where:   { tenantId: tenant.id, status: ResidentStatus.ACTIVO },
    orderBy: { lastName: 'asc' },
    take:    3,
  });

  if (residenciaSeed && directorSeedNut && auxiliarSeed && demoResidents.length > 0) {
    const centerIdSeed = residenciaSeed.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // ------------------------------------------------------------------
    // Menús — 2 días para la Residencia Los Olivos
    // ------------------------------------------------------------------

    // Día 1 (ayer) — menú estándar
    await db.menuItem.create({
      data: {
        tenantId:      tenant.id,
        centerId:      centerIdSeed,
        date:          yesterday,
        meal:          MealType.DESAYUNO,
        dishName:      'Café con leche o infusión + tostada con aceite de oliva y tomate',
        allergens:     ['GLUTEN', 'LACTEOS'] as unknown as Prisma.InputJsonValue,
        isAlternative: false,
        createdById:   directorSeedNut.id,
      },
    });
    await db.menuItem.create({
      data: {
        tenantId:      tenant.id,
        centerId:      centerIdSeed,
        date:          yesterday,
        meal:          MealType.COMIDA,
        dishName:      'Lentejas estofadas con verduras',
        description:   'Lentejas con zanahoria, patata y chorizo (versión sin gluten disponible)',
        allergens:     ['SULFITOS'] as unknown as Prisma.InputJsonValue,
        isAlternative: false,
        createdById:   directorSeedNut.id,
      },
    });
    await db.menuItem.create({
      data: {
        tenantId:      tenant.id,
        centerId:      centerIdSeed,
        date:          yesterday,
        meal:          MealType.COMIDA,
        dishName:      'Pollo a la plancha con puré de patata (dieta triturada)',
        allergens:     [] as unknown as Prisma.InputJsonValue,
        isAlternative: true, // plato alternativo / dieta especial
        createdById:   directorSeedNut.id,
      },
    });
    await db.menuItem.create({
      data: {
        tenantId:      tenant.id,
        centerId:      centerIdSeed,
        date:          yesterday,
        meal:          MealType.MERIENDA,
        dishName:      'Yogur natural con fruta de temporada',
        allergens:     ['LACTEOS'] as unknown as Prisma.InputJsonValue,
        isAlternative: false,
        createdById:   directorSeedNut.id,
      },
    });
    await db.menuItem.create({
      data: {
        tenantId:      tenant.id,
        centerId:      centerIdSeed,
        date:          yesterday,
        meal:          MealType.CENA,
        dishName:      'Crema de calabacín + tortilla española',
        allergens:     ['HUEVOS'] as unknown as Prisma.InputJsonValue,
        isAlternative: false,
        createdById:   directorSeedNut.id,
      },
    });

    // Día 2 (hoy) — menú estándar
    await db.menuItem.create({
      data: {
        tenantId:      tenant.id,
        centerId:      centerIdSeed,
        date:          today,
        meal:          MealType.DESAYUNO,
        dishName:      'Zumo de naranja natural + cereales con leche o yogur',
        allergens:     ['GLUTEN', 'LACTEOS'] as unknown as Prisma.InputJsonValue,
        isAlternative: false,
        createdById:   directorSeedNut.id,
      },
    });
    await db.menuItem.create({
      data: {
        tenantId:      tenant.id,
        centerId:      centerIdSeed,
        date:          today,
        meal:          MealType.COMIDA,
        dishName:      'Paella de verduras',
        description:   'Sin gluten. Apta para dieta blanda si se sirve bien cocida.',
        allergens:     [] as unknown as Prisma.InputJsonValue,
        isAlternative: false,
        createdById:   directorSeedNut.id,
      },
    });
    await db.menuItem.create({
      data: {
        tenantId:      tenant.id,
        centerId:      centerIdSeed,
        date:          today,
        meal:          MealType.COMIDA,
        dishName:      'Merluza al vapor con puré de patata',
        allergens:     ['PESCADO'] as unknown as Prisma.InputJsonValue,
        isAlternative: false,
        createdById:   directorSeedNut.id,
      },
    });
    await db.menuItem.create({
      data: {
        tenantId:      tenant.id,
        centerId:      centerIdSeed,
        date:          today,
        meal:          MealType.MERIENDA,
        dishName:      'Pieza de fruta + galletas sin gluten',
        allergens:     [] as unknown as Prisma.InputJsonValue,
        isAlternative: false,
        createdById:   directorSeedNut.id,
      },
    });
    await db.menuItem.create({
      data: {
        tenantId:      tenant.id,
        centerId:      centerIdSeed,
        date:          today,
        meal:          MealType.CENA,
        dishName:      'Sopa de fideos + filete de ternera con ensalada',
        allergens:     ['GLUTEN'] as unknown as Prisma.InputJsonValue,
        isAlternative: false,
        createdById:   directorSeedNut.id,
      },
    });

    // ------------------------------------------------------------------
    // Registros de ingesta — 4 registros, uno con baja ingesta
    // ------------------------------------------------------------------

    if (demoResidents[0]) {
      // Residente 0: ingesta normal
      await db.intakeRecord.create({
        data: {
          tenantId:     tenant.id,
          residentId:   demoResidents[0].id,
          date:         new Date(yesterday.getTime() + 8 * 60 * 60 * 1000), // ayer 08:00
          meal:         MealType.DESAYUNO,
          foodPct:      80,
          hydrationMl:  200,
          notes:        'Buen apetito. Toma bien la tostada y el café.',
          recordedById: auxiliarSeed.id,
        },
      });
      await db.intakeRecord.create({
        data: {
          tenantId:     tenant.id,
          residentId:   demoResidents[0].id,
          date:         new Date(yesterday.getTime() + 13 * 60 * 60 * 1000), // ayer 13:00
          meal:         MealType.COMIDA,
          foodPct:      70,
          hydrationMl:  150,
          recordedById: auxiliarSeed.id,
        },
      });
    }

    if (demoResidents[1]) {
      // Residente 1: ingesta normal
      await db.intakeRecord.create({
        data: {
          tenantId:     tenant.id,
          residentId:   demoResidents[1].id,
          date:         new Date(yesterday.getTime() + 13 * 60 * 60 * 1000), // ayer 13:00
          meal:         MealType.COMIDA,
          foodPct:      90,
          hydrationMl:  250,
          recordedById: auxiliarSeed.id,
        },
      });
    }

    if (demoResidents[2]) {
      // Residente 2: BAJA INGESTA — 3 comidas consecutivas muy bajas
      // (activará la alerta en el panel RF-NUT-007)
      for (let i = 0; i < 3; i++) {
        const mealTypes = [MealType.MERIENDA, MealType.CENA, MealType.DESAYUNO];
        const hours     = [16, 20, 8]; // tarde de anteayer, cena de anteayer, desayuno de ayer
        const dayOffset = i < 2 ? 2 : 1; // anteayer o ayer
        const date = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
        date.setHours(hours[i]!, 0, 0, 0);
        await db.intakeRecord.create({
          data: {
            tenantId:     tenant.id,
            residentId:   demoResidents[2].id,
            date,
            meal:         mealTypes[i] as MealType,
            foodPct:      15, // muy bajo — activa la alerta
            hydrationMl:  50,
            notes:        i === 0 ? 'Rechaza la comida, dice que no tiene hambre.' : undefined,
            recordedById: auxiliarSeed.id,
          },
        });
      }
    }

    console.log(`  Épica C (Nutrición): 10 ítems de menú (2 días) + 4 registros de ingesta (1 con alerta baja ingesta)`);
  }

  // ---------------------------------------------------------------------------
  // Seed de Épica D — Cuadrantes/Turnos del personal + Cierre de turno firmado
  // ---------------------------------------------------------------------------

  // Limpieza idempotente
  await db.shiftHandover.deleteMany({ where: { tenantId: tenant.id } });
  await db.shiftAssignment.deleteMany({ where: { tenantId: tenant.id } });
  await db.shiftTemplate.deleteMany({ where: { tenantId: tenant.id } });

  const seedDirector  = await db.user.findUnique({ where: { email: 'direccion@demo.vetlla.dev' } });
  const seedSanitario = await db.user.findUnique({ where: { email: 'sanitario@demo.vetlla.dev' } });
  const seedAuxiliar  = await db.user.findUnique({ where: { email: 'auxiliar@demo.vetlla.dev' } });

  const seedResidencia = await db.center.findFirst({
    where:   { tenantId: tenant.id, name: 'Residencia Los Olivos' },
    select:  { id: true },
  });

  const seedPlanta1 = seedResidencia
    ? await db.unit.findFirst({
        where:   { tenantId: tenant.id, centerId: seedResidencia.id, name: 'Planta 1' },
        select:  { id: true },
      })
    : null;

  if (seedDirector && seedSanitario && seedAuxiliar && seedResidencia && seedPlanta1) {
    const shiftCenterId = seedResidencia.id;
    const shiftUnitId   = seedPlanta1.id;
    const shiftTenantId = tenant.id;

    const shiftToday = new Date();
    shiftToday.setUTCHours(0, 0, 0, 0);
    const shiftTomorrow = new Date(shiftToday);
    shiftTomorrow.setDate(shiftToday.getDate() + 1);
    const shiftYesterday = new Date(shiftToday);
    shiftYesterday.setDate(shiftToday.getDate() - 1);

    // ------------------------------------------------------------------
    // 3 Plantillas de turno para la Residencia Los Olivos (Planta 1)
    // ------------------------------------------------------------------

    await db.shiftTemplate.create({
      data: {
        tenantId:    shiftTenantId,
        centerId:    shiftCenterId,
        unitId:      shiftUnitId,
        name:        'Mañana Planta 1',
        shift:       NursingNoteShift.MANANA,
        startTime:   '06:00',
        endTime:     '14:00',
        minStaff:    2,  // mínimo 2 auxiliares en mañana
        active:      true,
        createdById: seedDirector.id,
      },
    });

    await db.shiftTemplate.create({
      data: {
        tenantId:    shiftTenantId,
        centerId:    shiftCenterId,
        unitId:      shiftUnitId,
        name:        'Tarde Planta 1',
        shift:       NursingNoteShift.TARDE,
        startTime:   '14:00',
        endTime:     '22:00',
        minStaff:    2,
        active:      true,
        createdById: seedDirector.id,
      },
    });

    await db.shiftTemplate.create({
      data: {
        tenantId:    shiftTenantId,
        centerId:    shiftCenterId,
        unitId:      shiftUnitId,
        name:        'Noche Planta 1',
        shift:       NursingNoteShift.NOCHE,
        startTime:   '22:00',
        endTime:     '06:00',
        minStaff:    1,  // mínimo 1 auxiliar en noche
        active:      true,
        createdById: seedDirector.id,
      },
    });

    // ------------------------------------------------------------------
    // Asignaciones: hoy y mañana
    // Una asignación con AUSENTE sin sustituto para demo de infra-cobertura
    // ------------------------------------------------------------------

    // Hoy — MAÑANA: sanitario CONFIRMADO
    await db.shiftAssignment.create({
      data: {
        tenantId:    shiftTenantId,
        userId:      seedSanitario.id,
        date:        shiftToday,
        shift:       NursingNoteShift.MANANA,
        unitId:      shiftUnitId,
        status:      AssignmentStatus.CONFIRMADO,
        createdById: seedDirector.id,
      },
    });

    // Hoy — MAÑANA: auxiliar AUSENTE sin sustituto (genera alerta infra-cobertura)
    await db.shiftAssignment.create({
      data: {
        tenantId:         shiftTenantId,
        userId:           seedAuxiliar.id,
        date:             shiftToday,
        shift:            NursingNoteShift.MANANA,
        unitId:           shiftUnitId,
        status:           AssignmentStatus.AUSENTE,
        substituteUserId: null,
        notes:            'Baja por enfermedad. Sin sustituto asignado.',
        createdById:      seedDirector.id,
      },
    });

    // Hoy — TARDE: auxiliar CONFIRMADO + sanitario SUSTITUIDO por director
    await db.shiftAssignment.create({
      data: {
        tenantId:    shiftTenantId,
        userId:      seedAuxiliar.id,
        date:        shiftToday,
        shift:       NursingNoteShift.TARDE,
        unitId:      shiftUnitId,
        status:      AssignmentStatus.CONFIRMADO,
        createdById: seedDirector.id,
      },
    });
    await db.shiftAssignment.create({
      data: {
        tenantId:         shiftTenantId,
        userId:           seedSanitario.id,
        date:             shiftToday,
        shift:            NursingNoteShift.TARDE,
        unitId:           shiftUnitId,
        status:           AssignmentStatus.SUSTITUIDO,
        substituteUserId: seedDirector.id, // director como sustituto de enfermería
        notes:            'Sanitario en formación. Director cubre el turno.',
        createdById:      seedDirector.id,
      },
    });

    // Mañana — MAÑANA: ambos PLANIFICADO
    await db.shiftAssignment.create({
      data: {
        tenantId:    shiftTenantId,
        userId:      seedSanitario.id,
        date:        shiftTomorrow,
        shift:       NursingNoteShift.MANANA,
        unitId:      shiftUnitId,
        status:      AssignmentStatus.PLANIFICADO,
        createdById: seedDirector.id,
      },
    });
    await db.shiftAssignment.create({
      data: {
        tenantId:    shiftTenantId,
        userId:      seedAuxiliar.id,
        date:        shiftTomorrow,
        shift:       NursingNoteShift.MANANA,
        unitId:      shiftUnitId,
        status:      AssignmentStatus.PLANIFICADO,
        createdById: seedDirector.id,
      },
    });

    // ------------------------------------------------------------------
    // Cierre de turno firmado de ejemplo (ayer — turno de mañana)
    // ------------------------------------------------------------------

    await db.shiftHandover.create({
      data: {
        tenantId:         shiftTenantId,
        centerId:         shiftCenterId,
        unitId:           shiftUnitId,
        date:             shiftYesterday,
        shift:            NursingNoteShift.MANANA,
        summary:          'Turno de mañana sin incidencias graves. Todos los residentes han desayunado bien. Se ha realizado higiene completa. Constantes en rango normal en todos los residentes. El residente hab. 1-02 refiere leve dolor abdominal que cede con postura.',
        incidentsSummary: 'Hab. 1-02: dolor abdominal leve (EVA 2/10). Se ha comunicado a enfermería. Se recomienda vigilancia y control de deposición.',
        pendingTasks:     'Revisar deposición residente hab. 1-02 en turno de tarde. Confirmar que llega el sustituto del auxiliar en el turno de noche.',
        closedById:       seedSanitario.id,
        closedAt:         new Date(shiftYesterday.getTime() + 14 * 60 * 60 * 1000), // ayer a las 14:00
      },
    });

    console.log(`  Épica D (Turnos): 3 plantillas (mañana/tarde/noche Planta 1) + 6 asignaciones (hoy/mañana con AUSENTE+SUSTITUIDO para demo) + 1 cierre de turno firmado (ayer mañana)`);
  }

  console.log(`Seed OK.`);
  console.log(`  Tenant: ${tenant.name}`);
  console.log(`  Usuarios: ${userCount} (password demo: ${DEMO_PASSWORD})`);
  console.log(`  Centros: Residencia Los Olivos (30 plazas) + Vivienda Tutelada El Roble (8 plazas)`);
  console.log(`  Residentes: 28 con expediente de ejemplo`);
  console.log(`  Comunicaciones: 2 comunicados + 1 hilo con 3 mensajes`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
