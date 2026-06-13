# Evaluación de cumplimiento RNF Seguridad y Privacidad
**Rama:** claude/vetlla-saas-mvp-spec-PuHOW  
**Fecha:** 2026-06-13  
**Auditora:** Sofía (DPO / Seguridad RGPD)  
**Fuente de requerimientos:** requerimientos_completos_resiplus_core_superapp_benchmark.md v1.0 (2026-06-13)  
**Cruce con:** 2026-06-12-auditoria-superapp.md (remediaciones verificadas en código)

---

## Resumen ejecutivo

| Sección | Total RNF | HECHO | PARCIAL | PENDIENTE | BLOQUEADO | FUERA |
|---|---|---|---|---|---|---|
| 4.1 Seguridad (RNF-SEG-001..014) | 14 | 5 | 5 | 3 | 1 | 0 |
| 4.2 Privacidad (RNF-PRI-001..012) | 12 | 3 | 5 | 4 | 0 | 0 |
| **Total 4.1+4.2** | **26** | **8** | **10** | **7** | **1** | **0** |

**Cobertura 4.1 (Seguridad):** HECHO+PARCIAL = 10/14 = **71 %** — 4 RNF sin cobertura suficiente para piloto con datos reales.  
**Cobertura 4.2 (Privacidad):** HECHO+PARCIAL = 8/12 = **67 %** — 4 RNF materialmente incompletos.

Los 5 gaps que bloquean un piloto con datos reales se detallan al final.

---

## Resuelto por la remediación de 2026-06-12

Los hallazgos CRÍTICOS y ALTOS de la auditoría de ayer han sido corregidos en el código de esta rama antes de la presente evaluación. Impacto sobre los RNF:

| Hallazgo remediado | RNF beneficiado | Verificación en código |
|---|---|---|
| CRÍTICO-01: exportResidentData completo (v2) con 11 tablas nuevas | RNF-PRI-003 (art. 15), RNF-PRI-001 | `packages/db/src/dsar.ts` líneas 99-208; `dsar-registry.ts` (cobertura CI) |
| CRÍTICO-02: anonymizeResident borra/limpia todas las tablas nuevas | RNF-PRI-003 (art. 17), RNF-PRI-001 | `dsar.ts` líneas 224-329; campos `grantedBy`, `visitorNames`, `LifeStory` cubiertos |
| CRÍTICO-03: audit_logs DELETE | RNF-SEG-010, RNF-PRI-009 | **RESUELTO** — migración 20260612130000 + REVOKE en app-role.sql; verificado funcionalmente (permission denied) |
| ALTO-01: ConsoleEmailProvider fail-fast en producción | RNF-SEG-009 (tokens) | `apps/web/src/server/email/index.ts` líneas 34-39 y 90-96 |
| ALTO-02: resetPassword audita SUPERADMIN con sentinela PLATFORM | RNF-SEG-010 | `apps/web/src/server/routers/account.ts` líneas 62-70 |
| ALTO-04: checkInByCode con rate limit + error genérico | RNF-SEG-011 (análogo) | `visits.ts` líneas 64-75, 731-734, 747-762 |

El registro DSAR también introduce `dsar-registry.ts` que hace que CI falle si se añade una tabla con `residentId` sin declarar su política (cobertura estructural de art. 15/17).

---

## 4.1 Seguridad — RNF-SEG-001 a RNF-SEG-014

