# Auditoría de seguridad y RGPD — 2026-06-12
**Rama:** claude/vetlla-saas-mvp-spec-PuHOW  
**Auditora:** Sofía (DPO / Seguridad RGPD)  
**Alcance:** Auth, Email, Expediente Fase 1, Portal accionable (requests/comms/visits), RLS, AuditLog

---

## HALLAZGOS CRÍTICOS

---

### CRÍTICO-01: exportResidentData no cubre las tablas de Fase 1 ni las del portal — incumplimiento art. 15 RGPD

**Fichero:** `packages/db/src/dsar.ts`, función `exportResidentData`, líneas 69–124  
**Descripción:**  
La función `exportResidentData` exporta únicamente las tablas "antiguas": careRecords, medications, administrations, treatments, carePlans y auditTrail. Las 8 tablas nuevas de Fase 1 — `ResidentDevice`, `Vaccine`, `WeightRecord`, `PressureUlcer`+`UPPCuring`, `FallRecord`, `Restraint`, `ConsentRecord`, `LifeStory` — y las del portal accionable — `ServiceRequest`+`ServiceRequestComment`, `Visit`, `MessageThread`+`Message` — no se incluyen en ningún momento.

**Impacto RGPD:**  
Incumplimiento directo del art. 15 (derecho de acceso) y art. 20 (portabilidad). Si un interesado solicita su expediente completo, el responsable del tratamiento entrega un fichero incompleto con datos de salud de categoría especial (art. 9) ausentes: sujeciones, consentimientos, UPPs, caídas. Si la AEPD audita un DSAR export, la omisión es constatable. Además, el `sha256` del JSON parcial se certifica en AuditLog dando apariencia de exportación completa cuando no lo es.

**Corrección recomendada:**  
Añadir a `exportResidentData` los bloques con las nuevas consultas en el mismo `Promise.all`. Ejemplo mínimo de lo que falta:
```typescript
db.residentDevice.findMany({ where: { residentId }, orderBy: { createdAt: 'asc' } }),
db.vaccine.findMany({ where: { residentId }, orderBy: { date: 'asc' } }),
db.weightRecord.findMany({ where: { residentId }, orderBy: { recordedAt: 'asc' } }),
db.pressureUlcer.findMany({ where: { residentId }, include: { curings: true } }),
db.fallRecord.findMany({ where: { residentId } }),
db.restraint.findMany({ where: { residentId } }),
db.consentRecord.findMany({ where: { residentId } }),
db.lifeStory.findUnique({ where: { residentId } }),
db.serviceRequest.findMany({ where: { residentId }, include: { comments: { where: { internal: false } } } }),
db.visit.findMany({ where: { residentId } }),
db.messageThread.findMany({ where: { residentId }, include: { messages: true } }),
```
Añadir la versión del export a `version: 2` y documentar el cambio en el ADR DSAR.

**Estado DPIA/RoPA:** CRÍTICO — actualizar RoPA con todas las nuevas categorías de datos.

---

### CRÍTICO-02: anonymizeResident no borra ni pseudonimiza las tablas de Fase 1 — incumplimiento art. 17 RGPD

**Fichero:** `packages/db/src/dsar.ts`, función `anonymizeResident`, líneas 140–198  
**Descripción:**  
La función de supresión/anonimización bajo art. 17 borra contactos y vínculos familiares, y opcionalmente (según política) borra registros clínicos "antiguos". Sin embargo, cuando `policy.keepClinicalRecords = false` (o incluso cuando es `true`, para los datos que sí se deberían tratar), las tablas nuevas de Fase 1 (`ResidentDevice`, `Vaccine`, `WeightRecord`, `PressureUlcer`, `UPPCuring`, `FallRecord`, `Restraint`, `ConsentRecord`, `LifeStory`) y las del portal (`ServiceRequest`, `ServiceRequestComment`, `Visit`, `MessageThread`, `Message`) no se tocan en ninguna rama del código.

`ConsentRecord` es particularmente grave: contiene el historial de consentimientos RGPD del propio residente. Al anonimizarlo, ese historial queda huérfano con datos personales del interesado (campo `grantedBy` — nombre del firmante) sin disociar.  
`LifeStory` contiene datos personales de terceros (`importantPeople`) y datos de creencias religiosas (art. 9 RGPD).  
`visitorNames` en `Visit` contiene nombres de personas físicas que son terceros no usuarios del sistema, sin cobertura de supresión.

