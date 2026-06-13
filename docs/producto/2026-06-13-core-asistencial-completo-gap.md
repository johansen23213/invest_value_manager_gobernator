# Gap Analysis: Core Asistencial Completo vs. Estado Real de Vetlla
**Fecha:** 2026-06-13
**Autor:** Pau (Product Manager)
**Motivación:** Decisión estratégica de Angel (2026-06-13): ampliar el alcance de Vetlla del
MVP diferencial (cloud-native + IA) a un ERP sociosanitario completo, competidor directo de
ResiPlus / ADD Informática. Este documento analiza la brecha real, prioriza los módulos y
formula las decisiones que requieren respuesta de Angel.

---

## PASO 1 — Inventario del estado real de Vetlla

**Fuentes verificadas:** `packages/db/prisma/schema.prisma` (1.307 líneas) y 22 routers en
`apps/web/src/server/routers/`.

### Módulos operativos hoy (construidos, con RLS, tests verdes)

| Módulo | Schema (tablas) | Router | Estado |
|---|---|---|---|
| Multitenancy + RBAC | `tenants`, `users`, `auth_tokens`, `family_links` | `users`, `account`, `signup` | Completo + RLS enforced (vetlla_app) |
| Centros / Unidades / Plazas | `centers`, `units`, `beds` | `centers`, `units`, `beds` | Completo |
| Ocupación y KPIs de dirección | derivado de `beds`/`residents` | `overview` | Completo (plano + alertas) |
| Expediente sociosanitario (Fase 1) | `residents` (40+ campos), `emergency_contacts`, `allergies`, `diagnoses`, `assessments` (11 escalas), `resident_devices`, `vaccines`, `weight_records`, `pressure_ulcers`, `upp_curings`, `fall_records`, `restraints`, `consent_records`, `life_stories` | `residents`, `clinical` | Completo (23 endpoints clínicos, escalas Barthel/Tinetti/Pfeiffer/MEC/GDS/Norton/Braden/MNA/PAINAD/Downton/Lawton) |
| Atención directa offline-first | `care_records`, `sync_conflicts` | `care`, `conflicts` | Completo (LWW por campo, cola IndexedDB, PWA) |
| Medicación + MAR | `medications`, `medication_administrations`, `medication_sync_conflicts`, `treatments` | `medications`, `treatments` | Completo (prescripción + MAR + pauta + PRN + MAR offline ADR-0012) |
| PIA / PAI | `care_plans`, `care_plan_goals`, `care_plan_reviews` | `careplans` | Completo |
| Copiloto IA (packages/ai) | — | `copilot` | Slices 1-3 construidos; pendiente benchmark con modelo real en producción (H5 in_progress) |
| Auditoría / RGPD | `audit_logs` | `audit` | Completo (append-only, trigger inmutable, DSAR art.15/17) |
| Portal de familias (lectura + interacción) | `family_links`, `service_requests`, `service_request_comments`, `announcements`, `announcement_receipts`, `message_threads`, `messages`, `visits`, `visit_slot_configs` | `family`, `requests`, `comms`, `visits` | Completo (SuperApp: solicitudes + comunicados + mensajería + visitas QR) |
| Onboarding self-service + pricing | `tenants.plan` (PlanTier), `tenants.trial_ends_at` | `signup`, `plan` | Completo (TRIAL 30d + catálogo ESENCIAL/PROFESIONAL) |
| Observabilidad capa app | — | — | Logger JSON sin PII, /api/health |

**Resumen:** Vetlla tiene construido y verificado el core asistencial del expediente, la
atención directa, la medicación/MAR, el PIA y el canal digital con familias. Lo que NO tiene
es todo el bloque económico-administrativo, RRHH, logística y los módulos de cumplimiento
normativo estructurado que exige la inspección autonómica.

---

## PASO 2 — Mapa de capacidades de un ERP sociosanitario completo (referencia ResiPlus)

