// Etiquetas en español para los enums del dominio (i18n completo llega en H6).

export const CENTER_TYPE_LABELS: Record<string, string> = {
  RESIDENCIA: 'Residencia',
  CENTRO_DIA: 'Centro de día',
  VIVIENDA_TUTELADA: 'Vivienda tutelada',
};

export const DEPENDENCY_GRADE_LABELS: Record<string, string> = {
  SIN_VALORAR: 'Sin valorar',
  GRADO_I: 'Grado I',
  GRADO_II: 'Grado II',
  GRADO_III: 'Grado III',
};

export const SEX_LABELS: Record<string, string> = {
  HOMBRE: 'Hombre',
  MUJER: 'Mujer',
  OTRO: 'Otro',
  NS_NC: 'NS/NC',
};

export const RESIDENT_STATUS_LABELS: Record<string, string> = {
  ACTIVO: 'Activo',
  BAJA: 'Baja',
  PREINGRESO: 'Preingreso',
};

export const CONTACT_RELATION_LABELS: Record<string, string> = {
  HIJO_A: 'Hijo/a',
  CONYUGE: 'Cónyuge',
  HERMANO_A: 'Hermano/a',
  TUTOR_LEGAL: 'Tutor legal',
  OTRO: 'Otro',
};

export const ALLERGY_SEVERITY_LABELS: Record<string, string> = {
  LEVE: 'Leve',
  MODERADA: 'Moderada',
  GRAVE: 'Grave',
};

export const ASSESSMENT_TYPE_LABELS: Record<string, string> = {
  BARTHEL: 'Barthel (ABVD)',
  TINETTI: 'Tinetti (marcha/equilibrio)',
};

export const BED_STATUS_LABELS: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  FUERA_SERVICIO: 'Fuera de servicio',
};

export const CARE_TYPE_LABELS: Record<string, string> = {
  CONSTANTES: 'Constantes',
  ABVD: 'ABVD',
  DEPOSICION: 'Deposición',
  INGESTA: 'Ingesta',
  INCIDENCIA: 'Incidencia',
};

export const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Superadmin de plataforma',
  DIRECTOR: 'Dirección / gestor',
  SANITARIO: 'Sanitario (médico / enfermería)',
  AUXILIAR: 'Auxiliar (atención directa)',
  FAMILIAR: 'Familiar',
};