**Impacto RGPD:**  
Incumplimiento art. 17 (derecho de supresión). Puede derivar en responsabilidad por mantener datos de salud identificados tras ejercicio de derecho completado. Los datos de terceros en `visitorNames` y `importantPeople` no tienen cobertura de supresión.

**Corrección recomendada:**  
En la rama `!policy.keepClinicalRecords`, añadir las deletes de las tablas nuevas respetando el orden de FK:
- `UPPCuring` → `PressureUlcer`
- `Restraint`, `FallRecord`, `WeightRecord`, `Vaccine`, `ResidentDevice`, `ConsentRecord`, `LifeStory`
- `ServiceRequestComment` → `ServiceRequest`
- `Message` → `MessageThread`
- `Visit`

Independientemente de la política, `LifeStory.importantPeople` y `LifeStory.religion` deben ponerse a `null` al anonimizar (son datos de terceros y datos de creencias — art. 9). `Visit.visitorNames` debe sobrescribirse con `[]`. `ConsentRecord.grantedBy` debe ponerse a `null`.

---

### CRÍTICO-03: vetlla_app tiene permiso DELETE sobre audit_logs — la inmutabilidad depende solo del trigger

**Verificado en Postgres:** `SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='vetlla_app' AND table_name='audit_logs'` → `SELECT, INSERT, UPDATE, DELETE`.

**Descripción:**  
El trigger `audit_logs_immutable` bloquea `UPDATE` correctamente, pero el rol de aplicación `vetlla_app` tiene `DELETE` sobre `audit_logs`. El trigger no protege contra DELETE. Un atacante que comprometa la sesión de la app (p. ej. inyección SQL, bug de autorización en un endpoint futuro) puede borrar entradas del AuditLog.

**Impacto RGPD/seguridad:**  
El AuditLog es la prueba de trazabilidad exigida por art. 9 RGPD y el mecanismo de detección de intrusiones. Si un actor malicioso borra trazas de su actividad (acceso a expedientes, exportaciones DSAR, cambios de rol), la organización no puede probar ni refutar lo ocurrido ante la AEPD. Contradice el ADR 0007.

**Corrección recomendada:**  
Revocar DELETE sobre audit_logs al rol vetlla_app:
```sql
REVOKE DELETE ON public.audit_logs FROM vetlla_app;
```
Añadir también un trigger `BEFORE DELETE` que lance excepción, por defensa en profundidad:
```sql
CREATE OR REPLACE FUNCTION audit_logs_no_delete() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'audit_logs es inmutable: no se permite DELETE'; END; $$;
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_no_delete();
```

---

## HALLAZGOS ALTOS

---

### ALTO-01: EMAIL_PROVIDER=console se mantiene activo si http está mal configurado (fallback silencioso a logs)

**Fichero:** `apps/web/src/server/email/index.ts`, líneas 72–87  
**Descripción:**  
Si `EMAIL_PROVIDER=http` pero `EMAIL_API_URL` o `EMAIL_API_KEY` están vacíos o no definidos, el código hace silenciosamente fallback a `ConsoleEmailProvider` con solo un `logger.warn`. En ese caso, los tokens de reset de contraseña e invitación (enlaces de acceso con credenciales de un solo uso) se imprimen en los logs de la aplicación con el token en claro.

Adicionalmente, el `.env.example` tiene `EMAIL_PROVIDER="console"` como valor activo (no comentado), lo que favorece que un despliegue de producción apresurado arranque con console por olvido.

**Impacto RGPD/seguridad:**  
Los tokens de reset son credenciales de acceso temporales. Si el proveedor de logs (CloudWatch, Loki, Datadog) indexa las líneas de consola, el token queda en claro en un sistema de terceros con potencial acceso externo. Si los logs se exportan a herramientas SaaS fuera de la UE, viola la residencia de datos (RGPD art. 46). Abre ventana de suplantación de identidad.

**Corrección recomendada:**  
1. Cambiar el fallback de http-mal-configurado de ConsoleEmailProvider a un error `throw` en startup (fail-fast): si `EMAIL_PROVIDER=http` y faltan variables, lanzar excepción en el arranque, no degradar silenciosamente.
2. En el `.env.example` comentar el valor `EMAIL_PROVIDER="console"` con una advertencia explícita de que es solo para desarrollo local.
3. Añadir una comprobación de startup que verifique la variable y falle si `NODE_ENV=production` con provider console activo.

---

