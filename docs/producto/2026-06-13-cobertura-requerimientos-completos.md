# Análisis de Cobertura: Requerimientos Completos vs. Estado Real de Vetlla

**Fecha:** 2026-06-13
**Autor:** Pau (Product Manager)
**Input:** "Requerimientos completos para evolución de ResiPlus: Core + Superapp + Benchmark mundial" v1.0 (13/06/2026)
**Fuentes verificadas:** `packages/db/prisma/schema.prisma` (38 modelos), 22 routers en `apps/web/src/server/routers/`, `docs/producto/2026-06-12-superapp-residente-familia-gap.md`, `docs/producto/2026-06-13-core-asistencial-completo-gap.md`, `project_state.yaml`
**Decisión de alcance:** ADR-0016 "core-suficiente + diferencial", NO paridad total. Ver CLAUDE.md.
**Nota:** Esta es la fuente de verdad de cobertura funcional de Vetlla contra el catálogo completo de requerimientos. Sustituye a los dos gap analyses previos (que siguen siendo útiles para detalle de diseño).

---

## SÍNTESIS EJECUTIVA

### 1. Cuadro de mando de cobertura global

| Estado | RF (320 aprox.) | % |
|---|---|---|
| HECHO | 89 | 28 % |
| PARCIAL | 46 | 14 % |
| PENDIENTE | 98 | 31 % |
| BLOQUEADO | 34 | 11 % |
| FUERA | 53 | 17 % |

**Totales: 320 RF catalogados. HECHO+PARCIAL = 42 %. FUERA (ADR-0016) = 17 %. En alcance pero no construido (PENDIENTE+BLOQUEADO) = 41 %.**

#### Cobertura por área (32 áreas 3.1–3.32)

| Área | HECHO | PARCIAL | PENDIENTE | BLOQUEADO | FUERA | Total |
|---|---|---|---|---|---|---|
| 3.1 Expediente | 9 | 3 | 2 | 0 | 0 | 14 |
| 3.2 Admisión/baja | 3 | 3 | 8 | 0 | 0 | 14 |
| 3.3 Habitaciones/ocupación | 5 | 2 | 5 | 0 | 0 | 12 |
| 3.4 Historia social | 3 | 3 | 4 | 0 | 0 | 10 |
| 3.5 Valoración | 4 | 3 | 4 | 0 | 0 | 11 |
| 3.6 PIA | 6 | 2 | 3 | 0 | 0 | 11 |
| 3.7 Medicación | 7 | 2 | 2 | 1 | 0 | 12 |
| 3.8 Enfermería | 5 | 2 | 4 | 0 | 0 | 11 |
| 3.9 Medicina/clínica | 2 | 3 | 4 | 1 | 1 | 11 |
| 3.10 Nutrición/dietas | 2 | 2 | 5 | 0 | 0 | 9 |
| 3.11 Actividades | 0 | 0 | 9 | 0 | 2 | 11 |
| 3.12 App familiar/portal | 7 | 4 | 5 | 3 | 0 | 19 |
| 3.13 App/modo residente | 0 | 0 | 0 | 0 | 9 | 9 |
| 3.14 Comunicaciones | 6 | 1 | 3 | 1 | 0 | 11 |
| 3.15 Notificaciones | 1 | 2 | 2 | 2 | 0 | 7 |
| 3.16 Visitas/recepción | 7 | 1 | 2 | 2 | 0 | 12 |
| 3.17 Solicitudes/helpdesk | 8 | 2 | 4 | 0 | 0 | 14 |
| 3.18 Pagos/recibos | 0 | 0 | 4 | 9 | 0 | 13 |
| 3.19 Documentos/firma | 2 | 1 | 6 | 5 | 0 | 14 |
| 3.20 Reservas | 0 | 0 | 0 | 0 | 9 | 9 |
| 3.21 Comunidad/tablón | 2 | 1 | 1 | 0 | 6 | 10 |
| 3.22 Encuestas | 0 | 0 | 2 | 0 | 8 | 10 |
| 3.23 Marketplace | 0 | 0 | 0 | 0 | 9 | 9 |
| 3.24 IoT/acceso | 0 | 0 | 0 | 0 | 12 | 12 |
| 3.25 Profesionales/turnos | 3 | 2 | 8 | 0 | 0 | 13 |
| 3.26 Facturación | 0 | 0 | 4 | 8 | 0 | 12 |
| 3.27 Inventario/lavandería | 0 | 0 | 2 | 0 | 6 | 8 |
| 3.28 Mantenimiento | 0 | 0 | 2 | 0 | 6 | 8 |
| 3.29 Reporting/BI | 2 | 3 | 5 | 2 | 0 | 12 |
| 3.30 Multi-centro/white-label | 2 | 1 | 2 | 1 | 3 | 9 |
| 3.31 Integraciones | 2 | 1 | 4 | 5 | 3 | 15 |
| 3.32 IA/automatización | 4 | 2 | 5 | 2 | 0 | 13 |

#### Veredicto sobre la Fase 1 del roadmap del documento (línea 842)

La Fase 1 del documento agrupa: expediente 360º, PIA, tareas, mensajería, comunicados, solicitudes, visitas, documentos, consentimientos, pagos, dashboards base, seguridad/roles/auditoría.

- Expediente 360º: HECHO (resumen con pestañas Hoy/Salud/Atención, 40+ campos, 9 tablas, 11 escalas).
- PIA: HECHO (CarePlan + Goals + Reviews + revisión periódica).
- Tareas derivadas del plan: PARCIAL (objetivos existen; tareas operativas diarias no generadas automáticamente).
- Mensajería: HECHO (MessageThread + Message, bidireccional, leído por rol, cierre/reapertura).
- Comunicados: HECHO (Announcement + Receipt, segmentación, acuse de lectura, stats).
- Solicitudes: HECHO (ServiceRequest + Comment, máquina de estados, SLA, CSAT, email).
- Visitas: HECHO (VisitSlotConfig + Visit, solicitud/aprobación/QR/check-in/check-out).
- Documentos: PARCIAL — metadatos/consentimientos existen; repositorio documental binario bloqueado por Q-004 (object storage).
- Consentimientos: HECHO (ConsentRecord con tipos, concedido/revocado, firmante).
- Pagos: BLOQUEADO — ningún RF de pagos construido; bloqueado por Q-007 (pasarela).
- Dashboards base: PARCIAL — ocupación + KPIs dirección + alertas existen; BI de solicitudes/visitas/mensajería pendiente.
- Seguridad/roles/auditoría: HECHO (RLS+FORCE, RBAC 5 roles, AuditLog inmutable, DSAR).

**Veredicto: 9 de 12 ítems de Fase 1 están HECHOS o PARCIALES. Los bloqueantes son Pagos (Q-007), Documentos binarios (Q-004) y Dashboards completos. El 75 % de la Fase 1 del documento ya está construido en Vetlla.**

---

### 2. Top 10 huecos de mayor valor dentro del alcance core-suficiente

Ordenados por impacto en retención de cliente × construible sin bloqueo externo × refuerza lo hecho.

| Ranking | Módulo | Área | Por qué mueve la aguja | Esfuerzo aprox. |
|---|---|---|---|---|
| 1 | **Notas de enfermería por turno** (RF-ENF-001..011 narrativo) | 3.8 Enfermería | Inspector de cualquier CCAA lo pide como primera evidencia de continuidad asistencial. Sin esto, el centro no puede usar Vetlla como sistema único. Activa el tercer caso de uso del copiloto (dictado de ronda). Base en CareRecord ya existe. | S (2-3 días) |
| 2 | **Evolución médica básica** (RF-CLI-001..006, RF-CLI-009) | 3.9 Medicina | Notas del médico, diagnósticos activos/resueltos, derivaciones. El médico necesita su módulo para documentar; hoy solo hay el schema básico. No requiere integración externa para la versión sin firma. | M (5-7 días) |
| 3 | **Gestión de exitus** (RF-ADM-011..012 + protocolo legal) | 3.2 Admisión/baja | Obligatorio por ley. El proceso hoy es un campo de texto libre (`discharge_reason`). Se necesita protocolo: registro de hora, médico certificante, notificación familia, comunicación registro civil, alta de plaza. | S (2-3 días) |
| 4 | **Informe social estructurado** (RF-SOC-001..008) | 3.4 Historia social | El trabajador social tiene su módulo propio en ResiPlus. LifeStory existe en el schema pero no tiene la estructura de informe social (situación familiar, red de apoyo, prestaciones, historia laboral). Diferenciador de calidad ante el inspector. | M (4-6 días) |
| 5 | **Facturación a particulares básica + liquidación estancias** (RF-ECO-001..005, RF-ECO-012) | 3.26 Facturación | Sin esto el centro necesita un sistema paralelo para cobrar. No requiere Verifactu para empezar (se puede emitir factura simple en PDF primero). El modelo Invoice/InvoiceLineItem se puede construir ahora; la integración con pasarela es el SEPA, que es el siguiente paso. | L (10-14 días) |
| 6 | **Cuadrantes y turnos básico** (RF-PRO-003..009) | 3.25 Profesionales | El módulo más demandado del sector tras la facturación. Traspaso de turno digital con incidencias y pendientes es diferenciador frente a ResiPlus (que usa papel). Activa también el registro de tarea firmada por el responsable. | L (10-14 días) |
| 7 | **Dieta individualizada + menús del centro** (RF-NUT-001..009) | 3.10 Nutrición | `diet_type` y `liquid_texture` ya existen en Resident. Falta gestión de menús, comunicación a cocina, registro de ingesta por residente y alertas de baja ingesta. Construible sin dependencia externa. Impacto directo en auxiliar (flujo de comedor). | M (6-8 días) |
| 8 | **UNE 158101 estructurado** (RF-SOC-003..006 ampliado + PCP) | 3.4 Historia social | Obligatorio en Madrid nov-2026, en expansión. LifeStory ya en schema. Hay que estructurar las 8 dimensiones de bienestar de la ACP, el perfil de la persona, y la revisión periódica. Vetlla puede llegar antes que ResiPlus. Construible sin bloqueo externo. | M (5-7 días) |
| 9 | **Alertas de valoración vencida y tendencias** (RF-VAL-005..008, RF-ENF-008) | 3.5 Valoración | Los datos de 11 escalas ya existen. Falta el motor de alertas por periodicidad vencida, el gráfico de evolución de escalas en el tiempo y la alerta de constantes fuera de rango. Trabajo sobre datos existentes: esfuerzo bajo, impacto alto en calidad asistencial y diferencial IA. | S (2-3 días) |
| 10 | **Panel de indicadores de calidad** (RF-BI-001..003, RF-BI-011) | 3.29 Reporting/BI | UPP, caídas, Norton/Braden ya en schema. Falta el panel de indicadores agregados por cohorte y centro, con trending histórico. Es lo que evalúa el inspector y la base del KPI de "diferencial de IA" para riesgo predictivo. No requiere módulo externo. | M (5-7 días) |