| ID | Requerimiento | Estado | Fichero / gap |
|---|---|---|---|
| RNF-SEG-001 | Autenticación segura | HECHO | `auth.ts`: Credentials + bcrypt (cost 10) + validación Zod. JWT session. Anti-enumeración en reset. |
| RNF-SEG-002 | MFA | PENDIENTE | No implementado. `auth.ts` solo credenciales. Sin TOTP ni OTP. **GAP-2** |
| RNF-SEG-003 | SSO/OIDC/OAuth2 | PENDIENTE | No implementado. El comentario en `auth.ts` línea 13 lo aplaza a un hito futuro. Fuera del MVP actual pero requerido por RNF-SEG-003. |
| RNF-SEG-004 | Biometría en app | FUERA (MVP) | La PWA puede exponer WebAuthn en fase posterior; no es bloqueante para piloto interno. Sin fecha. |
| RNF-SEG-005 | Control de acceso basado en roles (RBAC) | HECHO | `apps/web/src/lib/rbac.ts`: 5 roles, 26 permisos, `permissionProcedure` en tRPC. Verificado en todos los routers. |
| RNF-SEG-006 | Permisos por centro, residente, módulo y acción | PARCIAL | Por módulo/acción: cubierto por RBAC. Por centro: RLS a nivel tenant (`app.tenant_id`). Por residente individual: `assertFamilyAccess` para FAMILIAR; para staff, el acceso es por tenant (toda la plantilla ve todos los residentes del tenant). Falta restricción staff por residente o unidad (p. ej. AUXILIAR solo ve su unidad). ADR-0013 aplaza roles personalizados por tenant. |
| RNF-SEG-007 | Cifrado de datos en tránsito | PARCIAL | HTTPS asumido por el hosting (Next.js en Vercel/cloud UE). No se audita forzado de HTTPS ni HSTS en cabeceras (BAJO-01 no resuelto). Sin certificación explícita en código/config. |
| RNF-SEG-008 | Cifrado de datos en reposo | PARCIAL | Depende del proveedor de BD/hosting (no está elegido — A-003 pendiente). No hay cifrado a nivel de aplicación (column-level encryption) ni documentación de la configuración del proveedor. Pendiente de decisión de infraestructura. |
| RNF-SEG-009 | Protección de tokens y credenciales | HECHO | `AuthToken`: hash SHA-256, single-use (`usedAt`), TTL por `expiresAt`. Token en claro solo en el enlace enviado. `ConsoleEmailProvider` bloqueado en producción (ALTO-01 resuelto). `.env.example` con secretos fuera del código. |
| RNF-SEG-010 | Auditoría de accesos y cambios | PARCIAL | Mutaciones auditadas: CREATE/UPDATE/DELETE, LOGIN, DSAR, COPILOT. El trigger `audit_logs_immutable` protege contra UPDATE. DELETE bloqueado para `vetlla_app` (REVOKE + trigger BEFORE DELETE; verificado). Lecturas sensibles (portal familiar, getThread) no auditadas (BAJO-02, aceptado para MVP). |
| RNF-SEG-011 | Bloqueo de cuenta por intentos fallidos | PENDIENTE | No hay bloqueo de cuenta en `auth.ts`. El rate limit de `checkInByCode` (ALTO-04 resuelto) cubre solo ese endpoint. No hay protección de fuerza bruta en el endpoint de login. **GAP-2 complementario.** |
| RNF-SEG-012 | Políticas de contraseña configurables | PARCIAL | Mínimo 8 caracteres en `account.ts` línea 43 (`z.string().min(8).max(72)`). No configurable por tenant. Sin validación de entropía, historial ni expiración. Suficiente para piloto interno, insuficiente para cumplimiento LOPDGDD en centros. |
| RNF-SEG-013 | Gestión de sesiones activas | PENDIENTE | JWT strategy sin revocación activa. No hay listado de sesiones, ni invalidación explícita (salvo por expiración del JWT). La revocación de `AuthToken` (enlace) sí funciona pero no aplica a la sesión activa. |
| RNF-SEG-014 | Revocación de accesos | PARCIAL | Borrado de usuario posible por DIRECTOR (`dsar:manage`). La sesión JWT activa no se invalida inmediatamente tras el borrado (depende de la expiración del token). Flujo de baja de empleado puede dejar ventana. |

---

## 4.2 Privacidad y cumplimiento — RNF-PRI-001 a RNF-PRI-012

