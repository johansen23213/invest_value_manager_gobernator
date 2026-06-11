# Expediente completo del residente — Análisis de gaps y hoja de ruta

**Fecha:** 2026-06-11  
**Autor:** Pau (Product Manager, Vetlla)  
**Contexto:** Análisis solicitado tras feedback "veo muy poca información del paciente".  
**Alcance:** residencias de mayores, centros de día, viviendas tuteladas/supervisadas en España.  
**Rama:** claude/vetlla-saas-mvp-spec-PuHOW  

---

## 1. Estado actual en Vetlla

### 1.1 Modelo de datos (schema.prisma, revisado 2026-06-11)

El modelo `Resident` registra hoy los siguientes campos directos:

| Campo | Tipo | Observación |
|---|---|---|
| firstName / lastName | String | Nombre completo |
| birthDate | DateTime? | Fecha de nacimiento |
| sex | Sex? | HOMBRE / MUJER / OTRO / NS_NC |
| nationalId | String? | DNI/NIE |
| dependencyGrade | DependencyGrade | SIN_VALORAR / GRADO_I / II / III (Ley 39/2006) |
| status | ResidentStatus | ACTIVO / BAJA / PREINGRESO |
| admissionDate | DateTime? | Fecha de ingreso |
| notes | String? | Observaciones libres |
| centerId / bedId | FK | Centro y plaza asignada |

**Relaciones activas:**

- `EmergencyContact`: nombre, parentesco (enum reducido), teléfono, email, isPrimary.
- `Allergy`: sustancia, gravedad (LEVE/MODERADA/GRAVE), reacción. Sin distinción alimentaria/medicamentosa.
- `Diagnosis`: descripción, código CIE-10 opcional, fecha.
- `Assessment`: tipo (BARTHEL o TINETTI), puntuación, notas.
- `Medication` + `MedicationAdministration` + `Treatment` (cabecera).
- `CarePlan` + `CarePlanGoal` + `CarePlanReview` (PIA/PAI).
- `CareRecord`: constantes, ABVD, deposiciones, ingesta, incidencias.
- `FamilyLink`: vínculo familiar con control de privacidad por sección.

### 1.2 Lo que se muestra en pantalla

La ruta `/residentes/[id]` (expediente) tiene 5 pestañas:

1. **Datos** — nacimiento, fecha ingreso, DNI/NIE, centro, plaza.  
2. **Escalas** — listado de valoraciones Barthel/Tinetti + formulario de nueva.  
3. **Contactos** — listado + añadir (nombre, parentesco, teléfono).  
4. **Alergias** — listado + añadir (sustancia, gravedad).  
5. **Diagnósticos** — listado + añadir (descripción, CIE-10).  
6. **RGPD** — (solo dsar:manage) export art.15 y anonimización art.17.

La ruta `/residentes/[id]/resumen` (vista 360, R-360) agrega operativa diaria en 3 pestañas (Hoy / Salud / Atención) pero **no añade nuevos datos del expediente**, sino vistas derivadas de los existentes.

**Conclusión del estado actual:** el expediente sociosanitario cubre un subconjunto mínimo de identificación + antecedentes básicos. Faltan bloques completos que en la práctica real de un centro son obligatorios o esperados desde el primer día de uso.

---

## 2. Análisis de dominio — Expediente sociosanitario completo

Referencia normativa: Ley 39/2006 de dependencia, RGPD art. 9 (datos de salud), Real Decreto 1051/2013 (valoración de dependencia), protocolos autonómicos de historia sociosanitaria, UNE 158101 (servicios de atención a personas en situación de dependencia), práctica de ResiPlus / Aegerus / Nexus como referencia competitiva.

### Bloque A — Identificación y administrativo

| Campo | Por qué se necesita | Quién lo consulta |
|---|---|---|
| Fotografía del residente | Identificación a pie de cama (auxiliar no conoce a todos los residentes de nombre); previene errores de medicación | Auxiliar, MAR |
| Nº de historia interna | Referencia cruzada con expedientes en papel y con administración autonómica | Dirección, sanitario |
| Nº tarjeta sanitaria (CIP / TSI) | Obligatorio para derivaciones a hospital, urgencias y gestiones con el sistema público de salud | Sanitario, dirección |
| Nº de Seguridad Social | Tramitación de prestaciones y documentos oficiales | Dirección |
| Mutua / aseguradora complementaria | Gestionar derivaciones y reembolsos; saber qué cubre el seguro privado | Dirección, sanitario |
| Régimen de plaza | Privada / concertada / prestación vinculada al servicio (PVS); condiciona facturación, inspección y derechos del residente | Dirección, inspección |
| Fecha de baja y motivo | Alta médica / fallecimiento / traslado / voluntaria; obligatorio para el registro de movimientos del centro | Dirección |
| Centro de procedencia | Hospital, domicilio, otro centro; útil para continuidad asistencial | Sanitario |
| Caducidad del DNI | Alerta para renovación (trámite que suele gestionar el tutor o la trabajadora social del centro) | Dirección, trabajo social |
| Incapacitación judicial | Sí/No + expediente; condiciona quién firma consentimientos | Sanitario, dirección |
| Tutor / curador legal | Nombre, NIF, teléfono, correo; necesario para firmar cualquier documento con implicación legal | Sanitario, dirección |
| Poder notarial / representante legal | Nombre, alcance del poder | Dirección |
| Voluntades anticipadas / testamento vital | Existencia + localización del documento; condiciona decisiones clínicas en urgencias | Sanitario |
| Idioma preferente | Es/Ca u otro; crítico para la comunicación con el residente y la familia | Todos |

