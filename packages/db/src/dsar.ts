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
//  - v4 (2026-06-13, Épica B): añadidas DischargeRecord, SocialReport, WellbeingProfile.
//    · DischargeRecord: export:true, anonymize:'scrub' (ver dsar-registry.ts).
//      En keepClinicalRecords=false: scrub de campos PII + DELETE de la fila.
//    · SocialReport: export:true, anonymize:'delete'.
//    · WellbeingProfile: export:true, anonymize:'delete'.
//    La versión del JSON sube de 3 a 4.
//  - v5 (2026-06-13, Épica C): añadida IntakeRecord (registro de ingesta estructurado).
//    · Dato de salud nutricional (art. 9 RGPD): export:true, anonymize:'delete'.
//    · MenuItem NO tiene residentId; no se exporta individualmente (es dato del centro).
//    La versión del JSON sube de 4 a 5.
//  - v7 (2026-06-14, Admisión/Preadmisión): añadida AdmissionRequest (solicitud de
//    ingreso/preadmisión). export:true, anonymize:'scrub' (PII del candidato limpiada,
//    fila conservada para trazabilidad del proceso).
//    La versión del JSON sube de 6 a 7.
//  - v8 (2026-06-14, Actividades): añadida ActivityEnrollment (inscripción y asistencia
//    a actividades). export:true, anonymize:'delete' (dato personal: participación,
//    observación del estado de ánimo). La versión del JSON sube de 7 a 8.
//  - v9 (2026-06-14, Diagnósticos+AyudasTécnicas): añadida AssistiveDevice (ayuda
//    técnica / producto de apoyo). export:true, anonymize:'delete' si !keepClinical.
//    El modelo Diagnosis ya estaba declarado; sus campos nuevos (type, status,
//    resolvedAt, notes) no necesitan cambio en el export (ya se serializa el objeto
//    completo). La versión del JSON sube de 8 a 9.
//  - v10 (2026-06-14, Inventario/Lavandería/Pertenencias): añadida ResidentBelonging.
//    export:true (el interesado tiene derecho a ver el registro de sus pertenencias,
//    art. 15 RGPD). anonymize:'delete' (no es registro clínico, sin obligación de
//    conservación sanitaria). InventoryItem / InventoryMovement no tienen residentId
//    y no se exportan individualmente (son datos del centro).
//    La versión del JSON sube de 9 a 10.

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
  version: 10;
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
  // v4: Épica B — exitus/baja, informe social, perfil de bienestar ACP
  dischargeRecords: unknown[];
  socialReports: unknown[];
  wellbeingProfile: unknown | null;
  // v5: Épica C — nutrición (registros de ingesta estructurados)
  intakeRecords: unknown[];
  // v6: Facturación (RF-ECO-001..005) — datos económicos del interesado
  billingProfile: unknown | null;
  invoices: unknown[];
  // v7: Admisión/Preadmisión (RF-ADM-001..010) — historial del proceso de admisión
  admissionRequests: unknown[];
  // v8: Actividades (animación sociocultural / terapia ocupacional)
  activityEnrollments: unknown[];
  // v9: Diagnósticos con estado + Ayudas técnicas (productos de apoyo)
  // Nota: diagnoses ya estaba en v1 (expediente clínico base); sus nuevos
  // campos (type, status, resolvedAt, notes) se serializan automáticamente
  // porque el include trae el objeto completo.
  assistiveDevices: unknown[];
  // v10: Inventario / Lavandería / Pertenencias del residente
  // InventoryItem/InventoryMovement son datos del CENTRO y no se exportan aquí.
  // ResidentBelonging: el interesado tiene derecho a ver el registro de sus pertenencias.
  belongings: unknown[];
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
    dischargeRecords,
    socialReports,
    wellbeingProfile,
    intakeRecords,
    billingProfile,
    invoices,
    admissionRequests,
    activityEnrollments,
    assistiveDevices,
    belongings,
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
    // v4: Épica B — exitus/baja, informe social, perfil de bienestar ACP.
    // DischargeRecord: export art.15 (el interesado tiene derecho a conocer su
    // historial de bajas). SocialReport y WellbeingProfile: datos personales del
    // interesado — derecho de acceso art.15 RGPD.
    db.dischargeRecord.findMany({
      where:   { residentId },
      orderBy: { dischargedAt: 'asc' },
    }),
    db.socialReport.findMany({
      where:   { residentId },
      orderBy: { reportDate: 'asc' },
    }),
    db.wellbeingProfile.findUnique({ where: { residentId } }),
    // v5: Épica C — registros de ingesta estructurada (dato de salud nutricional).
    db.intakeRecord.findMany({ where: { residentId }, orderBy: { date: 'asc' } }),
    // v6: Facturación (RF-ECO-001..005) — datos económicos del interesado art.15.
    db.residentBillingProfile.findUnique({
      where: { residentId },
      include: { tariff: { select: { id: true, code: true, name: true } } },
    }),
    db.invoice.findMany({
      where:   { residentId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    // v7: Admisión/Preadmisión (RF-ADM-001..010) — historial del proceso de
    // admisión que derivó en este residente. El interesado tiene derecho a
    // acceder a los datos de su solicitud de ingreso (art. 15 RGPD).
    db.admissionRequest.findMany({
      where:   { residentId },
      orderBy: { requestedAt: 'asc' },
    }),
    // v8: Actividades — inscripciones y asistencia del residente.
    // Participación en actividades y estado de ánimo son datos personales (art. 15).
    db.activityEnrollment.findMany({
      where:   { residentId },
      include: { session: { select: { id: true, startsAt: true, endsAt: true, activityId: true } } },
      orderBy: { enrolledAt: 'asc' },
    }),
    // v9: Ayudas técnicas (productos de apoyo). Datos de salud funcional (art. 9).
    db.assistiveDevice.findMany({ where: { residentId }, orderBy: { prescribedAt: 'asc' } }),
    // v10: Pertenencias personales del residente (ropa, calzado, joyería, lavandería…).
    // El interesado tiene derecho a ver el registro de sus pertenencias (art. 15 RGPD).
    db.residentBelonging.findMany({ where: { residentId }, orderBy: { registeredAt: 'asc' } }),
  ]);

  const data: ResidentExport = {
    format: 'vetlla-dsar-export',
    version: 10,
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
    dischargeRecords,
    socialReports,
    wellbeingProfile,
    intakeRecords,
    billingProfile,
    invoices,
    admissionRequests,
    activityEnrollments,
    assistiveDevices,
    belongings,
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
    // Épica B — exitus/baja, informe social, perfil de bienestar ACP (v4):
    // DischargeRecord: política 'scrub' → borramos la fila completa en este caso
    // porque !keepClinicalRecords implica limpieza total.
    await db.dischargeRecord.deleteMany({ where: { residentId } });
    await db.socialReport.deleteMany({ where: { residentId } });
    await db.wellbeingProfile.deleteMany({ where: { residentId } });
    // Épica C — registros de ingesta (v5, dato de salud nutricional):
    await db.intakeRecord.deleteMany({ where: { residentId } });
    // Actividades (v8, animación sociocultural / terapia ocupacional):
    await db.activityEnrollment.deleteMany({ where: { residentId } });
    // Ayudas técnicas (v9, productos de apoyo):
    await db.assistiveDevice.deleteMany({ where: { residentId } });
    // Pertenencias del residente (v10, inventario/lavandería):
    // No es registro clínico; se borra siempre en purga total (no keepClinicalRecords).
    await db.residentBelonging.deleteMany({ where: { residentId } });
  }

  // Admisión/Preadmisión (v7, RF-ADM-001..010) — política 'scrub' SIEMPRE:
  //   Las solicitudes de admisión del residente se conservan para trazabilidad
  //   del proceso (interés legítimo del centro), pero se limpian los PII del
  //   candidato: nombre, fecha nac., contacto. El estado, fechas del proceso y
  //   notas clínicas del proceso se conservan. La FK residentId se mantiene
  //   (ON DELETE SET NULL garantiza que si el Resident se borra, pasa a null
  //   automáticamente — aquí el residente existe pero anonimizado).
  await db.admissionRequest.updateMany({
    where: { residentId },
    data: {
      firstName:    'Anonimizado',
      lastName:     'XXXX',
      birthDate:    null,
      contactPhone: null,
      contactEmail: null,
      contactName:  null,
    },
  });

  // Facturación (v6, RF-ECO-001..005) — política 'scrub' SIEMPRE:
  //   Las facturas se CONSERVAN por obligación legal contable/fiscal
  //   (art. 30 Cód. Comercio: 6 años; art. 70.3 LGT: 4 años).
  //   Base legal: art. 17.3.b RGPD. Solo se anonimiza el campo payerName
  //   (PII del pagador) y sepaMandate (referencia de mandato).
  await db.residentBillingProfile.updateMany({
    where: { residentId },
    data: { sepaMandate: null, payerName: null },
  });
  await db.invoice.updateMany({
    where: { residentId },
    data: { payerName: null },
  });

  return {
    residentId,
    pseudonym,
    contactsDeleted: contacts.count,
    familyLinksDeleted: links.count,
    clinicalRecordsKept: policy.keepClinicalRecords,
  };
}