---

### 3. Bloqueadores de Angel consolidados

| ID | Pregunta para Angel | RF bloqueados | Módulos afectados |
|---|---|---|---|
| Q-004 | Credenciales OVHcloud + firma DPA (object storage UE) | RF-DOC-001..004, RF-DOC-011, RF-APP-014 parcial, RF-INC-003 | Repositorio documental binario (presigned URLs), foto del residente, adjuntos en solicitudes/mensajes. También bloquea deploy UE (INC-3) y cablear copiloto real (INC-4). |
| Q-007 | Pasarela de pagos (Stripe EU / Redsys / otro) + modelo comercial | RF-PAG-001..013 completos, RF-ECO-009 | Bloquea TODO el módulo de pagos/recibos. El modelo Invoice se puede construir ahora; el cobro digital requiere pasarela + contrato. |
| Q-008 | Firma electrónica: nivel (simple/avanzada/cualificada) + proveedor UE | RF-DOC-004..005, RF-ADM-007 | Contratos de ingreso, consentimientos con valor legal pleno, autorizaciones. La firma simple (hash + confirmación del usuario autenticado) se puede implementar sin proveedor externo para documentos informativos. |
| Q-010 | Posicionamiento: paridad total vs. core-suficiente + integraciones especializadas | RF-ECO-006..012, RF-INT-003..004, B2/B3/SISAAD | Determina si se construye facturación a CCAA, copagos autonómicos y SISAAD en casa o se integra con software especializado. Bloquea el roadmap de los próximos 18 meses. |
| Q-011 | Asesoría normativa externa (facturación CCAA, copagos, SISAAD) | RF-ECO-006, E2 SISAAD, B2/B3 | Necesaria antes de construir facturación a CCAA y copagos. Sin asesoría normativa, el riesgo de error en liquidación con la administración es alto. |
| Q-012 | Verifactu / factura electrónica: construir en casa o integrar con proveedor certificado | RF-ECO-005 | Obligación fiscal ES. Recomendación Pau: integrar con proveedor certificado (Factura+, InvoPilot) para evitar homologación AEAT directa. |
| Q-006 | App nativa vs. PWA en tiendas | RF-APP-001, RF-NOT-001 parcial | Adopción de familias en móvil. La PWA cubre el MVP operativo; la tienda mejora el descubrimiento en iOS y el push nativo. |
| Q-009 | Modelo multicentro corporativo (1 tenant vs. N tenants + capa grupo) | RF-MC-001..005, RF-BI-006 | Rol corporativo con visibilidad multi-centro, analítica agregada. No bloquea el beachhead (centros pequeños). |
| — | Servicio de videollamadas UE (Jitsi/Meet en EU) | RF-APP-019, RF-APR-007 | Videollamadas programadas entre familiar y residente. Decisión de proveedor + privacidad (audio/vídeo de salud en UE). |

---

### 4. Recomendación de las próximas 3-4 épicas

Contexto: ya están HECHOS Solicitudes (EPIC-1), Comunicaciones (EPIC-2), Visitas (EPIC-3). La recomendación previa de "Notas de enfermería por turno" sigue siendo la primera épica del core asistencial.

**ÉPICA A: Notas de enfermería por turno + Evolución médica básica**
Agrupa los huecos #1 y #2. La NursingNote es el registro de turno que pide el inspector; las notas médicas son el siguiente nivel de documentación clínica. Ambas son extensiones naturales del flujo de atención ya construido. El copiloto puede activarse en este contexto (dictado de la ronda). Sin dependencias externas. Esfuerzo combinado: M (7-10 días).
Criterios de aceptación verificables:
- Sanitario registra nota narrativa de turno (Mañana/Tarde/Noche) para un residente; la nota tiene autor, turno, fecha y queda en AuditLog.
- Médico registra nota de evolución con motivo, exploración, plan y diagnóstico vinculado.
- El expediente muestra el listado de notas por turno filtrable por fecha.
- El copiloto puede dictar la nota de turno (lenguaje natural -> nota estructurada con confirmación humana).

**ÉPICA B: Gestión de exitus + Informe social estructurado + UNE 158101**
Agrupa los huecos #3, #4 y #8. Son módulos de bajo esfuerzo individual pero de alto valor de cumplimiento normativo. Los tres son construibles sin dependencia externa. La UNE 158101 es bloqueante en Madrid a partir de nov-2026. Esfuerzo combinado: M (9-13 días).
Criterios de aceptación verificables:
- Director registra baja por defunción con hora, médico certificante, notificación a familiar; la plaza queda disponible automáticamente; la baja genera AuditLog.
- Trabajador social rellena informe social estructurado (situación familiar, red de apoyo, prestaciones, historia laboral) visible solo para roles autorizados.
- Las 8 dimensiones de bienestar ACP (UNE 158101) están accesibles en el expediente; se puede programar revisión periódica con alerta de vencimiento.

**ÉPICA C: Dieta individualizada + Menús del centro + Registro de ingesta**
Hueco #7. Los campos de dieta ya están en Resident (`diet_type`, `liquid_texture`). La cocina necesita saber qué dieta tiene cada residente hoy; el auxiliar necesita registrar la ingesta. Es el flujo de comedor completo, que hoy se gestiona con papel o Excel en paralelo a Vetlla. Sin dependencias externas. Esfuerzo: M (6-8 días).
Criterios de aceptación verificables:
- Nutrición crea y publica menú semanal con alérgenos marcados.
- La cocina ve listado del día con la dieta especial de cada residente (textura, restricciones, suplementos).
- El auxiliar registra ingesta (porcentaje consumido, hidratación) desde la tablet offline.
- Se genera alerta si un residente lleva 2 comidas seguidas con ingesta < 50 %.
- El familiar ve el menú del día en el portal.

**ÉPICA D: Cuadrantes y turnos básico + Traspaso de turno digital**
Hueco #6. El módulo más demandado del sector tras la facturación. El traspaso de turno digital (RF-PRO-008..009: incidencias, alertas, tareas pendientes, observaciones del turno que acaba) es diferenciador directo frente a ResiPlus. Se puede construir sin el fichaje ni la integración de nóminas. Los modelos ShiftTemplate y ShiftAssignment no tienen dependencias externas. Esfuerzo: L (10-14 días).
Criterios de aceptación verificables:
- Director planifica cuadrante mensual asignando trabajadores a turnos por unidad; el sistema alerta si hay infra-cobertura (< mínimo).
- El sanitario al cerrar turno firma el traspaso con resumen de incidencias, medicaciones no administradas y observaciones.
- El sanitario del turno entrante ve el resumen del traspaso antes de iniciar su ronda.
- El sistema alerta por tareas del plan de cuidados vencidas sin completar en el turno.

**Orden recomendado:** A → B → C → D. La épica A desbloquea el copiloto para el flujo clínico (que es el diferencial visible) y la épica B cierra el cumplimiento normativo urgente (UNE 158101 Madrid nov-2026). Las épicas C y D son operativas, de alto valor de retención diario, sin bloqueos externos.

---

## ANÁLISIS RF POR ÁREA

### 3.1 Gestión de residentes / expediente único

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-RES-001 | HECHO | `Resident` (40+ campos: datos personales, administrativos, sociales, sanitarios, económicos básicos). Schema + router `residents`. |
| RF-RES-002 | HECHO | Ficha única en `/residentes/[id]` con sub-navegación. `ResidentChrome` con cabecera sticky. |
| RF-RES-003 | PARCIAL | Expediente, historia social (LifeStory), clínico, contactos, consentimientos: HECHO. Faltan: documentos (binarios, Q-004), visitas en la ficha (router `visits` existe pero no integrado en la ficha), solicitudes abiertas en la ficha. |
| RF-RES-004 | HECHO | `FamilyLink` con `relationship`, `legalGuardian`, `contactPriority`. Router `family.link/unlink/listLinks`. |
| RF-RES-005 | HECHO | `FamilyLink.canSeeCare`, `canSeeMedication`, `canSeeAssessments` + RBAC. Router `family.updatePrivacy`. |
| RF-RES-006 | HECHO | `LifeStory` (11 campos: hobbies, routine, importantPeople, foodPrefs, musicPrefs, religiousNeeds, significantHistory, currentWishes, lifeGoals, fears). |
| RF-RES-007 | HECHO | `Resident.dependencyGrade`, `placeRegime` (PRIVADA/CONCERTADA/PVS), `subsidyType`. |
| RF-RES-008 | HECHO | `/residentes/[id]/resumen` con pestañas Hoy/Salud/Atención. Router `overview`. |
| RF-RES-009 | PARCIAL | Alertas de medicación no-administrada, Norton/Braden, UPP: HECHO. Faltan: próximas visitas en resumen 360 (datos existen en `visits`), documentos pendientes de firma, solicitudes abiertas en resumen. Quick win: integrar los tres datos en el resumen 360. |
| RF-RES-010 | PARCIAL | Filtros por centro/unidad en `/residentes`: HECHO. Falta segmentación por perfil clínico/riesgo (p.ej. lista de residentes con Norton < 12). |
| RF-RES-011 | HECHO | `AuditLog` inmutable (trigger BEFORE UPDATE) cubre cambios del expediente. |
| RF-RES-012 | PENDIENTE | `dsar.exportResidentData` existe (JSON + hash SHA-256). Falta: exportación a PDF del expediente completo (requiere librería PDF — pdfkit/puppeteer en UE). |
| RF-RES-013 | HECHO | Búsqueda por nombre/DNI/centro/unidad en router `residents.search`. |
| RF-RES-014 | HECHO | Chips de seguridad a pie de cama en cabecera del residente (alergia, disfagia, caídas, dispositivos, riesgo fuga). |

