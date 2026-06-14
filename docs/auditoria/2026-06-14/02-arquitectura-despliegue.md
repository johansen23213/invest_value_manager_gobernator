# Auditoría externa — Arquitectura y preparación para despliegue

> **Fecha:** 2026-06-14 · **Alcance:** cadena de migraciones en BD limpia, preparación de
> deploy UE, coherencia arquitectónica (tRPC, server/client, multitenancy), deuda técnica,
> PWA/offline. **Método:** solo lectura (código, grep). NO se ejecutó build/test/migrate/seed.
> **Postura:** adversarial — buscar fallos, no validar. **No fiarse** de `project_state.yaml`.

---

## Resumen ejecutivo

El árbol está en mejor forma de lo que el incidente del rol `vetlla_app` sugería: el patrón
de migraciones es disciplinado (la mayoría de bloques GRANT van guardados con
`IF EXISTS (rolname='vetlla_app')`, las columnas nuevas usan `IF NOT EXISTS` y defaults, los
enums se crean antes de usarse, RLS es fail-closed con `ENABLE+FORCE`). La clase de bug
"`node:crypto` en el cliente" está conscientemente evitada (uso de Web Crypto isomórfico).

Sin embargo, **persisten varios fallos de la clase "verde-en-local / roto-en-prod" y vacíos
de despliegue que impiden un deploy reproducible**:

1. **CRÍTICO — Push notifications muertas en el navegador.** Existe backend web-push completo,
   tabla `push_subscriptions`, migración, UI de suscripción y claves VAPID, pero `public/sw.js`
   **no tiene listener `push` ni `notificationclick`**. Ninguna notificación se mostrará jamás.
   Feature 100% backend, 0% entrega. Pasa todo el CI (no hay E2E de push).

2. **CRÍTICO — No existe camino de despliegue reproducible.** Cero Dockerfile, cero IaC, sin
   `output: 'standalone'` en `next.config.ts`, sin runbook de arranque (orden bootstrap rol →
   migrate → app-role → seed), sin gestión de secretos/KMS, sin backups/PITR. El roadmap lo
   reconoce (B2/B3) pero **no hay nada construido**. "Alta de centro en minutos" no es real.

3. **ALTO — Divergencia estructural local vs CI/prod en el rol de BD.** `scripts/dev-setup.sh`
   crea solo el rol owner `vetlla` y **no provisiona `vetlla_app` ni `APP_DATABASE_URL`**. En
   local la app corre como owner; los bloques `GRANT ... IF EXISTS(vetlla_app)` se **saltan en
   silencio** y el modelo de privilegios (REVOKE DELETE en audit_logs, CRUD granular) **nunca
   se ejercita**. Esta es exactamente la divergencia que ocultó el bug del `REVOKE`. Sigue viva.

4. **ALTO — Flujos críticos sin red de seguridad E2E en CI.** El job Playwright está
   **documentado pero deshabilitado** (comentado en `ci.yml`). Hay 13 specs (login, MAR offline,
   copiloto, RBAC, auditoría) que **no se ejecutan en CI**. Una regresión en el flujo estrella
   (tablet offline) pasa verde.

5. **ALTO — Secreto TOTP de MFA en claro.** `users.mfa_secret` se guarda sin cifrar (TODO
   Q-SEC). Una lectura de BD derrota el 2FA de todos los usuarios. En SaaS de datos de salud
   (art. 9 RGPD) es un riesgo serio; el mecanismo de cifrado existe solo como TODO.

**Verificado en BD limpia (lectura estática, no ejecución):** la cadena de 38 migraciones no
contiene OTRO `GRANT/REVOKE` sin guarda más allá del ya corregido (`20260612130000` línea 20,
ahora cubierto por el bootstrap). No hay `ADD VALUE` de enum usado en la misma transacción.
Los enums se crean antes de las columnas que los referencian. **No encontré una segunda
migración rota en fresco** — pero la ejecución real contra Postgres 16 limpio NO se hizo aquí
(otros auditores comparten la BD), así que esto queda como "verificado por lectura, pendiente
de ejecución".

---

## Tabla de hallazgos