### A. Asistencial (nuclear)
A1. Expediente sociosanitario completo (identificación, dependencia, sanitario, social)
A2. Valoración geriátrica integral (escalas + informe de valoración)
A3. Medicación + MAR + botiquín (stock de unidad)
A4. PIA/PAI con revisión periódica y firma
A5. Registros de atención diaria (constantes, ABVD, incidencias, deposiciones, ingesta)
A6. Historia clínica de enfermería (notas de enfermería por turno)
A7. Evolución médica (notas médicas, interconsultas, informes de alta)
A8. Heridas / UPP con protocolo de cura
A9. Dieta individualizada + menú del centro (integración cocina)
A10. Fisioterapia / rehabilitación (sesiones, objetivos funcionales)
A11. Trabajo social (informe social, recursos externos, prestaciones)
A12. Terapia ocupacional / actividades (programa de actividades, asistencia)
A13. Psicología (notas psicológicas, seguimiento)
A14. Sujeciones mecánicas (protocolo completo: prescripción + consentimiento + revisión + registro)
A15. Gestión de exitus (registro de fallecimiento, comunicación a familia, trámites)

### B. Económico-administrativo
B1. Facturación a particulares (cuotas mensuales, desglose de servicios, emisión de recibo)
B2. Facturación a CCAA por plazas concertadas (modelo de factura autonómica, tarifas concertadas)
B3. Copagos y participación del usuario (cálculo de capacidad económica Ley 39/2006)
B4. Gestión de cobros (domiciliación SEPA, remesas XML SEPA, seguimiento de impagados)
B5. Factura electrónica (Verifactu/TicketBAI/SII — obligación fiscal ES)
B6. Contabilidad integrada o exportación a contable (asientos, diario, mayor)
B7. Presupuesto y control de gastos por centro
B8. Gestión de proveedores y órdenes de compra
B9. Liquidación de estancias (altas parciales, días de ausencia, vacaciones del residente)

### C. RRHH
C1. Ficha del trabajador (datos personales, categoría, titulación, datos bancarios)
C2. Cuadrantes y turnos (planificación mensual, cobertura mínima por unidad)
C3. Control de fichaje (entrada/salida, geolocalización si aplica)
C4. Gestión de ausencias (vacaciones, IT, permisos)
C5. Horas extra y compensación
C6. Exportación/integración con gestoría de nóminas (A3, Nominasol, etc.)
C7. Gestión de formación y acreditaciones (cursos obligatorios, vencimientos)
C8. Prevención de riesgos laborales (documentación básica)

### D. Logística / Hostelería
D1. Farmacia / almacén de medicamentos (stock, lotes, caducidades, pedidos a proveedor)
D2. Control de temperatura de neveras de medicación
D3. Dietética / cocina / menús (elaboración de menús, lista de la compra, alérgenos)
D4. Lavandería (registro de ropa por residente, rotación de lencería)
D5. Mantenimiento (parte de avería, órdenes de trabajo, revisiones periódicas reglamentarias)
D6. Transporte (rutas de recogida/entrega para centros de día, gestión de vehículo)
D7. Almacén general (material sanitario, productos de higiene, inventario)

### E. Calidad y Cumplimiento Normativo
E1. Libro de registro oficial (entrada/salida de residentes con formato autonómico)
E2. Informes a la administración autonómica / SISAAD (Sistema de Información del SAAD)
E3. Indicadores de calidad (UPP nosocomiales, caídas, infecciones, absentismo, satisfacción)
E4. Gestión de inspecciones (preparación de documentación, histórico de inspecciones, no-conformidades)
E5. Protocolos normalizados de actuación (PNA: contención, urgencias, aislamiento, exitus)
E6. UNE 158101 (atención centrada en la persona — obligatoria Madrid nov-2026, en expansión)
E7. Plan de igualdad y cumplimiento laboral básico
E8. Gestión de quejas y sugerencias (registro, respuesta, indicador de resolución)
E9. Acreditación y licencia de apertura (documentación de requisitos por CCAA)