### Bloque B — Contactos y entorno social

| Campo | Por qué se necesita | Quién lo consulta |
|---|---|---|
| Orden de llamada / prioridad | En urgencias se llama al contacto prioritario; si hay varios familiares, el orden evita conflictos | Auxiliar, guardia |
| Horario de disponibilidad del contacto | Saber cuándo localizar a cada familiar | Auxiliar |
| Dirección postal del contacto | Para notificaciones formales y documentos legales | Dirección |
| Situación familiar (vive solo, con cónyuge, hijo…) | Contexto social para el PIA y para evaluar retorno al domicilio | Trabajo social |
| Trabajador/a social de referencia externo | Del ayuntamiento o del sistema autonómico; coordinación de prestaciones | Trabajo social |
| Valoración social (informe de ingreso) | Documento estructurado de situación social al ingreso | Trabajo social |
| Autorización de visitas / régimen de visitas | Quién puede visitar y con qué restricciones (especialmente en centros con residentes con demencia) | Auxiliar, recepción |

### Bloque C — Clínico

| Campo | Por qué se necesita | Quién lo consulta |
|---|---|---|
| Antecedentes personales de interés | Historia médica relevante al ingreso; complementa los diagnósticos activos | Sanitario |
| Tipo de alergia (medicamentosa / alimentaria / ambiental / latex) | Previene confusiones; la lógica de bloqueo de prescripción solo aplica a las medicamentosas | Sanitario, auxiliar |
| Intolerancias alimentarias | Separadas de las alergias (no inmunológicas); condicionan la dieta diaria | Auxiliar, cocina |
| Vacunación (gripe, COVID, neumococo, tétanos) | Registro obligatorio para inspecciones y para decidir campañas | Sanitario |
| Portador de dispositivos: sonda (vesical/nasogástrica), oxígeno domiciliario, marcapasos, CPAP, prótesis (cadera, rodilla, auditiva, dental, ocular) | Los dispositivos condicionan múltiples cuidados: no se puede hacer RCP estándar con marcapasos no compatible; la sonda necesita registro de mantenimiento; el oxígeno requiere caudalímetro | Auxiliar, sanitario |
| Grupo sanguíneo y factor Rh | Urgencias hospitalarias; el centro lo tiene más accesible que el hospital de guardia | Sanitario |
| Diagnóstico principal al ingreso | El diagnóstico que motivó el ingreso, separado de los comorbidos | Sanitario, dirección |
| Estado de los diagnósticos (activo / resuelto / crónico) | Hoy el modelo no distingue; un diagnóstico resuelto no debe aparecer como alerta activa | Sanitario |
| Médico de referencia externo (nombre, centro, teléfono) | Para coordinación asistencial con el sistema público | Sanitario |
| Especialistas de seguimiento | Cardiólogo, neurólogo, traumatólogo, etc. con sus citas | Sanitario |

### Bloque D — Valoración geriátrica integral (escalas)

Hoy solo existen Barthel y Tinetti. Un expediente completo de geriatría incluye:

| Escala | Para qué sirve | Periodicidad habitual |
|---|---|---|
| Pfeiffer (SPMSQ) o MEC-Lobo | Estado cognitivo; imprescindible para determinar capacidad de decisión del residente | Ingreso + anual + ante cambio |
| GDS-Reisberg | Estadio de demencia (1-7); condiciona el nivel de supervisión y el PIA | Ingreso + semestral si hay demencia |
| Norton o Braden | Riesgo de úlceras por presión (UPP); si Norton ≤ 14 se activa protocolo de prevención; requisito de inspección | Ingreso + semanal en riesgo |
| MNA (Mini Nutritional Assessment) | Estado nutricional; desnutrición es frecuente y se puede prevenir | Ingreso + trimestral |
| EVA o PAINAD | Dolor (EVA para comunicativos, PAINAD para demencia avanzada); infradiagnosticado | Con cada cambio clínico |
| Downton | Riesgo de caídas; complementa Tinetti con factores de medicación y cognición | Ingreso + tras caída |
| Zarit (si hay cuidador principal externo) | Sobrecarga del cuidador; relevante en viviendas tuteladas con familia implicada | Opcional, ingreso |
| Lawton-Brody (AIVD) | Actividades instrumentales; útil en centros de día y viviendas tuteladas | Ingreso |

### Bloque E — Cuidados y vida diaria (información usada a pie de cama)