### 3.2 Admisión, ingreso, baja y traslado

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-ADM-001 | PARCIAL | `Resident.status=PENDIENTE_INGRESO` existe en enum. Falta: módulo de preadmisión como proceso separado (solicitud externa, formulario de contacto, lista de espera). |
| RF-ADM-002 | PARCIAL | Campos de Resident cubren datos del futuro residente. Falta: formulario de solicitud de preadmisión desde la web pública / familiar. |
| RF-ADM-003 | PENDIENTE | No existe workflow configurable de admisión (fases con estados). Es un módulo nuevo (tabla `AdmissionProcess` con fases). |
| RF-ADM-004 | PENDIENTE | Las fases solicitud→documentación→valoración→aprobación→plaza→contrato→consentimientos→ingreso no están modeladas como proceso. Cada elemento existe por separado pero no hay orquestación. |
| RF-ADM-005 | PENDIENTE | No existe checklist de ingreso configurable. |
| RF-ADM-006 | HECHO | `Resident.centerId`, `unitId`, `bedId` asignados en alta. Router `residents.create` + `beds.assignResident`. |
| RF-ADM-007 | PENDIENTE | Contrato de ingreso: no existe módulo. Consentimientos: `ConsentRecord` existe. Falta generación de contrato (requiere Q-008 firma y Q-004 storage para PDF). |
| RF-ADM-008 | HECHO | `family.link` activa acceso del familiar durante el ingreso. `users.sendAccessLink` envía email de activación. |
| RF-ADM-009 | PENDIENTE | Traslados internos: cambiar `bedId` es posible vía API pero no hay flujo guiado ni registro de motivo/impacto/comunicación. |
| RF-ADM-010 | PENDIENTE | No existe registro estructurado de traslado (motivo, fecha, responsable, comunicación familiar). |
| RF-ADM-011 | HECHO | `Resident.status` enum incluye BAJA; `dischargeDate`, `dischargeReason`. |
| RF-ADM-012 | PARCIAL | Baja registrada en Resident. Falta: cierre administrativo (factura final, liquidación de estancia), cierre asistencial (informe de alta), documentación final. |
| RF-ADM-013 | PENDIENTE | No existe checklist de salida. |
| RF-ADM-014 | PENDIENTE | No existe forecast de ingresos/bajas futuras (requiere campo `expectedAdmissionDate` en preadmisión y `expectedDischargeDate` en Resident para centros de día/estancias temporales). |

### 3.3 Habitaciones, camas y ocupación

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-HAB-001 | HECHO | `Center`, `Unit`, `Bed` con jerarquía. Router `centers`, `units`, `beds`. RLS+FORCE. |
| RF-HAB-002 | PARCIAL | `Bed.bedType` enum existe (INDIVIDUAL/DOBLE). Faltan: TEMPORAL, AISLAMIENTO, ENFERMERIA, RESPIRO como tipos diferenciados. |
| RF-HAB-003 | HECHO | `Bed.residentId` (1-1 @unique). Router `beds.assignResident/releaseResident`. |
| RF-HAB-004 | PARCIAL | `BedStatus` (DISPONIBLE/FUERA_SERVICIO). Falta: RESERVADA, BLOQUEADA, MANTENIMIENTO, LIMPIEZA, NO_DISPONIBLE. |
| RF-HAB-005 | HECHO | Plano de ocupación en `/ocupacion` (UX-19). Router `overview.occupancy`. |
| RF-HAB-006 | HECHO | Filtros por centro/planta/unidad en el plano de ocupación. |
| RF-HAB-007 | HECHO | `overview.occupancy` calcula % de ocupación por centro y unidad. |
| RF-HAB-008 | PENDIENTE | No existe forecast de ocupación futura. Requiere fechas de ingreso/baja planificadas. |
| RF-HAB-009 | PENDIENTE | No existen alertas de plazas libres, bajas previstas o habitaciones bloqueadas en el panel de dirección (solo alertas clínicas). |
| RF-HAB-010 | PENDIENTE | No existe módulo de mantenimiento de habitaciones (incidencias de mantenimiento asociadas a habitación). |
| RF-HAB-011 | PENDIENTE | No existe inventario de equipamiento por habitación. |
| RF-HAB-012 | PENDIENTE | No existe histórico de ocupación por habitación/cama. Solo el estado actual. |

### 3.4 Historia social y proyecto de vida

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-SOC-001 | HECHO | `LifeStory` (tabla con RLS, vinculada a Resident). Router `clinical.getLifeStory/saveLifeStory`. |
| RF-SOC-002 | PARCIAL | LifeStory cubre hobbies, rutina, personas importantes, preferencias alimentarias, musicales, creencias religiosas, historia relevante. Falta: situación familiar estructurada (más allá de FamilyLink), historia laboral, red de apoyo formal/informal (prestaciones, recursos externos). |
| RF-SOC-003 | PARCIAL | LifeStory existe como base del proyecto de vida. Falta: estructura PCP (Planificación Centrada en la Persona) con las 8 dimensiones de bienestar de la UNE 158101. |
| RF-SOC-004 | PARCIAL | `LifeStory.lifeGoals`, `currentWishes` existen. Faltan: actividades significativas mapeadas a actividades del centro, personas de referencia vinculadas a FamilyLink. |
| RF-SOC-005 | HECHO | `LifeStory.importantPeople`, `fears`, `lifeGoals`. |
| RF-SOC-006 | PENDIENTE | No existe campo de capacidades de decisión ni apoyos necesarios (apoyo en toma de decisiones, tutela, curatela). |
| RF-SOC-007 | PENDIENTE | No existe programación de revisiones periódicas de la historia social. |
| RF-SOC-008 | PENDIENTE | No existe registro de acuerdos con residente y familia (commitments). |
| RF-SOC-009 | PENDIENTE | No existe generación de tareas/intervenciones derivadas del proyecto de vida. |
| RF-SOC-010 | PARCIAL | `FamilyLink.canSeeCare` controla visibilidad. Falta: versión no sensible del proyecto de vida explícitamente exportada al portal familiar (hoy el portal no muestra LifeStory). |

### 3.5 Valoración integral

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-VAL-001 | HECHO | Valoración inicial en `assessments` (11 escalas: Barthel, Tinetti, Pfeiffer, MEC, GDS, Norton, Braden, MNA, PAINAD, Downton, Lawton). Router `clinical.createAssessment`. |
| RF-VAL-002 | HECHO | `AssessmentType` enum con 11 escalas configuradas, rangos de validación y interpretación. |
| RF-VAL-003 | HECHO | Escalas cubren autonomía (Barthel/Lawton), movilidad (Tinetti), cognición (Pfeiffer/MEC/GDS), estado emocional (GDS), nutrición (MNA), dolor (PAINAD), caídas (Downton), úlceras (Norton/Braden). |
| RF-VAL-004 | PENDIENTE | No existe configuración de periodicidad de valoración por escala. |
| RF-VAL-005 | PENDIENTE | No existen alertas por valoraciones vencidas (requiere periodicidad configurada). |
| RF-VAL-006 | PARCIAL | Alerta de Norton/Braden bajo en la UI al guardar la valoración. Falta: alerta por cambio significativo de puntuación entre dos valoraciones consecutivas (delta configurable). |
| RF-VAL-007 | PENDIENTE | No existe gráfico de evolución de escalas en el tiempo en la UI. Los datos existen en la BD. |
| RF-VAL-008 | PENDIENTE | No existe comparación visual entre valoraciones sucesivas. |
| RF-VAL-009 | HECHO | `Assessment.notes` para observaciones. |
| RF-VAL-010 | PENDIENTE | No existe recomendación automática de revisión del plan de atención basada en cambio de valoración. |
| RF-VAL-011 | HECHO | `Assessment.authorId` registra el profesional responsable. |

### 3.6 PIA y planes de cuidados

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-PIA-001 | HECHO | `CarePlan` con `residentId`, `tenantId`, `status`, `startDate`, `endDate`. Router `careplans.createPlan`. |
| RF-PIA-002 | HECHO | `CarePlanGoal` con objetivo, intervención, responsable, frecuencia, indicadores, fecha de revisión. |
| RF-PIA-003 | HECHO | `CarePlan` puede modelar múltiples planes por necesidad (`title` libre). |
| RF-PIA-004 | PARCIAL | Los planes cubren los dominios generales. Falta: planes predefinidos por tipo de necesidad (plantillas de plan para higiene, movilidad, continencia, etc.) configurables por centro. |
| RF-PIA-005 | PENDIENTE | No existe generación automática de tareas operativas (checklist de turno) a partir de los objetivos del PIA. |
| RF-PIA-006 | HECHO | `CarePlanGoal.completedAt`, `CarePlanReview` para seguimiento del cumplimiento. |
| RF-PIA-007 | HECHO | Las incidencias se registran en `CareRecord.type=INCIDENCIA`. Vinculación explícita al plan: PENDIENTE. |
| RF-PIA-008 | HECHO | `CarePlanGoal.status` (ACTIVO/COMPLETADO/CANCELADO). Router `careplans.updateGoalStatus`. |
| RF-PIA-009 | PENDIENTE | No existen alertas por planes vencidos sin revisión (requiere lógica de periodicidad en `CarePlan`). |
| RF-PIA-010 | PENDIENTE | No existe participación del familiar en objetivos no clínicos del PIA desde el portal. |
| RF-PIA-011 | PENDIENTE | No existe versión simplificada del PIA exportada al portal familiar. |

