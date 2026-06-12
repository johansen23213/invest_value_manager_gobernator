# Gap Analysis — SuperApp Residente y Familia (Vetlla vs. Requerimientos ResiPlus)

**Fecha:** 2026-06-12  
**Autor:** Pau (Product Manager)  
**Input:** Documento de requerimientos "Evolución de ResiPlus hacia una SuperApp de residente y familia" v0.1  
**Rama:** claude/vetlla-saas-mvp-spec-PuHOW (sin cambios de código — solo documento)  
**Propósito:** Gap analysis riguroso, reencuadre estratégico y plan de incorporación priorizado.

---

## 1. Premisa estratégica

El documento de requerimientos está escrito para ResiPlus, que necesitaría construir una **capa nueva por encima de un core legacy** (cliente-servidor, no cloud-native, sin API pública tipada). Vetlla, por diseño, ES el core cloud-native: API-first (tRPC tipado), multitenant con RLS, PWA offline, RBAC granular, AuditLog, i18n es/ca desde el inicio. Esto significa que Vetlla no necesita integrar dos sistemas: puede ofrecer la experiencia familia nativamente, sin capa de integración, con el mismo modelo de datos y los mismos controles de seguridad. Esta es la tesis central del reencuadre estratégico (sección 3).

Sin embargo, el documento también expande el alcance de "software de gestión del centro" a "plataforma + canal digital familia", que añade módulos completamente nuevos (Solicitudes/SLA, Centro Documental, Comunicaciones bidireccionales, Pagos/recibos, Visitas con QR, Reservas, Encuestas) que hoy no existen en Vetlla.

---

## 2. Estado real de Vetlla relevante a estos requerimientos

### 2.1 Lo que YA existe (verificado en código)

| Área | Estado | Ficheros clave |
|---|---|---|
| Portal familiar (solo lectura) | Implementado: home con resumen del residente vinculado, novedades de atención, medicación activa, alergias, valoraciones | `apps/web/src/app/(app)/portal/page.tsx`, `apps/web/src/server/routers/family.ts` |
| FamilyLink con control de privacidad | Implementado: `canSeeCare`, `canSeeMedication`, `canSeeAssessments` por vínculo usuario↔residente | `packages/db/prisma/schema.prisma` (modelo FamilyLink) |
| Alta de familiar + invitación por email | Implementado: `family.link` (crea usuario FAMILIAR + vínculo), `users.sendAccessLink` (enlace de activación one-shot con caducidad), reset de contraseña | `apps/web/src/server/routers/family.ts`, `apps/web/src/server/routers/account.ts` |
| RBAC con 5 roles | Implementado: SUPERADMIN, DIRECTOR, SANITARIO, AUXILIAR, FAMILIAR. Permisos granulares por recurso. | `apps/web/src/lib/rbac.ts` |
| RLS multitenant | Implementado y verificado en CI (INC-1): `vetlla_app` NOSUPERUSER NOBYPASSRLS, 18 tablas con RLS+FORCE | `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/` |
| Revocación de acceso | Implementado: `family.unlink` borra FamilyLink; RLS impide acceso inmediatamente | `apps/web/src/server/routers/family.ts` |
| AuditLog inmutable | Implementado: todas las acciones sobre datos personales, trigger BEFORE UPDATE, permiso `audit:read` | `apps/web/src/server/routers/audit.ts`, `packages/db/prisma/migrations/` |
| Consentimientos (modelo) | Implementado: tabla `consent_records` (tipo, concedido/revocado, fecha, firmante), campos `consentImage`, `consentFamilyPortal`, `consentAdmission` en Resident | `packages/db/prisma/schema.prisma` (modelos ConsentRecord, Resident) |
| Consentimientos (UI/router) | Parcialmente implementado: router `clinical` tiene endpoints para consentimientos; UI en expediente. No expuesto al familiar aún. | `apps/web/src/server/routers/clinical.ts` |
| Auth segura (email + contraseña) | Implementado: Auth.js, bcrypt, sesiones seguras | `apps/web/src/server/auth.ts` |
| AuthToken un-solo-uso con caducidad | Implementado: invitación + reset de contraseña por enlace con caducidad configurable | `packages/db/prisma/schema.prisma` (modelo AuthToken) |
| i18n es/ca | Implementado en portal, login, shell | `apps/web/src/i18n/` |
| PWA / offline | Implementado: service worker, manifest, IndexedDB + cola sync | `apps/web/src/app/` |
| Onboarding self-service | Implementado: `/registro` crea tenant TRIAL en transacción | `apps/web/src/app/(public)/registro/` |
| Observabilidad (capa app) | Implementado: logger JSON sin PII, `/api/health`, timing de procedures lentas | `apps/web/src/lib/logger.ts` |
| Backoffice (gestión del centro) | Implementado: centros, unidades, plazas, residentes, equipo, MAR, PIA, alertas, conflictos, auditoría | `apps/web/src/app/(app)/` |
| Resumen 360 del residente | Implementado: `/residentes/[id]/resumen` con pestañas Hoy/Salud/Atención | `apps/web/src/app/(app)/residentes/[id]/resumen/` |
| DSAR (export/borrado art.15/17) | Implementado (mecánica parametrizable): `exportResidentData`, `anonymizeResident` | `apps/web/src/server/routers/dsar.ts` |
| Expediente clínico ampliado | Implementado: 28 campos, 9 tablas (dispositivos, vacunas, peso, UPP, caídas, sujeciones, consentimientos, historia de vida), 11 escalas | `packages/db/prisma/schema.prisma` |

