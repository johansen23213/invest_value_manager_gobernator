/**
 * RESIDENT_DATA_TABLES — registro central de tablas con datos del residente.
 *
 * Propósito: hacer estructuralmente imposible olvidar declarar la política DSAR
 * para una tabla nueva. Si se añade un modelo con `residentId` al schema sin
 * registrarlo aquí, el test estático `dsar-coverage.test.ts` falla en CI (sin BD).
 *
 * Diseño elegido: registro-declarativo (no registro-como-fuente-de-verdad).
 * `exportResidentData` y `anonymizeResident` en dsar.ts siguen siendo la
 * implementación autoritativa. Este registro es una DECLARACIÓN de intención
 * que el test compara contra:
 *   (a) el schema.prisma (cobertura: tabla nueva → CI rojo)
 *   (b) el código de dsar.ts (alineación: tabla declarada → aparece en export/anonymize)
 *
 * Este diseño es el menos invasivo: evita refactorizar dsar.ts (que tiene tests
 * de integración funcionando) y cumple el objetivo de Marc: "tabla nueva con
 * residentId → CI rojo hasta decidir su política". Ver hallazgo H-2 del informe
 * de revisión 2026-06-12.
 *
 * Política de retención/anonimización (campo `anonymize`) es orientativa según
 * la legislación vigente. La política definitiva depende de Q-003 (Angel/CIO).
 * Mientras tanto, los valores reflejan el análisis del DPO de 2026-06-12.
 *
 * Cómo añadir una tabla nueva:
 *   1. Añade una entrada con el nombre del modelo Prisma (PascalCase).
 *   2. Decide si se exporta en el DSAR (art. 15) y cómo se anonimiza (art. 17).
 *   3. Actualiza exportResidentData / anonymizeResident en dsar.ts.
 *   4. CI pasa de rojo a verde.
 */

export type DsarAnonymizePolicy =
  | 'delete'    // eliminar la fila completa
  | 'scrub'     // conservar la fila pero limpiar PII (nullify campos identificativos)
  | 'keep';     // conservar sin cambios (p. ej. datos ya anonimizados / derivados)

export interface DsarTableEntry {
  /** Nombre del modelo Prisma (PascalCase), tal como aparece en schema.prisma. */
  model: string;
  /** true → se incluye en el export art. 15 (exportResidentData). */
  export: boolean;
  /**
   * Política de anonimización art. 17 (anonymizeResident):
   *   - 'delete'  → fila eliminada incondicionalmente (o según política clínica)
   *   - 'scrub'   → campos PII de terceros limpiados siempre; el registro persiste
   *   - 'keep'    → no se toca (datos derivados / sin PII directa / obligación legal)
   */
  anonymize: DsarAnonymizePolicy;
  /** Razón breve para la política elegida. */
  reason: string;
}

/**
 * Registro canónico de tablas con campo `residentId` y su política DSAR.
 *
 * Modelos con residentId opcional (p. ej. Announcement.residentId?) también se
 * listan: cuando el campo está presente, el registro del residente aplica.
 */