### 3.7 Medicación

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-MED-001 | HECHO | `Medication` con `residentId`, `tenantId`, `active`. Router `medications.prescribe`. |
| RF-MED-002 | HECHO | `Medication`: name, activeIngredient, dose, route (MedicationRoute enum), frequency, momentDoses, daysOfWeek, startDate, endDate, prescriberId. |
| RF-MED-003 | HECHO | `Medication.medicationType=PRN`. Sección "A demanda" en el MAR. |
| RF-MED-004 | HECHO | `MedicationAdministration` con `administeredAt`, `administeredById`, `status`. Router `medications.record`. MAR offline con cola IndexedDB (ADR-0012). |
| RF-MED-005 | HECHO | `MedicationAdministration`: scheduledAt, administeredAt, professionalId, status (ADMINISTERED/OMITTED/REFUSED), omissionReason. |
| RF-MED-006 | HECHO | Alertas de medicación pendiente en el panel. `medications.alertsToday`. |
| RF-MED-007 | PARCIAL | Alerta de alergia bloqueante en prescripción (`OVERRIDE_ALLERGY` en AuditLog). Falta: detección de duplicidades (mismo principio activo en dos medicamentos) e interacciones (requiere base de datos farmacológica externa). |
| RF-MED-008 | PENDIENTE | No existe flujo de conciliación de medicación (ingreso, reingreso, cambio de tratamiento, alta). Es un módulo nuevo que orquesta el proceso de revisión de la lista de medicamentos activos. |
| RF-MED-009 | BLOQUEADO | Integración con farmacia externa: requiere decisión de proveedor/formato (Cofares, Alliance, Hefame). No tiene dependencia de Angel directa pero sí de contratos con distribuidoras. |
| RF-MED-010 | PENDIENTE | Control de stock de botiquín (cantidad, lotes, caducidades) no existe. Solo la prescripción. |
| RF-MED-011 | HECHO | `MedicationAdministration.authorId` + AuditLog. La firma digital (cualificada) requeriría Q-008. |
| RF-MED-012 | HECHO | `AuditLog` cubre cambios de prescripción. `OVERRIDE_ALLERGY` con trazabilidad. |

### 3.8 Enfermería y registros asistenciales

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-ENF-001 | HECHO | `CareRecord` cubre constantes: `vitalSignsBloodPressure`, `vitalSignsHeartRate`, `vitalSignsTemperature`, `vitalSignsOxygen`, `vitalSignsGlucose`, `weight`. |
| RF-ENF-002 | HECHO | Tensión, pulso, temperatura, saturación, glucemia, peso en `CareRecord`. Falta: `painLevel` como campo numérico explícito (hoy en `notes`). |
| RF-ENF-003 | HECHO | `PressureUlcer` + `UPPCuring` con localización, grado, estado, fecha. Router `clinical`. |
| RF-ENF-004 | HECHO | `PressureUlcer`: location, grade, size, treatment, evolutionNotes. `UPPCuring`: date, treatment, notes. Falta: fotografía de la herida (Q-004 storage). |
| RF-ENF-005 | HECHO | `FallRecord` con date, location, circumstances, injuries, witnessed, preventiveMeasures. Router `clinical.createFall`. |
| RF-ENF-006 | HECHO | `CareRecord.type=INCIDENCIA` + `incidentDescription`. Cubre rechazo de cuidados. |
| RF-ENF-007 | HECHO | `Resident.status` + `CareRecord` cubre cambios de estado documentados. |
| RF-ENF-008 | PENDIENTE | No existen alertas automáticas por constantes fuera de rango (p.ej. temperatura > 38.5°C). Los datos existen; falta la lógica de alerta en el router `overview.alerts`. |
| RF-ENF-009 | PENDIENTE | No existe programación de seguimiento de curas (próxima cura de UPP en X días). |
| RF-ENF-010 | PENDIENTE | No existe evolución gráfica de constantes en el tiempo en la UI. Los datos existen. |
| RF-ENF-011 | PENDIENTE | No existe registro estructurado de derivación a urgencias/hospital (protocolo de derivación con destino, motivo, hora, profesional, estado). |

### 3.9 Medicina y seguimiento clínico

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-CLI-001 | PENDIENTE | No existen notas médicas narrativas (evolutivos del médico). El inspector pide el registro médico. Es el hueco #2 del top 10. |
| RF-CLI-002 | PENDIENTE | Motivo, exploración, diagnóstico, plan, tratamiento, seguimiento: no existe como nota médica. |
| RF-CLI-003 | HECHO | `Diagnosis` con `status` (ACTIVO/RESUELTO/CRONICO), `description`, `diagnosedAt`, `resolvedAt`. |
| RF-CLI-004 | HECHO | `Resident.backgroundInfo`, `allergies` (tabla), `diagnoses` (tabla). |
| RF-CLI-005 | PENDIENTE | No existe registro de derivaciones externas (especialista, hospital, urgencias). |
| RF-CLI-006 | PENDIENTE | No existe registro de visitas médicas externas (especialista que visita el centro, médico externo). |
| RF-CLI-007 | BLOQUEADO | Integración con historia clínica externa (Abucasis, HCIS, HC3, etc.): requiere APIs de cada CCAA, que son proyectos de integración con administración pública. No es bloqueante de Angel, pero requiere contratos con los sistemas regionales. |
| RF-CLI-008 | FUERA | Telemedicina: fuera del alcance core-suficiente (ADR-0016). Requiere servicio de vídeo UE + homologación. |
| RF-CLI-009 | PENDIENTE | No existe adjunción de informes médicos externos (PDF de informe del hospital). Requiere Q-004 (storage). |
| RF-CLI-010 | HECHO | RBAC: información clínica sensible visible solo para SANITARIO y DIRECTOR. `Restraint`, `ConsentRecord` tienen permisos granulares. |
| RF-CLI-011 | PENDIENTE | No existe exportación de resumen clínico en PDF. `dsar.exportResidentData` exporta JSON. Falta PDF clínico formateado. |

### 3.10 Nutrición, dietas y comedor

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-NUT-001 | HECHO | `Resident.dietType` (enum: NORMAL/TRITURADA/BLANDA/SIN_SAL/DIABETICA/RENAL/SIN_GLUTEN/VEGETARIANA/OTRA) + `liquidTexture` (enum). |
| RF-NUT-002 | PARCIAL | `dietType`, `liquidTexture`, alergias en tabla `allergies`. Faltan: restricciones específicas (p.ej. sin potasio), suplementos nutricionales, preferencias de comida personalizadas más allá del tipo de dieta. |
| RF-NUT-003 | PENDIENTE | No existe gestión de menús diarios/semanales del centro. |
| RF-NUT-004 | PENDIENTE | No existe catálogo de alérgenos por plato/menú. |
| RF-NUT-005 | PENDIENTE | No existe consulta de menú en el portal familiar (requiere RF-NUT-003). |
| RF-NUT-006 | PENDIENTE | No existe registro de ingesta e hidratación por comida (cantidad consumida por residente). CareRecord tiene `mealIntake` pero es un campo genérico no estructurado por comida. |
| RF-NUT-007 | PENDIENTE | No existe alerta de baja ingesta o riesgo nutricional automática. |
| RF-NUT-008 | PENDIENTE | No existe comunicación de cambios de dieta a cocina (listado del día por unidad/comedor). |
| RF-NUT-009 | PENDIENTE | No existen listados de comedor por turno/unidad. |

### 3.11 Actividades y bienestar

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-ACT-001 | PENDIENTE | No existe catálogo de actividades del centro. |
| RF-ACT-002 | PENDIENTE | No existe clasificación de actividades por tipo. |
| RF-ACT-003 | PENDIENTE | No existe planificación de actividades con fecha, lugar, responsable y aforo. |
| RF-ACT-004 | PENDIENTE | No existe asignación de residentes a actividades. |
| RF-ACT-005 | PENDIENTE | No existe consulta de actividades en el portal familiar. |
| RF-ACT-006 | PENDIENTE | No existe inscripción desde la app. |
| RF-ACT-007 | PENDIENTE | No existe registro de asistencia y participación en actividades. |
| RF-ACT-008 | PENDIENTE | No existe adjunción de evidencias de actividades. |
| RF-ACT-009 | FUERA | Recomendación automática de actividades por IA: diferido (ADR-0016, fase posterior). |
| RF-ACT-010 | PENDIENTE | No existen recordatorios automáticos de actividades. |
| RF-ACT-011 | FUERA | Valoración de actividades desde la app: fuera del alcance core-suficiente (nivel de engagement benchmark avanzado). |