| Campo | Por qué se necesita | Quién lo consulta |
|---|---|---|
| Tipo de dieta (normal, triturada, pastosa, con espesante) | Previene atragantamiento (disfagia; causa frecuente de muerte en mayores) | Auxiliar, cocina — CRÍTICO |
| Textura de líquidos (libre, néctar, miel, pudding) | Protocolo disfagia IDDSI; auxiliar necesita saberlo antes de dar agua | Auxiliar — CRÍTICO |
| Suplementos nutricionales (Ensure, Fortimel, etc.) | Prescripción nutricional; el auxiliar lo prepara con la bandeja | Auxiliar, cocina |
| Alergias e intolerancias alimentarias | (ya en bloque C, pero debe llegar a la hoja de cuidados de auxiliar) | Auxiliar, cocina |
| Ayudas técnicas: silla de ruedas (manual/eléctrica), andador, muletas, grúa, bipedestador, barandillas de cama, cojín antiescaras | El auxiliar elige el material correcto y la técnica de transferencia; sin esto hay riesgo de caída y lesiones | Auxiliar — CRÍTICO |
| Continencia: tipo de absorbente (pañal talla S/M/L, empapador, sonda) y frecuencia de cambio | El auxiliar compra material, organiza cambios y detecta retención urinaria | Auxiliar |
| Patrón de sueño habitual y medicación hipnótica | Saber si el residente madruga, si tiene insomnio crónico; evitar despertar innecesario en la ronda nocturna | Auxiliar nocturno |
| Historia de vida (profesión, aficiones, música, mascotas, familia) | Base de la atención centrada en la persona (ACP), obligatoria en UNE 158101; el copiloto de IA puede usarla para personalizar el PIA | Todas las categorías de personal |
| Religión y prácticas religiosas | Dieta (halal, kosher, ayuno), ritos, capellán; especialmente relevante en residencias con diversidad cultural | Auxiliar, dirección |
| Idioma preferente (ya en bloque A; aquí es dato operativo) | El auxiliar de guardia debe saber si el residente solo habla catalán o un idioma diferente | Auxiliar |
| Riesgo de fuga / deambulación nocturna | Protocolo de seguridad; determina si la habitación necesita sensor o si se ubica cerca del control | Auxiliar nocturno, dirección |
| Preferencias en aseo personal (ducha/baño, mañana/tarde, con quién) | Autonomía y dignidad del residente; reduce resistencia a los cuidados | Auxiliar |

### Bloque F — Programas y seguimiento clínico

| Campo / Tabla | Por qué se necesita | Quién lo consulta |
|---|---|---|
| Registro de peso y talla periódico | Detectar desnutrición o retención de líquidos; el MNA lo requiere; la inspección lo pide | Sanitario, enfermería |
| UPP activas: localización, estadio (I-IV), dimensiones, fecha inicio, registro de curas, fotografía | Las UPP son un indicador de calidad de la inspección; tener el registro evita litigios y permite gestión proactiva | Sanitario, enfermería — CRÍTICO para inspección |
| Sujeciones mecánicas: tipo (cama, silla, cinturón), prescripción médica, consentimiento, revisión periódica | MUY REGULADO: la Ley 41/2002 y la jurisprudencia exigen prescripción médica, consentimiento informado, revisión periódica y registro. La inspección puede suspender la licencia si no hay protocolo | Sanitario, dirección — RIESGO LEGAL |
| Caídas: fecha, hora, circunstancias, lesiones, testigos, medidas adoptadas | Registro obligatorio; indicador de calidad e inspección; protege frente a reclamaciones | Sanitario, dirección |
| Programa de fisioterapia / rehabilitación | Sesiones, objetivos, progreso | Sanitario, fisioterapeuta |

### Bloque G — RGPD / Consentimientos

| Campo | Por qué se necesita | Quién lo consulta |
|---|---|---|
| Consentimiento de imagen (fotografía, vídeo) | Art. 7 RGPD; sin él no se puede publicar ninguna imagen del residente (newsletter, redes sociales del centro) | Dirección |
| Consentimiento del portal de familias | El RGPD exige base legal explícita para compartir datos con terceros (familiares) aunque sean próximos | Dirección |
| Consentimiento informado de ingreso | Documento que cubre el tratamiento de datos durante la estancia; debe registrarse su firma y fecha | Dirección |
| Consentimiento para compartir con profesionales sanitarios externos | Derivaciones, informes, acceso del médico de cabecera | Sanitario |
| Consentimiento para uso de datos anonimizados en mejora del servicio / IA | Obligatorio para entrenar o evaluar modelos con datos reales (art. 9.2 RGPD, datos de salud) | DPO / dirección |

---

## 3. Gap analysis

### Leyenda de severidad
- **Critica** — sin esto un centro real no puede operar o hay riesgo legal inminente.
- **Alta** — los directores lo esperan al comparar con ResiPlus; sin ello no se firma contrato.
- **Media** — mejora la calidad asistencial; diferencial frente a competidores básicos.
- **Baja** — nice-to-have, diferencial secundario.