### ALTO-02: resetPassword no audita el evento si el usuario es SUPERADMIN (sin tenantId)

**Fichero:** `apps/web/src/server/routers/account.ts`, líneas 55–67  
**Descripción:**  
La mutación `resetPassword` solo llama a `logAudit` si `user.tenantId` es truthy (línea 56: `if (user.tenantId)`). Un usuario SUPERADMIN de plataforma (tenantId = null) puede restablecer su contraseña sin dejar ninguna traza en AuditLog.

**Impacto RGPD/seguridad:**  
El restablecimiento de contraseña del SUPERADMIN es la acción de mayor privilegio del sistema (bypass de RLS sobre todos los tenants). Que no quede trazado es incompatible con el principio de trazabilidad del art. 9 RGPD y con el ADR 0007. En caso de incidente de seguridad, no hay evidencia del cambio de credenciales.

**Corrección recomendada:**  
Usar `asPlatformAdmin()` para registrar el reset del superadmin en un log de plataforma separado, o bien registrar en un AuditLog con `tenantId = 'PLATFORM'` (valor sentinela). Lo mínimo:
```typescript
await logAudit(authDb, {
  tenantId: user.tenantId ?? 'PLATFORM',
  actorId: user.id,
  actorEmail: user.email,
  action: 'PASSWORD_RESET',
  entity: 'User',
  entityId: user.id,
  summary: 'Contraseña restablecida mediante enlace',
});
```

---

### ALTO-03: listAll (staff) expone el conteo TOTAL de comentarios incluyendo los internos al familiar vía conteo indirecto

**Fichero:** `apps/web/src/server/routers/requests.ts`, línea 185  
**Descripción:**  
El endpoint `listAll` (permiso `requests:manage`, solo staff) usa `_count: { select: { comments: true } }` que cuenta todos los comentarios de una solicitud, incluidos los `internal=true`. Esto es correcto para staff. Sin embargo, si en el futuro un endpoint del familiar (p. ej. `listMine`) obtiene el recuento total y lo compara con el de comentarios visibles, inferiría la existencia de comentarios internos.

Actualmente `listMine` está bien protegido (`where: { internal: false }`). El riesgo es de consistencia: si un desarrollador añade en el futuro un campo `totalComments` al listado del familiar copiando el patrón de `listAll` sin el filtro, el número de comentarios internos queda implícitamente visible.

**Impacto RGPD/seguridad:**  
Riesgo de fuga de información sobre deliberaciones internas del staff (notas de coordinación, valoraciones de la solicitud). Bajo hoy pero materializable en próximas iteraciones.

**Corrección recomendada:**  
En `listAll` no es un problema de seguridad inmediato (solo staff ve este endpoint). Documentar en el código con un comentario explícito que `_count.comments` incluye internos y que ningún endpoint del familiar debe exponerlo sin filtro `{ where: { internal: false } }`.

---

### ALTO-04: checkInByCode sin rate limiting — enumeración de códigos QR de visita

**Fichero:** `apps/web/src/server/routers/visits.ts`, líneas 727–776  
**Descripción:**  
El endpoint `checkInByCode` acepta cualquier código de 1 a 20 caracteres y hace una búsqueda exacta por `qrCode` en la BD. No hay mecanismo de rate limiting, bloqueo por IP ni límite de intentos fallidos. Un atacante con acceso a la red interna del centro (o con credenciales de `AUXILIAR`/`SANITARIO`/`DIRECTOR`) podría iterar combinaciones del espacio de códigos BASE32 de 8 caracteres (32^8 ≈ 10^12) hasta encontrar un código válido del día.

Aunque el espacio es grande, la caducidad es diaria (fecha), no por intento. Si el centro tiene muchas visitas confirmadas simultáneas, la probabilidad de colisión dentro del tenant aumenta. Adicionalmente, el endpoint devuelve mensajes de error distintos según si el código no existe (`NOT_FOUND`) vs si existe pero está en estado incorrecto (`BAD_REQUEST`), lo que permite oracle binario.

**Impacto RGPD/seguridad:**  
Un atacante podría hacer check-in en una visita ajena, físicamente entrar al centro bajo identidad incorrecta, o acceder al expediente del residente vinculado a la visita. Dato de salud: el residentId queda expuesto en la respuesta del check-in (`visit.residentId`).

