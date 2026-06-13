// DSAR — Derechos del interesado (RGPD): acceso/portabilidad (art. 15/20) y
// supresión (art. 17) sobre el expediente de un residente.
//
// Principios:
//  - El export devuelve TODO lo que el sistema guarda del residente, acotado
//    por RLS al tenant, con un hash SHA-256 para integridad del fichero.
//  - La supresión es ANONIMIZACIÓN, no borrado físico: los datos clínicos
//    pueden estar sujetos a obligaciones legales de conservación sanitaria
//    (art. 17.3.b RGPD) y el AuditLog es inmutable por diseño (trazabilidad).
//    Qué se conserva exactamente lo parametriza `AnonymizePolicy` — la política
//    concreta de retención es decisión de negocio/legal (Q-003, pendiente de
//    Angel); el mecanismo no espera a esa decisión.
//
// CHANGELOG:
//  - v2 (2026-06-12, CRÍTICO-01): añadidas todas las tablas de Fase 1 y del
//    portal (ResidentDevice, Vaccine, WeightRecord, PressureUlcer+UPPCuring,
//    FallRecord, Restraint, ConsentRecord, LifeStory, ServiceRequest+comments,
//    Visit, MessageThread+Message). Los comentarios internos de staff (internal=true)
//    SE INCLUYEN en el export art.15: son datos personales del interesado (reflejan
//    valoraciones del staff sobre él/ella) y el derecho de acceso del RGPD los cubre.
//    Ref.: GT29 WP260 rev.01 §3.3 y AEPD "Guía para el cumplimiento del deber de
//    informar" (2021). La versión del JSON sube de 1 a 2.
//  - v2 (2026-06-12, CRÍTICO-02): anonymizeResident borra ahora todas las tablas
//    nuevas en la rama keepClinicalRecords=false, y SIEMPRE (independientemente de
//    la política) limpia los campos con PII de terceros:
//      · ConsentRecord.grantedBy → null  (nombre del firmante; tercero)
//      · LifeStory → DELETE completo     (100% datos personales/categoría especial
//        art. 9: religion; datos de terceros: importantPeople. DELETE es más seguro
//        que nullificar campo a campo porque evita fugas si se añaden campos nuevos)
//      · Visit.visitorNames → []         (nombres de visitantes; terceros no usuarios)

import type { TenantPrisma } from './rls';

// Web Crypto (no node:crypto): este módulo se re-exporta desde el index del
// paquete y los componentes cliente importan tipos/enums de '@vetlla/db' — un
// import de node:crypto a nivel de módulo rompería el bundle del navegador.
async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Política de supresión (art. 17). Los defaults son CONSERVADORES. */
export interface AnonymizePolicy {
  /**
   * Conservar los registros clínicos (atención, MAR, PIA, valoraciones)
   * vinculados al residente ya anonimizado. Default true: la legislación
   * sanitaria española exige conservar la historia clínica (años según CCAA);
   * se elimina la identificación directa, no el dato clínico.
   */
  keepClinicalRecords: boolean;
}

export const DEFAULT_ANONYMIZE_POLICY: AnonymizePolicy = {
  keepClinicalRecords: true,
};

/** Export completo del expediente (art. 15). El shape es estable y versionado. */
export interface ResidentExport {
  format: 'vetlla-dsar-export';
  version: 3;
  generatedAt: string;
  tenantId: string;
  resident: unknown;
  careRecords: unknown[];
  medications: unknown[];
  administrations: unknown[];
  treatments: unknown[];
  carePlans: unknown[];
  auditTrail: unknown[];
  // v2: tablas Fase 1 y portal
  devices: unknown[];
  vaccines: unknown[];
  weights: unknown[];
  pressureUlcers: unknown[];
  falls: unknown[];
  restraints: unknown[];
  consents: unknown[];
  lifeStory: unknown | null;
  serviceRequests: unknown[];
  visits: unknown[];
  messageThreads: unknown[];
  // v3: documentación clínica (Épica A)
  nursingNotes: unknown[];
  medicalNotes: unknown[];
}

export interface ResidentExportResult {
  data: ResidentExport;
  /** SHA-256 del JSON canónico (integridad del fichero entregado). */
  sha256: string;
}

/**
 * Recopila todos los datos del residente (art. 15). `db` debe estar acotado al
 * tenant (RLS): es imposible exportar residentes de otro tenant.
 */
