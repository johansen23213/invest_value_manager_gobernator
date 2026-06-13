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
  BARTHEL:      'Barthel (ABVD)',
  TINETTI:      'Tinetti (marcha/equilibrio)',
  PFEIFFER:     'Pfeiffer (cognitivo)',
  MEC_LOBO:     'MEC-Lobo (cognitivo)',
  GDS_REISBERG: 'GDS-Reisberg (demencia)',
  NORTON:       'Norton (riesgo UPP)',
  BRADEN:       'Braden (riesgo UPP)',
  MNA:          'MNA (nutrición)',
  PAINAD:       'PAINAD (dolor en demencia)',
  DOWNTON:      'Downton (riesgo caídas)',
  LAWTON_BRODY: 'Lawton-Brody (AIVD)',
};

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  SONDA_VESICAL:           'Sonda vesical',
  SONDA_NASOGASTRICA:      'Sonda nasogástrica',
  OXIGENO_DOMICILIARIO:    'Oxígeno domiciliario',
  CPAP:                    'CPAP',
  MARCAPASOS:              'Marcapasos',
  DESFIBRILADOR_IMPLANTABLE: 'Desfibrilador implantable',
  PROTESIS_CADERA:         'Prótesis de cadera',
  PROTESIS_RODILLA:        'Prótesis de rodilla',
  PROTESIS_AUDITIVA:       'Prótesis auditiva',
  PROTESIS_DENTAL:         'Prótesis dental',
  OTRO:                    'Otro dispositivo',
};

export const DIET_TYPE_LABELS: Record<string, string> = {
  NORMAL:    'Dieta normal',
  TRITURADA: 'Dieta triturada',
  PASTOSA:   'Dieta pastosa',
  BLANDA:    'Dieta blanda',
  DIABETICA: 'Dieta diabética',
  HIPOSODICA: 'Dieta hiposódica',
  OTRA:      'Dieta especial',
};

export const LIQUID_TEXTURE_LABELS: Record<string, string> = {
  LIBRE:  'Líquidos libres',
  NECTAR: 'Líquidos néctar (IDDSI 2)',
  MIEL:   'Líquidos miel (IDDSI 3)',
  PUDING: 'Líquidos pudding (IDDSI 4)',
};

export const RESTRAINT_TYPE_LABELS: Record<string, string> = {
  BARANDILLAS:    'Barandillas de cama',
  CINTURON_SILLA: 'Cinturón en silla',
  MUNEQUERAS:     'Muñequeras',
  CHALECO:        'Chaleco',
  OTRO:           'Otra sujeción',
};

export const CONSENT_TYPE_LABELS: Record<string, string> = {
  INGRESO:                  'Consentimiento de ingreso',
  IMAGEN:                   'Fotografía / vídeo',
  PORTAL_FAMILIAS:          'Portal de familias',
  DATOS_SANITARIOS_EXTERNOS: 'Datos sanitarios externos',
  IA_ANONIMA:               'Uso de datos anónimos en IA',
};

export const UPP_ORIGIN_LABELS: Record<string, string> = {
  INGRESO: 'Al ingreso (no imputable al centro)',
  CENTRO:  'Durante la estancia',
};

export const PLACE_REGIME_LABELS: Record<string, string> = {
  PRIVADA:             'Plaza privada',
  CONCERTADA:          'Plaza concertada',
  PRESTACION_VINCULADA: 'Prestación vinculada (PVS)',
};

export const ALLERGY_TYPE_LABELS: Record<string, string> = {
  MEDICAMENTOSA: 'Medicamentosa',
  ALIMENTARIA:   'Alimentaria',
  AMBIENTAL:     'Ambiental',
  LATEX:         'Látex',
  OTRA:          'Otra',
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

export const DOSE_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  ADMINISTRADO: 'Administrado',
  NO_ADMINISTRADO: 'No administrado',
  RECHAZADO: 'Rechazado',
};

export const SHIFT_LABELS: Record<string, string> = {
  MANANA: 'Mañana',
  TARDE: 'Tarde',
  NOCHE: 'Noche',
};