### 2.2 Lo que NO existe (gap real)

Ver sección 2.3.

---

## 3. Tabla de Gap Analysis por Bloque del Documento

### Bloque 1 — SuperApp / Home multirrol (APP-001..APP-010)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| APP-001 | App iOS/Android nativa | PWA instalable funciona en móvil; no está en App Store/Play Store | Decisión de app nativa vs. PWA (Q-nueva) | Decisión de Angel + coste (publicación en tiendas, Swift/Kotlin o React Native) | Alta — afecta adopción de familias |
| APP-002 | Portal web responsive | Implementado (Next.js + Tailwind responsive) | Ninguno para usuario familia | — | Cubierto |
| APP-003 | Home personalizada por rol | Parcial: panel de dirección/auxiliar existe; portal familiar existe | Home familiar enriquecida con quick actions accionables (hoy es solo lectura pasiva) | — | Media |
| APP-004 | Quick actions configurables por centro | No existe | Feature flags por módulo por centro; configuración de acciones destacadas | — | Media |
| APP-005 | Resumen operativo del residente | Parcial: `/portal` muestra novedades básicas | Próximas visitas, documentos pendientes, solicitudes abiertas (requieren módulos nuevos) | Depende de Solicitudes y Documental | Alta |
| APP-006 | Múltiples residentes por familiar | Implementado: `family.portal` devuelve array de residentes del familiar | Selector visual entre residentes en la UI (hoy se listan todos juntos) | — | Baja |
| APP-007 | Múltiples centros (grupo corporativo) | Multitenant existe; un familiar está en un tenant | Rol corporativo multi-tenant no existe; familiar solo ve dentro de su tenant | Decisión de modelo multicentro/multitenant (Q-nueva) | Media |
| APP-008 | White-label por centro/marca | No existe | Logo, colores, textos configurables por tenant/centro | Decisión de Angel sobre alcance comercial | Baja (nice-to-have piloto) |
| APP-009 | Buscador global | No existe | Búsqueda cross-entidades para el familiar | — | Baja |
| APP-010 | Timeline de actividad | No existe | Tabla/feed de eventos ordenados: pagos, mensajes, documentos, visitas, solicitudes | Depende de otros módulos | Media |

### Bloque 2 — IAM / Identidad, Autenticación, Roles y Permisos (IAM-001..IAM-012)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| IAM-001 | Alta de usuarios vinculados a residentes | Implementado: `family.link` | — | — | Cubierto |
| IAM-002 | Auth segura email+contraseña + recuperación | Implementado: Auth.js + AuthToken reset | — | — | Cubierto |
| IAM-003 | MFA para perfiles sensibles | Modelado (A-004) pero no implementado | Implementar TOTP/SMS MFA para tutor legal y administración | — | Alta para producción |
| IAM-004 | Roles y permisos granulares | Implementado: RBAC con 5 roles + permisos por recurso | Subtipos de familiar (principal/secundario/tutor) + permisos por tipo de documento, evento, relación legal | — | Alta |
| IAM-005 | Revocación inmediata de acceso | Implementado: `family.unlink` + RLS inmediata | — | — | Cubierto |
| IAM-006 | Auditoría de accesos (login, consultas, descargas) | Parcial: login y acciones en AuditLog; no hay registro de descarga documental ni consulta de sección sensible | Auditar consulta de documentos descargados y acceso a secciones sensibles del portal | Depende de módulo Documental | Media |
| IAM-007 | Delegación de permisos (tutor autoriza a familiar) | No existe | Modelo de subpermisos delegados entre familiares | — | Alta si se añade tutor legal |
| IAM-008 | Invitaciones con caducidad | Implementado: AuthToken con `expiresAt` | — | — | Cubierto |
| IAM-009 | Bloqueo por intentos fallidos | No existe | Rate limiting + bloqueo temporal de cuenta | — | Alta para producción |
| IAM-010 | Panel de permisos activos visible al usuario | No existe | UI "Mis permisos" en el portal familiar | — | Baja |
| IAM-011 | Gestión de contactos autorizados por residente | Parcial: `family.listLinks` + `updatePrivacy` | Vista de todos los contactos con relación legal y vigencia desde expediente | — | Media |
| IAM-012 | SSO corporativo para profesionales | No existe | SAML/OIDC para grupos corporativos | Decisión de Angel (coste + demanda) | Baja (roadmap) |