### F. Cuadro de Mando / BI
F1. KPIs de ocupación y facturación por centro (dirección)
F2. KPIs asistenciales (escalas por residente, evolución, alertas clínicas)
F3. KPIs de RRHH (absentismo, cobertura, rotación)
F4. Informes exportables (PDF/Excel) para inspección y auditoría interna
F5. Comparativa multi-centro (grupos corporativos)
F6. BI avanzado (integración con herramientas externas: Metabase, Power BI)

---

## PASO 3 — Gap Analysis

Leyenda severidad: **BLOQUEANTE** (impide que un centro opere o abandone ResiPlus), **ALTO**
(necesario en los primeros 6 meses), **MEDIO** (deseable año 1), **BAJO** (nice-to-have).

### A. Asistencial

| ID | Módulo | Vetlla hoy | Qué falta | Dependencias externas | Valor retención | Severidad |
|---|---|---|---|---|---|---|
| A1 | Expediente completo | 40+ campos, 14 tablas, 11 escalas | Historia clínica de enfermería por turno (notas narrativas); evolución médica (notas del médico, interconsultas, informes de alta) | Ninguna | Alto: es donde el inspector mira primero | **BLOQUEANTE** |
| A2 | Valoración geriátrica integral | 11 escalas en `assessments` | Informe consolidado de valoración (PDF firmable); periodicidad obligatoria y alerta de vencimiento | Proveedor firma (Q-008) para firma digital | Alto: documento clave para PIA y concierto | ALTO |
| A3 | Medicación + MAR + botiquín | Prescripción + MAR completo + offline | Stock de unidad (botiquín): cantidad, lotes, caducidades | Ninguna (integraciones con farmacia son roadmap) | Medio: los grandes tienen farmacia integrada; los pequeños usan papel | MEDIO |
| A5-A6 | Atención + notas de enfermería | CareRecord (constantes, ABVD, etc.) | Notas de enfermería narrativas por turno (texto libre, firmadas por el autor) | Ninguna | Alto: es el registro de turno que pide el inspector | ALTO |
| A7 | Evolución médica | Diagnoses básico | Notas médicas con firma del facultativo, interconsultas, informes de alta/ingreso | Firma electrónica (Q-008) para validez | Alto para centros con médico propio | ALTO |
| A10 | Fisioterapia / rehab | Nada | Sesiones de fisio, objetivos funcionales ABVD, evolución | Ninguna | Medio: diferenciador en centros grandes | MEDIO |
| A11 | Trabajo social | LifeStory básica | Informe social estructurado (problemática, recursos, historia social), gestión de prestaciones/becas | Ninguna | Alto: el trabajador social tiene su propio módulo en ResiPlus | ALTO |
| A12 | Terapia ocupacional / actividades | Nada | Programa de actividades por centro, registro de asistencia por residente | Ninguna | Medio: diferenciador de calidad | MEDIO |
| A13 | Psicología | Nada | Notas psicológicas, test cognitivos, seguimiento (más allá de GDS/Pfeiffer) | Ninguna | Bajo en centros pequeños; medio en centros especializados demencia | BAJO/MEDIO |
| A15 | Gestión de exitus | `residents.status=BAJA` + `discharge_reason` | Protocolo: registro de hora, médico certificante, notificación a familia, comunicación al registro civil, alta de plaza | Ninguna | Obligatorio por ley; el proceso hoy es manual | **BLOQUEANTE** |

### B. Económico-administrativo