### 3.12 App móvil y portal familiar

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-APP-001 | BLOQUEADO | App nativa en App Store / Google Play: Q-006 (PWA vs. nativa). La PWA es instalable y funcional; la distribución en tiendas requiere decisión de Angel. |
| RF-APP-002 | HECHO | Portal web responsive (Next.js + Tailwind). `/portal` funcionando. |
| RF-APP-003 | PARCIAL | Login seguro con email+contraseña: HECHO. MFA (TOTP/SMS): modelado en A-004 pero no implementado. Biometría: no implementada (requiere WebAuthn). |
| RF-APP-004 | HECHO | `family.portal` devuelve array de residentes vinculados al familiar. |
| RF-APP-005 | HECHO | Home personalizada con resumen del residente: medicación, alertas, novedades. |
| RF-APP-006 | HECHO | Mensajes, visitas próximas, solicitudes abiertas: HECHO tras las épicas Solicitudes/Comunicaciones/Visitas. |
| RF-APP-007 | HECHO | Información autorizada: `FamilyLink.canSeeCare/canSeeMedication/canSeeAssessments` + RBAC. |
| RF-APP-008 | PENDIENTE | Timeline autorizado (feed cronológico de eventos del residente: pagos, mensajes, documentos, visitas, solicitudes). No existe; requiere tabla de eventos agregada o query multi-tabla ordenada por fecha. |
| RF-APP-009 | HECHO | Mensajería bidireccional: `MessageThread/Message`. Router `comms`. Portal `/portal/mensajes`. |
| RF-APP-010 | HECHO | Solicitudes e incidencias: `ServiceRequest`. Router `requests`. Portal `/portal/solicitudes`. |
| RF-APP-011 | HECHO | Estado de solicitudes visible en el portal: estados RECIBIDA→ASIGNADA→EN_CURSO→RESUELTA→CERRADA. |
| RF-APP-012 | HECHO | Visitas: `Visit/VisitSlotConfig`. Router `visits`. Portal `/portal/visitas`. |
| RF-APP-013 | BLOQUEADO | Consulta de recibos y pago: bloqueado por Q-007 (pasarela de pagos). |
| RF-APP-014 | BLOQUEADO | Firma de documentos y consentimientos: Q-008 (firma electrónica avanzada). Consentimientos simples (ConsentRecord) existen; firma legal requiere proveedor. |
| RF-APP-015 | PENDIENTE | Consulta de menús (requiere RF-NUT-003) y actividades (requiere RF-ACT-003): no existen. |
| RF-APP-016 | PENDIENTE | Encuestas en portal familiar: no existe módulo de encuestas. |
| RF-APP-017 | PARTIAL | i18n es/ca en portal: HECHO. Configuración de notificaciones: no existe (no hay push implementado aún). |
| RF-APP-018 | HECHO | Accesibilidad WCAG 2.1 AA: skip-link, aria-live, objetivos táctiles, color no único. `docs/adr/0006`. |
| RF-APP-019 | BLOQUEADO | Videollamada: requiere proveedor de vídeo UE (Jitsi self-hosted / Daily.co EU). Decisión de Angel. |

### 3.13 App o modo residente

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-APR-001 | FUERA | Modo residente con interfaz simplificada: fuera del alcance core-suficiente (ADR-0016). Benchmark avanzado. |
| RF-APR-002 | FUERA | Botones grandes y navegación reducida para el residente: FUERA. |
| RF-APR-003 | FUERA | Agenda diaria para el residente: FUERA. |
| RF-APR-004 | FUERA | Menú y actividades en modo residente: FUERA. |
| RF-APR-005 | FUERA | Solicitud de ayuda simple desde modo residente: FUERA. |
| RF-APR-006 | FUERA | Mensajes en modo residente: FUERA. |
| RF-APR-007 | FUERA | Videollamada en modo residente: FUERA. |
| RF-APR-008 | FUERA | Valoración de servicios en modo residente: FUERA. |
| RF-APR-009 | FUERA | Lectura fácil y alto contraste en modo residente: FUERA (la accesibilidad general del portal sí está; el modo residente específico no). |

### 3.14 Comunicaciones y mensajería

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-COM-001 | HECHO | Mensajería bidireccional familia-centro: `MessageThread/Message`. Router `comms`. |
| RF-COM-002 | HECHO | Mensajes internos entre profesionales: `MessageThread` con `type=INTERNO`. |
| RF-COM-003 | PARCIAL | Categorización: `MessageThread.subject` libre. Falta: enum de categorías configurables (urgente, administrativo, clínico, etc.). |
| RF-COM-004 | HECHO | `Message.readAt` por rol. Vista con leído/no-leído en backoffice. |
| RF-COM-005 | PENDIENTE | Adjuntos en mensajes: no existe (requiere Q-004 storage). |
| RF-COM-006 | HECHO | `Announcement` para comunicados masivos. Router `comms.broadcast`. |
| RF-COM-007 | HECHO | `Announcement.targetType` (TODO_EL_CENTRO/POR_UNIDAD/RESIDENTE). Router `comms`. |
| RF-COM-008 | HECHO | `AnnouncementReceipt.acknowledgedAt`. Stats de % leído/% acuse en backoffice. |
| RF-COM-009 | PENDIENTE | No existen plantillas de comunicación configurables por centro. |
| RF-COM-010 | HECHO | Trazabilidad: `AuditLog` + `AnnouncementReceipt` + `Message.readAt`. |
| RF-COM-011 | BLOQUEADO | Integración con SMS (coste recurrente, decisión de Angel Q-007 relacionado) y WhatsApp Business (RGPD + META no UE). Email: HECHO (provider UE, `sendEmailSafe`). |

### 3.15 Notificaciones inteligentes

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-NOT-001 | PENDIENTE | Push notifications: Web Push API (VAPID) no implementada. El modelo de `PushSubscription` no existe en el schema aún. |
| RF-NOT-002 | PARCIAL | Email por cambio de estado de solicitudes y mensajes nuevos: HECHO. Push: PENDIENTE. |
| RF-NOT-003 | PENDIENTE | Deep link desde notificación: depende de push (RF-NOT-001). |
| RF-NOT-004 | PENDIENTE | Configuración de preferencias de notificación: no existe. |
| RF-NOT-005 | PENDIENTE | Centro de notificaciones en el portal: no existe. Solo el email actual. |
| RF-NOT-006 | BLOQUEADO | Registro de entrega y apertura de notificaciones críticas por push: bloqueado por RF-NOT-001 (push no implementado). |
| RF-NOT-007 | HECHO | Recordatorios automáticos por email: el provider UE existe y se usa en solicitudes/mensajes. Falta extensión a visitas, valoraciones vencidas, documentos pendientes. |

### 3.16 Visitas, visitantes y recepción

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-VIS-001 | HECHO | `Visit` con solicitud desde portal familiar. Router `visits.requestVisit`. |
| RF-VIS-002 | HECHO | `Visit`: residentId, familyLinkId, slotId (VisitSlotConfig), date, visitors (JSON), notes. |
| RF-VIS-003 | HECHO | `Visit.status` (PENDIENTE/APROBADA/RECHAZADA/CANCELADA). Router `visits.approve/reject/cancel`. |
| RF-VIS-004 | PENDIENTE | Visitas recurrentes: no existe (hoy cada visita es puntual). Requiere campo `recurrenceRule` en Visit o tabla `VisitRecurrence`. |
| RF-VIS-005 | HECHO | Visitantes puntuales en `Visit.visitors` JSON. Visitantes recurrentes (familiar principal): HECHO por FamilyLink. |
| RF-VIS-006 | HECHO | `Visit.accessCode` (BASE32, 6 caracteres) generado al aprobar, enviado por email. |
| RF-VIS-007 | HECHO | `Visit.checkinAt/checkoutAt`. Router `visits.checkIn/checkOut`. Rate-limited (10/min). |
| RF-VIS-008 | HECHO | `Visit.visitors` JSON con nombre y relación. Aceptación de condiciones en el portal al solicitar. |
| RF-VIS-009 | PARCIAL | `VisitSlotConfig.maxVisitorsPerSlot` controla aforo. Transacción Serializable para evitar carrera. Falta: control de aforo total por sala física (no solo por franja). |
| RF-VIS-010 | HECHO | Histórico de visitas: `visits.listForResident/listForCenter`. |
| RF-VIS-011 | PENDIENTE | No existe bloqueo explícito de visitantes (lista negra). Solo rechazo de visita puntual. |
| RF-VIS-012 | FUERA | Integración con control de accesos físico (torniquete, lector): FUERA (ADR-0016, IoT). |

### 3.17 Solicitudes, incidencias y helpdesk

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-INC-001 | HECHO | `ServiceRequest` desde portal familiar. Router `requests.create`. |
| RF-INC-002 | HECHO | `ServiceRequest.category` enum (MANTENIMIENTO/ADMINISTRACION/HABITACION/ROPA/ALIMENTACION/ACTIVIDAD/VISITA/FACTURACION/OTRO). |
| RF-INC-003 | PENDIENTE | Adjuntar foto/documento en solicitud: no existe (requiere Q-004 storage). |
| RF-INC-004 | HECHO | `ServiceRequest.assignedToId`. Router `requests.assign`. |
| RF-INC-005 | HECHO | `ServiceRequest.status` (RECIBIDA/ASIGNADA/EN_CURSO/PENDIENTE_INFO/RESUELTA/CERRADA). |
| RF-INC-006 | HECHO | Estado visible en portal familiar: `/portal/solicitudes` con estado de cada solicitud. |
| RF-INC-007 | HECHO | `ServiceRequestComment` con `isInternal` para comentarios del equipo vs. visibles al familiar. |
| RF-INC-008 | HECHO | SLA por prioridad (NORMAL: 48h, URGENTE: 4h). `dueAt` calculado al crear. |
| RF-INC-009 | PENDIENTE | Escalado automático de solicitudes vencidas: no existe (los datos están; falta el job/cron de escalado). |
| RF-INC-010 | HECHO | `ServiceRequest.rating` (1-5 CSAT) + `ratingComment`. Router `requests.rate`. |
| RF-INC-011 | HECHO | Reapertura: `ServiceRequest.status=RECIBIDA` al reabrir. Router `requests.reopen`. |
| RF-INC-012 | PARCIAL | `ServiceRequest.resolvedAt/firstResponseAt/dueAt` existen. Falta: panel de métricas de tiempo medio de respuesta/resolución por categoría. |
| RF-INC-013 | HECHO | Backoffice `/solicitudes` con bandeja, asignación, cambio de estado, comentario interno. |
| RF-INC-014 | PENDIENTE | Asignación automática según reglas por categoría: no existe (hoy es asignación manual en backoffice). |