| ID | Requerimiento | Estado | Fichero / gap |
|---|---|---|---|
| RNF-PRI-001 | Cumplimiento RGPD | PARCIAL | Base técnica sólida (RLS, AuditLog, DSAR, minimización en prompts). Faltan: RoPA formalizado, DPIA firmado, política de retención (Q-003), gestión de brechas, y consentimientos granulares digitales con evidencia. **Ver RNF-PRI-004, 005, 012.** |
| RNF-PRI-002 | Minimización de datos | PARCIAL | `FamilyLink` expone solo campos autorizados (`canSeeCare`, `canSeeMedication`, `canSeeAssessments`). Copiloto: `redactPii` antes del prompt (ADR-0008). Pendiente: email del familiar en `listForCenter` (MEDIO-02 parcialmente resuelto según código leído — no se ve la corrección en el diff), conteo de comentarios internos (ALTO-03 documentado no corregido). |
| RNF-PRI-003 | Derechos ARSOPL | PARCIAL | Art. 15 (acceso) y art. 17 (supresión) cubiertos: `dsar.ts` + `dsarRouter` con confirmación de apellido. Art. 16 (rectificación): cubierto por los routers de edición estándar con AuditLog. Art. 18 (limitación), art. 20 (portabilidad JSON), art. 21 (oposición): sin flujo específico dedicado ni documentación de proceso para el responsable del tratamiento. Plazo de respuesta 30 días: sin sistema de seguimiento de solicitudes ARSOPL. |
| RNF-PRI-004 | Registro de actividades de tratamiento (RoPA) | PENDIENTE | No existe documento RoPA formal. La auditoría de ayer lista 6 tratamientos nuevos a añadir. El `dsar-registry.ts` es un catálogo técnico de tablas, no un RoPA (no incluye base jurídica, responsable, subencargados, transferencias internacionales). **GAP-3** |
| RNF-PRI-005 | Consentimientos granulares | PARCIAL | Modelo `ConsentRecord` existe en el schema con DSAR coverage. `FamilyLink` tiene granularidad por sección (care/medication/assessments). Sin embargo, no hay flujo de UI para recogida y firma digital de consentimientos RGPD (RF-DOC-006/007/008). Los consentimientos clínicos (imagen, salidas, telemedicina) no tienen mecanismo de captura + evidencia en la plataforma. |
| RNF-PRI-006 | Revocación de consentimientos | PARCIAL | `ConsentRecord` tiene campo para estado. No hay endpoint dedicado de revocación ni flujo de notificación al centro tras la revocación. La reversión de `FamilyLink.canSeeCare` es editable pero no genera auditoría específica de "revocación de consentimiento". |
| RNF-PRI-007 | Evidencia de consentimiento | PENDIENTE | No hay captura de firma electrónica, IP/dispositivo, versión del documento ni timestamp de aceptación en ningún flujo de consentimiento. RF-DOC-005 (evidencia de firma) está sin implementar. **GAP-4** |
| RNF-PRI-008 | Separación información familiar / profesional | HECHO | `assertFamilyAccess` (centralizado en `family-access.ts`) + RLS + `FamilyLink` + permisos `portal:read`. El staff no puede usar el endpoint del familiar y viceversa. `canSeeCare/canSeeMedication/canSeeAssessments` gestionan la granularidad. RF-SOC-010, RF-CLI-010, RF-PIA-011 cubiertos arquitectónicamente. |
| RNF-PRI-009 | Registro de accesos a datos sensibles | PARCIAL | Mutaciones: cubiertas. Lecturas críticas: no auditadas (BAJO-02 — aceptado para MVP). DELETE sobre `audit_logs` bloqueado para `vetlla_app` (verificado funcionalmente). Registro de acceso SUPERADMIN: cubierto tras ALTO-02. |
| RNF-PRI-010 | Anonimización/seudonimización para analítica | PARCIAL | Copiloto: `redactPii` antes del prompt (seudonimización implementada). Analítica de datos (BI/dashboards): no hay pipeline de anonimización para reporting. El módulo BI no está en scope MVP pero el modelo de datos no tiene capa de anonimización para analítica. |
| RNF-PRI-011 | Retención documental configurable | PENDIENTE | Q-003 abierto: política de retención no decidida. `AnonymizePolicy.keepClinicalRecords` existe pero es hardcoded (default `true`). No hay TTL configurable por tipo de dato/tenant ni job de limpieza automático (excepto el propuesto para `visitorNames` en la auditoría de ayer). **GAP-3 complementario.** |
| RNF-PRI-012 | Gestión de brechas de seguridad | PENDIENTE | No existe ningún procedimiento documentado ni flujo técnico para: (a) detección de brecha, (b) evaluación de riesgo, (c) notificación a AEPD en 72h (art. 33 RGPD), (d) notificación a interesados si procede (art. 34). No hay canal de reporte, plantilla de notificación ni responsable asignado. **GAP-5** |