| ID | Módulo | Vetlla hoy | Qué falta | Dependencias externas | Bloqueante para abandono ResiPlus | Severidad |
|---|---|---|---|---|---|---|
| B1 | Facturación particulares | Nada (solo modelo de datos PlanTier para el SaaS) | Factura de estancia mensual por residente: desglose de servicios, servicios extra, conceptos adicionales; emisión PDF; historial | Ninguna para factura básica | Sí: el centro no puede facturar sin esto | **BLOQUEANTE** |
| B2 | Facturación a CCAA | Nada | Modelo de factura por plaza concertada, tarifas negociadas, liquidación mensual a CCAA (formato varía por autonomía: Madrid, Catalunya, Andalucía, etc.) | APIs/formatos de cada CCAA (17 sistemas distintos); asesoría normativa por autonomía | Sí para centros concertados (~60% del mercado) | **BLOQUEANTE** para concertados |
| B3 | Copagos (participación usuario) | `place_regime` (PRIVADA/CONCERTADA/PVS) | Cálculo de aportación del usuario según resolución de dependencia (IPREM, % de pensión, tabla autonómica); generación de recibo de copago | Normativa autonómica (varía por CCAA); pendiente asesoría legal | Sí para plazas concertadas | **BLOQUEANTE** para concertados |
| B4 | Cobros + SEPA | Nada | Mandato SEPA por residente/pagador; generación de fichero XML SEPA (pain.008.003.02) para presentar al banco; gestión de devoluciones (R-transactions) | Banco/entidad financiera para SEPA | Sí: es el mecanismo de cobro principal | **BLOQUEANTE** |
| B5 | Factura electrónica | Nada | Verifactu (AEAT, obligatorio pymes ES desde 2025-2026 según calendario); TicketBAI (País Vasco/Navarra); SII (grandes empresas, facturación >6M€) | Homologación AEAT (proceso de certificación); API AEAT | Sí (obligación fiscal) | **BLOQUEANTE** (legal) |
| B6 | Contabilidad | Nada | Al menos exportación de asientos contables (formato A3/Contaplus/genérico); idealmente integración bidireccional | Integración con software contable del cliente (A3, Sage, etc.) | No bloqueante si exporta; sí si el centro lo quiere integrado | ALTO |
| B9 | Liquidación de estancias | Nada | Cálculo de días de ausencia (hospitalización, vacaciones), ajuste de factura proporcional, nota de abono | Ninguna | Alto: los centros tienen muchas bajas temporales | ALTO |

### C. RRHH

| ID | Módulo | Vetlla hoy | Qué falta | Dependencias externas | Bloqueante | Severidad |
|---|---|---|---|---|---|---|
| C1 | Ficha del trabajador | `users` (email, nombre, rol, jobTitle) | Datos completos: DNI, categoría profesional, titulación, datos bancarios, fecha de alta, contrato | Ninguna | Sí para operar sin Excel paralelo | ALTO |
| C2 | Cuadrantes / turnos | Nada | Planificación mensual de turnos por unidad, cobertura mínima, alertas de infra-cobertura | Ninguna | Sí: es el módulo más solicitado después de la facturación según benchmarks del sector | **BLOQUEANTE** |
| C3 | Control de fichaje | Nada | Registro de entrada/salida (manual + lector/app), cuadrilla real vs. planificado | Posible integración con lector biométrico/tarjeta (hardware externo) | Alto: LGTBSS obliga al registro de jornada | ALTO |
| C4 | Ausencias | Nada | Solicitud y aprobación de vacaciones, partes de IT, permisos; calendario de equipo | Integración con la Seguridad Social (Certific@) para IT en gestión avanzada | Alto: necesario para cuadrante | ALTO |
| C6 | Nóminas | Nada | Exportación de incidencias a gestoría (horas, ausencias, extras) en formato compatible | Software de nóminas del cliente (A3Nom, Nominasol, Meta4, etc.) | No bloqueante si exporta | MEDIO |
| C7 | Formación | Nada | Registro de cursos, acreditaciones, vencimientos (manipulador de alimentos, primeros auxilios, prevención) | Ninguna | Medio: lo piden los centros grandes; pequeños usan Excel | MEDIO |

### D. Logística / Hostelería