| Bloque | Qué existe hoy en Vetlla | Qué falta | Severidad |
|---|---|---|---|
| **A — Identificación y administrativo** | DNI/NIE, fecha ingreso, dependencyGrade, status (ACTIVO/BAJA/PREINGRESO), notes | Fotografía, nº historia, CIP/TSI, nº SS, mutua/aseguradora, régimen de plaza (privada/concertada/PVS), motivo de baja, centro de procedencia, caducidad DNI, incapacitación judicial + tutor/curador, voluntades anticipadas, idioma preferente | Critica (régimen de plaza + tutor/representante legal + voluntades anticipadas); Alta (fotografía + TSI + motivo baja) |
| **B — Contactos y entorno social** | Contacto (nombre, parentesco, teléfono, email, isPrimary) | Orden de llamada explícito (ya está isPrimary pero no un número ordinal), horario de disponibilidad, dirección postal, situación familiar, trabajador/a social externo, valoración social al ingreso, régimen de visitas | Alta (trabajador/a social + valoración social); Media (resto) |
| **C — Clínico** | Alergias (sustancia + gravedad + reacción), diagnósticos (CIE-10 + descripción), antecedentes en notes | Tipo de alergia (medicamentosa/alimentaria/etc.), intolerancias alimentarias separadas, vacunación, dispositivos (sonda, oxígeno, marcapasos, prótesis), grupo sanguíneo, estado del diagnóstico (activo/resuelto/crónico), médico de referencia externo, especialistas | Critica (dispositivos — sonda/O2/marcapasos afectan a la atención directa; tipo alergia alimentaria bloquea dieta); Alta (vacunación, médico externo, estado diagnóstico) |
| **D — Escalas** | Barthel (ABVD, 0–100), Tinetti (marcha, 0–28) | Pfeiffer/MEC-Lobo (cognitivo), GDS-Reisberg (demencia), Norton/Braden (UPP), MNA (nutrición), EVA/PAINAD (dolor), Downton (caídas), Lawton-Brody (AIVD) | Critica (Norton/Braden — las UPP son el indicador nº1 en inspecciones); Alta (Pfeiffer/MEC-Lobo — capacidad cognitiva es clave para el PIA y para el consentimiento; MNA — desnutrición es prevalente); Media (resto) |
| **E — Cuidados y vida diaria** | CareRecord con tipos (constantes, ABVD, deposición, ingesta, incidencia). Sin ficha fija de cuidados del residente. | Dieta y textura de líquidos, ayudas técnicas, continencia (tipo de absorbente), sueño, historia de vida, idioma, riesgo de fuga, preferencias de aseo | Critica (dieta/textura — riesgo de atragantamiento; ayudas técnicas — riesgo de caída en transferencias); Alta (continencia, riesgo de fuga); Media (historia de vida, preferencias) |
| **F — Programas y seguimiento** | CareRecord genérico (incidencias), CarePlan/PIA | Registro de peso periódico, UPP activas con registro de curas, sujeciones mecánicas, registro de caídas estructurado, programa de rehabilitación | Critica (sujeciones — riesgo legal máximo; UPP activas — indicador de inspección); Alta (caídas, peso) |
| **G — RGPD / Consentimientos** | DSAR (export art.15, anonimización art.17), AuditLog | Consentimiento de imagen, consentimiento portal de familias registrado como campo explícito (hoy solo FamilyLink), consentimiento informado de ingreso, consentimiento para IA | Alta (consentimiento de imagen; consentimiento informado de ingreso — obligación legal); Media (consentimiento IA) |

### Resumen del gap

- **6 áreas con ítems de severidad Crítica**: régimen de plaza/representante legal, tipo de alergia/dispositivos, Norton/Braden, dieta/textura/ayudas técnicas, sujeciones mecánicas, UPP activas.
- **La pantalla de "Datos" muestra 5 campos** (nacimiento, ingreso, DNI, centro, plaza). Un director de ResiPlus ve 30+ en una sola pantalla.
- **El bloque E (cuidados y vida diaria) no existe como entidad**: hay registros de atención pero no una ficha de perfil de cuidados que el auxiliar consulte antes de asistir al residente.

---

## 4. Propuesta de implementación por fases

### Criterio de priorización
Cada campo se justifica por: ¿quién lo lee y cuándo? ¿hay riesgo legal sin él? ¿es el dato que el auxiliar necesita en los primeros 10 segundos de contacto con el residente?

Los datos que el auxiliar usa a pie de cama deben estar en la ficha de cuidados de la vista 360, no enterrados en el expediente administrativo.

---

### Fase 1 — Lo crítico y vendible (estimación: 3–4 semanas de desarrollo)

**Objetivo:** cerrar los gaps que bloquean que un centro real use Vetlla como sistema principal desde el día 1.

#### F1.1 — Ampliar el modelo `Resident` (campos directos)