| # | Sev | Área | Evidencia | Impacto | Recomendación |
|---|-----|------|-----------|---------|---------------|
| A-01 | **Crítico** | PWA/push | `apps/web/public/sw.js` (42 líneas, sin `push`/`notificationclick`) vs `apps/web/src/server/push/index.ts:128` (`webpush.sendNotification`), tabla `push_subscriptions`, `push-card.tsx:200` | Las notificaciones push NUNCA se muestran. Feature completa en backend + UI, inerte en el navegador. Falsa sensación de feature lista. | Añadir en `sw.js` listeners `push` (parsear payload, `showNotification`) y `notificationclick` (focus/open). Añadir E2E o test de SW. |
| A-02 | **Crítico** | Deploy UE | No existe Dockerfile/IaC/runbook en el repo (`find` vacío); `next.config.ts` sin `output:'standalone'`; sin docs de arranque prod | No hay camino reproducible a producción UE. Deploy manual o inexistente. Bloquea el principio "cloud-native, alta en minutos". | Dockerfile multi-stage + `output:'standalone'`; runbook con orden bootstrap→migrate→app-role→seed; IaC (OVHcloud/Scaleway) con Postgres gestionado, secretos fuera de repo, backups/PITR, health/readiness. (ADR de deploy pendiente, INC-3). |
| A-03 | **Alto** | CI/local drift | `scripts/dev-setup.sh:75` crea solo `vetlla`; no crea `vetlla_app` ni exporta `APP_DATABASE_URL`. Bloques `GRANT ... IF EXISTS(vetlla_app)` en p.ej. `migrations/20260614210000_actividades/migration.sql:211` | En local la app corre como owner; el modelo de privilegios NO se ejercita. Misma clase de divergencia que ocultó el bug del REVOKE. Nuevos errores de grant/role volverán a pasar inadvertidos en local. | `dev-setup.sh` debe provisionar `vetlla_app` (NOSUPERUSER NOBYPASSRLS) y fijar `APP_DATABASE_URL`, igualando el arranque de CI/prod. |
| A-04 | **Alto** | CI/cobertura | `.github/workflows/ci.yml:140-160` (job E2E comentado); 13 specs en `apps/web/e2e/*.spec.ts` que no corren en CI | Login, MAR offline, copiloto, RBAC, auditoría sin protección automatizada. El flujo estrella (offline en tablet) solo se verifica a mano. | Activar job Playwright (paralelo) tal como ya describe el propio comentario; gate sobre flujos críticos. |
| A-05 | **Alto** | Seguridad/RGPD | `packages/db/prisma/schema.prisma:70-72` (`mfaSecret` sin cifrar); `migrations/20260614100000_mfa_and_login_lockout/migration.sql:7` | Secreto TOTP en claro: una lectura de BD derrota el 2FA de todos los usuarios. Riesgo art. 9 RGPD. | Cifrado a nivel de columna con KMS EU-soberano (Q-SEC). No marcar MFA como "listo" hasta cerrarlo. |
| A-06 | **Medio** | Rendimiento/escala | `apps/web/src/server/routers/care.ts:46-50` filtra `residentId` + `orderBy recordedAt desc`; índice solo en `resident_id` (`migrations/20260607075901_care_records/migration.sql:46`), sin composite `(resident_id, recorded_at)` | En `care_records` (tabla más caliente: constantes/ABVD por minuto) la query principal hace index scan + sort. Degrada con volumen. Igual patrón en MAR. | Índice compuesto `(resident_id, recorded_at DESC)` (y revisar `medication_administrations` por `(resident_id, scheduled_at)`). |
| A-07 | **Medio** | PWA/offline | `apps/web/public/sw.js:28-29` cachea respuestas de navegación (incluye payloads RSC con datos) en `vetlla-v1`; sin precache de `/atencion`; fallback solo si se visitó online antes | Riesgo de datos sociosanitarios obsoletos servidos offline; el fallback de navegación falla en primera visita offline. La promesa "offline en tablet" depende de IndexedDB, no del SW, pero el SW puede servir vistas stale. | Limitar caché del SW a shell/estáticos; no cachear navegaciones con datos; precachear el shell de `/atencion`; versionar y limpiar caché en `activate`. |
| A-08 | **Medio** | Email/feature gap | `apps/web/src/server/routers/comms.ts:117,185` ("TODO Q-005: encolar job…"); publicar comunicado NO envía email | Los comunicados a familias no se notifican por email (no-op silencioso). El usuario cree que se envió. | Documentar explícitamente en UI que no hay email aún, o implementar el job (Q-005). No presentarlo como entregado. |
| A-09 | **Medio** | Auth/multitenancy | `apps/web/src/server/trpc.ts:67` `bypassRls: role === 'SUPERADMIN'` confía en el claim de rol de la sesión | Si el rol de la sesión (JWT) pudiera manipularse o asignarse mal, `bypass_rls=on` rompe TODO el aislamiento entre tenants. La defensa RLS depende aquí de la integridad del claim. | Verificar que el rol SUPERADMIN no es asignable por tenant y que el JWT está firmado/validado server-side; test que confirme que un usuario de tenant no puede obtener bypass. |
| A-10 | **Bajo** | Seguridad headers | `apps/web/next.config.ts` sin `headers()` (CSP, HSTS, X-Frame-Options, Referrer-Policy) | SaaS de salud sin cabeceras de seguridad de transporte/contenido. | Añadir CSP/HSTS/headers en `next.config.ts` o middleware antes del deploy UE. |
| A-11 | **Bajo** | Migraciones/PG | `migrations/20260611200000_expediente_fase1/migration.sql:16-33` hace `ALTER TYPE ... ADD VALUE` (no se usa en la misma txn — OK en PG16) | En PG<12 rompería; los valores añadidos no son usables en la misma transacción. Aquí no se usan, así que pasa. Riesgo latente si una migración futura añade y usa un valor en el mismo fichero. | Convención: nunca usar un valor de enum recién añadido en la misma migración. Documentar. |