| ID | Módulo | Vetlla hoy | Qué falta | Dependencias externas | Bloqueante | Severidad |
|---|---|---|---|---|---|---|
| D1 | Farmacia / almacén med. | Nada (solo prescripción) | Stock de medicamentos por unidad/centro, control de lotes y caducidades, pedidos a distribuidora | Integración con distribuidoras farmacéuticas (Cofares, Alliance, Hefame) — complejo; puede hacerse sin integración al inicio | No bloqueante para operar; sí para auditoría de medicación de centros grandes | MEDIO |
| D3 | Dieta / cocina / menús | `diet_type` y `liquid_texture` en Resident | Elaboración de menús por semanas, lista de la compra, control de alérgenos por menú, dietas especiales activas del día para cocina | Ninguna para versión básica | Medio: operativo para cocina es diferenciador importante | MEDIO |
| D5 | Mantenimiento | Nada | Parte de avería, orden de trabajo, histórico de intervenciones, revisiones periódicas reglamentarias (ascensores, extintores, calderas) | Ninguna | Bajo-Medio: los pequeños usan teléfono + cuaderno | BAJO |
| D6 | Transporte | Nada | Rutas de recogida/entrega para centros de día, gestión de asistentes, parte de transporte | Ninguna | Bajo para residencias; Medio-Alto para centros de día | MEDIO (centros de día) |

### E. Calidad y Cumplimiento Normativo

| ID | Módulo | Vetlla hoy | Qué falta | Dependencias externas | Bloqueante | Severidad |
|---|---|---|---|---|---|---|
| E1 | Libro de registro oficial | `residents` (admissionDate, dischargeDate, status) | Formato oficial de libro de registro de entrada/salida de residentes (cada CCAA tiene su modelo); exportable/imprimible en el formato que pide la inspección | Modelos autonómicos (17 CCAA, algunos digitales otros papel) | Sí: la inspección lo pide siempre | **BLOQUEANTE** |
| E2 | SISAAD | Nada | Generación de ficheros XML del IMSERSO para el Sistema de Información del SAAD (Resoluciones de PIA, altas/bajas de residentes, indicadores de calidad del SAAD) | API/formato IMSERSO + integración con resoluciones del IAAP de cada CCAA | Sí para centros concertados que reciben subvención pública | **BLOQUEANTE** para concertados |
| E3 | Indicadores de calidad | Parcialmente (UPP, caídas, Norton/Braden ya existen en schema) | Panel de indicadores agregados (% UPP nosocomiales, tasa caídas, % reingresos, infecciones, satisfacción); trending histórico | Ninguna (los datos ya están en el schema) | Alto: es lo que evalúa la inspección + UNE 158101 | ALTO |
| E4 | Gestión de inspecciones | Nada | Registro de inspecciones recibidas, no-conformidades, plan de mejora, seguimiento | Ninguna | Medio: el dolor es real pero los centros usan Excel | MEDIO |
| E6 | UNE 158101 | LifeStory ya en schema | Módulo estructurado de PCP (Planificación Centrada en la Persona): 8 dimensiones de bienestar, perfil de la persona, historia de vida estructurada, revisión periódica | Ninguna para el modelo; potencialmente certificadora para la acreditación | Sí en Madrid (nov-2026); en expansión a otras CCAA | **BLOQUEANTE** (Madrid nov-2026) |
| E8 | Quejas y sugerencias | `service_requests` puede cubrir parte | Módulo específico de quejas/sugerencias con registro oficial, plazo de respuesta legal (10 días), informe para inspección | Ninguna | Medio: la hoja de reclamaciones es legal; el módulo de gestión es diferenciador | MEDIO |

### F. Cuadro de Mando / BI