```prisma
model Resident {
  // Existentes — no cambian
  // ...

  // NUEVOS — Fase 1
  photoUrl          String?   @map("photo_url")           // URL firmada en storage EU
  internalRecordNo  String?   @map("internal_record_no")  // nº historia interna del centro
  cip               String?                               // Tarjeta Sanitaria / CIP autonómico
  socialSecurityNo  String?   @map("social_security_no")
  insurerName       String?   @map("insurer_name")        // mutua / aseguradora complementaria
  placeRegime       PlaceRegime @default(PRIVADA) @map("place_regime")
  dischargeDate     DateTime? @map("discharge_date")
  dischargeReason   String?   @map("discharge_reason")    // alta médica / traslado / fallecimiento / voluntaria
  originCenter      String?   @map("origin_center")       // centro/hospital de procedencia al ingreso
  nationalIdExpiry  DateTime? @map("national_id_expiry")  // caducidad DNI — alerta para renovación
  judicialCapacity  Boolean   @default(true) @map("judicial_capacity") // true = capaz; false = incapacitado
  legalRepName      String?   @map("legal_rep_name")      // tutor/curador/apoderado
  legalRepPhone     String?   @map("legal_rep_phone")
  legalRepEmail     String?   @map("legal_rep_email")
  advanceDirectives Boolean?  @map("advance_directives")  // Sí/No + localización del doc
  advanceDirLocation String?  @map("advance_dir_location")
  preferredLanguage String    @default("es") @map("preferred_language") // "es" | "ca" | otro
  bloodGroup        String?   @map("blood_group")         // A+, O-, etc.
  // Consentimientos explícitos (RGPD)
  consentImage      Boolean   @default(false) @map("consent_image")
  consentFamilyPortal Boolean @default(false) @map("consent_family_portal")
  consentAdmission  DateTime? @map("consent_admission")   // fecha firma consentimiento de ingreso

  // NUEVOS — Ficha de cuidados (datos operativos a pie de cama)
  dietType          DietType? @map("diet_type")
  liquidTexture     LiquidTexture? @map("liquid_texture")
  continenceType    String?   @map("continence_type")     // absorbente/sonda/control
  absorbentSize     String?   @map("absorbent_size")      // S/M/L/XL
  wanderingRisk     Boolean   @default(false) @map("wandering_risk")
  fallRisk          Boolean   @default(false) @map("fall_risk")
  nutritionSupplements String? @map("nutrition_supplements")

  // Relaciones nuevas
  devices           ResidentDevice[]
  vaccines          Vaccine[]
  weights           WeightRecord[]
  pressureUlcers    PressureUlcer[]
  falls             FallRecord[]
  restraints        Restraint[]
  consents          ConsentRecord[]
  lifeStory         LifeStory?
}

enum PlaceRegime {
  PRIVADA
  CONCERTADA
  PRESTACION_VINCULADA   // PVS — plaza financiada por la CCAA directamente al centro
}

enum DietType {
  NORMAL
  TRITURADA
  PASTOSA
  BLANDA
  DIABETICA
  HIPOSODICА
  OTRA
}

enum LiquidTexture {
  LIBRE      // sin restricción
  NECTAR     // IDDSI nivel 2
  MIEL       // IDDSI nivel 3
  PUDING     // IDDSI nivel 4 (solo sólidos)
}
```

#### F1.2 — Nuevas tablas