### Bloque 3 — Consentimiento, Privacidad y Representación Legal (CONS-001..CONS-009)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| CONS-001 | Registrar consentimientos por residente y familiar | Implementado: `ConsentRecord` con tipo, versión, fecha, firmante | Versión del texto legal + IP del usuario (trazabilidad digital del consentimiento) | — | Media |
| CONS-002 | Aceptar, rechazar o revocar consentimientos | Implementado: `granted: Boolean` en ConsentRecord | Exposición al familiar desde el portal (hoy solo gestionable por dirección) | — | Alta — quick win |
| CONS-003 | Diferenciar tipos de consentimiento | Implementado: enum `ConsentType` (INGRESO, IMAGEN, PORTAL_FAMILIAS, DATOS_SANITARIOS_EXTERNOS, IA_ANONIMA) | Añadir tipos COMUNICACIONES y ECONOMICO (necesarios para los nuevos módulos) | — | Media |
| CONS-004 | Conservar evidencia de aceptación (IP, fecha, versión) | Parcial: fecha y firmante guardados | IP de la acción y versión del texto legal no se guardan | — | Alta — RGPD |
| CONS-005 | Bloquear acciones sin consentimiento válido | Parcial: `consentFamilyPortal` en Resident existe | Lógica de "gate de consentimiento" antes de mostrar secciones del portal | — | Alta |
| CONS-006 | Caducidad y renovación de consentimientos | No existe | Campo `expiresAt` en ConsentRecord + lógica de aviso | — | Media |
| CONS-007 | Consentimiento por representante legal | Parcial: `consentBy` en Restraint (modelo); no en ConsentRecord | Campo `grantedByRole` (residente/tutor/representante) en ConsentRecord | — | Alta — legal |
| CONS-008 | Base legal alternativa cuando no aplica consentimiento | No existe | Campo `legalBasis` en ConsentRecord (contrato, obligación legal, interés vital) | Decisión/validación legal de Angel/DPO | Media |
| CONS-009 | Panel de privacidad para el usuario final | No existe | UI en portal familiar: "Mis datos / Mis consentimientos / Mis derechos" | — | Media |

### Bloque 4 — Comunicaciones, Mensajería y Notificaciones (COM-001..COM-012)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| COM-001 | Comunicados generales segmentados (centro/unidad/grupo) | No existe | Tabla `Announcement` (tenant, center, target, content, sentAt) + router + UI backoffice | — | Alta |
| COM-002 | Mensajería bidireccional controlada | No existe | Tabla `Message` o `Thread` (familiar -> centro, centro -> familiar) + router + UI | — | Alta |
| COM-003 | Categorías de mensaje configurables | No existe | Depende de COM-001/COM-002 | — | Media |
| COM-004 | Notificaciones push | No existe | Web Push API (VAPID) + tabla suscripciones push | No bloqueante externo; VAPID es estándar web | Alta — diferencial de adopción |
| COM-005 | Deep link desde notificación a la acción | No existe | URL estructuradas + lógica de routing desde push payload | Depende de COM-004 | Media |
| COM-006 | Acuse de lectura de comunicados críticos | No existe | Campo `readAt` en tabla de envíos + UI de estado en backoffice | — | Media |
| COM-007 | Email como canal complementario | Parcial: email transaccional UE existe (AUTH-1) para invitación/reset | Reutilizar provider UE para notificaciones operativas (no solo auth) | — | Media — quick win |
| COM-008 | SMS para comunicaciones críticas | No existe | Integración con proveedor SMS UE | Decisión de Angel (coste recurrente por SMS) | Baja (roadmap) |
| COM-009 | Plantillas configurables | No existe | Tabla de plantillas por centro + editor de backoffice | — | Media |
| COM-010 | Acuse de recibo | No existe | Depende de COM-001 | — | Media |
| COM-011 | Bandeja de entrada y archivo | No existe | Vista del familiar con historial de comunicaciones | Depende de COM-001/COM-002 | Media |
| COM-012 | Traducción asistida / multilingüe | Parcial: i18n es/ca en UI existe | Las comunicaciones del centro (texto libre) no tienen traducción automática | Decisión de Angel sobre qué idiomas soportar | Baja |

### Bloque 5 — Centro Documental, Informes, Firma y Acuses (DOC-001..DOC-012)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| DOC-001 | Mostrar documentos según permisos | No existe (no hay modelo de Documento en Vetlla) | Tabla `Document` (tenantId, centerId, residentId opcional, type, url, permisos) + router + portal UI | Object storage UE (Q-004) para archivos binarios | Alta |
| DOC-002 | Clasificar por tipo | No existe | Enum `DocumentType` (CONTRATO, RECIBO, AUTORIZACION, INFORME, NORMAS_CENTRO, COMUNICACION_FORMAL, POLITICA_PRIVACIDAD) | Depende de DOC-001 | Alta |
| DOC-003 | Publicación desde backoffice | No existe | Upload + metadatos + selección de destinatarios | Object storage UE (Q-004) | Alta |
| DOC-004 | Descarga controlada con auditoría | No existe | Log de descarga en AuditLog + URL firmada temporal (presigned) | Object storage UE (Q-004) | Alta — RGPD |
| DOC-005 | Acuse de lectura | No existe | Tabla `DocumentRead` (documentId, userId, readAt) + campo `requiresAck` en Document | — | Alta |
| DOC-006 | Firma electrónica (simple/avanzada) | No existe | Integración con proveedor de firma UE (Autofirma, Signaturit, DocuSign UE) o firma simple con hash | Decisión de Angel (proveedor + coste + nivel de firma requerido) | Alta para contratos |
| DOC-007 | Versionar documentos | No existe | Campo `version` + relación `previousVersionId` en Document | — | Media |
| DOC-008 | Caducidad documental | No existe | Campo `expiresAt` + tarea de aviso | — | Media |
| DOC-009 | Carga documental por familiar | No existe | Upload desde portal familiar + flujo de revisión | Object storage UE (Q-004) | Media |
| DOC-010 | Validar formato, tamaño y malware | No existe | Validación MIME + límite de tamaño; antivirus en storage (p.ej. ClamAV o servicio del proveedor) | Decisión de nivel de protección | Media |
| DOC-011 | Flujo de revisión documental | No existe | Estado `PENDIENTE_REVISION` en Document + notificación a administración | — | Media |
| DOC-012 | Integración con gestores documentales externos | No aplica (Vetlla ES el gestor) | — | — | No aplica |

