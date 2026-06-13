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
];

/** Lookup rápido por nombre de modelo. */
export const RESIDENT_DATA_TABLE_MAP = new Map<string, DsarTableEntry>(
  RESIDENT_DATA_TABLES.map((e) => [e.model, e]),
);