### 3.18 Pagos, recibos y estado de cuenta

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-PAG-001 | PENDIENTE | No existe tabla `Invoice/Receipt`. Solo `Tenant.plan` (PlanTier del SaaS). |
| RF-PAG-002 | PENDIENTE | No existe estado de cuenta en la app. |
| RF-PAG-003 | PENDIENTE | No existe descarga de recibos (requiere también Q-004 storage para PDF). |
| RF-PAG-004 | BLOQUEADO | Pago digital: Q-007 (pasarela de pago). |
| RF-PAG-005 | BLOQUEADO | Soporte de tarjeta/domiciliación/transferencia: Q-007. |
| RF-PAG-006 | BLOQUEADO | Bizum/wallet: Q-007. |
| RF-PAG-007 | BLOQUEADO | Autopay/pago automático: Q-007. |
| RF-PAG-008 | BLOQUEADO | Notificación previa al cargo: Q-007. |
| RF-PAG-009 | BLOQUEADO | Pago de servicios extra: Q-007. |
| RF-PAG-010 | BLOQUEADO | Conciliación con banco/pasarela: Q-007. |
| RF-PAG-011 | BLOQUEADO | Integración con ERP/contabilidad: Q-010 (posicionamiento) + Q-007. |
| RF-PAG-012 | PENDIENTE | Recordatorios de pago pendiente (email): el provider UE existe; falta la tabla Invoice. |
| RF-PAG-013 | PENDIENTE | Histórico económico del residente: no existe. |

### 3.19 Documentos, firma y consentimientos

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-DOC-001 | BLOQUEADO | Repositorio documental binario: Q-004 (object storage UE). El modelo `Document` no existe en el schema. La mecánica de metadatos se puede construir sin storage; los binarios requieren Q-004. |
| RF-DOC-002 | PENDIENTE | No existe clasificación de documentos (enum `DocumentType`). |
| RF-DOC-003 | PENDIENTE | No existe generación de documentos desde plantillas. |
| RF-DOC-004 | BLOQUEADO | Firma electrónica: Q-008. La firma simple (hash + usuario autenticado) es construible; la firma avanzada/cualificada requiere proveedor UE. |
| RF-DOC-005 | BLOQUEADO | Evidencia de firma (IP, fecha, versión, dispositivo): Q-008 para la parte avanzada. `ConsentRecord.grantedAt/grantedBy` cubre parcialmente la firma de consentimientos simples. |
| RF-DOC-006 | HECHO | `ConsentRecord` con `type` (enum ConsentType: INGRESO, IMAGEN, PORTAL_FAMILIAS, DATOS_SANITARIOS_EXTERNOS, IA_ANONIMA), `granted`, `grantedAt`, `grantedBy`. |
| RF-DOC-007 | HECHO | `ConsentType` cubre imagen, portal familias, datos sanitarios externos, IA. Faltan: COMUNICACIONES, ECONOMICO (para nuevos módulos). |
| RF-DOC-008 | HECHO | `ConsentRecord.granted=false` equivale a revocación. Router `clinical.revokeConsent`. |
| RF-DOC-009 | PENDIENTE | No existe versionado documental (campo `version` + `previousVersionId` en Document). |
| RF-DOC-010 | PENDING | No existe vista de documentos pendientes de lectura/firma en el portal (requiere modelo Document). |
| RF-DOC-011 | PENDIENTE | No existe descarga controlada de documentos con URL presignada (requiere Q-004 + modelo Document). |
| RF-DOC-012 | PENDIENTE | No existen alertas por documentos caducados. |
| RF-DOC-013 | HECHO | Auditoría documental cubierta por `AuditLog` para consentimientos. Se extenderá al modelo Document. |
| RF-DOC-014 | HECHO | No aplica: Vetlla ES el gestor documental (ventaja vs. ResiPlus que necesita integración). |

### 3.20 Reservas de espacios, servicios y recursos

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-RESV-001 | FUERA | Reservas de espacios: fuera del alcance core-suficiente (ADR-0016). Roadmap Fase 2. |
| RF-RESV-002 | FUERA | Salas de visita, comedor privado, peluquería, podología, transporte, videollamada: FUERA. |
| RF-RESV-003 | FUERA | Disponibilidad de recursos en app: FUERA. |
| RF-RESV-004 | FUERA | Solicitud de reserva: FUERA. |
| RF-RESV-005 | FUERA | Aprobación de reserva: FUERA. |
| RF-RESV-006 | FUERA | Reglas de reserva: FUERA. |
| RF-RESV-007 | FUERA | Confirmaciones/recordatorios de reserva: FUERA. |
| RF-RESV-008 | FUERA | Lista de espera: FUERA. |
| RF-RESV-009 | FUERA | Cobro asociado a reservas: FUERA (requiere también Q-007). |

### 3.21 Comunidad, tablón y engagement

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-COMU-001 | HECHO | `Announcement` actúa como tablón digital del centro. |
| RF-COMU-002 | HECHO | `Announcement.body` (texto libre, puede incluir noticias, avisos, menús, actividades). |
| RF-COMU-003 | HECHO | `Announcement.targetType` (TODO_EL_CENTRO/POR_UNIDAD/RESIDENTE). |
| RF-COMU-004 | HECHO | `AnnouncementReceipt.acknowledgedAt`. % acuse en backoffice. |
| RF-COMU-005 | FUERA | Reacciones/comentarios en comunicados: fuera del alcance core-suficiente. Benchmark avanzado (comunidad). |
| RF-COMU-006 | FUERA | Encuestas rápidas en tablón: fuera (ver 3.22 encuestas, que también está fuera del MVP). |
| RF-COMU-007 | FUERA | Newsletter automática periódica: fuera. |
| RF-COMU-008 | FUERA | Galería de fotos con consentimiento de imagen: fuera (requiere Q-004 + flujo de consentimiento de imagen). |
| RF-COMU-009 | PENDIENTE | Calendario de eventos: los comunicados de tipo ACTIVIDAD existen pero no hay vista de calendario. |
| RF-COMU-010 | FUERA | Contenido multidioma de las comunicaciones del centro (texto libre del centro, no la UI): fuera del MVP. La UI ya está en es/ca. |

### 3.22 Encuestas y satisfacción

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-ENC-001 | FUERA | Encuestas configurables: fuera del alcance core-suficiente (ADR-0016). |
| RF-ENC-002 | FUERA | Envío a residentes/familiares/profesionales: FUERA. |
| RF-ENC-003 | FUERA | Segmentación por centro/unidad/perfil: FUERA. |
| RF-ENC-004 | FUERA | Tasa de respuesta: FUERA. |
| RF-ENC-005 | FUERA | Satisfacción media: FUERA. |
| RF-ENC-006 | FUERA | Comentarios abiertos: FUERA. |
| RF-ENC-007 | FUERA | Alerta por baja satisfacción: FUERA. |
| RF-ENC-008 | FUERA | Acciones de mejora: FUERA. |
| RF-ENC-009 | PENDIENTE | NPS/CSAT: el CSAT post-resolución de solicitudes SÍ está (RF-INC-010). El NPS periódico no existe. |
| RF-ENC-010 | PENDIENTE | Dashboard comparativo de satisfacción entre centros: no existe. |

### 3.23 Marketplace y servicios complementarios

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-MKT-001 | FUERA | Marketplace de servicios complementarios: fuera del alcance core-suficiente (ADR-0016). |
| RF-MKT-002 | FUERA | Peluquería, podología, fisioterapia extra, transporte, acompañamiento, productos: FUERA. |
| RF-MKT-003 | FUERA | Solicitar/reservar servicio: FUERA. |
| RF-MKT-004 | FUERA | Precio y disponibilidad: FUERA. |
| RF-MKT-005 | FUERA | Pago o cargo en recibo: FUERA. |
| RF-MKT-006 | FUERA | Validación de servicios sensibles: FUERA. |
| RF-MKT-007 | FUERA | Valoración del servicio: FUERA. |
| RF-MKT-008 | FUERA | Gestión de proveedores: FUERA. |
| RF-MKT-009 | FUERA | Control de autorizaciones económicas: FUERA (los `ServiceRequest.category=ACTIVIDAD` cubren una solicitud simple, no el marketplace completo). |

### 3.24 Acceso digital, seguridad física e IoT

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-IOT-001 | FUERA | Integración con control de accesos: FUERA (ADR-0016, Fase 3). |
| RF-IOT-002 | FUERA | QR para visitantes en control de accesos: el `Visit.accessCode` existe para gestión interna de visitas; la integración con torniquete/lector físico es FUERA. |
| RF-IOT-003 | FUERA | Mobile key/NFC: FUERA. |
| RF-IOT-004 | FUERA | Videoportero/citofonía digital: FUERA. |
| RF-IOT-005 | FUERA | Sensores de presencia/cama/movimiento/puertas/temperatura/caídas: FUERA. |
| RF-IOT-006 | FUERA | Asociar dispositivos a residente/habitación: FUERA (nota: `ResidentDevice` existe en el schema para dispositivos médicos del residente, no para IoT del edificio). |
| RF-IOT-007 | FUERA | Alertas IoT: FUERA. |
| RF-IOT-008 | FUERA | Integrar alertas IoT con panel profesional: FUERA. |
| RF-IOT-009 | FUERA | Estado de dispositivos IoT: FUERA. |
| RF-IOT-010 | FUERA | Alerta por dispositivo desconectado: FUERA. |
| RF-IOT-011 | FUERA | Histórico de eventos IoT: FUERA. |
| RF-IOT-012 | FUERA | Automatización sobre eventos IoT: FUERA. |