---

## "Verificado" vs "Pendiente"

### Verificado (por lectura estática)
- Cadena de 38 migraciones leída en orden. **Solo un `REVOKE/GRANT` sin guarda** de rol
  (`20260612130000:20`, el ya conocido); el resto van guardados con `IF EXISTS(vetlla_app)`.
  No hay segunda migración que asuma el rol sin guarda.
- `ADD COLUMN` usa `IF NOT EXISTS`/defaults en las migraciones de extensión; no se detectó
  colisión de columna contra tablas creadas distinto por otra migración.
- Enums creados antes de las columnas que los referencian; sin `ADD VALUE` usado en misma txn.
- RLS fail-closed (`current_setting(...,TRUE)` + `ENABLE+FORCE` + política por GUC). El gate
  de aislamiento RLS de `packages/db` **sí** corre en CI (`ci.yml:128`).
- Separación server/client: sin imports `node:*` en `apps/web/src`; uso consciente de Web
  Crypto isomórfico (`lib/totp.ts`, `lib/mfa-recovery.ts`, `server/account/tokens.ts`);
  `next.config.ts` excluye `web-push`/`bcryptjs`/`@prisma/client` del bundle cliente.
- Bootstrap del rol antes de migrate (fix del incidente) presente y coherente
  (`app-role-bootstrap.sql` + paso CI dedicado).

### Pendiente (no ejecutable aquí / requiere acción)
- **Ejecución real de la cadena de migraciones contra Postgres 16 limpio** (no se corrió:
  BD compartida con otros auditores). Recomendado: job CI que migre en BD efímera fresca
  SIN datos previos en cada PR (ya está, pero conviene un job de "migración en limpio" aislado).
- Confirmar A-01/A-04/A-07 con E2E real en navegador (push, offline, SW).
- Definir KMS EU para A-05 (mfa_secret) — decisión de infra/Angel.
- ADR y artefactos de deploy (A-02) — INC-3, responsable `leo-devops` + `marc-arquitecto`.

---

## Notas de método y honestidad sobre la incertidumbre
- No ejecuté migraciones/seed/build/tests por restricción del encargo (BD/árbol compartidos).
  Los hallazgos de "fresh DB" se basan en lectura, no en una corrida real: la confianza es
  alta para el patrón estático, pero **una corrida en limpio sigue siendo la prueba definitiva**.
- A-09 es un riesgo condicional (depende de la integridad del JWT/asignación de rol, que cae
  en el alcance de la auditoría de seguridad 01); lo señalo por completitud arquitectónica.