| ID | Módulo | Vetlla hoy | Qué falta | Dependencias externas | Bloqueante | Severidad |
|---|---|---|---|---|---|---|
| F1 | KPIs ocupación | `/ocupacion` con plano + KPIs básicos | KPIs de facturación por centro (ingresos vs. coste plaza, ocupación media mensual) | Módulo B (facturación) primero | Medio | MEDIO |
| F2 | KPIs asistenciales | Alertas de no-administrado, Norton/Braden | Panel de tendencias: escalas por cohorte, evolución de caídas/UPP en el tiempo | Ninguna (datos ya existen) | Alto: diferenciador de calidad | ALTO |
| F4 | Informes exportables | Nada estructurado | Generación de PDF de expediente, informe de valoración, informe de inspección | Librería PDF (pdfkit, puppeteer, etc.) en la UE | Alto: lo piden todos los clientes | ALTO |

---

## PASO 4 — Reencuadre Estratégico

La decisión de Angel de competir con paridad total frente a ResiPlus reencuadra el
posicionamiento de forma profunda: Vetlla deja de ser la "alternativa ligera cloud-native con
IA" y aspira a ser "el ERP sociosanitario que ResiPlus debería haber sido si lo hubieran
construido hoy". El diferencial sigue siendo la arquitectura (cloud-native, API-first, IA
agéntica), pero ahora sobre un core funcional equivalente, no reducido. Esto es defendible
porque la arquitectura de Vetlla —multitenancy real con RLS, API tRPC, PWA offline, capa IA
provider-agnóstica— escala al core completo sin refactorización estructural: los módulos
nuevos son tablas nuevas con `tenantId + RLS`, routers tRPC, y UI en el mismo stack. No hay
deuda técnica de fondo que lo impida.

El riesgo honesto es de tiempo y conocimiento normativo, no de arquitectura. ResiPlus tiene
más de 20 años de profundidad funcional en dos áreas que no son UX sino integración
regulatoria: (a) los formatos autonómicos de facturación concertada, libro de registro y
SISAAD varían por CCAA y cambian con cada decreto; (b) la certificación de factura
electrónica (Verifactu/TicketBAI/SII) requiere homologación con la AEAT, un proceso que no
es solo código sino trámite administrativo. Alcanzar paridad total en estos bloques es
plausible, pero el camino correcto es hacerlo con apoyo de asesoría normativa externa por
CCAA y con un gestor de Verifactu certificado, no inventarlo desde cero. El riesgo de
construir Verifactu propio o los formatos SISAAD sin validación legal es alto: un error puede
exponer al cliente a una inspección de Hacienda o a perder la subvención del concierto.

La pregunta estratégica que debe responder Angel es si Vetlla compite en paridad funcional
total (incluyendo los módulos económico-administrativos y RRHH completos, que son los más
regulados y los más caros de mantener) o en "core suficiente + mucho mejor UX/IA/SuperApp":
es decir, el bloque asistencial completo + cumplimiento normativo E + los módulos económicos
básicos (facturación particulares + SEPA), dejando la facturación a CCAA, contabilidad, y
nóminas como integraciones con software especializado (no compitiendo con Sage o Nominasol,
sino conectándose a ellos). Esta segunda vía sería el punto de partida de los primeros 18
meses y requeriría mucho menos esfuerzo normativo, con un mensaje comercial igualmente potente
para el beachhead de centros pequeños/independientes.

---

## PASO 5 — Plan por Módulos Priorizado (MoSCoW adaptado)

Criterio de ordenación: **valor de retención del cliente × construible sin bloqueo externo ×
refuerza lo ya hecho**. Solo se contemplan los módulos faltantes; los existentes están
consolidados.

### Must Have (sin esto, un centro no puede abandonar ResiPlus)