```prisma
/// Dispositivos que porta el residente (sonda, oxígeno, marcapasos, prótesis…).
/// Un residente puede tener varios simultáneamente.
model ResidentDevice {
  id          String      @id @default(cuid())
  tenantId    String      @map("tenant_id")
  residentId  String      @map("resident_id")
  resident    Resident    @relation(fields: [residentId], references: [id], onDelete: Cascade)
  type        DeviceType
  description String?     // detalle libre (ej: "Sonda Foley 16F", "Marcapasos Medtronic")
  since       DateTime?   // fecha de implantación/colocación
  notes       String?
  active      Boolean     @default(true)
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  @@index([tenantId])
  @@index([residentId])
  @@map("resident_devices")
}

enum DeviceType {
  SONDA_VESICAL
  SONDA_NASOGASTRICA
  OXIGENO_DOMICILIARIO
  CPAP
  MARCAPASOS
  DESFIBRILADOR_IMPLANTABLE
  PROTESIS_CADERA
  PROTESIS_RODILLA
  PROTESIS_AUDITIVA
  PROTESIS_DENTAL
  OTRO
}

/// Vacunación del residente.
model Vaccine {
  id          String   @id @default(cuid())
  tenantId    String   @map("tenant_id")
  residentId  String   @map("resident_id")
  resident    Resident @relation(fields: [residentId], references: [id], onDelete: Cascade)
  type        String   // "gripe", "COVID", "neumococo", "tétanos", etc.
  date        DateTime
  lot         String?  // lote del vial — trazabilidad
  notes       String?
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([tenantId])
  @@index([residentId])
  @@map("vaccines")
}

/// Registro periódico de peso y talla.
model WeightRecord {
  id          String   @id @default(cuid())
  tenantId    String   @map("tenant_id")
  residentId  String   @map("resident_id")
  resident    Resident @relation(fields: [residentId], references: [id], onDelete: Cascade)
  weightKg    Float    @map("weight_kg")
  heightCm    Float?   @map("height_cm")  // solo si cambia; suele medirse al ingreso
  bmi         Float?                      // calculado y almacenado para tendencias
  recordedAt  DateTime @map("recorded_at")
  recordedById String? @map("recorded_by_id")
  notes       String?
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([tenantId])
  @@index([residentId])
  @@map("weight_records")
}

/// Úlcera por presión (UPP) activa o resuelta.
model PressureUlcer {
  id          String        @id @default(cuid())
  tenantId    String        @map("tenant_id")
  residentId  String        @map("resident_id")
  resident    Resident      @relation(fields: [residentId], references: [id], onDelete: Cascade)
  location    String        // localización anatómica (sacro, talón, trocánter…)
  stage       Int           // 1–4 (escala NPUAP/EPUAP)
  onsetDate   DateTime      @map("onset_date")
  resolvedDate DateTime?    @map("resolved_date")
  acquired    UPPOrigin     // INGRESO (ya la traía) | CENTRO (se produjo aquí) — indicador de calidad/legal
  notes       String?
  active      Boolean       @default(true)
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  curings     UPPCuring[]

  @@index([tenantId])
  @@index([residentId])
  @@map("pressure_ulcers")
}

enum UPPOrigin {
  INGRESO  // la traía al entrar; no imputable al centro
  CENTRO   // apareció durante la estancia; indicador de calidad/inspección
}

/// Registro de cura de una UPP.
model UPPCuring {
  id             String        @id @default(cuid())
  tenantId       String        @map("tenant_id")
  pressureUlcerId String       @map("pressure_ulcer_id")
  pressureUlcer  PressureUlcer @relation(fields: [pressureUlcerId], references: [id], onDelete: Cascade)
  date           DateTime
  treatment      String        // descripción del apósito y técnica
  evolution      String?       // mejor / igual / peor / resuelto
  doneById       String?       @map("done_by_id")
  createdAt      DateTime      @default(now()) @map("created_at")

  @@index([tenantId])
  @@index([pressureUlcerId])
  @@map("upp_curings")
}

/// Caída registrada.
model FallRecord {
  id           String   @id @default(cuid())
  tenantId     String   @map("tenant_id")
  residentId   String   @map("resident_id")
  resident     Resident @relation(fields: [residentId], references: [id], onDelete: Cascade)
  occurredAt   DateTime @map("occurred_at")
  location     String?  // habitación, pasillo, baño…
  circumstances String? // qué estaba haciendo el residente
  injuries     String?  // contusión, fractura, herida…
  witnessed    Boolean  @default(false)
  measures     String?  // medidas adoptadas tras la caída
  reportedById String?  @map("reported_by_id")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@index([tenantId])
  @@index([residentId])
  @@map("fall_records")
}

/// Sujeción mecánica (MUY REGULADO: requiere prescripción médica + consentimiento + revisión).
model Restraint {
  id               String         @id @default(cuid())
  tenantId         String         @map("tenant_id")
  residentId       String         @map("resident_id")
  resident         Resident       @relation(fields: [residentId], references: [id], onDelete: Cascade)
  type             RestraintType
  justification    String         // motivo clínico documentado
  prescribedById   String?        @map("prescribed_by_id") // sanitario que prescribe
  prescribedAt     DateTime       @map("prescribed_at")
  consentObtained  Boolean        @default(false) @map("consent_obtained")
  consentDate      DateTime?      @map("consent_date")
  consentBy        String?        @map("consent_by")       // quién firma (residente o representante)
  active           Boolean        @default(true)
  endDate          DateTime?      @map("end_date")
  endReason        String?        @map("end_reason")
  reviewedAt       DateTime?      @map("reviewed_at")      // última revisión periódica
  notes            String?
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")

  @@index([tenantId])
  @@index([residentId])
  @@map("restraints")
}

enum RestraintType {
  BARANDILLAS     // barandilla de cama
  CINTURON_SILLA  // cinturón en silla de ruedas
  MUÑEQUERAS
  CHALECO
  OTRO
}

/// Registro de consentimientos RGPD/clínicos (trazabilidad explícita).
model ConsentRecord {
  id          String      @id @default(cuid())
  tenantId    String      @map("tenant_id")
  residentId  String      @map("resident_id")
  resident    Resident    @relation(fields: [residentId], references: [id], onDelete: Cascade)
  type        ConsentType
  granted     Boolean     // true = concede / false = revoca
  grantedBy   String?     @map("granted_by")  // nombre de quien firma (residente o representante)
  date        DateTime
  notes       String?
  createdAt   DateTime    @default(now()) @map("created_at")

  @@index([tenantId])
  @@index([residentId])
  @@map("consent_records")
}

enum ConsentType {
  INGRESO          // consentimiento informado de ingreso
  IMAGEN           // fotografía/vídeo
  PORTAL_FAMILIAS
  DATOS_SANITARIOS_EXTERNOS
  IA_ANONIMA       // uso de datos anonimizados en mejora del servicio/IA
}

/// Historia de vida del residente (atención centrada en la persona, UNE 158101).
model LifeStory {
  id              String   @id @default(cuid())
  tenantId        String   @map("tenant_id")
  residentId      String   @unique @map("resident_id")
  resident        Resident @relation(fields: [residentId], references: [id], onDelete: Cascade)
  profession      String?  // ocupación/profesión anterior
  hobbies         String?  // aficiones y actividades que le gustaban
  music           String?  // géneros o artistas favoritos
  importantPeople String?  @map("important_people") // familia, amigos clave
  religion        String?  // religión y prácticas (dieta, fiestas, ritos)
  preferences     String?  // preferencias en el aseo, comidas favoritas, rutinas
  notes           String?  // campo libre para el trabajador social
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@index([tenantId])
  @@map("life_stories")
}
```