### Bloque 6 — Pagos, Recibos y Estado de Cuenta (PAY-001..PAY-011)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| PAY-001 | Estado de cuenta por residente | No existe | Tabla `Invoice` / `Receipt` (tenantId, residentId, concepto, importe, estado, vencimiento) | — | Alta (P1 doc) |
| PAY-002 | Pago digital | No existe | Integración con pasarela de pago UE (Stripe EU, Redsys, BBVA Merchant) | Decisión de Angel (pasarela, contrato, comisiones) | Alta — requiere decisión |
| PAY-003..PAY-011 | Resto de funcionalidad de pagos | No existe | Todos dependen de PAY-001 y PAY-002 | Pasarela de pagos | Alta — bloqueo externo |

El bloque de Pagos está **completamente bloqueado por la decisión de pasarela de pagos**. El modelo de datos (tabla Invoice/Receipt con estados normalizados: PENDIENTE/EN_PROCESO/PAGADO/VENCIDO/RECHAZADO/ANULADO/DEVUELTO/CONCILIADO) es independiente y se puede definir ahora; la funcionalidad de pago real requiere pasarela.

### Bloque 7 — Solicitudes, Incidencias y Tracking con SLA (REQ-001..REQ-013)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| REQ-001 | Crear solicitudes desde la app | No existe | Tabla `FamilyRequest` (tenantId, residentId, familyLinkId, category, description, status, priority, attachments) + router + UI portal | — | Alta |
| REQ-002 | Categorías configurables | No existe | Tabla `RequestCategory` por tenant (name, responsibleRole, slaHours) | — | Alta |
| REQ-003 | Estado visible al familiar | No existe | Depende de REQ-001; UI de estado (RECIBIDA/ASIGNADA/EN_CURSO/PENDIENTE_INFO/RESUELTA/CERRADA) | — | Alta |
| REQ-004 | Asignación a equipos responsables | No existe | Campo `assignedToRole` o `assignedToUserId` + router de gestión en backoffice | — | Alta |
| REQ-005 | Timestamps automáticos (creación, asignación, primera respuesta, resolución) | No existe | Campos calculados o campos explícitos en FamilyRequest | — | Alta |
| REQ-006 | Comentarios y evidencias | No existe | Tabla `RequestComment` (requestId, authorId, body, attachments) | — | Alta |
| REQ-007 | SLA por categoría y prioridad | No existe | Campo `slaHours` en RequestCategory + lógica de alerta de SLA incumplido | — | Media |
| REQ-008 | Notificación de cambio de estado | No existe | Depende de COM-004 (push) o COM-007 (email) | — | Alta — adopción |
| REQ-009 | Valoración post-resolución | No existe | Campo `rating` + `ratingComment` en FamilyRequest | — | Media (CSAT) |
| REQ-010..REQ-013 | Reapertura, escalado, ITSM, FAQ | No existe | Dependiente de los anteriores | — | Baja |

### Bloque 8 — Visitas, Autorizaciones y Control de Acceso (VIS-001..VIS-012)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| VIS-001..VIS-010 | Gestión digital de visitas (solicitar, aprobar, QR, check-in/out, cancelar, visitantes, notificar) | No existe | Tabla `Visit` (tenantId, residentId, familyLinkId, date, slot, visitors, status, qrToken, checkinAt, checkoutAt) + router + UI portal + UI recepción | — | Alta (P1 doc) |
| VIS-011 | Integración con control de acceso físico | No existe | Webhook/API hacia sistema de acceso externo | IoT/acceso físico externo; decisión de Angel | Baja (roadmap P2) |
| VIS-012 | Cuestionario previo a la visita | No existe | Formulario configurable por centro antes de la visita | — | Baja |

El módulo de Visitas es completamente nuevo, pero no tiene dependencias externas bloqueantes. Es construible con el stack actual.

### Bloque 9 — Reservas de Espacios, Servicios y Actividades (RSV-001..RSV-010)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| RSV-001..RSV-008 | Publicar recursos reservables, disponibilidad, reserva, aprobación, aforo, lista de espera, recordatorios, cancelación | No existe | Tabla `Resource` + `Reservation` (tenantId, resourceId, residentId, slot, status, capacity) + router + UI | — | P1 — tras visitas |
| RSV-009 | Reservas de pago | No existe | Depende de módulo Pagos | Pasarela de pagos | Baja (bloqueo PAY) |
| RSV-010 | Reglas avanzadas de reserva | No existe | Configurable, depende de RSV-001..008 | — | Baja |

### Bloque 10 — Agenda del Residente y Vida Diaria (AGEN-001..AGEN-007)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| AGEN-001..AGEN-005 | Agenda del residente (actividades, visitas, citas, inscripciones, recordatorios, filtro de información sensible) | Parcial: CarePlan/objetivos existen; no hay agenda de eventos del centro ni actividades publicables | Tabla `CenterEvent` / `Activity` (tenantId, centerId, date, type, capacity) + visibilidad para familiar | — | P1 — complementa Visitas |
| AGEN-006 | Sincronización con calendarios externos (Google/Apple) | No existe | Export iCal/CalDAV | — | Baja |
| AGEN-007 | Videollamadas programadas | No existe | Integración con Jitsi/Meet | Decisión de Angel (servicio de vídeo UE) | Baja |