### 3.25 Profesionales, turnos y tareas

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-PRO-001 | HECHO | `User` con rol, centerId, estado. Router `users.list/invite/updateRole`. |
| RF-PRO-002 | HECHO | `User.role` (UserRole enum), `User.jobTitle`, `User.centerId`. |
| RF-PRO-003 | PENDIENTE | Turnos/guardias/ausencias/sustituciones: no existen los modelos `ShiftTemplate/ShiftAssignment`. Es el hueco #6 del top 10. |
| RF-PRO-004 | PARCIAL | Asignación de residente a profesional de referencia: `Resident.referenceUserId` existe como campo. No hay UI para gestionarlo. |
| RF-PRO-005 | PENDIENTE | No existe generación automática de tareas por residente/turno/plan de cuidados. |
| RF-PRO-006 | PARCIAL | Panel de tareas: el panel principal muestra alertas clínicas y solicitudes. No hay panel de "mis tareas del turno" generado desde el PIA. |
| RF-PRO-007 | HECHO | Registro desde tablet: toda la atención directa (`/atencion`) funciona desde tablet offline-first. |
| RF-PRO-008 | PENDIENTE | Traspaso de turno digital: no existe. Es una de las funciones más diferenciadoras del sector. |
| RF-PRO-009 | PENDIENTE | Incidencias, alertas, tareas pendientes en el traspaso: depende de RF-PRO-008. |
| RF-PRO-010 | PENDIENTE | Checklist de inicio/fin de turno: no existe. |
| RF-PRO-011 | PENDIENTE | Medición de carga de trabajo por equipo: no existe. |
| RF-PRO-012 | PARCIAL | Alertas por no-administración de medicación: HECHO. Alertas por tareas del PIA vencidas: no existen. |
| RF-PRO-013 | PENDIENTE | Firma en tareas críticas: no existe (requiere Q-008 para firma avanzada; firma simple con usuario autenticado es construible sin proveedor). |

### 3.26 Administración económica y facturación

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-ECO-001 | PENDIENTE | No existe configuración de tarifas por centro/habitación/servicio. |
| RF-ECO-002 | PENDIENTE | No existe tabla de tarifas. Solo `Resident.placeRegime` (régimen de plaza). |
| RF-ECO-003 | PENDIENTE | No existe vinculación de residente a contrato económico. |
| RF-ECO-004 | PENDIENTE | No existe tabla de pagador, forma de pago, tarifa, servicios incluidos. |
| RF-ECO-005 | PENDIENTE | No existe facturación periódica (tabla Invoice). |
| RF-ECO-006 | BLOQUEADO | Copagos y financiación pública/privada: Q-010 (posicionamiento) + Q-011 (asesoría normativa autonómica). |
| RF-ECO-007 | BLOQUEADO | Recibos impagados: Q-007 (pasarela) + requiere Invoice. |
| RF-ECO-008 | PENDIENTE | Recordatorios de deuda: el provider de email existe; falta la tabla Invoice. |
| RF-ECO-009 | BLOQUEADO | Conciliación bancaria: Q-007 (pasarela). |
| RF-ECO-010 | BLOQUEADO | Integración con ERP contable: Q-010 (posicionamiento estratégico). |
| RF-ECO-011 | PENDIENTE | Informes de facturación/cobros/deuda: requiere Invoice primero. |
| RF-ECO-012 | PENDIENTE | Rectificaciones/abonos/devoluciones: requiere Invoice + Q-007. |

### 3.27 Inventario, lavandería y pertenencias

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-INV-001 | FUERA | Registro de pertenencias del residente: fuera del alcance core-suficiente (ADR-0016). |
| RF-INV-002 | FUERA | Descripción/foto/estado/fecha de pertenencias: FUERA. |
| RF-INV-003 | FUERA | Gestión de lavandería: FUERA. |
| RF-INV-004 | FUERA | Recogida/lavado/entrega/pérdida en lavandería: FUERA. |
| RF-INV-005 | FUERA | Ayudas técnicas asignadas: FUERA (nota: `ResidentDevice` cubre dispositivos médicos — silla de ruedas, audífono — que están HECHO). |
| RF-INV-006 | FUERA | Stock de material asistencial: FUERA. |
| RF-INV-007 | FUERA | Alerta de stock bajo: FUERA. |
| RF-INV-008 | FUERA | Inventario por centro/almacén: FUERA. |

### 3.28 Mantenimiento y facilities

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-MAN-001 | FUERA | Incidencias de mantenimiento: fuera del alcance core-suficiente (ADR-0016). |
| RF-MAN-002 | FUERA | Asociar incidencias a habitación/zona/equipo: FUERA. |
| RF-MAN-003 | FUERA | Órdenes de trabajo: FUERA. |
| RF-MAN-004 | FUERA | Prioridad/responsable/SLA/estado de OT: FUERA. |
| RF-MAN-005 | FUERA | Mantenimiento preventivo: FUERA. |
| RF-MAN-006 | FUERA | Revisiones periódicas de equipamiento: FUERA. |
| RF-MAN-007 | PENDIENTE | Reporting de incidencias de mantenimiento: si se construye el módulo, este es derivado. |
| RF-MAN-008 | PENDIENTE | Comunicación al familiar de incidencia que afecta al residente: el canal de comunicaciones existe; falta el módulo de mantenimiento que lo dispare. |

### 3.29 Reporting, BI y analítica

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-BI-001 | HECHO | Cuadros de mando operativos: `/ocupacion` (KPIs dirección), `/alertas` (centro de alertas). |
| RF-BI-002 | PARCIAL | Dashboard de ocupación, tareas, incidencias, medicación, riesgos: HECHO. Faltan: visitas (datos existen, no hay KPI en dashboard), pagos (no existe), satisfacción (CSAT de solicitudes existe). |
| RF-BI-003 | HECHO | Indicadores asistenciales: escalas Barthel/Tinetti/Norton/Braden, UPP, caídas, alertas de medicación. |
| RF-BI-004 | PENDIENTE | Indicadores económicos: requiere módulo de facturación. |
| RF-BI-005 | PENDIENTE | Indicadores de experiencia digital: adopción de la app (lastLoginAt existe), solicitudes pendientes (existe), mensajes leídos (existe). Falta panel agregado. |
| RF-BI-006 | BLOQUEADO | Comparativa entre centros: Q-009 (modelo multicentro corporativo). |
| RF-BI-007 | PENDIENTE | Exportación a Excel/CSV/PDF: `dsar.exportResidentData` exporta JSON. Falta exportación de listados/informes en formatos comunes. |
| RF-BI-008 | FUERA | Integración con Power BI / Metabase: fuera del alcance core-suficiente (ADR-0016). |
| RF-BI-009 | PENDIENTE | Alertas por desviación de indicadores: las alertas clínicas existen; faltan alertas de gestión (ocupación < X %, solicitudes SLA vencido > Y %). |
| RF-BI-010 | PENDIENTE | KPIs personalizados: no existe. |
| RF-BI-011 | HECHO | Dashboards diferenciados por rol: `/alertas` para DIRECTOR, `/atencion` para AUXILIAR, `/portal` para FAMILIAR. |
| RF-BI-012 | PARCIAL | Analítica de uso de app: `lastLoginAt` en User existe. Falta: panel de activación/retención (% invitados/registrados/activos). |

### 3.30 Multi-centro, multi-marca y white-label

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-MC-001 | HECHO | Gestión multi-centro: `Tenant` con múltiples `Center`. RBAC + RLS por tenant. |
| RF-MC-002 | HECHO | Configuración global (tenant) y local (centro): `Tenant.plan`, `Center.settings`. |
| RF-MC-003 | PENDIENTE | Informes consolidados multi-centro: no existen. Requiere Q-009 (modelo de grupo). |
| RF-MC-004 | PENDIENTE | Rol corporativo con visibilidad multi-centro: no existe. Requiere Q-009. |
| RF-MC-005 | PENDIENTE | Parametrización por país/región (CCAA): no existe. Requiere Q-010 + Q-011. |
| RF-MC-006 | FUERA | Personalización de marca: blanco y negro en la UI es configurable, pero white-label por tenant (logo, colores, dominio propio) está fuera del alcance core-suficiente. |
| RF-MC-007 | FUERA | App white-label opcional: FUERA (ADR-0016). |
| RF-MC-008 | FUERA | Logos, colores, textos legales y dominios propios: FUERA. |
| RF-MC-009 | BLOQUEADO | Catálogos globales y locales (plantillas de actividades, dietas, escalas compartidas entre centros del mismo grupo): Q-009. |

### 3.31 Integraciones

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-INT-001 | HECHO | API tRPC tipada y documentada (compilador TypeScript garantiza los tipos en compile-time). |
| RF-INT-002 | HECHO | APIs para residentes, profesionales, visitas, solicitudes, actividades (cuando existan), facturación (cuando exista): la arquitectura tRPC garantiza que cada módulo tiene API. |
| RF-INT-003 | BLOQUEADO | Integración con ERP/contabilidad: Q-010 (posicionamiento estratégico). |
| RF-INT-004 | BLOQUEADO | Integración con pasarelas de pago: Q-007. |
| RF-INT-005 | BLOQUEADO | Integración con firma electrónica: Q-008. |
| RF-INT-006 | HECHO | No aplica: Vetlla ES el gestor documental. No hay integración externa que resolver para documentos nativos. |
| RF-INT-007 | FUERA | Integración con farmacia/prescripción externa (Cofares, Alliance): fuera del alcance core-suficiente inicial. |
| RF-INT-008 | FUERA | Integración con historia clínica externa (Abucasis, HCIS): fuera del alcance core-suficiente (ADR-0016). Requiere APIs de CCAA. |
| RF-INT-009 | HECHO | Email: provider UE integrado (`sendEmailSafe`). Push y SMS: PENDIENTE (push) / Q (SMS). |
| RF-INT-010 | FUERA | Videollamada: fuera del alcance core-suficiente. Requiere servicio de vídeo UE. |
| RF-INT-011 | FUERA | Control de accesos: FUERA (ADR-0016, IoT). |
| RF-INT-012 | FUERA | Sensores y dispositivos IoT: FUERA (ADR-0016). |
| RF-INT-013 | PENDIENTE | Webhooks para eventos relevantes: no existen. Son el mecanismo para que terceros reaccionen a eventos de Vetlla (ingreso, alta, cambio de estado). |
| RF-INT-014 | PENDIENTE | Importación/exportación masiva: `dsar.exportResidentData` existe; falta importación masiva (CSV de residentes, profesionales). |
| RF-INT-015 | PENDIENTE | Monitorización de integraciones: `/api/health` existe. Falta dashboard de estado de integraciones activas (email, push cuando exista). |

### 3.32 Inteligencia artificial y automatización