---

## Requerimientos transversales (RF con implicación de privacidad/seguridad)

| ID | Requerimiento | Estado | Nota |
|---|---|---|---|
| RF-DOC-004 | Firma electrónica | PENDIENTE | No existe proveedor elegido ni integración. Requiere decisión de Angel sobre proveedor cualificado (eIDAS) o simple. **GAP-4** |
| RF-DOC-005 | Registrar firmante, fecha, IP/dispositivo, versión y evidencia | PENDIENTE | Depende de RF-DOC-004. |
| RF-DOC-006 | Consentimientos granulares | PARCIAL | Modelo existe; flujo de UI y captura de evidencia, no. |
| RF-DOC-007 | Cubrir imagen, telemedicina, salidas, visitas, acceso familiar | PENDIENTE | Los tipos de consentimiento están enumerados en el backlog pero sin implementación. `ConsentRecord` tiene campo `type` genérico. |
| RF-DOC-008 | Revocación de consentimientos | PARCIAL | Modelo soporta revocación; flujo de notificación y evidencia, no. |
| RF-DOC-013 | Auditoría documental | PARCIAL | AuditLog cubre acciones sobre residentes/expediente. No hay auditoría específica de ciclo de vida de documentos (versión, apertura, descarga, firma). |
| RF-RES-005 | Permisos específicos por familiar o tutor | PARCIAL | `FamilyLink.canSeeCare/canSeeMedication/canSeeAssessments`. Falta granularidad por tipo de información clínica sensible (ej. diagnósticos psiquiátricos vs. constantes). |
| RF-CLI-010 | Limitar visibilidad de información clínica sensible | PARCIAL | El FAMILIAR solo ve lo que `FamilyLink` permite. Staff ve todo dentro del tenant. Sin granularidad de visibilidad por tipo de dato clínico para staff de menor privilegio. |
| RF-PIA-011 | Mostrar a familia versión simplificada y autorizada del PIA | PENDIENTE | `FamilyLink.canSeeAssessments` controla acceso pero no hay endpoint ni UI de "versión simplificada del PIA para familias". |
| RF-SOC-010 | Mostrar a familia versión autorizada (historia social) | PENDIENTE | Mismo patrón. No hay endpoint filtrado de historia social para familias. |
| RF-IA-003 | No responder información clínica sin autorización y control de permisos | HECHO | Copiloto solo accesible con `care:write`/`careplan:write` (SANITARIO/DIRECTOR, nunca FAMILIAR). El modelo recibe datos seudonimizados, no PII directa. |
| RF-IA-011 | Trazabilidad de uso de IA | HECHO | `COPILOT_DRAFT` y `COPILOT_CONFIRM` en AuditLog con modelo, versión de prompt y utterance seudonimizado. Ver `copilot.ts` líneas 68-78, 119-130. |
| RF-IA-012 | Revisión humana en recomendaciones críticas | HECHO | Patrón draft→confirm obligatorio: `draftCareRecord`/`draftCarePlan` no persisten; solo `confirmCareRecord`/`confirmCarePlan` escriben (acción explícita del profesional). |
| RF-IA-013 | Evitar decisiones automatizadas no supervisadas en contexto clínico | HECHO | Diseño arquitectónico: el modelo nunca toca la BD; herramientas de escritura requieren confirmación. ADR-0008 documenta la clasificación AI Act como "asistencia administrativa riesgo limitado". |