#### F1.3 — Ampliar `AssessmentType` con las escalas críticas

```prisma
enum AssessmentType {
  BARTHEL          // ABVD (0–100)
  TINETTI          // marcha y equilibrio (0–28)
  // NUEVOS — Fase 1
  PFEIFFER         // estado cognitivo (0–10 errores; 0 = normal)
  MEC_LOBO         // Mini-Examen Cognoscitivo Lobo (0–35; ≤23 deterioro)
  GDS_REISBERG     // estadio demencia (1–7)
  NORTON           // riesgo UPP (5–20; ≤14 = riesgo alto)
  BRADEN           // riesgo UPP (6–23; ≤18 = riesgo)
  MNA              // estado nutricional (0–30)
  PAINAD           // dolor en demencia avanzada (0–10)
  DOWNTON          // riesgo de caídas (0–12; ≥3 = alto riesgo)
  LAWTON_BRODY     // AIVD (0–8)
}
```

#### F1.4 — Ampliar `Allergy` con tipo

```prisma
model Allergy {
  // Existentes
  // ...
  // NUEVO
  allergyType  AllergyType? @map("allergy_type")
}

enum AllergyType {
  MEDICAMENTOSA
  ALIMENTARIA
  AMBIENTAL
  LATEX
  OTRA
}
```

#### F1.5 — Ampliar `EmergencyContact` con datos adicionales

```prisma
model EmergencyContact {
  // Existentes
  // ...
  // NUEVOS
  callOrder     Int?     @map("call_order")        // 1 = llamar primero
  availability  String?                            // "mañanas", "tardes + fines de semana"
  postalAddress String?  @map("postal_address")
}
```

#### F1.6 — Escala de Norton/Braden como disparador del protocolo de UPP

Cuando se registra una valoración Norton ≤ 14 o Braden ≤ 18, el sistema debe:
1. Crear una alerta en `/alertas` (ya existe el router de alertas).
2. Sugerir al copiloto de IA incluir objetivo de prevención de UPP en el PIA.

Este comportamiento es lógica pura (sin nuevo schema) y se implementa en el router de `assessments`.

---

### Fase 2 — Alta fidelidad competitiva (estimación: 4–6 semanas)

**Objetivo:** alcanzar paridad funcional con ResiPlus en el expediente sociosanitario para el proceso comercial con directores experimentados.

- **Ayudas técnicas como entidad** (tabla `TechnicalAid`): silla de ruedas, andador, grúa, etc. con descripción y fecha de asignación. Hoy son un campo de texto libre.
- **Médico y especialistas externos** (tabla `ExternalClinician`): nombre, especialidad, centro, teléfono, próxima cita.
- **Programa de fisioterapia / rehabilitación**: sesiones en `CareRecord` (ya existe el tipo, se extiende el payload) + objetivos vinculados al PIA.
- **Diagnósticos: estado activo/crónico/resuelto** — añadir campo `diagnosisStatus` al modelo existente.
- **Valoración social estructurada**: tabla `SocialAssessment` con los bloques del ingreso (convivencia previa, red de apoyo, acceso al domicilio, circunstancias socioeconómicas).
- **UX del expediente**: reorganizar en secciones más amplias con la ficha de cuidados visible en la vista 360 (los datos de dieta/ayudas técnicas aparecen como tarjeta de alerta en la pestaña "Hoy").

---

### Fase 3 — Diferencial y automatización con IA (estimación: 3–5 semanas, con H5 cerrado)

**Objetivo:** convertir la riqueza de datos del expediente en ventaja competitiva real del copiloto.