export const GOAL_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROGRESO: 'En progreso',
  CONSEGUIDO: 'Conseguido',
  CANCELADO: 'Cancelado',
};

export const CARE_PLAN_STATUS_LABELS: Record<string, string> = {
  ACTIVO: 'Activo',
  CERRADO: 'Cerrado',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: 'Alta',
  UPDATE: 'Modificación',
  DELETE: 'Baja',
  ADMINISTER: 'Administración',
  RECORD: 'Registro',
  LOGIN: 'Acceso',
  COPILOT_DRAFT: 'Borrador del copiloto',
  COPILOT_CONFIRM: 'Confirmación del copiloto',
};

export const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'Superadmin de plataforma',
  DIRECTOR: 'Dirección / gestor',
  SANITARIO: 'Sanitario (médico / enfermería)',
  AUXILIAR: 'Auxiliar (atención directa)',
  FAMILIAR: 'Familiar',
};

// ---------------------------------------------------------------------------
// Solicitudes del portal de familias (REQ-001..REQ-011)
// ---------------------------------------------------------------------------

export const SR_CATEGORY_LABELS: Record<string, string> = {
  ADMINISTRACION:    'Administración y gestión',
  DOCUMENTACION:     'Documentación y papeles',
  VISITAS:           'Visitas y salidas',
  ACTIVIDADES:       'Actividades y ocio',
  MANTENIMIENTO:     'Mantenimiento e instalaciones',
  ALIMENTACION:      'Alimentación y menús',
  COMUNICACION:      'Comunicación con el equipo',
  OBJETOS_PERSONALES: 'Objetos y ropa personal',
  INCIDENCIA_APP:    'Incidencia en la aplicación',
  OTRA:              'Otra consulta o solicitud',
};

export const SR_PRIORITY_LABELS: Record<string, string> = {
  BAJA:    'Baja',
  NORMAL:  'Normal',
  ALTA:    'Alta',
  URGENTE: 'Urgente',
};

export const SR_STATUS_LABELS: Record<string, string> = {
  RECIBIDA:       'Recibida',
  ASIGNADA:       'Asignada',
  EN_CURSO:       'En curso',
  PENDIENTE_INFO: 'Pendiente de información',
  RESUELTA:       'Resuelta',
  CERRADA:        'Cerrada',
  REABIERTA:      'Reabierta',
};

// ---------------------------------------------------------------------------
// Comunicados y mensajería (COM-001..COM-011)
// ---------------------------------------------------------------------------

export const ANNOUNCEMENT_CATEGORY_LABELS: Record<string, string> = {
  GENERAL:           'General',
  SALUD:             'Salud y bienestar',
  ADMINISTRACION:    'Administración',
  ACTIVIDADES:       'Actividades y ocio',
  URGENTE:           'Urgente',
  MENU:              'Menú',
  MANTENIMIENTO:     'Mantenimiento',
};

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<string, string> = {
  TODO_EL_CENTRO: 'Todo el centro',
  POR_UNIDAD:     'Por unidad',
  RESIDENTE:      'Residente concreto',
};

export const MESSAGE_THREAD_CATEGORY_LABELS: Record<string, string> = {
  GENERAL:        'General',
  SALUD:          'Salud y bienestar',
  ADMINISTRACION: 'Administración',
  ACTIVIDADES:    'Actividades y ocio',
  URGENTE:        'Urgente',
};

export const MESSAGE_THREAD_STATUS_LABELS: Record<string, string> = {
  ABIERTO: 'Abierto',
  CERRADO: 'Cerrado',
};

// ---------------------------------------------------------------------------
// Visitas (VIS-001..VIS-010)
// ---------------------------------------------------------------------------

export const VISIT_STATUS_LABELS: Record<string, string> = {
  SOLICITADA:  'Solicitada',
  CONFIRMADA:  'Confirmada',
  RECHAZADA:   'Rechazada',
  CANCELADA:   'Cancelada',
  EN_CURSO:    'En curso',
  COMPLETADA:  'Completada',
  NO_SHOW:     'No presentado',
};