| Prioridad | Módulo | Esfuerzo | Bloqueos | Por qué ahora |
|---|---|---|---|---|
| 1 | **Notas de enfermería por turno** (A1/A5-A6) | S | Ninguno | El inspector lo pide siempre; los datos de CareRecord ya existen como base; es extensión natural del flujo offline del auxiliar |
| 2 | **Facturación a particulares básica** (B1 + B9) | M | Ninguno para versión básica | Sin esto el centro necesita otro sistema en paralelo para cobrar |
| 3 | **Remesas SEPA** (B4) | M | Banco del cliente (mandato); sin API externa en Vetlla | Ligado a B1; el cobro sin domiciliación es impracticable a escala |
| 4 | **Cuadrantes / turnos básico** (C2) | L | Ninguno | Es el módulo más demandado del sector tras la facturación; no hay dependencia externa |
| 5 | **Libro de registro autonómico** (E1) | M-L | Modelos autonómicos (empezar por Madrid + Catalunya) | La inspección siempre lo pide; empezar con los dos mercados más grandes |
| 6 | **UNE 158101 estructurado** (E6) | M | Ninguno (LifeStory ya en schema; ampliar 8 dimensiones) | Obligatorio en Madrid nov-2026; Vetlla puede llegar antes que ResiPlus |
| 7 | **Gestión de exitus** (A15) | S | Ninguno | Proceso obligatorio por ley; hoy es un campo de texto libre |
| 8 | **Informe de valoración PDF** (F4 parcial) | S | Librería PDF (pdfkit en UE) | Solicitado por todos los clientes; datos ya existen |

### Should Have (necesario en los primeros 12 meses)

| Módulo | Esfuerzo | Bloqueos |
|---|---|---|
| Informe social estructurado (A11) | M | Ninguno |
| Ficha completa del trabajador (C1) | S | Ninguno |
| Control de fichaje básico (C3) | M | Hardware opcional |
| Panel de indicadores de calidad (E3) | M | Datos ya existen en schema |
| Gestión de ausencias (C4) | M | Ninguno |
| Notas médicas / evolución (A7) | M | Firma para validez completa (Q-008) |
| Dieta / cocina básica (D3) | M | Ninguno |
| Factura electrónica Verifactu (B5) | XL | Homologación AEAT — asesoría externa obligatoria |

### Could Have (año 2, según demanda y decisión de competir en paridad total)

Facturación a CCAA (B2), copagos (B3), SISAAD (E2), farmacia/almacén (D1), contabilidad (B6),
nóminas (C6), fisioterapia (A10), terapia ocupacional (A12), mantenimiento (D5), transporte (D6).

### Won't Have (sin decisión de Angel de paridad total)

Contabilidad integrada completa, nóminas propias, integraciones con hardware farmacia/RFID,
apps nativas de RRHH.

---

### Modelo de datos de alto nivel: los 3 primeros candidatos

#### Candidato 1: Notas de enfermería por turno (NursingNote)

```
model NursingNote {
  id           String   -- tenantId + RLS ENABLE FORCE
  tenantId     String   -- tenant_id, índice
  residentId   String   -- FK Resident
  shift        Enum     -- MAÑANA | TARDE | NOCHE
  shiftDate    Date     -- fecha del turno (UTC midnight)
  body         String   -- texto narrativo (Markdown permitido)
  authorId     String   -- user.id (sanitario/auxiliar)
  signedAt     DateTime?-- firmado digitalmente (Q-008 si aplica)
  createdAt    DateTime
}
-- Índices: (tenantId, residentId, shiftDate), (tenantId, authorId)
-- Dependencias: ninguna externa; extiende el flujo offline de CareRecord
```

#### Candidato 2: Factura de estancia (Invoice + InvoiceLineItem)

```
model Invoice {
  id           String   -- tenantId + RLS ENABLE FORCE
  tenantId     String
  residentId   String   -- FK Resident
  period       String   -- "2026-06" (año-mes)
  status       Enum     -- BORRADOR | EMITIDA | COBRADA | IMPAGADA | ANULADA
  issuedAt     DateTime?
  dueAt        DateTime?
  totalCents   Int      -- importe total en céntimos (evitar Float)
  sepaMandate  String?  -- referencia del mandato SEPA del pagador
  pdfUrl       String?  -- URL firmada (object storage Q-004)
  createdAt    DateTime
  lines        InvoiceLineItem[]
}

model InvoiceLineItem {
  id          String
  tenantId    String
  invoiceId   String   -- FK Invoice
  concept     String   -- "Estancia mensual", "Fisioterapia", etc.
  units       Float    -- días, sesiones, etc.
  unitPrice   Int      -- en céntimos
  totalCents  Int
}
-- Dependencias: ninguna para versión básica; Verifactu = bloqueo externo (B5)
```