export const RESIDENT_DATA_TABLES: DsarTableEntry[] = [
  // Tablas de vínculo y contacto
  {
    model:     'FamilyLink',
    export:    true,
    anonymize: 'delete',
    reason:    'Vínculo con familiar: PII de tercero; se borra en anonimización.',
  },
  {
    model:     'EmergencyContact',
    export:    true,
    anonymize: 'delete',
    reason:    'Contacto de emergencia: PII de tercero; se borra en anonimización.',
  },

  // Expediente clínico base
  {
    model:     'Allergy',
    export:    true,
    anonymize: 'delete',
    reason:    'Dato de salud (art. 9); se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'Diagnosis',
    export:    true,
    anonymize: 'delete',
    reason:    'Dato de salud (art. 9); se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'Treatment',
    export:    true,
    anonymize: 'delete',
    reason:    'Dato de salud; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'Assessment',
    export:    true,
    anonymize: 'delete',
    reason:    'Valoración clínica (Barthel/Tinetti); se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'CareRecord',
    export:    true,
    anonymize: 'delete',
    reason:    'Registro de atención directa; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'Medication',
    export:    true,
    anonymize: 'delete',
    reason:    'Prescripción farmacológica; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'MedicationAdministration',
    export:    true,
    anonymize: 'delete',
    reason:    'MAR: administración de medicación; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'CarePlan',
    export:    true,
    anonymize: 'delete',
    reason:    'Plan de atención individualizado; se elimina si keepClinicalRecords=false.',
  },

  // Fase 1 — Expediente ampliado
  {
    model:     'ResidentDevice',
    export:    true,
    anonymize: 'delete',
    reason:    'Dispositivo del residente; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'Vaccine',
    export:    true,
    anonymize: 'delete',
    reason:    'Historial vacunal; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'WeightRecord',
    export:    true,
    anonymize: 'delete',
    reason:    'Registro de peso; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'PressureUlcer',
    export:    true,
    anonymize: 'delete',
    reason:    'UPP: dato de salud categoría especial; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'FallRecord',
    export:    true,
    anonymize: 'delete',
    reason:    'Caída: evento clínico; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'Restraint',
    export:    true,
    anonymize: 'delete',
    reason:    'Contención: dato de salud; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'ConsentRecord',
    export:    true,
    anonymize: 'scrub',
    reason:    'Consentimiento: siempre se limpia grantedBy (PII de tercero firmante); fila se borra si keepClinicalRecords=false.',
  },
  {
    model:     'LifeStory',
    export:    true,
    anonymize: 'delete',
    reason:    'Historia de vida: art. 9 (religion) + PII de terceros (importantPeople). DELETE siempre.',
  },

  // Portal de familias
  {
    model:     'ServiceRequest',
    export:    true,
    anonymize: 'delete',
    reason:    'Solicitud del portal; se elimina si keepClinicalRecords=false.',
  },
  {
    model:     'Visit',
    export:    true,
    anonymize: 'scrub',
    reason:    'Visita: siempre se limpian visitorNames (PII de terceros visitantes). Fila se borra si keepClinicalRecords=false.',
  },
  {
    model:     'MessageThread',
    export:    true,
    anonymize: 'delete',
    reason:    'Hilo de mensajería; se elimina si keepClinicalRecords=false.',
  },

  // Comunicados con residentId opcional (comunicado personal)
  {
    model:     'Announcement',
    export:    false,
    anonymize: 'keep',
    reason:    'Comunicado de centro: residentId opcional (audiencia específica). El comunicado es del centro, no del residente. No se exporta individualmente (el center lo retiene). Exclusión explícita.',
  },

  // Épica A — Documentación clínica estructurada
  {
    model:     'NursingNote',
    export:    true,
    anonymize: 'delete',
    reason:    'Nota de enfermería por turno: dato de salud (art. 9 RGPD). Contiene observaciones del residente firmadas por enfermería. Se exporta en DSAR art.15 y se borra en anonimización si !keepClinicalRecords.',
  },
  {
    model:     'MedicalNote',
    export:    true,
    anonymize: 'delete',
    reason:    'Evolutivo médico: dato de salud de categoría especial (art. 9 RGPD). Staff-only por diseño (RF-CLI-010). Se exporta en DSAR art.15 (el interesado tiene derecho a acceder a su historia clínica) y se borra si !keepClinicalRecords.',
  },

  // Épica C — Nutrición: registro de ingesta estructurado
  {
    model:     'IntakeRecord',
    export:    true,
    anonymize: 'delete',
    reason:    'Registro de ingesta por comida: dato de salud nutricional (art. 9 RGPD). ' +
               'Contiene foodPct, hydrationMl y notas del residente. ' +
               'Se exporta en DSAR art.15 (historial nutricional del interesado) y se borra ' +
               'en anonimización si !keepClinicalRecords. ' +
               'MenuItem NO tiene residentId y no entra en este registro.',
  },

  // Facturación (RF-ECO-001..005) — datos económicos del residente/pagador
  {
    model:     'ResidentBillingProfile',
    export:    true,
    anonymize: 'scrub',
    reason:    'Perfil de facturación: tarifa asignada, copago público/privado, datos del pagador (payerName, sepaMandate). ' +
               'Dato económico personal del interesado (art. 15 RGPD: derecho de acceso). ' +
               'Se exporta. En anonimización: scrub de payerName → null y sepaMandate → null ' +
               '(PII del pagador — puede ser tercero). La fila se conserva por ' +
               'OBLIGACIÓN LEGAL CONTABLE/FISCAL: art. 30 Cód. Comercio (6 años) y ' +
               'art. 70.3 LGT (4 años). Base: art. 17.3.b RGPD limita derecho de supresión.',
  },
  {
    model:     'Invoice',
    export:    true,
    anonymize: 'scrub',
    reason:    'Factura emitida por el centro al residente/pagador. ' +
               'Dato económico personal (art. 15 RGPD). Se exporta (historial de facturación). ' +
               'En anonimización: scrub de payerName → null (PII del pagador). ' +
               'CONSERVAR POR OBLIGACIÓN LEGAL CONTABLE/FISCAL: art. 30 Cód. Comercio ' +
               '(6 años) y art. 70.3 LGT (4 años). Base: art. 17.3.b RGPD. ' +
               'Las líneas (InvoiceLine) heredan el cascade de Invoice.',
  },

  // Épica B — Exitus/Baja, Informe Social, Perfil de Bienestar ACP
  {
    model:     'DischargeRecord',
    export:    true,
    anonymize: 'scrub',
    reason:    'Registro de baja: contiene fecha y tipo de baja (incluyendo DEFUNCION). Se exporta en DSAR art.15. En anonimización: scrub de reason/notes/certifiedBy/destination (PII); la fila se conserva para trazabilidad administrativa (no tiene cobertura de retención sanitaria estricta pero sí obligación legal de registro de bajas). Si !keepClinicalRecords se borra.',
  },
  {
    model:     'SocialReport',
    export:    true,
    anonymize: 'delete',
    reason:    'Informe social: contiene situación familiar, económica, red de apoyo — datos personales de categoría especial art. 9 RGPD (información socioeconómica sensible). Se exporta en DSAR art.15. Se borra en anonimización (no tiene base de retención sanitaria obligatoria).',
  },
  {
    model:     'WellbeingProfile',
    export:    true,
    anonymize: 'delete',
    reason:    'Perfil de bienestar ACP (UNE 158101): contiene preferencias personales, autodeterminación, relaciones. Datos personales de la persona. Se exporta en DSAR art.15. Se borra en anonimización.',
  },

  // ---------------------------------------------------------------------------
  // Diagnósticos con estado (extensión del modelo Diagnosis existente)
  //
  // El modelo Diagnosis ya estaba declarado arriba (expediente clínico base).
  // No se añade una entrada duplicada: los campos nuevos (type, status,
  // resolvedAt, prescribedById, notes) son parte del mismo modelo.
  // La política existente (export:true, anonymize:'delete') ya los cubre.
  //
  // AssistiveDevice: ayuda técnica / producto de apoyo del residente.
  //   Dato de salud (necesidades funcionales — art. 9 RGPD): export art.15.
  //   En anonimización: delete si !keepClinicalRecords (es historial clínico).
  // ---------------------------------------------------------------------------
  {
    model:     'AssistiveDevice',
    export:    true,
    anonymize: 'delete',
    reason:    'Ayuda técnica del residente (silla de ruedas, andador, grúa…): ' +
               'dato de salud funcional (art. 9 RGPD). Se exporta en DSAR art.15. ' +
               'Se borra en anonimización si !keepClinicalRecords.',
  },

  // ---------------------------------------------------------------------------
  // Actividades (animación sociocultural / terapia ocupacional)
  //
  // ActivityEnrollment: inscripción y asistencia de un residente a una sesión.
  //   Contiene participación, preferencias de ocio y estado de ánimo (observation).
  //   Es dato personal del residente → export art.15 + anonymize art.17.
  //   'delete': desvincula al residente de la actividad. La sesión (Activity,
  //   ActivitySession) no tiene residentId y no entra en este registro.
  // ---------------------------------------------------------------------------
  {
    model:     'ActivityEnrollment',
    export:    true,
    anonymize: 'delete',
    reason:    'Inscripción y asistencia del residente a actividades: participación y estado de ánimo (observation) son datos personales. Export art.15; delete en anonimización (desvincula al residente).',
  },

  // ---------------------------------------------------------------------------
  // Inventario / Almacén / Lavandería / Pertenencias del residente
  //
  // InventoryItem / InventoryMovement: son stock del CENTRO (sin residentId).
  //   No se declaran aquí: no tienen datos personales del residente.
  //
  // ResidentBelonging: pertenencias personales del residente (ropa, calzado,
  //   joyería, documentos…). La ropa marcada para lavandería también se modela
  //   aquí (status = EN_LAVANDERIA).
  //
  //   Política DSAR:
  //     export:true  — el interesado tiene derecho a ver el registro de sus
  //                    pertenencias (art. 15 RGPD: datos que le conciernen).
  //     anonymize:'delete' — las pertenencias personales NO son registro clínico.
  //                    No existe obligación legal de conservación sanitaria para
  //                    este dato. Al suprimir el residente, las pertenencias se
  //                    devuelven a la familia o se registra la devolución en el
  //                    expediente de baja (DischargeRecord.belongingsReturned).
  //                    La fila en resident_belongings se borra: no hay interés
  //                    legítimo de conservación del centro (art. 17.3.b RGPD no
  //                    aplica — no es dato fiscal ni sanitario obligatorio).
  //                    Razón para no usar 'scrub': no hay campos PII de terceros
  //                    en esta tabla (description/label son del objeto, no de personas).
  // ---------------------------------------------------------------------------
  {
    model:     'ResidentBelonging',
    export:    true,
    anonymize: 'delete',
    reason:    'Pertenencias personales del residente (ropa, calzado, joyería, documentos, ropa en lavandería). ' +
               'Dato personal del interesado: export art.15 (tiene derecho a ver el inventario de sus pertenencias). ' +
               'En anonimización: delete (no es registro clínico ni sanitario; no hay obligación de conservación. ' +
               'Las pertenencias se devuelven/documentan en DischargeRecord.belongingsReturned antes de la supresión).',
  },

  // ---------------------------------------------------------------------------
  // Admisión / Preadmisión (RF-ADM-001..010)
  //
  // Política DSAR de AdmissionRequest:
  //   La tabla contiene datos personales del CANDIDATO (nombre, fecha nac.,
  //   contacto) que aún no es Resident (residentId es null hasta ADMITTED).
  //
  //   Base jurídica: interés legítimo (art. 6.1.f RGPD) durante el proceso.
  //
  //   Cuando pasa a ADMITTED:
  //     - Se crea un Resident y residentId se rellena.
  //     - Los datos del sujeto fluyen al expediente del Resident (que tiene
  //       export:true y anonymize:'delete').
  //     - La solicitud de admisión se exporta junto con el expediente del
  //       residente (art. 15): el interesado puede ver su historial de admisión.
  //
  //   Cuando es REJECTED o WITHDRAWN (candidato no admitido):
  //     - No hay residentId → el flujo DSAR automatizado de residentes
  //       no alcanza esta tabla directamente.
  //     - La política de retención y purga definitiva se define en Q-003 (CIO).
  //     - Por ahora: se incluye en la exportación si el interesado solicita
  //       acceso a sus datos (el ejercicio de derechos se gestiona por el
  //       canal del DPO del centro, no por el portal de familias).
  //
  //   Decisión de anonimización:
  //     - scrub: cuando el residente es suprimido, se limpian los datos PII
  //       del candidato (nombre, contacto) de la solicitud. Se conserva la
  //       fila para trazabilidad del proceso de admisión (interés legítimo
  //       del centro). La FK residentId pasa a null por ON DELETE SET NULL.
  //     - Si el candidato nunca fue admitido (REJECTED/WITHDRAWN), la purga
  //       la gestiona la política de retención de Q-003 (fuera del flujo
  //       automatizado de anonymizeResident).
  // ---------------------------------------------------------------------------
  {
    model:     'AdmissionRequest',
    export:    true,
    anonymize: 'scrub',
    reason:    'Solicitud de admisión/preadmisión: contiene datos personales del candidato (nombre, ' +
               'fecha nac., contacto). Cuando es ADMITTED, el residentId vincula al Resident y la ' +
               'solicitud se exporta en el DSAR del residente (art. 15). En anonimización: scrub de ' +
               'firstName/lastName/birthDate/contactPhone/contactEmail/contactName → null. La fila se ' +
               'conserva para trazabilidad del proceso de admisión. Candidatos NO admitidos: purga según ' +
               'Q-003 (política de retención de interés legítimo, pendiente CIO).',
  },
];

/** Lookup rápido por nombre de modelo. */
export const RESIDENT_DATA_TABLE_MAP = new Map<string, DsarTableEntry>(
  RESIDENT_DATA_TABLES.map((e) => [e.model, e]),
);