**Corrección recomendada:**  
1. Implementar rate limiting por `actorId` + IP en tRPC (p. ej. máximo 10 intentos/minuto fallidos por sesión). La biblioteca `@upstash/ratelimit` o un middleware propio con Redis/Upstash EU es suficiente.
2. Normalizar los mensajes de error: devolver siempre el mismo mensaje genérico independientemente del motivo del fallo (eliminar el oracle binario de "código no encontrado" vs "estado incorrecto").
3. A medio plazo, reducir el espacio de búsqueda con un índice parcial `WHERE status = 'CONFIRMADA' AND scheduled_at::date = CURRENT_DATE` y aumentar la longitud del código a 10 caracteres.

---

## HALLAZGOS MEDIOS

---

### MEDIO-01: visitorNames en Visit son datos personales de terceros sin base jurídica explícita ni inclusión en RoPA

**Fichero:** `packages/db/prisma/schema.prisma`, modelo `Visit`, campo `visitorNames Json`; `apps/web/src/server/routers/visits.ts`, línea 76  
**Descripción:**  
El campo `visitorNames` almacena los nombres completos de los visitantes (personas físicas que no son usuarios del sistema y no han firmado ningún consentimiento en Vetlla). Se recopilan sin limitación de número (`max(6)` acompañantes), se envían en el email de confirmación, y persisten indefinidamente en la BD sin TTL ni política de borrado.

Los visitantes son "interesados" en el sentido del RGPD cuyos datos se tratan sin que Vetlla pueda demostrar la base jurídica de dicho tratamiento (no son trabajadores, no tienen contrato con el centro, no han prestado consentimiento en el sistema). El tratamiento podría ampararse en el interés legítimo (seguridad del centro, control de accesos), pero debe documentarse.

**Impacto RGPD:**  
Art. 13 RGPD (información al interesado). Si la AEPD audita el tratamiento de visitantes, la ausencia de base jurídica documentada es una infracción. Adicionalmente, `anonymizeResident` no limpia `visitorNames` (ver CRÍTICO-02).

**Corrección recomendada:**  
1. Añadir en el RoPA una línea de tratamiento "Registro de visitantes a residentes" con base jurídica (propuesta: interés legítimo art. 6.1.f), finalidad (control de accesos/seguridad), y período de retención (p. ej. 1 año desde la visita).
2. Añadir un job de limpieza que ponga `visitorNames = []` en visitas con `scheduledAt` más antiguo que el período de retención.
3. Informar a los visitantes de la recogida de sus datos (p. ej. en la confirmación de visita enviada al familiar, añadir una línea sobre la política de privacidad).

---

### MEDIO-02: listForCenter (staff) expone email del solicitante familiar en la agenda del centro

**Fichero:** `apps/web/src/server/routers/visits.ts`, líneas 477–505  
**Descripción:**  
El endpoint `listForCenter` incluye `requestedBy: { select: { id: true, name: true, email: true } }`. La pantalla de la agenda del centro para check-in/check-out de recepción expone el email del familiar para todos los usuarios con `visits:manage` (DIRECTOR, SANITARIO, AUXILIAR). El AUXILIAR de recepción no necesita el email del familiar para gestionar la agenda física: basta con el nombre y el código.

**Impacto RGPD:**  
Sobreexposición de dato de contacto del familiar a personal con menor nivel de responsabilidad (AUXILIAR). Minimización insuficiente (art. 5.1.c RGPD).

**Corrección recomendada:**  
Eliminar `email` del select en `listForCenter`. Si se necesita contactar al familiar desde esa pantalla, hacerlo mediante un endpoint específico con permiso más restrictivo o visibilizándolo solo a DIRECTOR.

---

### MEDIO-03: announcementStats carga todos los FamilyLinks y Residents del tenant sin paginación

**Fichero:** `apps/web/src/server/routers/comms.ts`, líneas 397–420  
**Descripción:**  
El cálculo de destinatarios en `announcementStats` carga en memoria todos los `familyLink` y todos los `resident` del tenant con `findMany` sin límite. En un tenant grande (p. ej. 500 residentes, 1500 familiares), esta consulta genera presión de memoria en el proceso Node.js y puede exponer volúmenes de datos no justificados.

**Impacto RGPD/seguridad:**  
Riesgo de disponibilidad (un tenant grande puede impactar a otros en el proceso compartido). No es una fuga de datos pero sí un tratamiento de volumen mayor al necesario (minimización).

**Corrección recomendada:**  
Calcular los destinatarios con una query agregada en SQL en lugar de cargar todos los registros en memoria. Alternativa más simple: añadir `take: 5000` como guardrail y emitir un warning si se supera.