- **Copiloto para la historia de vida**: a partir de texto libre dictado o escrito, el copiloto extrae y estructura la historia de vida (profesión, aficiones, familia) en `LifeStory`. Igual que el Feature 1 (CareRecord desde lenguaje natural).
- **Borrador de PIA personalizado desde la historia de vida**: el copiloto usa `LifeStory` + las escalas cognitivas + las escalas funcionales para proponer objetivos del PIA coherentes con la persona, no genéricos. Es el diferencial frente a ResiPlus (que genera objetivos de plantilla).
- **Alertas proactivas**: el sistema detecta automáticamente patrones de riesgo (pérdida de peso progresiva + Norton en rango de riesgo + sin UPP registrada = sugerencia de foto de comprobación de la piel) y los presenta en el dashboard del sanitario.
- **Informe de ingreso asistido**: a partir de los datos del expediente y las valoraciones iniciales, el copiloto genera un primer borrador del informe de ingreso (documento que los centros deben enviar a la administración autonómica para tramitar la prestación).
- **Análisis de consentimientos pendientes**: el copiloto detecta que un residente no tiene consentimiento de imagen firmado o lleva 6 meses sin revisión de sujeción y genera una tarea para el equipo.

---

## 5. Impacto en la vista de expediente y en la vista 360

### Expediente `/residentes/[id]` — estructura propuesta tras Fase 1

| Pestaña | Contenido principal |
|---|---|
| **Datos** | Identificación completa (foto, DNI, CIP, SS, régimen plaza, tutor, voluntades, idioma), documentación legal, consentimientos |
| **Salud** | Diagnósticos (con estado), alergias (con tipo), dispositivos, grupo sanguíneo, médico externo, vacunas |
| **Escalas** | Todas las escalas (Barthel, Tinetti, Pfeiffer, Norton, MNA, etc.) con evolución temporal |
| **Cuidados** | Ficha operativa: dieta/textura, ayudas técnicas, continencia, sueño, riesgo de fuga, preferencias |
| **Seguimiento** | UPP activas, caídas, sujeciones, evolución del peso |
| **Historia de vida** | Información personal, aficiones, familia, religión |
| **Contactos** | Contactos con orden de llamada, dirección, disponibilidad |
| **RGPD** | Export art.15, anonimización art.17, registro de consentimientos |

### Vista 360 `/residentes/[id]/resumen` — pestaña "Hoy" (añadir)

La ficha de cuidados debe aparecer como **banner de contexto** en la pestaña "Hoy" antes de la sección de medicación pendiente:

```
┌─────────────────────────────────────────────────────────┐
│  FICHA DE CUIDADOS                                      │
│  Dieta: Triturada · Líquidos: Néctar (IDDSI 2)         │
│  Ayuda: Grúa para transferencias                       │
│  Continencia: Pañal M · Cambio cada 3h                 │
│  RIESGO FUGA: Sí — unidad con cierre                   │
└─────────────────────────────────────────────────────────┘
```

Este banner es la información que el auxiliar necesita en los primeros 10 segundos de contacto con el residente. Si falta algún dato crítico (dieta no definida, dispositivo sin registrar), aparece como aviso amarillo para que el sanitario lo complete.

---

## 6. Notas para Marc y Núria (no implementar hasta revisión)

1. **Todas las tablas nuevas** necesitan `tenant_id` + RLS+FORCE + política en su migración. El patrón está establecido en el codebase.
2. **`photoUrl`** apunta a un objeto en storage EU (no se almacena el binario en Postgres). Necesitará un servicio de subida de imágenes con URL firmada — esto es infra nueva que debe decidir Marc/Leo antes de implementar.
3. **`Restraint`** tiene implicaciones legales muy serias: la UI debe obligar a que el campo `justification`, `prescribedById` y `consentObtained` estén rellenos antes de guardar. El AuditLog debe registrar creación, modificación y cada revisión periódica. Sofia-DPO debe revisar este flujo antes de salir a producción.
4. **`AssessmentType` ampliar el enum** implica una migración Prisma con `ALTER TYPE`. Los rangos e interpretaciones de cada nueva escala deben añadirse a `apps/web/src/lib/scales.ts`.
5. **`ConsentRecord`** no reemplaza los campos boolean en `Resident` (que son un resumen del estado actual). La tabla `ConsentRecord` es el historial de cambios de consentimiento, para cumplimiento del art. 7 RGPD (posibilidad de demostrar el consentimiento y su retirada).

---

## Referencias

- Ley 39/2006 de Promoción de la Autonomía Personal y Atención a las personas en situación de dependencia.
- Real Decreto 1051/2013, sobre procedimiento de reconocimiento de la situación de dependencia.
- Ley 41/2002, básica reguladora de la autonomía del paciente (consentimiento informado, historia clínica, voluntades anticipadas).
- UNE 158101:2015 (servicios de atención a personas en situación de dependencia).
- IDDSI Framework 2019 (International Dysphagia Diet Standardisation Initiative) — texturas de líquidos y alimentos.
- NPUAP/EPUAP/PPPIA 2019 — clasificación y prevención de úlceras por presión.
- RGPD art. 7 (consentimiento), art. 9 (datos de salud), art. 15 (acceso), art. 17 (supresión).
- Observación directa de ResiPlus y Aegerus (análisis competitivo, docs/negocio/).