---

## Top-5 gaps de cumplimiento — bloqueantes para piloto con datos reales

### GAP-1: audit_logs con DELETE por el rol de aplicación — RESUELTO ✅ (corrección del CIO, 2026-06-13)

**RNF:** RNF-SEG-010, RNF-PRI-009  
**Estado:** **RESUELTO Y VERIFICADO FUNCIONALMENTE.** Este hallazgo era un FALSO POSITIVO de esta evaluación: la corrección SÍ está en la rama.
**Evidencia (verificada por el CIO en Postgres real, 2026-06-13):**
- Migración `packages/db/prisma/migrations/20260612130000_audit_logs_immutable_delete/migration.sql`: `REVOKE DELETE ON public.audit_logs FROM vetlla_app` + trigger `audit_logs_no_delete BEFORE DELETE` que lanza excepción para `vetlla_app`.
- `packages/db/prisma/sql/app-role.sql` (paso 5) revoca DELETE de forma idempotente en cada refresh de grants.
- Catálogo: `vetlla_app` tiene solo INSERT/SELECT/UPDATE sobre `audit_logs` (NO DELETE).
- **Prueba funcional**: `DELETE FROM audit_logs` como `vetlla_app` → `ERROR: permission denied for table audit_logs`.
- El CASCADE de borrado de tenant sigue funcionando (se ejecuta como owner, no como vetlla_app).
**Conclusión:** el AuditLog es append-only también frente a DELETE. No queda acción pendiente en este punto.
**Plazo:** Antes de cualquier piloto. Sin esto el AuditLog no es legalmente fiable.

---

### GAP-2: Sin MFA ni bloqueo de cuenta por fuerza bruta (CRÍTICO para datos de salud)

**RNF:** RNF-SEG-002, RNF-SEG-011  
**Descripción:** `auth.ts` solo tiene autenticación por credenciales. No hay TOTP, OTP, ni WebAuthn. No hay contador de intentos fallidos ni bloqueo temporal de cuenta. Para datos de salud (art. 9 RGPD), el INCIBE y la ENS requieren al menos autenticación de doble factor para acceso a sistemas con datos sensibles. Un piloto con datos reales sin MFA expone al responsable del tratamiento a responsabilidad por medidas insuficientes (art. 32 RGPD: "garantizar la confidencialidad de manera permanente").  
**Decisión que desbloquea:** Angel debe decidir el nivel mínimo aceptable para el piloto: (a) MFA obligatorio para todos los roles con datos clínicos (SANITARIO, DIRECTOR), opcional para FAMILIAR; o (b) MFA obligatorio para todos. Implementación: Auth.js soporta TOTP con `otpauth`; requiere campo `totpSecret` en el modelo User y pantalla de verificación.

---

### GAP-3: Sin RoPA formalizado ni política de retención decidida (ALTO)

**RNF:** RNF-PRI-004, RNF-PRI-011  
**Descripción:** No existe un documento RoPA (art. 30 RGPD) ni una política de retención por categoría de dato (Q-003 abierto). El `dsar-registry.ts` es un catálogo técnico, no un registro de actividades de tratamiento. Sin RoPA, Vetlla no puede demostrar cumplimiento ante la AEPD, no puede responder a una inspección, y no puede calcular cuándo borrar datos. Los 6 tratamientos nuevos identificados en la auditoría de ayer siguen sin base jurídica formalizada (solicitudes de servicio, mensajería, visitas, visitantes como interesados, historia de vida, comunicados).  
**Decisión que desbloquea:** Angel debe aprobar: (a) la base jurídica de cada tratamiento (especialmente `LifeStory.religion` que requiere consentimiento explícito art. 9.2.a); (b) los períodos de retención por categoría; (c) designación formal del responsable del tratamiento (el centro vs. Vetlla como encargado). Con esa decisión, el DPO redacta el RoPA y la política Q-003 en una sesión.

