import bcrypt from 'bcryptjs';
import {
  ActivityCategory,
  ActivitySessionStatus,
  AdmissionOrigin,
  AdmissionStatus,
  AllergySeverity,
  AllergyType,
  AnnouncementAudience,
  AnnouncementCategory,
  AssessmentType,
  AssignmentStatus,
  BillingUnit,
  CenterType,
  ConsentType,
  ContactRelation,
  DependencyGrade,
  DeviceType,
  DietType,
  DischargeType,
  EnrollmentStatus,
  InvoiceStatus,
  LiquidTexture,
  MealType,
  MedicalNoteType,
  MessageThreadCategory,
  MedicationRoute,
  MedicationType,
  NursingNoteCategory,
  NursingNoteShift,
  PayerType,
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

  // ---------------------------------------------------------------------------
  // LIMPIEZA IDEMPOTENTE — orden FK estricto (hijo → padre).
  //
  // Regla: hay que borrar en orden inverso al de creación, siguiendo las FKs,
  // ANTES de recrear los padres (Resident, Center). Si no se respeta el orden,
  // la 2ª ejecución falla con FK violation al intentar borrar un padre que
  // todavía tiene hijos.
  //
  // Árbol de dependencias relevante (solo las que bloquean si no se borran antes):
  //
  //   InvoiceLine ──FK──► Invoice ──FK(Restrict)──► Resident   ← el error original
  //   ResidentBillingProfile ──FK──► Resident
  //   Tariff ──FK──► Tenant  (sin residentId; se borra aparte)
  //
  //   ActivityEnrollment ──FK──► ActivitySession ──FK──► Activity (sin residentId)
  //   ActivityEnrollment ──FK──► Resident
  //
  //   AdmissionRequest.residentId ──FK(SetNull)──► Resident  ← no bloquea, pero se limpia
  //
  //   AuditLog: no tiene FK de BD real a Resident; se limpia por tenantId.
  //
  //   Announcement.residentId ──FK(Cascade)──► Resident  (cascade, pero el deleteMany
  //     de announcements ya estaba en el bloque COM; se mueve aquí para que ocurra antes)
  //   MessageThread.residentId ──FK(Cascade)──► Resident  (ídem)
  //
  // Tablas que SÍ tienen onDelete:Cascade desde Resident y se borran automáticamente
  // al borrar el residente en BD (no necesitan deleteMany explícito):
  //   EmergencyContact, Allergy, Diagnosis, Assessment, CareRecord, Medication,
  //   MedicationAdministration, CarePlan, CarePlanGoal, CarePlanReview,
  //   ResidentDevice, Vaccine, WeightRecord, PressureUlcer (→ UPPCuring),
  //   FallRecord, Restraint, ConsentRecord, LifeStory, ServiceRequest
  //   (→ ServiceRequestComment), FamilyLink, Visit, NursingNote, MedicalNote,
  //   DischargeRecord, SocialReport, WellbeingProfile, IntakeRecord,
  //   AssistiveDevice, ResidentBelonging.
  //
  // PERO: `deleteMany` de Prisma NO dispara los onDelete cascades de la BD
  // cuando el borrado lo inicia Prisma (no pasa por triggers de BD en el mismo
  // sentido). Para las FKs con Restrict o las que Prisma no cascadea
  // automáticamente por su propio cliente, hay que borrar manualmente en orden.
  // ---------------------------------------------------------------------------

  // 1. Nietos de Invoice (líneas de factura) — antes que Invoice
  await db.invoiceLine.deleteMany({ where: { tenantId: tenant.id } });
  // 2. Facturas — FK Restrict sobre Resident; deben irse antes que el residente
  await db.invoice.deleteMany({ where: { tenantId: tenant.id } });
  // 3. Perfiles de facturación del residente
  await db.residentBillingProfile.deleteMany({ where: { tenantId: tenant.id } });
  // 4. Tarifas del tenant (no dependen de Resident, pero se recrean → limpiar)
  await db.tariff.deleteMany({ where: { tenantId: tenant.id } });

  // 5. Inscripciones a actividades (FK a Resident + FK a ActivitySession)
  await db.activityEnrollment.deleteMany({ where: { tenantId: tenant.id } });
  // 6. Sesiones de actividad (FK a Activity)
  await db.activitySession.deleteMany({ where: { tenantId: tenant.id } });
  // 7. Catálogo de actividades (sin residentId; se recrean cada vez)
  await db.activity.deleteMany({ where: { tenantId: tenant.id } });

  // 8. Solicitudes de admisión (residentId SetNull — no bloquea, pero se limpian
  //    antes de recrear centros a los que hacen referencia por centerId Restrict)
  await db.admissionRequest.deleteMany({ where: { tenantId: tenant.id } });

  // 9. Comunicados y mensajería que referencian Resident (Cascade en BD,
  //    pero se limpian aquí para no duplicar con los deleteMany de sus bloques)
  await db.message.deleteMany({ where: { tenantId: tenant.id } });
  await db.messageThread.deleteMany({ where: { tenantId: tenant.id } });
  await db.announcementReceipt.deleteMany({ where: { tenantId: tenant.id } });
  await db.announcement.deleteMany({ where: { tenantId: tenant.id } });

  // 10. Visitas y franjas (FK a Resident y a Center)
  await db.visit.deleteMany({ where: { tenantId: tenant.id } });
  await db.visitSlotConfig.deleteMany({ where: { tenantId: tenant.id } });

  // 11. Cuadrantes/turnos (FK a Center/Unit, sin residentId; se recrean)
  await db.shiftHandover.deleteMany({ where: { tenantId: tenant.id } });
  await db.shiftAssignment.deleteMany({ where: { tenantId: tenant.id } });
  await db.shiftTemplate.deleteMany({ where: { tenantId: tenant.id } });

  // 12. Documentación clínica con FK a Resident
  await db.nursingNote.deleteMany({ where: { tenantId: tenant.id } });
  await db.medicalNote.deleteMany({ where: { tenantId: tenant.id } });

  // 13. Épica B — baja, informe social, bienestar
  await db.dischargeRecord.deleteMany({ where: { tenantId: tenant.id } });
  await db.socialReport.deleteMany({ where: { tenantId: tenant.id } });
  await db.wellbeingProfile.deleteMany({ where: { tenantId: tenant.id } });

  // 14. Épica C — ingestas y menús
  await db.intakeRecord.deleteMany({ where: { tenantId: tenant.id } });
  await db.menuItem.deleteMany({ where: { tenantId: tenant.id } });

  // 15. Solicitudes de servicio del portal de familias (FK a Resident)
  await db.serviceRequestComment.deleteMany({ where: { tenantId: tenant.id } });
  await db.serviceRequest.deleteMany({ where: { tenantId: tenant.id } });

  // 16. AuditLog: NO se borra. La tabla audit_logs es APPEND-ONLY por diseño
  //     (REVOKE DELETE + trigger BEFORE DELETE, migración 20260612130000): ni el
  //     owner puede borrar — un DELETE da "permission denied" (42501). No tiene FK
  //     real a Resident/User, así que no bloquea el borrado de residentes. Las
  //     entradas de ejemplo se crean con guard de conteo para no acumular.

  // 17. Ahora sí: residentes (todos los hijos con Restrict ya están limpios)
  await db.resident.deleteMany({ where: { tenantId: tenant.id } });
  // 18. Centros (y sus unidades/camas en cascade de BD)
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
    // (la limpieza ya se realizó al inicio de main() — no hay que repetirla)

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
    // La limpieza de announcements/messageThreads ya se realizó al inicio de main()

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

  // La limpieza de visitas ya se realizó al inicio de main()

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

  // La limpieza de notas clínicas ya se realizó al inicio de main()

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

  // La limpieza de Épica B ya se realizó al inicio de main()

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

  // La limpieza de Épica C ya se realizó al inicio de main()

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

  // La limpieza de Épica D ya se realizó al inicio de main()

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

  // ---------------------------------------------------------------------------
  // Seed de Actividades (RF-ACT-001..012)
  // Catálogo + sesiones (futuras y pasadas con asistencia) + inscripciones
  // incluido el residente vinculado al familiar demo (/portal/actividades)
  // ---------------------------------------------------------------------------

  // La limpieza de actividades (inscripciones → sesiones → catálogo) ya se realizó al inicio de main()

  const actResidencia = await db.center.findFirst({
    where: { tenantId: tenant.id, name: 'Residencia Los Olivos' },
    select: { id: true },
  });
  const actDirector = await db.user.findUnique({ where: { email: 'direccion@demo.vetlla.dev' } });
  const actAuxiliar = await db.user.findUnique({ where: { email: 'auxiliar@demo.vetlla.dev' } });

  // Residente del familiar (primer residente por apellido) — ya se obtuvo como firstResident
  const actFamiliarResident = await db.resident.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { lastName: 'asc' },
  });

  // 4 residentes activos para inscripciones variadas
  const actResidents = await db.resident.findMany({
    where: { tenantId: tenant.id, status: ResidentStatus.ACTIVO },
    orderBy: { lastName: 'asc' },
    take: 5,
  });

  if (actResidencia && actDirector && actAuxiliar && actResidents.length >= 3) {
    const centerId = actResidencia.id;
    const now = new Date();

    // --- Catálogo de actividades (5 categorías) ---
    const actTallerMemoria = await db.activity.create({
      data: {
        tenantId:     tenant.id,
        name:         'Taller de memoria',
        description:  'Ejercicios de estimulación cognitiva: series numéricas, asociación de palabras, puzles y reminiscencia.',
        category:     ActivityCategory.COGNITIVA,
        location:     'Sala polivalente, Planta 1',
        responsibleId: actAuxiliar.id,
        maxCapacity:  12,
        durationMin:  60,
      },
    });

    const actGimnasia = await db.activity.create({
      data: {
        tenantId:     tenant.id,
        name:         'Gimnasia de mantenimiento',
        description:  'Ejercicios de movilidad articular, equilibrio y coordinación adaptados a cada nivel funcional.',
        category:     ActivityCategory.FISICA,
        location:     'Sala de fisioterapia',
        responsibleId: actAuxiliar.id,
        maxCapacity:  10,
        durationMin:  45,
      },
    });

    const actManualidades = await db.activity.create({
      data: {
        tenantId:     tenant.id,
        name:         'Taller de manualidades',
        description:  'Pintura en tela, papiroflexia y decoración. Estimulación de la motricidad fina y la creatividad.',
        category:     ActivityCategory.CREATIVA,
        location:     'Sala de actividades, Planta 2',
        responsibleId: actAuxiliar.id,
        maxCapacity:  8,
        durationMin:  90,
      },
    });

    const actTertulia = await db.activity.create({
      data: {
        tenantId:     tenant.id,
        name:         'Tertulia y lectura',
        description:  'Lectura en voz alta, comentario de noticias del día y debate guiado sobre temas de actualidad o historia.',
        category:     ActivityCategory.SOCIAL,
        location:     'Sala de estar, Planta 1',
        responsibleId: actDirector.id,
        maxCapacity:  15,
        durationMin:  60,
      },
    });

    const actExcursion = await db.activity.create({
      data: {
        tenantId:     tenant.id,
        name:         'Salida al mercado municipal',
        description:  'Excursión mensual al mercado local. Fomenta la autonomía, la orientación y el contacto con el entorno.',
        category:     ActivityCategory.SALIDA,
        location:     'Mercado Central de Valencia',
        responsibleId: actDirector.id,
        maxCapacity:  6,
        durationMin:  120,
      },
    });

    // --- Sesiones pasadas (REALIZADA) con asistencia registrada ---

    // Taller memoria: sesión hace 7 días — REALIZADA
    const pastMemoria = new Date(now);
    pastMemoria.setDate(now.getDate() - 7);
    pastMemoria.setHours(10, 0, 0, 0);
    const pastMemoriaEnd = new Date(pastMemoria.getTime() + 60 * 60 * 1000);

    const sesionMemoriaPasada = await db.activitySession.create({
      data: {
        tenantId:   tenant.id,
        activityId: actTallerMemoria.id,
        centerId,
        startsAt:   pastMemoria,
        endsAt:     pastMemoriaEnd,
        status:     ActivitySessionStatus.REALIZADA,
        notes:      'Sesión de reminiscencia con fotos de época. Muy buena participación.',
      },
    });

    // Inscripciones con asistencia registrada (sesión pasada)
    for (let i = 0; i < Math.min(3, actResidents.length); i++) {
      const res = actResidents[i]!;
      await db.activityEnrollment.create({
        data: {
          tenantId:    tenant.id,
          sessionId:   sesionMemoriaPasada.id,
          residentId:  res.id,
          status:      EnrollmentStatus.INSCRITO,
          attended:    i < 2, // primeros 2 asistieron, 3ro no
          observation: i === 0 ? 'Muy participativa. Aportó anécdotas de su infancia.' : i === 1 ? 'Correcto. Se distrajo un poco al final.' : null,
        },
      });
    }

    // Residente del familiar: inscripción con asistencia en sesión pasada
    if (actFamiliarResident && !actResidents.slice(0, 3).some((r: { id: string }) => r.id === actFamiliarResident.id)) {
      await db.activityEnrollment.create({
        data: {
          tenantId:   tenant.id,
          sessionId:  sesionMemoriaPasada.id,
          residentId: actFamiliarResident.id,
          status:     EnrollmentStatus.INSCRITO,
          attended:   true,
          observation: 'Participó activamente. Recordó con detalle su etapa profesional.',
        },
      });
    }

    // Gimnasia: sesión hace 3 días — REALIZADA
    const pastGim = new Date(now);
    pastGim.setDate(now.getDate() - 3);
    pastGim.setHours(9, 0, 0, 0);
    const pastGimEnd = new Date(pastGim.getTime() + 45 * 60 * 1000);

    const sesionGimPasada = await db.activitySession.create({
      data: {
        tenantId:   tenant.id,
        activityId: actGimnasia.id,
        centerId,
        startsAt:   pastGim,
        endsAt:     pastGimEnd,
        status:     ActivitySessionStatus.REALIZADA,
        notes:      'Ejercicios de equilibrio y coordinación. Sin incidencias.',
      },
    });

    for (let i = 0; i < Math.min(4, actResidents.length); i++) {
      const res = actResidents[i]!;
      await db.activityEnrollment.create({
        data: {
          tenantId:   tenant.id,
          sessionId:  sesionGimPasada.id,
          residentId: res.id,
          status:     EnrollmentStatus.INSCRITO,
          attended:   true,
          observation: i === 0 ? 'Completó todos los ejercicios sin ayuda.' : null,
        },
      });
    }

    // --- Sesiones futuras (PROGRAMADA) con inscripciones pendientes ---

    // Taller memoria: sesión mañana
    const futureMem = new Date(now);
    futureMem.setDate(now.getDate() + 1);
    futureMem.setHours(10, 0, 0, 0);
    const futureMemEnd = new Date(futureMem.getTime() + 60 * 60 * 1000);

    const sesionMemoriaFutura = await db.activitySession.create({
      data: {
        tenantId:   tenant.id,
        activityId: actTallerMemoria.id,
        centerId,
        startsAt:   futureMem,
        endsAt:     futureMemEnd,
        status:     ActivitySessionStatus.PROGRAMADA,
      },
    });

    // Inscribir al residente del familiar (aparece en /portal/actividades)
    if (actFamiliarResident) {
      await db.activityEnrollment.create({
        data: {
          tenantId:   tenant.id,
          sessionId:  sesionMemoriaFutura.id,
          residentId: actFamiliarResident.id,
          status:     EnrollmentStatus.INSCRITO,
          attended:   null,
        },
      });
    }

    // Inscribir otros residentes a la sesión futura
    for (let i = 0; i < Math.min(3, actResidents.length); i++) {
      const res = actResidents[i]!;
      if (actFamiliarResident && res.id === actFamiliarResident.id) continue;
      await db.activityEnrollment.create({
        data: {
          tenantId:   tenant.id,
          sessionId:  sesionMemoriaFutura.id,
          residentId: res.id,
          status:     EnrollmentStatus.INSCRITO,
          attended:   null,
        },
      });
    }

    // Manualidades: sesión en 3 días
    const futureManu = new Date(now);
    futureManu.setDate(now.getDate() + 3);
    futureManu.setHours(16, 0, 0, 0);
    const futureManuEnd = new Date(futureManu.getTime() + 90 * 60 * 1000);

    const sesionManuFutura = await db.activitySession.create({
      data: {
        tenantId:   tenant.id,
        activityId: actManualidades.id,
        centerId,
        startsAt:   futureManu,
        endsAt:     futureManuEnd,
        status:     ActivitySessionStatus.PROGRAMADA,
        notes:      'Se preparan centros de mesa para la celebración del mes.',
      },
    });

    // Un residente en lista de espera (aforo cubierto)
    if (actResidents.length >= 5) {
      for (let i = 0; i < 4; i++) {
        await db.activityEnrollment.create({
          data: {
            tenantId:   tenant.id,
            sessionId:  sesionManuFutura.id,
            residentId: actResidents[i]!.id,
            status:     EnrollmentStatus.INSCRITO,
            attended:   null,
          },
        });
      }
      // El 5º queda en lista de espera (maxCapacity=8, pero creamos este para demo)
      await db.activityEnrollment.create({
        data: {
          tenantId:   tenant.id,
          sessionId:  sesionManuFutura.id,
          residentId: actResidents[4]!.id,
          status:     EnrollmentStatus.LISTA_ESPERA,
          attended:   null,
        },
      });
    }

    // Tertulia: sesión en 5 días
    const futureTertulia = new Date(now);
    futureTertulia.setDate(now.getDate() + 5);
    futureTertulia.setHours(17, 0, 0, 0);
    const futureTertuliaEnd = new Date(futureTertulia.getTime() + 60 * 60 * 1000);

    await db.activitySession.create({
      data: {
        tenantId:   tenant.id,
        activityId: actTertulia.id,
        centerId,
        startsAt:   futureTertulia,
        endsAt:     futureTertuliaEnd,
        status:     ActivitySessionStatus.PROGRAMADA,
        notes:      'Tema: "Recuerdos de la Semana Santa en Valencia".',
      },
    });

    // Excursión: sesión en 2 semanas
    const futureExcursion = new Date(now);
    futureExcursion.setDate(now.getDate() + 14);
    futureExcursion.setHours(10, 0, 0, 0);
    const futureExcursionEnd = new Date(futureExcursion.getTime() + 120 * 60 * 1000);

    await db.activitySession.create({
      data: {
        tenantId:   tenant.id,
        activityId: actExcursion.id,
        centerId,
        startsAt:   futureExcursion,
        endsAt:     futureExcursionEnd,
        status:     ActivitySessionStatus.PROGRAMADA,
        notes:      'Excursión mensual de junio. Inscripción abierta. Plazas limitadas a 6.',
      },
    });

    console.log(`  Actividades: 5 actividades en catálogo + 7 sesiones (2 pasadas REALIZADA + 5 futuras PROGRAMADA) + inscripciones con asistencia registrada, 1 en lista de espera, residente del familiar inscrito`);
  }

  // ---------------------------------------------------------------------------
  // Seed de Facturación (RF-ECO-001..005)
  // Tarifa, perfil de facturación, facturas (DRAFT, ISSUED, PAID) + líneas
  // incluido el residente del familiar para /portal/facturas
  // ---------------------------------------------------------------------------

  // La limpieza de facturación (líneas → facturas → perfiles → tarifas) ya se realizó al inicio de main()

  // Tarifa base: cuota mensual de plaza privada
  const tariffBase = await db.tariff.create({
    data: {
      tenantId:   tenant.id,
      code:       'CUOTA-RESID',
      name:       'Cuota mensual residencia',
      baseAmount: new Prisma.Decimal(2100.00),
      unit:       BillingUnit.MENSUAL,
      vatPct:     new Prisma.Decimal(0),
      vatExempt:  true,
      validFrom:  new Date('2026-01-01'),
    },
  });

  // Tarifa módulo fisioterapia (diaria)
  const tariffFisio = await db.tariff.create({
    data: {
      tenantId:   tenant.id,
      code:       'MODULO-FISIO',
      name:       'Módulo de fisioterapia individual',
      baseAmount: new Prisma.Decimal(45.00),
      unit:       BillingUnit.UNICO,
      vatPct:     new Prisma.Decimal(0),
      vatExempt:  true,
      validFrom:  new Date('2026-01-01'),
    },
  });

  // Obtener los primeros 4 residentes para facturas
  const facResidents = await db.resident.findMany({
    where: { tenantId: tenant.id, status: ResidentStatus.ACTIVO },
    orderBy: { lastName: 'asc' },
    take: 4,
  });

  // Residente del familiar
  const facFamiliarResident = await db.resident.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { lastName: 'asc' },
  });

  if (facResidents.length > 0) {
    // Perfil de facturación para cada residente
    for (let i = 0; i < facResidents.length; i++) {
      const res = facResidents[i]!;
      await db.residentBillingProfile.upsert({
        where: { residentId: res.id },
        update: {},
        create: {
          tenantId:       tenant.id,
          residentId:     res.id,
          tariffId:       tariffBase.id,
          publicCopayPct: new Prisma.Decimal(i === 0 ? 30 : 0),  // residente 0 tiene copago público 30%
          privatePct:     new Prisma.Decimal(i === 0 ? 70 : 100),
          payerType:      PayerType.FAMILIAR,
          payerName:      i === 0 ? 'Ana García (hija)' : `Familiar residente ${i + 1}`,
          notes:          i === 0 ? 'Copago Dependencia Grado III aprobado. Domiciliación SEPA pendiente.' : null,
        },
      });
    }

    // Helper para crear factura con líneas directamente en BD (sin pasar por el router)
    const createInvoiceWithLines = async (
      residentId: string,
      periodYear: number,
      periodMonth: number, // 1-based
      status: InvoiceStatus,
      invoiceNumber: number | null,
      lines: Array<{ description: string; quantity: number; unitPrice: number; tariffId?: string }>,
    ) => {
      const baseTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
      const pStart = new Date(periodYear, periodMonth - 1, 1);
      const pEnd   = new Date(periodYear, periodMonth, 0); // último día del mes

      return db.invoice.create({
        data: {
          tenantId:      tenant.id,
          residentId,
          series:        'A',
          invoiceNumber: status !== InvoiceStatus.DRAFT ? invoiceNumber : null,
          invoiceYear:   status !== InvoiceStatus.DRAFT ? periodYear : null,
          periodStart:   pStart,
          periodEnd:     pEnd,
          status,
          issuedAt:      status !== InvoiceStatus.DRAFT ? new Date(periodYear, periodMonth - 1, 5) : null,
          paidAt:        status === InvoiceStatus.PAID   ? new Date(periodYear, periodMonth - 1, 20) : null,
          payerType:     PayerType.FAMILIAR,
          payerName:     'Familiar demo',
          baseAmount:    new Prisma.Decimal(baseTotal),
          vatAmount:     new Prisma.Decimal(0),
          totalAmount:   new Prisma.Decimal(baseTotal),
          dueAt:         new Date(periodYear, periodMonth - 1, 25),
          lines: {
            create: lines.map((l, idx) => ({
              tenantId:    tenant.id,
              tariffId:    l.tariffId ?? null,
              description: l.description,
              quantity:    new Prisma.Decimal(l.quantity),
              unitPrice:   new Prisma.Decimal(l.unitPrice),
              vatPct:      new Prisma.Decimal(0),
              vatExempt:   true,
              lineBase:    new Prisma.Decimal(l.quantity * l.unitPrice),
              lineVat:     new Prisma.Decimal(0),
              lineTotal:   new Prisma.Decimal(l.quantity * l.unitPrice),
              sortOrder:   idx,
            })),
          },
        },
      });
    };

    // Facturas para los primeros residentes
    if (facResidents[0]) {
      // Residente 0 (con copago): factura PAID de abril 2026
      await createInvoiceWithLines(facResidents[0].id, 2026, 4, InvoiceStatus.PAID, 1, [
        { description: 'Cuota mensual residencia — 2026/04', quantity: 1, unitPrice: 1470.00, tariffId: tariffBase.id },
        { description: 'Módulo fisioterapia individual (8 sesiones)', quantity: 8, unitPrice: 45.00, tariffId: tariffFisio.id },
      ]);

      // Residente 0: factura ISSUED de mayo 2026
      await createInvoiceWithLines(facResidents[0].id, 2026, 5, InvoiceStatus.ISSUED, 2, [
        { description: 'Cuota mensual residencia — 2026/05', quantity: 1, unitPrice: 1470.00, tariffId: tariffBase.id },
      ]);
    }

    if (facResidents[1]) {
      // Residente 1: factura PAID de mayo 2026
      await createInvoiceWithLines(facResidents[1].id, 2026, 5, InvoiceStatus.PAID, 3, [
        { description: 'Cuota mensual residencia — 2026/05', quantity: 1, unitPrice: 2100.00, tariffId: tariffBase.id },
      ]);
    }

    if (facResidents[2]) {
      // Residente 2: borrador de junio 2026 (DRAFT — pendiente de emisión)
      await createInvoiceWithLines(facResidents[2].id, 2026, 6, InvoiceStatus.DRAFT, null, [
        { description: 'Cuota mensual residencia — 2026/06', quantity: 1, unitPrice: 2100.00, tariffId: tariffBase.id },
        { description: 'Suplemento habitación individual', quantity: 1, unitPrice: 150.00 },
      ]);
    }

    // Factura para el residente del familiar (ISSUED — visible en /portal/facturas)
    if (facFamiliarResident && !facResidents.slice(0, 3).some((r: { id: string }) => r.id === facFamiliarResident.id)) {
      // Asegurar perfil de facturación si no existe
      await db.residentBillingProfile.upsert({
        where: { residentId: facFamiliarResident.id },
        update: {},
        create: {
          tenantId:       tenant.id,
          residentId:     facFamiliarResident.id,
          tariffId:       tariffBase.id,
          publicCopayPct: new Prisma.Decimal(30),
          privatePct:     new Prisma.Decimal(70),
          payerType:      PayerType.FAMILIAR,
          payerName:      'Ana García (hija)',
        },
      });

      await createInvoiceWithLines(facFamiliarResident.id, 2026, 5, InvoiceStatus.ISSUED, 4, [
        { description: 'Cuota mensual residencia — 2026/05', quantity: 1, unitPrice: 1470.00, tariffId: tariffBase.id },
      ]);

      await createInvoiceWithLines(facFamiliarResident.id, 2026, 4, InvoiceStatus.PAID, 5, [
        { description: 'Cuota mensual residencia — 2026/04', quantity: 1, unitPrice: 1470.00, tariffId: tariffBase.id },
      ]);
    }

    console.log(`  Facturación: 2 tarifas + perfiles para 4 residentes + facturas (PAID×2, ISSUED×2, DRAFT×1) con líneas, incluyendo residente del familiar`);
  }

  // ---------------------------------------------------------------------------
  // Seed de Admisiones (RF-ADM-001..007)
  // Solicitudes en distintos estados del pipeline para /admisiones
  // ---------------------------------------------------------------------------

  // La limpieza de admisiones ya se realizó al inicio de main()

  const admDirector = await db.user.findUnique({ where: { email: 'direccion@demo.vetlla.dev' } });
  const admResidencia = await db.center.findFirst({
    where: { tenantId: tenant.id, name: 'Residencia Los Olivos' },
    select: { id: true },
  });

  if (admDirector && admResidencia) {
    const centerId = admResidencia.id;

    const candidatos: Array<{
      firstName: string;
      lastName: string;
      birthDate: Date;
      status: AdmissionStatus;
      priority: number;
      dependencyGrade: DependencyGrade;
      origin: AdmissionOrigin;
      contactName: string;
      contactPhone: string;
      notes?: string;
      expectedAdmissionDate?: Date;
      outcomeReason?: string;
    }> = [
      {
        firstName: 'Milagros',
        lastName: 'Blanco Herrera',
        birthDate: new Date(1940, 3, 12),
        status: AdmissionStatus.LEAD,
        priority: 2,
        dependencyGrade: DependencyGrade.GRADO_II,
        origin: AdmissionOrigin.INICIATIVA_PROPIA,
        contactName: 'Roberto Blanco (hijo)',
        contactPhone: '612345001',
        notes: 'Familia interesada por información telefónica. Pendiente de concertar visita.',
      },
      {
        firstName: 'Vicente',
        lastName: 'Pardo Castellano',
        birthDate: new Date(1936, 8, 23),
        status: AdmissionStatus.WAITLIST,
        priority: 1,
        dependencyGrade: DependencyGrade.GRADO_III,
        origin: AdmissionOrigin.DERIVACION_HOSPITAL,
        contactName: 'Marta Pardo (hija)',
        contactPhone: '612345002',
        notes: 'Alta hospitalaria prevista para el 30 de junio. Necesita plaza urgente. Grado III reconocido.',
        expectedAdmissionDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
      {
        firstName: 'Amparo',
        lastName: 'Navarro Ferrer',
        birthDate: new Date(1943, 1, 8),
        status: AdmissionStatus.EVALUATION,
        priority: 2,
        dependencyGrade: DependencyGrade.GRADO_II,
        origin: AdmissionOrigin.DERIVACION_SS,
        contactName: 'Servicios Sociales Ajuntament de València',
        contactPhone: '963456001',
        notes: 'Visita al centro realizada el 5 de junio. Pendiente informe médico de su geriatra.',
      },
      {
        firstName: 'Ramón',
        lastName: 'Soler Ibáñez',
        birthDate: new Date(1938, 6, 15),
        status: AdmissionStatus.OFFERED,
        priority: 1,
        dependencyGrade: DependencyGrade.GRADO_III,
        origin: AdmissionOrigin.TRASLADO_OTRO_CENTRO,
        contactName: 'Carmen Soler (esposa)',
        contactPhone: '612345003',
        notes: 'Plaza ofrecida en Planta 2. Familia estudiando condiciones económicas. Respuesta esperada esta semana.',
        expectedAdmissionDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
      {
        firstName: 'Francisca',
        lastName: 'Ortega Molina',
        birthDate: new Date(1942, 10, 3),
        status: AdmissionStatus.REJECTED,
        priority: 3,
        dependencyGrade: DependencyGrade.GRADO_I,
        origin: AdmissionOrigin.INICIATIVA_PROPIA,
        contactName: 'Luis Ortega (hermano)',
        contactPhone: '612345004',
        notes: 'Valoración realizada el 1 de mayo.',
        outcomeReason: 'Nivel de dependencia insuficiente para plaza en residencia. Se derivó a centro de día.',
      },
      {
        firstName: 'Josefa',
        lastName: 'Ruiz Torres',
        birthDate: new Date(1935, 4, 20),
        status: AdmissionStatus.WAITLIST,
        priority: 2,
        dependencyGrade: DependencyGrade.GRADO_II,
        origin: AdmissionOrigin.INICIATIVA_PROPIA,
        contactName: 'Antonio Ruiz (hijo)',
        contactPhone: '612345005',
        notes: 'Segunda solicitud. Estuvo en lista de espera en 2025. Actualiza documentación.',
      },
    ];

    for (const c of candidatos) {
      await db.admissionRequest.create({
        data: {
          tenantId:             tenant.id,
          centerId,
          firstName:            c.firstName,
          lastName:             c.lastName,
          birthDate:            c.birthDate,
          status:               c.status,
          priority:             c.priority,
          dependencyGrade:      c.dependencyGrade,
          placeRegime:          PlaceRegime.PRIVADA,
          origin:               c.origin,
          contactName:          c.contactName,
          contactPhone:         c.contactPhone,
          notes:                c.notes ?? null,
          expectedAdmissionDate: c.expectedAdmissionDate ?? null,
          outcomeReason:        c.outcomeReason ?? null,
          createdById:          admDirector.id,
          requestedAt:          new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000),
        },
      });
    }

    console.log(`  Admisiones: ${candidatos.length} solicitudes (LEAD×1, WAITLIST×2, EVALUATION×1, OFFERED×1, REJECTED×1)`);
  }

  // ---------------------------------------------------------------------------
  // Seed adicional de Comunicación (COM-012..COM-015)
  // Añade comunicados extra y un segundo hilo para que las listas no estén vacías
  // ---------------------------------------------------------------------------
  // Nota: los comunicados y el hilo principal ya se crean en el bloque COM-001..011
  // (con deleteMany previo que los limpia). Aquí añadimos más comunicados DENTRO
  // del mismo bloque de limpieza. Para no reordenar código, simplemente re-obtenemos
  // los usuarios y añadimos registros extra DESPUÉS de que el bloque COM-001..011
  // ya los haya creado (que en este punto ya están en BD).

  const comDir2 = await db.user.findUnique({ where: { email: 'direccion@demo.vetlla.dev' } });
  const comFam2 = await db.user.findUnique({ where: { email: 'familiar@demo.vetlla.dev' } });
  const comFamRes2 = await db.resident.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { lastName: 'asc' },
  });

  if (comDir2 && comFam2 && comFamRes2) {
    // Comunicado de salud (nutrición) — idempotente por título exacto
    const existingMenuAnn = await db.announcement.findFirst({
      where: { tenantId: tenant.id, title: 'Nuevo menú de verano a partir del 1 de julio' },
    });
    if (!existingMenuAnn) {
      await db.announcement.create({
        data: {
          tenantId:    tenant.id,
          authorId:    comDir2.id,
          title:       'Nuevo menú de verano a partir del 1 de julio',
          body:        [
            'Estimadas familias,',
            '',
            'Os informamos de que a partir del próximo 1 de julio incorporamos el menú de verano,',
            'con platos más frescos y mayor variedad de ensaladas y frutas de temporada.',
            '',
            'El menú completo estará disponible en el tablón de la entrada y en este portal.',
            '',
            'Gracias por vuestra confianza. El equipo de Nutrición.',
          ].join('\n'),
          category:    AnnouncementCategory.GENERAL,
          audience:    AnnouncementAudience.TODO_EL_CENTRO,
          requiresAck: false,
        },
      });

      await db.announcement.create({
        data: {
          tenantId:    tenant.id,
          authorId:    comDir2.id,
          title:       'Fiesta de verano — sábado 28 de junio',
          body:        [
            'Estimadas familias,',
            '',
            'El próximo sábado 28 de junio celebramos nuestra Fiesta de Verano en el jardín del centro.',
            'Habrá actuación musical en directo, merienda especial y juegos para todos.',
            '',
            'Las visitas ese día estarán abiertas de 11:00 a 19:00 sin restricción de aforo.',
            '',
            'Os esperamos a todos. ¡Será una tarde especial!',
          ].join('\n'),
          category:    AnnouncementCategory.GENERAL,
          audience:    AnnouncementAudience.TODO_EL_CENTRO,
          requiresAck: false,
        },
      });
    }

    // Segundo hilo de mensajería (si no existe ya más de 1)
    const existingThreads = await db.messageThread.count({ where: { tenantId: tenant.id } });
    if (existingThreads < 2) {
      const thread2 = await db.messageThread.create({
        data: {
          tenantId:      tenant.id,
          residentId:    comFamRes2.id,
          subject:       'Fotos de la excursión al mercado',
          category:      MessageThreadCategory.BIENESTAR,
          createdById:   comFam2.id,
          lastMessageAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      });

      await db.message.create({
        data: {
          tenantId:       tenant.id,
          threadId:       thread2.id,
          authorId:       comFam2.id,
          body:           '¿Tienen fotos de la excursión al mercado de la semana pasada? Mi madre me comentó que se lo pasó muy bien.',
          readByFamilyAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      });

      await db.message.create({
        data: {
          tenantId:      tenant.id,
          threadId:      thread2.id,
          authorId:      comDir2.id,
          body:          'Por supuesto. Le enviamos las fotos por email en las próximas horas. ¡Su madre estuvo estupenda! Se apuntó a todos los juegos del mercado.',
          readByStaffAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        },
      });

      await db.messageThread.update({
        where: { id: thread2.id },
        data:  { lastMessageAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
      });
    }

    console.log(`  Comunicación extra: +2 comunicados de centro (menú verano + fiesta) + 1 hilo adicional`);
  }

  // ---------------------------------------------------------------------------
  // Seed de AuditLog (entradas de ejemplo para /auditoria)
  // ---------------------------------------------------------------------------

  // audit_logs es APPEND-ONLY (no se puede borrar), así que la idempotencia se
  // logra con un guard de conteo: solo se siembran las entradas de ejemplo si la
  // tabla está vacía para este tenant (BD fresca de CI). En re-seeds locales no se
  // duplican. El seed no genera AuditLog por otras vías (escribe vía Prisma directo).
  {
    const auditCount = await db.auditLog.count({ where: { tenantId: tenant.id } });
    const auditDir = await db.user.findUnique({ where: { email: 'direccion@demo.vetlla.dev' } });
    const auditSan = await db.user.findUnique({ where: { email: 'sanitario@demo.vetlla.dev' } });
    const auditAux = await db.user.findUnique({ where: { email: 'auxiliar@demo.vetlla.dev' } });
    const auditRes = await db.resident.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { lastName: 'asc' },
    });

    if (auditCount === 0 && auditDir && auditSan && auditAux && auditRes) {
      const auditEntries = [
        {
          actorId:    auditSan.id,
          actorEmail: auditSan.email,
          action:     'RECORD',
          entity:     'MedicationAdministration',
          entityId:   auditRes.id,
          summary:    `Administración registrada: Paracetamol 1g — ${auditRes.firstName} ${auditRes.lastName} (08:00)`,
        },
        {
          actorId:    auditAux.id,
          actorEmail: auditAux.email,
          action:     'CREATE',
          entity:     'CareRecord',
          entityId:   auditRes.id,
          summary:    `Registro de atención directa: higiene completa — ${auditRes.firstName} ${auditRes.lastName}`,
        },
        {
          actorId:    auditDir.id,
          actorEmail: auditDir.email,
          action:     'ISSUE',
          entity:     'Invoice',
          entityId:   null,
          summary:    'Factura emitida: A-2026-2 (1.470,00 EUR)',
        },
        {
          actorId:    auditSan.id,
          actorEmail: auditSan.email,
          action:     'CREATE',
          entity:     'Assessment',
          entityId:   auditRes.id,
          summary:    `Escala Barthel registrada: 60 puntos — ${auditRes.firstName} ${auditRes.lastName}`,
        },
        {
          actorId:    auditDir.id,
          actorEmail: auditDir.email,
          action:     'ADMISSION_TRANSITION',
          entity:     'AdmissionRequest',
          entityId:   null,
          summary:    'Solicitud de admisión Ramón Soler Ibáñez: EVALUATION → OFFERED',
          metadata:   { from: 'EVALUATION', to: 'OFFERED' } as unknown as Prisma.InputJsonValue,
        },
        {
          actorId:    auditAux.id,
          actorEmail: auditAux.email,
          action:     'RECORD',
          entity:     'ActivityEnrollment',
          entityId:   null,
          summary:    `Asistencia registrada: asistió — Taller de memoria (${auditRes.firstName} ${auditRes.lastName})`,
        },
      ];

      for (const entry of auditEntries) {
        await db.auditLog.create({
          data: {
            tenantId:   tenant.id,
            actorId:    entry.actorId,
            actorEmail: entry.actorEmail,
            action:     entry.action,
            entity:     entry.entity,
            entityId:   entry.entityId ?? null,
            summary:    entry.summary,
            metadata:   entry.metadata ?? Prisma.DbNull,
            createdAt:  new Date(Date.now() - Math.floor(Math.random() * 3) * 24 * 60 * 60 * 1000),
          },
        });
      }

      console.log(`  AuditLog: ${auditEntries.length} entradas de ejemplo para /auditoria`);
    }
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