### Bloque 11 — Información Asistencial Compartible y Bienestar (CARE-001..CARE-007)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| CARE-001 | Configurar qué información asistencial ve el familiar | Implementado: `canSeeCare`, `canSeeMedication`, `canSeeAssessments` en FamilyLink | Ampliar flags: `canSeeDiet`, `canSeeFalls`, `canSeeWeightHistory`, `canSeePlanSummary` | — | Media — quick win |
| CARE-002 | Resúmenes periódicos de bienestar | No existe | Job periódico que genera resumen legible (IA copiloto puede ayudar aquí) + UI portal | Copiloto H5 (disponible) o lógica sin IA | Media |
| CARE-003 | Preferencias compartibles del residente | Parcial: `LifeStory` (historia de vida) existe | Versión "no clínica" legible por familia en portal | — | Media — quick win |
| CARE-004 | Plan de vida en versión no sensible | Parcial: `CarePlan` existe con objetivos | Endpoint/UI que filtre solo los objetivos marcados como "compartibles con familia" | — | Media |
| CARE-005..CARE-007 | Preferencias no clínicas compartibles, indicadores de bienestar, alertas no clínicas | Parcial: modelo existe; sin exposición familiar ni alertas | Vista de preferencias (dieta, actividades, rutinas) en portal; alertas solo con validación del centro | — | Media |

### Bloque 12 — Encuestas, Feedback y Satisfacción (FB-001..FB-007)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| FB-001..FB-007 | Encuestas configurables, CSAT post-solicitud, NPS periódico, anónimas, resultados a dirección | No existe | Tabla `Survey` + `SurveyResponse` (tenantId, type, questions JSON, anonymous) + router + UI | — | P1 — tras Solicitudes (CSAT se acopla a REQ-009) |

### Bloque 13 — Analítica, KPIs y Cuadros de Mando (BI-001..BI-011)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| BI-001..BI-002 | Activación y uso recurrente de usuarios | Parcial: `lastLoginAt` en User existe | Dashboard de adopción: % invitados/registrados/activos (DAU/WAU/MAU) | — | Media |
| BI-003 | KPIs de solicitudes | No existe | Depende de módulo Solicitudes | — | Media |
| BI-004 | KPIs de pagos | No existe | Depende de módulo Pagos | — | Media |
| BI-005 | KPIs de visitas | No existe | Depende de módulo Visitas | — | Media |
| BI-006 | KPIs de documentación | No existe | Depende de módulo Documental | — | Media |
| BI-007 | KPIs de satisfacción | No existe | Depende de módulo Encuestas | — | Media |
| BI-008..BI-011 | Filtros, exportación, alertas de gestión, integración BI | No existe | Depende de todos los anteriores; exportación CSV/Excel pura es trivial | — | Baja |

### Bloque 14 — Integraciones, APIs y Ecosistema (INT-001..INT-013)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| INT-001..INT-003 | Integración con maestro de residentes, contactos y documentos de ResiPlus | **No aplica**: Vetlla ES el core. Los datos maestros viven nativamente en Vetlla | — | — | No aplica (ventaja competitiva) |
| INT-004..INT-006 | Integración con facturación, visitas, solicitudes | **No aplica**: Vetlla tiene API tRPC tipada; no hay integración externa que resolver | Los módulos son nativos cuando se construyan | — | No aplica |
| INT-007 | APIs documentadas (OpenAPI/tRPC) | Parcial: tRPC es tipado pero no hay documentación OpenAPI pública | Generar docs OpenAPI o potenciar la introspección tRPC para el ecosistema | — | Baja (post-MVP) |
| INT-008 | Gestión de errores de integración | Parcial: logger JSON + health check existen | Retry automático con backoff para jobs asíncronos (notificaciones push, email) | — | Media |
| INT-009 | Webhooks o eventos | No existe | Sistema de eventos/webhooks para integraciones de terceros | Decisión de Angel sobre ecosistema | Baja (roadmap) |
| INT-010..INT-013 | IoT, sensores, BI externo, CRM/ITSM | No existe | Roadmap P2; requiere evaluación específica | Varios bloqueantes externos | P2 |

### Bloque 15 — Administración y Configuración Backoffice (ADM-001..ADM-010)

| ID Doc | Requerimiento | Estado Vetlla | Qué falta | Bloqueante externo | Severidad |
|---|---|---|---|---|---|
| ADM-001 | Backoffice administrativo | Implementado: panel, centros, residentes, equipo, alertas, auditoría, ocupación | Extender con gestión de comunicados, solicitudes asignadas, documentos publicados | — | Media |
| ADM-002 | Activar/desactivar módulos por centro | Parcial: `PlanTier` por tenant existe; no hay feature flags granulares por módulo/centro | Tabla `TenantFeatureFlag` o campo JSON `enabledModules` por Tenant/Center | — | Alta — configurable |
| ADM-003 | Configurar roles y permisos | Parcial: RBAC por rol existe; no configurable desde UI | Panel de "qué ve cada rol" en UI (hoy en código). Custom roles diferidos (ADR-0013) | — | Media |
| ADM-004 | Configurar categorías de solicitudes y SLA | No existe | Depende de módulo Solicitudes | — | Alta |
| ADM-005 | Plantillas de comunicación | No existe | Depende de módulo Comunicaciones | — | Media |
| ADM-006 | Franjas de visitas y reservas | No existe | Depende de módulos Visitas/Reservas | — | Alta |
| ADM-007 | Gestión de contenidos informativos | No existe | Tabla `CenterContent` (noticias, normas, FAQ, guías) + editor backoffice | — | Baja |
| ADM-008 | White-label básico (logo, colores, contacto) | No existe | Tabla `TenantBranding` + aplicación en portal familiar | Decisión de Angel sobre alcance comercial | Baja |
| ADM-009 | Workflows configurables | No existe | Roadmap P2 | — | Baja |
| ADM-010 | Administración corporativa multicentro | No existe | Modelo de grupo con centros múltiples bajo un "tenant corporativo" vs. tenants separados | Decisión de modelo de datos multicentro (Q-nueva) | Media |