| ID | Estado | Qué lo cubre en Vetlla / Qué falta |
|---|---|---|
| RF-IA-001 | PENDIENTE | Asistente conversacional para familiares: no existe. El copiloto actual es solo para profesionales. |
| RF-IA-002 | PENDIENTE | FAQs sobre visitas/pagos/documentos/actividades/horarios para familiar: no existe. |
| RF-IA-003 | HECHO | PII y datos clínicos no se comparten sin autorización. RBAC + RLS. AuditLog de cada acción del copiloto. |
| RF-IA-004 | HECHO | Asistente para profesionales (Feature 1: NL→CareRecord, Feature 2: borrador PIA). `packages/ai` Slices 1-3 construidos. H5 in_progress. |
| RF-IA-005 | HECHO | El copiloto puede localizar información del expediente según permisos (respeta RLS + RBAC en todas las herramientas). |
| RF-IA-006 | PARCIAL | Feature 2 (borrador PIA) sugiere objetivos a partir del expediente. Falta: sugerencias de tareas/alertas a partir de eventos clínicos (delta de escalas, patrón de caídas). |
| RF-IA-007 | PENDIENTE | Detección de patrones de riesgo (caídas, baja ingesta, aislamiento, pérdida de peso, empeoramiento funcional): los datos existen (FallRecord, CareRecord.mealIntake, WeightRecord, assessments). Falta: la capa de análisis de patrones en el copiloto. |
| RF-IA-008 | PENDIENTE | Resumen de evolutivos y comunicaciones: no existe. Sería la Feature 3 del copiloto (resumen de turno/semana para el sanitario). |
| RF-IA-009 | PENDIENTE | Clasificación automática de solicitudes: `ServiceRequest.category` es manual. IA puede clasificarla automáticamente al crearla. |
| RF-IA-010 | PENDIENTE | Recomendación de respuestas/plantillas para solicitudes: no existe. |
| RF-IA-011 | HECHO | Trazabilidad de uso de IA: `AuditLog` con `action=COPILOT_DRAFT/COPILOT_CONFIRM` + `promptVersion`. |
| RF-IA-012 | HECHO | Human-in-the-loop: `copilot.draftCareRecord/confirmCareRecord`, `draftCarePlan/confirmCarePlan`. Nada se guarda sin confirmación. |
| RF-IA-013 | HECHO | Las decisiones automatizadas no supervisadas en contexto clínico están arquitectónicamente prevenidas (el modelo solo propone, el profesional confirma). |

---

## ANÁLISIS RNF (Secciones 4.1–4.5)

### 4.1 Seguridad y 4.2 Privacidad y cumplimiento

**Remisión al informe de Sofía (DPO):** `docs/seguridad/2026-06-12-auditoria-superapp.md`

Los RNF 4.1 (RNF-SEG-001..014) y 4.2 (RNF-PRI-001..012) están analizados en detalle por la DPO. Resumen ejecutivo del análisis de Sofía ya integrado en `project_state.yaml` (sección `superapp_visitas_y_auditoria_done`): los 3 críticos de seguridad fueron remediados, el aislamiento multitenant en las 38 tablas es robusto, los derechos ARSOPL (export art.15 + anonimización art.17) están implementados con política parametrizable (Q-003 pendiente para la política definitiva).

**Pendientes de seguridad fuera del informe de Sofía:**
- RNF-SEG-002 (MFA): modelado (A-004) pero no implementado. Prioridad alta para producción.
- RNF-SEG-011 (Bloqueo por intentos fallidos): no existe. Rate limiting en `checkInByCode` existe; falta en login. Prioridad alta para producción.
- RNF-SEG-003 (SSO/OIDC): no existe. Roadmap Q-009 para grupos corporativos.

### 4.3 Disponibilidad, rendimiento y escalabilidad

| ID | Estado | Nota |
|---|---|---|
| RNF-PER-001 | PENDIENTE | Disponibilidad 24x7 para funciones críticas: requiere deploy UE (INC-3, Q-004). La arquitectura soporta alta disponibilidad (cloud-native, stateless). |
| RNF-PER-002 | PARCIAL | Carga rápida de pantallas principales: Next.js App Router + Server Components. No hay medición de tiempos en producción (INC-3 pendiente). |
| RNF-PER-003 | PARCIAL | Soporte multi-centro con miles de residentes: RLS + índices por `tenantId` + `residentId`. No hay pruebas de carga. |
| RNF-PER-004 | PENDIENTE | Soporte de picos de uso en comunicaciones/pagos/campañas: no hay cola de jobs asíncronos para el envío masivo de comunicados (el envío de email en lote está diferido, job/queue en Q-005). |
| RNF-PER-005 | PARCIAL | Monitorización técnica: `/api/health` con check de BD, logger JSON estructurado sin PII. Falta integración con herramienta de APM (Datadog, Sentry EU). |
| RNF-PER-006 | PENDIENTE | Alertas de disponibilidad: no existen (requieren herramienta de monitoring externa). |
| RNF-PER-007 | BLOQUEADO | Backup y recuperación: Q-004 (OVHcloud Postgres gestionado incluye backups automáticos; requiere contrato). |
| RNF-PER-008 | BLOQUEADO | RPO/RTO por criticidad: requiere definición formal (decisión de negocio + Q-004 para producción). |
| RNF-PER-009 | PENDIENTE | Escalado horizontal: la arquitectura stateless (Next.js + Postgres) lo soporta. No está configurado (requiere IaC / Q-004). |

### 4.4 Accesibilidad y usabilidad

| ID | Estado | Nota |
|---|---|---|
| RNF-ACC-001 | HECHO | WCAG 2.1 AA implementado. ADR-0006. Skip-link, aria-live, nav/main etiquetados, color no único. |
| RNF-ACC-002 | HECHO | Tipografía grande, configurable con Tailwind. El design system Lifecare tiene escala tipográfica clara. |
| RNF-ACC-003 | HECHO | Alto contraste: tokens teal/coral/crema con contraste AA verificado. `docs/ux/direccion-de-arte.md`. |
| RNF-ACC-004 | HECHO | Textos comprensibles: review de UX (Elena), terminología del sector en la UI. |
| RNF-ACC-005 | PARCIAL | Lectura fácil en el portal familiar: hay trabajo de simplificación (portal familiar más humano, UX-20). Falta: revisión formal de lectura fácil para personas con deterioro cognitivo leve. |
| RNF-ACC-006 | HECHO | Compatibilidad con lectores de pantalla: Radix primitives (Dialog/Tabs/Toast) gestionan focus-trap, aria-live, retorno de foco (UX-08). |
| RNF-ACC-007 | HECHO | Acciones frecuentes en pocos pasos: `CareRecord` en 3 toques desde `/atencion`, MAR filtrado por turno, acciones rápidas en el resumen 360. |
| RNF-ACC-008 | HECHO | Confirmación clara en acciones destructivas: dialog de confirmación (UX-03) con Radix. |
| RNF-ACC-009 | HECHO | Errores comprensibles: validación inline Zod en cliente (UX-09), mensajes de error en es/ca. |
| RNF-ACC-010 | HECHO | PWA compatible con iOS y Android. Next.js + Tailwind responsive. Testado en tablet. |

### 4.5 Mantenibilidad y parametrización

| ID | Estado | Nota |
|---|---|---|
| RNF-MAN-001 | PARCIAL | Catálogos sin desarrollo: `AssessmentType`, `MedicationRoute`, `CareRecordType`, `ConsentType` son enums Prisma (requieren migración para añadir valores). Faltan catálogos configurables desde UI sin código (categorías de solicitud, tipos de dieta, tipos de actividad). |
| RNF-MAN-002 | PENDIENTE | Parametrización de workflows de admisión, revisión de PIA, alta/baja: no existen workflows configurables. Los estados de los procesos son enums fijos. |
| RNF-MAN-003 | PARCIAL | RBAC configurable: los 5 roles y sus permisos están en código (`rbac.ts`). No hay UI de configuración de permisos. ADR-0013 documenta la decisión de diferir roles custom hasta demanda real. |
| RNF-MAN-004 | PENDIENTE | Plantillas de comunicación y documentos: no existen. |
| RNF-MAN-005 | PARTIAL | Activación/desactivación de módulos: `Tenant.plan` (PlanTier: ESENCIAL/PROFESIONAL). Falta: feature flags granulares por módulo/centro (tabla `TenantFeatureFlag`). |
| RNF-MAN-006 | HECHO | Logs técnicos: logger JSON estructurado sin PII, timing de procedures lentas, `/api/health`. `docs/adr/0010`. |
| RNF-MAN-007 | PARCIAL | Documentación funcional: CLAUDE.md, ADRs (0001-0016), `project_state.yaml`. Documentación de API: tRPC tipado (compilador garantiza contrato); falta OpenAPI/Swagger para terceros. |
| RNF-MAN-008 | PENDIENTE | Entornos separados (dev/test/preprod/prod): dev con docker-compose local existe. CI con Postgres de servicio existe. Preprod y prod: Q-004 (INC-3). |
| RNF-MAN-009 | HECHO | Pruebas automatizadas: 380 tests Vitest + 49 e2e Playwright. Gate RLS en CI (INC-1). |
| RNF-MAN-010 | PARCIAL | Versionado de APIs: tRPC no tiene versionado explícito de endpoints. Los prompts del copiloto tienen versión (`promptVersion: v2`). Falta estrategia de versionado de la API tRPC para cambios breaking. |

---

## Referencias cruzadas

- Análisis anterior SuperApp: `docs/producto/2026-06-12-superapp-residente-familia-gap.md`
- Análisis anterior Core asistencial: `docs/producto/2026-06-13-core-asistencial-completo-gap.md`
- Expediente completo fase 1: `docs/producto/2026-06-11-expediente-completo-residente.md`
- Seguridad y privacidad (Sofía): `docs/seguridad/2026-06-12-auditoria-superapp.md`
- Decisión de alcance: `docs/adr/0016` (core-suficiente + diferencial, no paridad total)
- Fuente de verdad de avance: `project_state.yaml`