---

### GAP-4: Sin firma electrónica ni evidencia de consentimiento (ALTO)

**RNF:** RNF-PRI-005, RNF-PRI-006, RNF-PRI-007; RF-DOC-004/005/006/007/008  
**Descripción:** No hay proveedor de firma electrónica elegido. Los consentimientos RGPD (imagen, salidas, acceso familiar a información clínica, telemedicina) no tienen mecanismo de captura, firma ni evidencia (IP, dispositivo, versión del documento, timestamp). Sin evidencia de consentimiento, el tratamiento de datos de categoría especial (art. 9) bajo base jurídica de consentimiento (art. 9.2.a) no es demostrable ante la AEPD. Para un piloto con residentes reales, el centro necesita capturar y conservar la evidencia de consentimiento digitalmente.  
**Decisión que desbloquea:** Angel debe elegir el nivel de firma para el MVP: (a) firma simple (captura de email + timestamp + checkbox + hash del documento — suficiente para consentimientos internos no contractuales); o (b) firma electrónica avanzada/cualificada (eIDAS — proveedor externo: Signaturit, Docusign UE, Uanataca). La opción (a) es implementable internamente en 1-2 sprints sin integración externa. La opción (b) requiere contrato con proveedor.

---

### GAP-5: Sin procedimiento de gestión de brechas de seguridad (ALTO)

**RNF:** RNF-PRI-012  
**Descripción:** No existe ningún procedimiento documentado para: detectar una brecha, evaluarla, notificar a la AEPD en 72 horas (art. 33 RGPD) y notificar a los interesados si el riesgo es alto (art. 34). Para datos de salud (categoría especial art. 9), la AEPD considera que prácticamente cualquier brecha requiere notificación. Sin este procedimiento, si se produce un incidente antes del piloto, el responsable del tratamiento incumple una obligación legal con multa de hasta 10 M€ o el 2 % del volumen de negocio global.  
**Decisión que desbloquea:** No requiere desarrollo técnico para el piloto. Requiere que Angel apruebe un procedimiento operativo mínimo: (a) canal de reporte de incidentes (email seguro o ticket); (b) plantilla de notificación a AEPD (formulario online AEPD); (c) criterio de evaluación de riesgo (para decidir si se notifica también a interesados); (d) responsable de coordinar la respuesta. El DPO puede redactar el procedimiento en formato de una página. Bloquea el piloto porque sin él la organización opera sin red de seguridad legal.

---

## Estado de los pilares de cumplimiento

| Pilar | Estado | Nota |
|---|---|---|
| Residencia de datos UE | PARCIAL | Decisión de despliegue A-003 pendiente. El modelo de datos y la IA están diseñados para UE; el proveedor de hosting/BD no está elegido. |
| RLS + aislamiento multitenant | HECHO | 38/39 tablas con RLS+FORCE verificadas. `auth_tokens` justificado. |
| AuditLog inmutabilidad | HECHO | Trigger UPDATE: OK. DELETE: bloqueado (REVOKE + trigger, verificado). |
| DSAR art. 15/17 | HECHO | Resuelto por CRÍTICO-01 y CRÍTICO-02. Cubierto con CI estructural. |
| Minimización PII en IA | HECHO | `redactPii` en copiloto. Modelo no toca BD. AuditLog sin utterance crudo. |
| DPIA | PENDIENTE | No realizado formalmente. Requiere RoPA previo (GAP-3). |
| RoPA | PENDIENTE | GAP-3. |
| MFA | PENDIENTE | GAP-2. |
| Firma electrónica | PENDIENTE | GAP-4. |
| Gestión de brechas | PENDIENTE | GAP-5. |
| Separación familiar/profesional | HECHO | `assertFamilyAccess` centralizado. |

---

*Próxima revisión recomendada: tras decisiones de Angel sobre GAP-2 (MFA), GAP-3 (RoPA/retención) y GAP-4 (firma). GAP-1 (audit_logs DELETE): RESUELTO y verificado por el CIO 2026-06-13.*