### Bloque 16 — IoT, Accesos, Sensores (IOT-001..IOT-007)

Completamente fuera del MVP de Vetlla. Toda la funcionalidad IoT es P2 en el documento fuente y requiere evaluación específica de privacidad, seguridad y hardware. No se desarrolla aquí. Alineado con lo que está fuera del MVP de Vetlla según CLAUDE.md.

### Bloque 17 — Marketplace y Servicios Complementarios (MKT-001..MKT-006)

Fuera del MVP de Vetlla (explícitamente en CLAUDE.md). El propio documento fuente lo pone en P2 y dice que es secundario hasta que los módulos base estén consolidados.

---

## 4. Reencuadre Estratégico

### 4.1 La tesis del cloud-native

ResiPlus es un ERP cliente-servidor de escritorio con más de 2.750 centros. Para ofrecer la SuperApp familia, necesita construir una capa front-end nueva sobre un core legacy sin API pública tipada, resolver integraciones con sistemas de facturación externos, y mantener dos lógicas (la del core y la de la capa). Este es exactamente el modelo que describe el documento: "integración, no duplicación", con ResiPlus como fuente maestra.

Vetlla no tiene ese problema. Los residentes, contactos, consentimientos, atención, medicación y PIA **ya viven en el mismo Postgres con RLS**, accesibles mediante la misma API tRPC tipada. Un módulo de Solicitudes de familias en Vetlla es simplemente una tabla nueva con tenantId+RLS+router, no una integración. Un Centro Documental es un objeto en storage UE referenciado desde la misma BD. Esto es el diferencial real: no hay capa de integración que romper, no hay fuente maestra duplicada, no hay que sincronizar.

El riesgo de ResiPlus frente a Vetlla es que la capa nueva envejece más rápido que el core; si el core cambia (lo que ocurre con actualizaciones de versión), la capa se puede romper. En Vetlla, la consistencia es garantizada por el schema y el compilador TypeScript.

### 4.2 El riesgo de alcance

El documento expande el producto de "software de gestión del centro" a "plataforma + canal digital familia + módulo de pagos + módulo documental + módulo de solicitudes + módulo de visitas + analítica". Son entre 5 y 8 módulos nuevos sin dependencias externas, más 3 que requieren decisiones de Angel (pasarela de pagos, object storage, app nativa vs. PWA). Esto es producto suficiente para 12-18 meses de construcción adicional si se hace bien. El riesgo es intentarlo todo a la vez y no terminar nada.

La decisión clave de producto es: ¿Vetlla quiere ser el ERP de gestión del centro + la SuperApp familia en el mismo MVP, o construye el diferencial de gestión primero y añade la capa familia como el siguiente ciclo? El documento de ResiPlus sugiere que incluso ellos separan en 4 fases.

---

## 5. Plan de Incorporación Priorizado (MoSCoW Vetlla, no copiado del documento)

### 5.1 QUICK WINS — Lo que está a medias y se completa con poco esfuerzo (1-3 días cada uno)

**QW-1: Portal familiar "accionable" en la home (ya es solo lectura pasiva)**
- Qué es: añadir en el portal familiar los flags de privacidad ampliados (`canSeeDiet`, `canSeeLifeStory`) y mostrar la historia de vida y preferencias del residente (LifeStory ya existe en el schema) de forma legible y no clínica.
- Qué NO es: un módulo nuevo. Es ampliar lo que ya existe.
- Esfuerzo: 0.5 días Dani/Elena. Sin dependencias externas.
- Criterio de aceptación: el familiar ve "Le gusta la música de los 60, prefiere ducha por la mañana" si la dirección lo ha rellenado y tiene permiso.

**QW-2: Consentimientos visibles y accionables desde el portal familiar**
- Qué es: exponer al familiar los consentimientos activos de su residente (ConsentRecord ya existe) con opción de revocar los que no son obligatorios. Añadir captura de IP y versión de texto en ConsentRecord.
- Esfuerzo: 1 día Núria (router) + 0.5 días Dani (UI). Sin dependencias externas.
- Criterio de aceptación: el familiar ve "Consentimiento de imagen: concedido el 01/06/2026. [Revocar]". La revocación queda en AuditLog. IP registrada.