// ---------------------------------------------------------------------------
// Notas de enfermería y evolución médica (Épica A del core asistencial)
// ---------------------------------------------------------------------------

/** Turno de la nota de enfermería (NursingNoteShift). */
export const NURSING_NOTE_SHIFT_LABELS: Record<string, string> = {
  MANANA: 'Mañana',
  TARDE:  'Tarde',
  NOCHE:  'Noche',
};

/** Categoría de la nota de enfermería (NursingNoteCategory). */
export const NURSING_NOTE_CATEGORY_LABELS: Record<string, string> = {
  GENERAL:     'General',
  INCIDENCIA:  'Incidencia',
  CURA:        'Cura',
  CONDUCTA:    'Conducta',
  SUENO:       'Sueño',
  DOLOR:       'Dolor',
  ALIMENTACION: 'Alimentación',
};

/** Tipo de evolutivo médico (MedicalNoteType). */
export const MEDICAL_NOTE_TYPE_LABELS: Record<string, string> = {
  EVOLUTIVO:   'Evolutivo',
  EXPLORACION: 'Exploración',
  DERIVACION:  'Derivación',
  VISITA:      'Visita',
};

// ---------------------------------------------------------------------------
// Épica B — Gestión de exitus/baja (discharge.ts)
// ---------------------------------------------------------------------------

export const DISCHARGE_TYPE_LABELS: Record<string, string> = {
  DEFUNCION:         'Fallecimiento',
  VOLUNTARIA:        'Baja voluntaria',
  TRASLADO_CENTRO:   'Traslado a otro centro',
  TRASLADO_HOSPITAL: 'Traslado a hospital',
  FIN_ESTANCIA:      'Fin de estancia',
  OTRO:              'Otro motivo',
};

// ---------------------------------------------------------------------------
// Épica C — Nutrición, Menús y Comedor (RF-NUT-001..009)
// ---------------------------------------------------------------------------

export const MEAL_TYPE_LABELS: Record<string, string> = {
  DESAYUNO: 'Desayuno',
  COMIDA:   'Comida',
  MERIENDA: 'Merienda',
  CENA:     'Cena',
};

/** Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011). */
export const ALLERGEN_LABELS: Record<string, string> = {
  GLUTEN:         'Gluten',
  CRUSTACEOS:     'Crustáceos',
  HUEVOS:         'Huevos',
  PESCADO:        'Pescado',
  CACAHUETES:     'Cacahuetes',
  SOJA:           'Soja',
  LACTEOS:        'Lácteos',
  FRUTOS_CASCARA: 'Frutos de cáscara',
  APIO:           'Apio',
  MOSTAZA:        'Mostaza',
  SESAMO:         'Sésamo',
  SULFITOS:       'Sulfitos',
  ALTRAMUCES:     'Altramuces',
  MOLUSCOS:       'Moluscos',
};

// ---------------------------------------------------------------------------
// Épica B — Perfil de bienestar ACP / UNE 158101 (social.ts)
// ---------------------------------------------------------------------------

/** Las 8 dimensiones del bienestar (UNE 158101 / modelo GENCAT). */
export const WELLBEING_DIMENSION_LABELS: Record<string, string> = {
  emotionalWellbeing:     'Bienestar emocional',
  physicalWellbeing:      'Bienestar físico',
  materialWellbeing:      'Bienestar material',
  personalDevelopment:    'Desarrollo personal',
  selfDetermination:      'Autodeterminación',
  interpersonalRelations: 'Relaciones interpersonales',
  socialInclusion:        'Inclusión social',
  rights:                 'Derechos',
};

/** Estado de la revisión ACP. */
export const REVIEW_STATUS_LABELS: Record<string, string> = {
  OVERDUE:  'Revisión vencida',
  DUE_SOON: 'Revisión próxima',
  OK:       'Al día',
  NOT_SET:  'Sin fecha',
};