export async function exportResidentData(
  db: TenantPrisma,
  tenantId: string,
  residentId: string,
): Promise<ResidentExportResult> {
  const resident = await db.resident.findUnique({
    where: { id: residentId },
    include: {
      contacts: true,
      allergies: true,
      diagnoses: true,
      assessments: true,
      familyLinks: true,
      bed: { select: { id: true, code: true } },
      center: { select: { id: true, name: true, type: true } },
    },
  });
  if (!resident) {
    throw new Error(`Residente ${residentId} no encontrado en el tenant.`);
  }

  const [
    careRecords,
    medications,
    administrations,
    treatments,
    carePlans,
    auditTrail,
    devices,
    vaccines,
    weights,
    pressureUlcers,
    falls,
    restraints,
    consents,
    lifeStory,
    serviceRequests,
    visits,
    messageThreads,
    nursingNotes,
    medicalNotes,
  ] = await Promise.all([
    db.careRecord.findMany({ where: { residentId }, orderBy: { recordedAt: 'asc' } }),
    db.medication.findMany({ where: { residentId }, orderBy: { createdAt: 'asc' } }),
    db.medicationAdministration.findMany({
      where: { residentId },
      orderBy: { scheduledAt: 'asc' },
    }),
    db.treatment.findMany({ where: { residentId }, orderBy: { createdAt: 'asc' } }),
    db.carePlan.findMany({
      where: { residentId },
      include: { goals: true, reviews: true },
      orderBy: { createdAt: 'asc' },
    }),
    // Trazas de auditoría cuyo sujeto es el residente.
    db.auditLog.findMany({ where: { entityId: residentId }, orderBy: { createdAt: 'asc' } }),
    // v2: Fase 1
    db.residentDevice.findMany({ where: { residentId }, orderBy: { createdAt: 'asc' } }),
    db.vaccine.findMany({ where: { residentId }, orderBy: { date: 'asc' } }),
    db.weightRecord.findMany({ where: { residentId }, orderBy: { recordedAt: 'asc' } }),
    db.pressureUlcer.findMany({
      where: { residentId },
      include: { curings: true },
      orderBy: { onsetDate: 'asc' },
    }),
    db.fallRecord.findMany({ where: { residentId }, orderBy: { occurredAt: 'asc' } }),
    db.restraint.findMany({ where: { residentId }, orderBy: { prescribedAt: 'asc' } }),
    db.consentRecord.findMany({ where: { residentId }, orderBy: { date: 'asc' } }),
    db.lifeStory.findUnique({ where: { residentId } }),
    // v2: Portal — los comentarios internos SE INCLUYEN (art. 15: el interesado tiene
    // derecho a acceder a todos sus datos, incluyendo valoraciones del staff sobre él).
    db.serviceRequest.findMany({
      where: { residentId },
      include: { comments: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.visit.findMany({ where: { residentId }, orderBy: { scheduledAt: 'asc' } }),
    db.messageThread.findMany({
      where: { residentId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    // v3: Épica A — documentación clínica (RF-CLI-010: staff-only, pero el
    // interesado tiene derecho de acceso art. 15 a su propia historia clínica).
    db.nursingNote.findMany({
      where: { residentId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { noteDate: 'asc' },
    }),
    db.medicalNote.findMany({
      where: { residentId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { noteDate: 'asc' },
    }),
  ]);

  const data: ResidentExport = {
    format: 'vetlla-dsar-export',
    version: 3,
    generatedAt: new Date().toISOString(),
    tenantId,
    resident,
    careRecords,
    medications,
    administrations,
    treatments,
    carePlans,
    auditTrail,
    devices,
    vaccines,
    weights,
    pressureUlcers,
    falls,
    restraints,
    consents,
    lifeStory,
    serviceRequests,
    visits,
    messageThreads,
    nursingNotes,
    medicalNotes,
  };

  const sha256 = await sha256Hex(JSON.stringify(data));
  return { data, sha256 };
}

export interface AnonymizeResult {
  residentId: string;
  /** Pseudónimo asignado (visible donde antes estaba el nombre). */
  pseudonym: string;
  contactsDeleted: number;
  familyLinksDeleted: number;
  clinicalRecordsKept: boolean;
}

/**
 * Anonimiza al residente (art. 17): elimina la identificación directa y los
 * vínculos con terceros; conserva (o no, según política) los datos clínicos
 * ya disociados. El AuditLog NO se toca (inmutable; obligación de trazabilidad).
 */
export async function anonymizeResident(
  db: TenantPrisma,
  tenantId: string,
  residentId: string,
  policy: AnonymizePolicy = DEFAULT_ANONYMIZE_POLICY,
): Promise<AnonymizeResult> {
  const resident = await db.resident.findUnique({ where: { id: residentId } });
  if (!resident) {
    throw new Error(`Residente ${residentId} no encontrado en el tenant.`);
  }

  // Pseudónimo estable y no reversible (no derivado de los datos personales).
  const pseudonym = `R-${(await sha256Hex(`${tenantId}:${residentId}`)).slice(0, 8).toUpperCase()}`;

  // 1) Identificación directa fuera.
  await db.resident.update({
    where: { id: residentId },
    data: {
      firstName: 'Anonimizado',
      lastName: pseudonym,
      nationalId: null,
      birthDate: null,
      notes: null,
      status: 'BAJA',
      bedId: null, // libera la plaza
    },
  });

  // 2) Datos de terceros vinculados al residente: se borran.
  const contacts = await db.emergencyContact.deleteMany({ where: { residentId } });
  const links = await db.familyLink.deleteMany({ where: { residentId } });

  // 3) PII de terceros INDEPENDIENTE de la política de conservación clínica.
  //    Estos datos afectan a personas físicas distintas del residente y no tienen
  //    cobertura de retención sanitaria; se limpian siempre (art. 17 RGPD).
  //
  //    · ConsentRecord.grantedBy: nombre de quien firmó. Es PII de un tercero
  //      (representante legal, familiar). Se pone a null para mantener la traza
  //      del consentimiento (tipo, fecha, decisión) sin identificar al firmante.
  //
  //    · LifeStory: DELETE completo. Contiene datos de categoría especial (religion
  //      — art. 9 RGPD) e identificación de terceros (importantPeople). Borrar la
  //      fila es más seguro que nullificar campo a campo: garantiza limpieza aunque
  //      se añadan campos nuevos en el futuro. La historia de vida NO tiene base de
  //      retención sanitaria obligatoria.
  //
  //    · Visit.visitorNames: nombres de visitantes (terceros no usuarios del sistema).
  //      Se sobrescriben con [] para conservar la traza de visita (fecha, estado)
  //      sin los datos de identidad de los acompañantes.
  await db.consentRecord.updateMany({
    where: { residentId },
    data: { grantedBy: null },
  });
  await db.lifeStory.deleteMany({ where: { residentId } });
  await db.visit.updateMany({
    where: { residentId },
    data: { visitorNames: [] },
  });

  // 4) Datos clínicos: según política (default conservar, ya disociados).
  if (!policy.keepClinicalRecords) {
    // El orden respeta las FKs (hijos antes que padres).
    await db.medicationSyncConflict.deleteMany({
      where: { administration: { residentId } },
    });
    await db.medicationAdministration.deleteMany({ where: { residentId } });
    await db.medication.deleteMany({ where: { residentId } });
    await db.treatment.deleteMany({ where: { residentId } });
    await db.syncConflict.deleteMany({ where: { careRecord: { residentId } } });
    await db.careRecord.deleteMany({ where: { residentId } });
    await db.carePlanReview.deleteMany({ where: { carePlan: { residentId } } });
    await db.carePlanGoal.deleteMany({ where: { carePlan: { residentId } } });
    await db.carePlan.deleteMany({ where: { residentId } });
    await db.assessment.deleteMany({ where: { residentId } });
    await db.diagnosis.deleteMany({ where: { residentId } });
    await db.allergy.deleteMany({ where: { residentId } });
    // Fase 1 — tablas nuevas (orden respeta FKs):
    await db.uPPCuring.deleteMany({ where: { pressureUlcer: { residentId } } });
    await db.pressureUlcer.deleteMany({ where: { residentId } });
    await db.restraint.deleteMany({ where: { residentId } });
    await db.fallRecord.deleteMany({ where: { residentId } });
    await db.weightRecord.deleteMany({ where: { residentId } });
    await db.vaccine.deleteMany({ where: { residentId } });
    await db.residentDevice.deleteMany({ where: { residentId } });
    // ConsentRecord: el grantedBy ya fue limpiado arriba; el delete completo
    // aplica solo si !keepClinicalRecords (los consentimientos son historial clínico).
    await db.consentRecord.deleteMany({ where: { residentId } });
    // Portal:
    await db.serviceRequestComment.deleteMany({
      where: { request: { residentId } },
    });
    await db.serviceRequest.deleteMany({ where: { residentId } });
    await db.message.deleteMany({ where: { thread: { residentId } } });
    await db.messageThread.deleteMany({ where: { residentId } });
    // Visit: la traza de visita (sin visitorNames ya limpiado) se borra también.
    await db.visit.deleteMany({ where: { residentId } });
    // Épica A — documentación clínica (v3):
    await db.nursingNote.deleteMany({ where: { residentId } });
    await db.medicalNote.deleteMany({ where: { residentId } });
  }

  return {
    residentId,
    pseudonym,
    contactsDeleted: contacts.count,
    familyLinksDeleted: links.count,
    clinicalRecordsKept: policy.keepClinicalRecords,
  };
}