**QW-3: Notificaciones por email para eventos del portal (reutiliza provider ya existente)**
- Qué es: cuando el centro publica una comunicación, un documento o una solicitud cambia de estado, el familiar recibe un email usando el provider UE ya cableado en AUTH-1 (invitación/reset).
- Esfuerzo: 1 día Núria (job/hook) + 0 días infraestructura (provider ya existe).
- Criterio de aceptación: el familiar recibe un email con asunto "Nuevo comunicado de [Centro]" cuando la dirección publica un anuncio. Sin push todavía.

### 5.2 MUST HAVE — Las 3-4 épicas que dan el salto (no existen hoy)

**EPIC-1: Solicitudes/Incidencias del familiar con estado y SLA**

Esta es la épica de mayor impacto por impacto en reducción de carga administrativa (el objetivo central del documento). Elimina llamadas y WhatsApps.

Modelo de datos mínimo:

```
FamilyRequest {
  id, tenantId, residentId, familyLinkId
  category: String (FK a RequestCategory)
  description: String
  status: RECIBIDA | ASIGNADA | EN_CURSO | PENDIENTE_INFO | RESUELTA | CERRADA
  priority: NORMAL | URGENTE
  assignedToRole: UserRole?
  assignedToUserId: String?
  resolvedAt: DateTime?
  firstResponseAt: DateTime?
  rating: Int?           // CSAT 1-5
  ratingComment: String?
  createdAt, updatedAt
  [RLS: tenant_id + política]
}

RequestCategory {
  id, tenantId
  name: String
  slaHours: Int
  defaultAssignedRole: UserRole
  active: Boolean
}

RequestComment {
  id, tenantId, requestId, authorId
  body: String
  isFromCenter: Boolean
  attachmentUrl: String?
  createdAt
}
```

Routers: `familyRequests.create`, `familyRequests.listByFamilyLink`, `familyRequests.updateStatus` (DIR/backoffice), `familyRequests.addComment`, `familyRequests.rate`.
Permisos nuevos: `family_request:write` (FAMILIAR), `family_request:manage` (DIRECTOR, SANITARIO).
Notificación: email al familiar cuando cambia el estado (reutiliza QW-3).
Backoffice: lista de solicitudes asignadas por responsable, con estado y SLA.
UI portal: "Nueva solicitud" + lista con estados.

**EPIC-2: Centro Documental con acuse de lectura**

El segundo módulo de mayor impacto. Elimina el envío de documentos por email/postal y da trazabilidad legal.

Modelo de datos mínimo:

```
Document {
  id, tenantId, centerId
  residentId: String?     // null = documento del centro (normas, políticas)
  type: DocumentType
  title: String
  storageKey: String      // clave en object storage UE (Q-004)
  version: Int @default(1)
  publishedAt: DateTime?
  expiresAt: DateTime?
  requiresAck: Boolean    // requiere acuse de lectura
  requiresSignature: Boolean
  publishedById: String
  [RLS]
}

DocumentRead {
  id, tenantId, documentId, userId
  readAt: DateTime
  signedAt: DateTime?
  ipHash: String          // hash de IP para evidencia RGPD
}
```

Routers: `documents.publish` (DIR), `documents.listForFamilyLink`, `documents.markRead`, `documents.getPresignedUrl` (URL temporal para descarga segura).
Permiso nuevo: `documents:publish` (DIRECTOR), `documents:read` (FAMILIAR si vinculado).
Bloquea en: object storage UE (Q-004 de OVHcloud). Sin storage, los documentos son solo metadatos (sin binarios). Se puede construir el modelo y la UI ahora; el storage se cablea cuando llega Q-004.
Firma: diferir a fase 2 (requiere decisión de proveedor de firma).

**EPIC-3: Comunicaciones y notificaciones push bidireccionales**

El tercer pilar del canal digital familia. Sin esto, la SuperApp es pasiva.

Modelo de datos mínimo:

```
Announcement {
  id, tenantId, centerId
  targetType: ALL | UNIT | RESIDENT
  targetId: String?
  subject: String
  body: String
  requiresAck: Boolean
  sentAt: DateTime?
  [RLS]
}

AnnouncementRead {
  id, tenantId, announcementId, userId, readAt
}

PushSubscription {
  id, tenantId, userId
  endpoint: String
  p256dh: String
  auth: String
  createdAt
}
```

Push: Web Push API (VAPID). No requiere proveedor externo. Funciona en PWA.
Email: reutiliza el provider UE de AUTH-1.
Routers: `announcements.publish` (DIR), `announcements.listForUser`, `announcements.markRead`, `pushSubscriptions.subscribe/unsubscribe`.
Permiso nuevo: `announcements:publish` (DIRECTOR), `announcements:read` (FAMILIAR).
Nota: no se implementa SMS en esta épica (coste recurrente, decisión de Angel).

**(Opcional) EPIC-4: Visitas digitales con QR**

Cuarta épica de valor claro para el familiar, sin dependencias externas bloqueantes. El centro elimina el teléfono para gestionar visitas; el familiar agenda desde la app.

Modelo de datos mínimo:

```
VisitSlot {
  id, tenantId, centerId
  dayOfWeek: Int[]
  startTime: String   // "10:00"
  endTime: String     // "12:00"
  maxVisitors: Int
  active: Boolean
}

Visit {
  id, tenantId, residentId, familyLinkId
  slotId: String
  date: DateTime
  visitors: Json      // [{ name, relation }]
  status: PENDIENTE | APROBADA | RECHAZADA | CANCELADA
  qrToken: String     // HMAC firmado con expiración
  checkinAt: DateTime?
  checkoutAt: DateTime?
  notes: String?
  [RLS]
}
```