#### Candidato 3: Turno / cuadrante (Shift + ShiftAssignment)

```
model ShiftTemplate {
  id         String   -- tenantId + RLS
  tenantId   String
  centerId   String   -- FK Center
  name       String   -- "Mañana 7-15", "Tarde 15-22", "Noche 22-7"
  startTime  String   -- "HH:MM"
  endTime    String   -- "HH:MM"
  minStaff   Int      -- cobertura mínima obligatoria por turno
}

model ShiftAssignment {
  id         String
  tenantId   String
  userId     String   -- FK User (trabajador asignado)
  templateId String   -- FK ShiftTemplate
  date       Date     -- día de trabajo
  status     Enum     -- PLANIFICADO | CONFIRMADO | AUSENTE | SUSTITUIDO
  notes      String?
  createdById String? -- quien planificó
  createdAt  DateTime
}
-- Dependencias: ninguna; C3 (fichaje) y C4 (ausencias) son extensiones naturales
```

---

### Recomendación: Primer Módulo a Construir

**Notas de enfermería por turno (NursingNote).**

Razones:

1. **Sin dependencia externa:** ningún proveedor, ninguna API, ninguna homologación. Se puede
   construir y validar con un cliente piloto esta semana.

2. **Bloquea el abandono de ResiPlus:** el inspector de cualquier CCAA pide el registro de
   turno de enfermería como evidencia de la continuidad asistencial. Sin esto, un centro no
   puede operativamente usar Vetlla como sistema único.

3. **Refuerza lo ya construido:** es la extensión natural del flujo offline del auxiliar/sanitario
   en `/atencion`. El autor, el turno y la fecha ya son conceptos del sistema. El schema de
   `NursingNote` comparte la misma lógica de `CareRecord` (tenantId + RLS + authorId +
   offline-first). Se puede reutilizar la cola de sync existente.

4. **Diferencial de IA inmediato:** el copiloto ya puede dictar notas en lenguaje natural
   (Feature 1, H5). La NursingNote es el tercer caso de uso del copiloto, el más visible
   para el sanitario: "dictado de la ronda de enfermería" -> nota estructurada + firmada.
   Este caso de uso no está disponible en ResiPlus.

5. **Esfuerzo pequeño:** 1 tabla, 1 router (6-8 endpoints), 1 pantalla en el expediente y
   en el flujo del sanitario. Estimación: 2-3 días de trabajo. Ratio impacto/esfuerzo máximo.

---

## Decisiones Escaladas a Angel

Ver sección `open_questions` del `project_state.yaml`:

- **Q-010**: Posicionamiento definitivo: paridad total vs. core suficiente + integración con
  software especializado para facturación CCAA/nóminas/contabilidad. Determina el roadmap de
  los próximos 18 meses.

- **Q-011**: Asesoría normativa externa: para construir facturación a CCAA (B2), copagos (B3)
  y SISAAD (E2) correctamente se necesita validación legal por autonomía (al menos Madrid y
  Catalunya como mercados beachhead). ¿Tiene Angel ya un asesor o gestoría de referencia en
  el sector?

- **Q-012**: Factura electrónica Verifactu (B5): el proceso de homologación con la AEAT
  requiere intervención de un tercero certificado o de un proveedor de soluciones Verifactu
  homologado (Factura+, InvoPilot, etc.). ¿Se construye en casa o se integra con un proveedor
  certificado? Recomendación: integrar con proveedor certificado para evitar el riesgo de
  homologación. Esta decisión desbloquea la facturación completa (B1-B5).