---

### MEDIO-04: ConsoleEmailProvider imprime el token de reset en claro en consola (sin redact)

**Fichero:** `apps/web/src/server/email/index.ts`, líneas 30–35  
**Descripción:**  
El `ConsoleEmailProvider` usa `console.info` directamente (no el logger estructurado), imprimiendo el cuerpo del email completo incluyendo el token del enlace. El logger tiene `redactFields` para claves como `token`, pero esta ruta lo evita deliberadamente ("En dev queremos VER el enlace"). Si este proveedor llegara a producción (ver ALTO-01), el token quedaría en los logs de infraestructura sin redactar.

**Impacto RGPD/seguridad:**  
Dependiente de ALTO-01. En sí mismo es aceptable en desarrollo. El riesgo es que el comentario "// En dev queremos VER el enlace" da cobertura semántica para no añadir protección, pero no hay guardrail que impida su uso en producción.

**Corrección recomendada:**  
Añadir un guard explícito en `ConsoleEmailProvider.send`:
```typescript
if (process.env.NODE_ENV === 'production') {
  throw new Error('ConsoleEmailProvider no está permitido en producción.');
}
```

---

### MEDIO-05: auth_tokens sin RLS — justificación correcta pero sin política explícita en pg_policies

**Verificado en Postgres:** `auth_tokens` tiene `relrowsecurity=false`, no aparece en `pg_policies`.  
**Descripción:**  
El diseño es correcto (la tabla es infraestructura cross-tenant de auth, equivalente al sistema de sesiones, y se accede exclusivamente con `asPlatformAdmin()`). Sin embargo, no existe ninguna restricción a nivel de BD que prevenga que un cliente con `tenantId` configurado (rol `vetlla_app`) lea o modifique tokens de otros usuarios si por algún bug se ejecuta una query sobre esta tabla con el cliente de tenant en lugar del de plataforma.

**Impacto RGPD/seguridad:**  
El hash del token está almacenado (sin reversión trivial), pero si un bug hiciera llegar el hash a un atacante, podría intentar fuerza bruta. El riesgo real es bajo dado que la app no expone esta tabla via tRPC a clientes.

**Corrección recomendada:**  
Añadir una política RLS que solo permita acceso al rol `vetlla` (owner) o a través de `bypass_rls=on`:
```sql
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_tokens_platform_only ON auth_tokens 
  FOR ALL USING (current_setting('app.bypass_rls', true) = 'on');
```
Esto garantiza que una query accidental con cliente de tenant devuelva 0 filas.

---

## HALLAZGOS BAJOS

---

### BAJO-01: Middleware next.js no añade cabeceras de seguridad HTTP