Routers: `visits.requestVisit`, `visits.listForFamilyLink`, `visits.approve/reject` (DIR), `visits.checkin/checkout` (recepción), `visits.validateQr`.
Permiso nuevo: `visits:request` (FAMILIAR), `visits:manage` (DIRECTOR), `visits:checkin` (nuevo rol RECEPCION o DIRECTOR).

### 5.3 ESPERA DECISIÓN DE ANGEL

Las siguientes funcionalidades no pueden avanzar sin decisión explícita de Angel:

| Tema | Pregunta para Angel | Qué desbloquea |
|---|---|---|
| App nativa vs. PWA | ¿Publicamos la PWA actual en App Store / Google Play como TWA (Trusted Web Activity), o construimos app nativa (React Native / Expo)? TWA es más barato pero tiene limitaciones de notificaciones y cámara. | Adopción de familias en móvil; push nativo |
| Pasarela de pagos | ¿Qué pasarela usar para cobros a familias? (Stripe EU, Redsys, BBVA Merchant). ¿Qué modelo comercial: Vetlla cobra la comisión, el centro, o pasa el coste al familiar? | Módulo completo de Pagos/Recibos |
| Object storage UE (Q-004) | Ya está en Q-004 (OVHcloud Object Storage). Desbloquear Q-004 desbloquea también el Centro Documental. | Módulo Documental completo (binarios) |
| Firma electrónica | ¿Qué nivel de firma requiere el sector (simple/avanzada/cualificada)? ¿Qué proveedor UE? (Autofirma, Signaturit, DocuSign UE, ValidatedID) | Contratos y autorizaciones con fuerza legal |
| Modelo multicentro corporativo | ¿Un grupo con varios centros es un solo tenant con múltiples centros, o tenants separados con una capa de grupo? | Rol corporativo, analítica agregada |
| SMS para notificaciones críticas | ¿Se activa SMS como canal? (coste recurrente por SMS ~0.05-0.10 EUR/SMS) | COM-008 |

### 5.4 Orden del Primer Incremento Construible Aquí (sin dependencias externas)

Propuesta de orden de construcción, con su justificación de impacto x esfuerzo:

**Incremento A (2-3 días): Quick Wins en serie**
1. QW-1: Historia de vida legible en portal (amplía FamilyLink.canSeeLifeStory)
2. QW-2: Consentimientos accionables en portal (expone ConsentRecord al familiar + captura IP)
3. QW-3: Email de notificación reutilizando provider UE

Justificación: sin código nuevo relevante, sin riesgo, sin dependencias. Entregan valor real al familiar y completan el portal para que sea "accionable" en algo.

**Incremento B (1 semana): EPIC-3 Comunicaciones (Announcements + Web Push)**

Justificación: antes que Solicitudes, porque las Comunicaciones son el canal que hace que el familiar abra la app. Sin notificaciones, el familiar no se entera de que tiene solicitudes resueltas ni documentos pendientes. Es la infraestructura de atención del usuario para el resto de módulos. VAPID no requiere proveedor externo.

**Incremento C (1.5 semanas): EPIC-1 Solicitudes/Incidencias básico (sin SLA complejo)**

Justificación: el mayor impacto en reducción de carga administrativa del centro. Sin pasarela ni storage. Construible completamente con el stack actual.

**Incremento D (1 semana, condicional a Q-004): EPIC-2 Centro Documental**

Justificación: alto impacto pero bloqueado por object storage. Se puede construir la lógica (metadatos, permisos, acuses) sin el storage real; los binarios se añaden cuando llega OVHcloud.

**Incremento E (1.5 semanas): EPIC-4 Visitas con QR**

Justificación: alto valor percibido por el familiar; el QR de visita es tangible y diferencial. Sin dependencias externas.

---

## 6. Resumen Ejecutivo del Gap

### Cubierto (no requiere trabajo):
- Auth, invitación, revocación, RBAC, AuditLog, RLS, multitenant, i18n es/ca, PWA, expediente, portal de solo lectura, consentimientos (modelo), onboarding self-service.

### Quick wins (menos de 1 semana total):
- Historia de vida en portal + consentimientos accionables + email de notificación reutilizando provider existente.

### Módulos nuevos de alto impacto sin dependencias externas (4-6 semanas):
- Comunicaciones/Anuncios + Web Push VAPID.
- Solicitudes/Incidencias del familiar con estado y comentarios.
- Visitas digitales con QR.

### Módulos de alto impacto con dependencia externa bloqueante:
- Centro Documental completo (binarios): bloqueado por Q-004 (object storage OVHcloud).
- Pagos/Recibos: bloqueado por decisión de pasarela de Angel.
- Firma electrónica: bloqueado por decisión de proveedor y nivel de firma.

### Módulos de roadmap (no MVP, no construir ahora):
- Reservas de espacios/actividades, Encuestas/NPS, Analítica BI, IoT/accesos, Marketplace, SSO corporativo, SMS, Videollamadas, Multicentro corporativo, White-label avanzado.

### Decisiones que necesita Angel (new open_questions):
- App nativa vs. PWA con distribución en tiendas.
- Pasarela de pagos para módulo PAY.
- Firma electrónica: proveedor y nivel.
- Modelo multicentro corporativo (1 tenant vs. N tenants con capa de grupo).