**Fichero:** `apps/web/src/middleware.ts`  
El middleware actual solo inyecta `x-pathname`. No añade `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, ni `Permissions-Policy`. Para una aplicación con datos de salud, estas cabeceras son práctica recomendada (OWASP) y reducen el riesgo de ataques XSS y clickjacking.

**Corrección recomendada:** Añadir cabeceras de seguridad en el middleware o en `next.config` (ver `headers()` de Next.js).

---

### BAJO-02: AuditLog no registra markAnnouncementRead ni listThreads/listMine como accesos a datos

**Descripción:**  
Las operaciones de lectura sensible — `listAnnouncementsForMe`, `getThread`, `listMine` (solicitudes), `portal` (family) — no se registran en AuditLog. Para datos de salud art. 9, el art. 32 RGPD y la norma ENS recomiendan registrar también los accesos de lectura, no solo las mutaciones. Actualmente solo se auditan las escrituras.

**Corrección recomendada:** A corto plazo, aceptable para el MVP (las lecturas son muy frecuentes y saturarían el AuditLog). Añadir un flag de "acceso auditado" al menos para `getThread` y `portal` cuando el rol es FAMILIAR, con debounce por sesión.

---

### BAJO-03: listAll (staff) expone emails de asignado y creador de la solicitud

**Fichero:** `apps/web/src/server/routers/requests.ts`, líneas 183–184  
El endpoint `listAll` incluye `createdBy: { select: { email: true } }` y `assignedTo: { select: { email: true } }`. El email del familiar creador está expuesto al AUXILIAR que solo necesita ver el nombre para gestionar la solicitud. Mínima minimización.

**Corrección recomendada:** Eliminar `email` de los `select` de `createdBy` y `assignedTo` en `listAll`. Si el staff necesita contactar por email, hacerlo desde el detalle de la solicitud (`get`) con permiso más específico.

---

## VERIFICACIÓN RLS

Todas las 39 tablas de la base de datos tienen `relrowsecurity=true` y `relforcerowsecurity=true` salvo `auth_tokens` (justificado y registrado como riesgo en MEDIO-05) y `_prisma_migrations` (tabla de infraestructura sin datos personales, aceptable).

Las 38 políticas activas siguen el patrón correcto:
```
(current_setting('app.bypass_rls', true) = 'on') OR (tenant_id = current_setting('app.tenant_id', true))
```

Las tablas nuevas de Fase 1 y portal (consent_records, restraints, fall_records, pressure_ulcers, upp_curings, weight_records, vaccines, resident_devices, life_stories, service_requests, service_request_comments, visits, message_threads, messages, announcements, announcement_receipts, visit_slot_configs) tienen RLS+FORCE correctamente aplicado.

El trigger `audit_logs_immutable` protege contra UPDATE pero no contra DELETE (ver CRÍTICO-03).

---

## CHECKLIST DPIA DELTA — Tratamientos nuevos a añadir al RoPA

Los siguientes tratamientos han aparecido en esta sesión y no están en el RoPA anterior:

| Tratamiento | Categorías de datos | Base jurídica propuesta | Período retención | Estado |
|---|---|---|---|---|
| Solicitudes de servicio (familias) | Nombre residente, categoría de solicitud, comentarios | Ejecución de contrato (art. 6.1.b) | 3 años desde cierre | PENDIENTE de formalizar |
| Mensajería bidireccional familia-centro | Cuerpo de mensajes, nombre residente | Ejecución de contrato (art. 6.1.b) | 2 años desde cierre del hilo | PENDIENTE |
| Registro de visitas | Nombre residente, nombres visitantes (terceros), estado de visita, QR | Interés legítimo (art. 6.1.f) — control de accesos | 1 año desde la visita | PENDIENTE — base jurídica a validar con Angel |
| Visitantes como interesados (visitorNames) | Nombre completo de personas físicas no usuarias | Interés legítimo (art. 6.1.f) | 1 año | PENDIENTE — requiere info art. 13 |
| Historia de vida (LifeStory) | Profesión, aficiones, personas importantes, religión (art. 9) | Consentimiento (art. 9.2.a) o interés vital (art. 9.2.c) para atención centrada en la persona | Mientras dure la estancia + retención sanitaria CCAA | PENDIENTE — base jurídica para `religion` requiere consentimiento explícito |
| Comunicados a familias (Announcement) | Email del familiar, nombre residente | Ejecución de contrato | 1 año | PENDIENTE |

**NOTA sobre LifeStory.religion:** el campo `religion` contiene datos de creencias (categoría especial art. 9 RGPD). Necesita consentimiento explícito (art. 9.2.a) o cobertura por interés vital. Añadir al checklist de ConsentRecord la aceptación explícita de este tratamiento antes de rellenar el campo.

---

## VEREDICTO GENERAL

El código tiene un nivel de madurez notable en aislamiento multitenant (RLS verificado en 38/39 tablas, doble aislamiento RLS+FamilyLink en todos los endpoints del familiar) y en trazabilidad de mutaciones. Sin embargo, el crecimiento acelerado de las últimas 48h ha generado tres brechas críticas que deben corregirse antes de cualquier piloto con datos reales:

1. El export DSAR y la anonimización del art. 17 son estructuralmente incompletos respecto a las nuevas tablas. Un ejercicio de derechos hoy entregaría un expediente incompleto y dejaría datos identificables tras una supresión: esto es incumplimiento constatable por la AEPD.

2. La inmutabilidad del AuditLog está protegida a medias: el trigger bloquea UPDATE pero el rol de aplicación puede DELETE. Un atacante interno o un bug pueden borrar la traza de sus propias acciones, que es precisamente el escenario que el AuditLog debe prevenir.

3. La falta de rate limiting en checkInByCode expone el acceso físico al centro a enumeración de códigos con oracle binario, con riesgo de suplantación de visitante.

Los hallazgos ALTOS (email console en producción, reset SUPERADMIN sin auditar) son corregibles con cambios de pocas líneas. El DPIA delta de visitorNames y LifeStory.religion requiere decisión jurídica de Angel antes de activar esos campos en producción.
