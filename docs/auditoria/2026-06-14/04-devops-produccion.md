# Auditoría DevOps / SRE / Preparación de Producción
**Fecha:** 2026-06-14  
**Auditor:** leo-devops (adversarial, solo lectura)  
**Alcance:** CI/CD, deploy UE, observabilidad, backups/DR, gestión de secretos, arranque local

---

## Tabla de hallazgos

| ID | Área | Severidad | Fichero : línea | Descripción | Impacto | Recomendación |
|----|------|-----------|-----------------|-------------|---------|---------------|
| H-01 | Deploy UE | **CRÍTICO** | — | No existe ningún Dockerfile de producción, IaC (Terraform/Pulumi/Ansible), Helm chart ni runbook de deploy. Zero path to production. | El principio #1 ("alta de un centro en minutos") es imposible. Sin esto no hay producción. Bloqueante total. | Crear Dockerfile multi-stage Next.js + script de provisión OVHcloud. Bloqueado por Q-004 (credenciales Angel). |
| H-02 | Secretos prod | **CRÍTICO** | `.env` : 14-22 | El `.env` commiteado en el repo contiene `AUTH_SECRET="change-me-in-production..."` y `ANTHROPIC_API_KEY=""`. No hay vault ni gestor de secretos en producción. | Una rotación forzada (brecha, filtración de log) no tiene procedimiento. El `AUTH_SECRET` actual invalidaría todas las sesiones si se rota sin runbook. | Adoptar un gestor de secretos (OVHcloud Key Management Service o Vault open-source). Documentar rotación de `AUTH_SECRET`, `DATABASE_URL`, `VAPID_PRIVATE_KEY`. |
| H-03 | RGPD / Residencia UE | **CRÍTICO** | `project_state.yaml` : Q-004 | OVHcloud elegido (ADR-0011) pero sin credenciales, sin DPA firmado, sin región Postgres contratada. La inferencia (AI Endpoints) también sin contratar. | Operar con datos de salud (art. 9 RGPD) sin DPA con el proveedor UE es infracción legal. DPIA obligatoria sin cerrar. | Escalar a Angel para cerrar Q-004. No lanzar piloto con datos reales hasta DPA firmado. |
| H-04 | RLS en prod | **CRÍTICO** | `project_state.yaml` : Q-005 | No se sabe si el Postgres gestionado de OVHcloud permite `CREATE ROLE` desde el usuario base, o si el rol `vetlla_app` (NOSUPERUSER NOBYPASSRLS) debe aprovisionarse desde la consola del proveedor. | Si `vetlla_app` no existe en producción, la app cae al fallback `DATABASE_URL` (owner/superusuario). RLS no aplica. Aislamiento multitenant roto en producción. | Resolver Q-005 antes del primer deploy. Añadir comprobación de arranque: si `APP_DATABASE_URL` no está set en `NODE_ENV=production`, la app debe fallar al arrancar, no degradarse silenciosamente. |
| H-05 | CI: no hay deploy | **ALTO** | `.github/workflows/ci.yml` | El pipeline solo testea (lint + typecheck + build + test). No hay ningún job de deploy, publicación de imagen Docker, ni notificación de artefacto. No hay pipeline de release. | El CI es una red de seguridad pero no un pipeline de entrega. Producción requiere pasos manuales indefinidos. | Añadir job `deploy` (tras `build-test` verde en `main`) que publique imagen a un registry UE y dispare migración. Bloqueado por H-01. |
| H-06 | CI: paso psql frágil | **ALTO** | `.github/workflows/ci.yml` : 70-74 | El paso "Bootstrap app role" instala `psql` con `apt-get` si no está disponible. Esto añade latencia variable y una descarga de red no cacheada en cada run. Si el mirror de Ubuntu está caído, el job falla por infraestructura, no por código. | Pipeline frágil ante fallos de red externos. Viola "falla pronto y claro" por razón equivocada. | Usar la action `ubuntu-latest` que ya incluye `postgresql-client`. Verificar en un run real o usar image personalizada con el cliente incluido. Alternativa: script de bootstrap en contenedor Postgres directamente. |
| H-07 | CI: E2E Playwright ausente | **ALTO** | `.github/workflows/ci.yml` : 138-162 | Los tests Playwright (login, MAR offline, copiloto, portal familia) están comentados con un TODO. Los flujos críticos no tienen red de seguridad automatizada en CI. | Una regresión en el flujo de login o de medicación offline puede pasar CI verde durante días. El roadmap-produccion.md lo cataloga como brecha E3. | Añadir job `e2e` paralelo según el plan ya documentado en el comentario del CI (5 pasos). Prioridad: login + MAR + auditoría. |
| H-08 | CI: acción `pnpm/action-setup` sin pin de SHA | **MEDIO** | `.github/workflows/ci.yml` : 43 | La action `pnpm/action-setup@v4` referencia un tag mutable, no un SHA inmutable. Mismo patrón en `demo-screenshots.yml`. | Un attacker que comprometiera el repositorio de la action podría inyectar código malicioso en el pipeline de Vetlla sin cambiar el CI propio. | Fijar todas las actions a SHA: `pnpm/action-setup@SHA` + `actions/checkout@SHA` + `actions/setup-node@SHA`. |
| H-09 | CI: rama fijada en demo workflow | **MEDIO** | `.github/workflows/demo-screenshots.yml` : 50 | `ref: claude/vetlla-saas-mvp-spec-PuHOW` está hardcodeado en el checkout de `demo-screenshots.yml`. | El workflow de capturas siempre buildea de esa branch, no de la branch donde se lanza. Si la branch se renombra o se archiva, el workflow rompe silenciosamente. | Eliminar el `ref` para que checkout use la branch donde se dispara el `workflow_dispatch`. |
| H-10 | Observabilidad: sin correlation ID | **ALTO** | `apps/web/src/server/logger.ts` | El logger JSON no incluye un `request_id` ni `trace_id` por petición. Los logs de `trpc.error` y `trpc.slow` son útiles pero no correlacionables entre sí ni con los logs de infraestructura. | En un incidente es imposible reconstruir la cadena de eventos de una petición concreta entre los logs. | Inyectar un `x-request-id` en el middleware (`middleware.ts`) y propagarlo al contexto tRPC → logger. Coste mínimo, valor alto en on-call. |
| H-11 | Observabilidad: sin error tracking UE | **ALTO** | `apps/web/src/app/api/trpc/[trpc]/route.ts` | `onError` loguea a `console.error` (logger JSON). No hay integración con ningún sistema de error tracking (Sentry, GlitchTip, etc.). En producción los logs van a stdout del contenedor. Si no hay agregación, los errores se pierden. | Errores en producción invisibles salvo que alguien lea los logs activamente. Sin alertas. El roadmap los cataloga como F1/F2. | Integrar GlitchTip (auto-alojado UE, OSS, API compatible Sentry) o Sentry EU-region. No enviar PII al error tracker (el logger ya redacta; conectar el mismo mecanismo). |
| H-12 | Observabilidad: `/api/health` incompleto | **MEDIO** | `apps/web/src/app/api/health/route.ts` | El healthcheck solo verifica `SELECT 1` contra la BD. No verifica: (a) que la BD usada sea `APP_DATABASE_URL` (el rol de app con RLS), no el owner; (b) que el servicio de email esté configurado; (c) latencia de BD. | El proveedor puede considerar la instancia "healthy" aunque la BD use el rol incorrecto (RLS bypassed). Sin distinción entre liveness y readiness. | Ampliar a: (1) ping con `APP_DATABASE_URL` explícitamente, (2) verificación de variables críticas (`EMAIL_PROVIDER`, `AUTH_SECRET` != placeholder), (3) separar endpoints `/api/health/live` y `/api/health/ready`. |
| H-13 | Observabilidad: sin métricas | **MEDIO** | — | No hay exportación de métricas (Prometheus/OpenMetrics). No hay SLOs definidos ni dashboards. | Imposible saber si el sistema cumple SLA sin instrumentación. Detectar degradación lenta (p. ej. DB pool saturado) requiere análisis manual de logs. | Añadir métricas de golden signals (latencia, error rate, throughput) via `next-prom-client` o similar. Dashboards Grafana auto-alojado UE. |
| H-14 | Backups / DR | **CRÍTICO** | — | No existe ninguna estrategia de backup documentada ni testada. No hay política de PITR (Point-In-Time Recovery). No hay RTO/RPO definidos. No hay runbook de restore. | Pérdida de datos clínicos de residentes sin recuperación posible. Inaceptable para datos de salud art. 9 RGPD y para cualquier piloto real. | Con OVHcloud Postgres gestionado: habilitar backups automáticos diarios + PITR 7 días mínimo. Documentar y PROBAR restore en entorno staging antes del primer piloto. Definir RTO < 4h, RPO < 1h. |
| H-15 | Gestión de secretos: rotación | **ALTO** | `.env.example` | No hay procedimiento documentado de rotación para: `AUTH_SECRET` (rotar invalida todas las sesiones), `VAPID_PRIVATE_KEY` (rotar invalida todas las suscripciones push), `APP_DATABASE_URL` password, `EMAIL_API_KEY`. | Sin procedimiento, una brecha de secreto implica o dejar el secreto comprometido o causar una interrupción de servicio no planificada. | Documentar procedimiento de rotación cero-downtime para cada secreto crítico. Implementar doble-secreto para `AUTH_SECRET` (Next-Auth soporta múltiples secrets para rollover). |
| H-16 | Gestión de secretos: `.env` en git | **CRÍTICO** | `.env` (raíz del repo) | El fichero `.env` está commiteado en el repositorio (confirmado: existe y tiene contenido, incluyendo `ANTHROPIC_API_KEY=""`). Aunque el valor está vacío, el patrón establece que `.env` va a git. | Si alguien comete un `.env` con un secreto real por error, queda en el historial git para siempre. | Verificar que `.env` está en `.gitignore` y, si está trackeado, eliminarlo del historial (`git rm --cached .env`). Solo `.env.example` va a git. |
| H-17 | Arranque local: `app-role-bootstrap.sql` no en `dev-setup.sh` | **MEDIO** | `scripts/dev-setup.sh` : 121-127 | El script `dev-setup.sh` ejecuta migraciones y seed, pero NO ejecuta `app-role-bootstrap.sql` antes de `migrate:deploy` ni `app-role.sql` después. En un entorno local limpio, el rol `vetlla_app` no existiría y `APP_DATABASE_URL` apuntaría a un rol inexistente (o no se define). | Desarrollador nuevo con entorno limpio tendría RLS no enforced localmente. CI reproduce el problema correcto (ejecuta bootstrap), pero local no. Divergencia dev ↔ CI. | Añadir en `dev-setup.sh`: (1) `psql ... -f packages/db/prisma/sql/app-role-bootstrap.sql` antes de `migrate:deploy`, (2) `psql ... -f packages/db/prisma/sql/app-role.sql` después. Verificar idempotencia (ya lo son). |
| H-18 | Migraciones: sin estrategia expand/contract | **ALTO** | `packages/db/prisma/migrations/` | Hay 38 migraciones, varias de ellas rename de columnas implícito y adición de FKs. No hay runbook de "deploy zero-downtime" ni documentación de expand/contract. | Una migración que renombra una columna rompe la versión anterior de la app que sigue leyendo el nombre antiguo, causando downtime multitenant. | Documentar y adoptar la estrategia expand/contract: (1) añadir columna nueva, (2) código lee ambas, (3) migrar datos, (4) eliminar columna antigua en release posterior. Obligatorio antes del primer deploy real. |
| H-19 | CI: `ANTHROPIC_API_KEY` en `env.ts` sin validación de proveedor | **MEDIO** | `apps/web/src/env.ts` : 8 | `env.ts` valida `ANTHROPIC_API_KEY` como `optional().default('')`. Sin embargo, `AI_PROVIDER`, `AI_VLLM_BASE_URL`, `AI_VLLM_API_KEY`, `VAPID_*`, `EMAIL_API_URL`, `EMAIL_API_KEY` no se validan en `env.ts`. | La app puede arrancar en producción sin variables críticas configuradas y fallar tarde (en runtime, no en startup). Viola "fail fast". | Ampliar `env.ts` para validar las variables críticas de producción condicionalmente: si `AI_PROVIDER != stub`, exigir `AI_VLLM_BASE_URL`; si `EMAIL_PROVIDER == http`, exigir `EMAIL_API_URL`; si `NODE_ENV == production`, exigir `VAPID_*`. El email ya tiene guarda parcial, pero no en startup. |
| H-20 | CI: tests E2E de demo en workflow distinto | **BAJO** | `.github/workflows/demo-screenshots.yml` | El workflow de capturas de demo es `workflow_dispatch` (manual). Si se dispara, usa las mismas credenciales hardcodeadas en el YML (`vetlla_dev_password`, etc.). | Menor: las credenciales son de CI/dev, no de producción. Pero consolida el patrón de credenciales en código. | Mover las credenciales de CI a GitHub Secrets incluso para valores de dev (crea el hábito correcto). |

---

## Checklist de "lo que falta para producción" (priorizada)

### BLOQUEANTE ABSOLUTO — Sin esto no se puede abrir producción

- [ ] **P-01 RGPD/Legal**: Firmar DPA con OVHcloud (HDS). Sin esto, cualquier dato de salud en producción es infracción art. 9 RGPD. (Q-004, Angel)
- [ ] **P-02 Deploy**: Dockerfile multi-stage de producción para Next.js. Sin imagen no hay deploy. (H-01)
- [ ] **P-03 Deploy**: IaC mínimo para OVHcloud: Postgres gestionado + instancia app + DNS + TLS. Reproducible con un comando. (H-01, Q-004)
- [ ] **P-04 Secretos**: Vault o KMS para `AUTH_SECRET`, `DATABASE_URL` prod, `APP_DATABASE_URL`, `VAPID_PRIVATE_KEY`, `EMAIL_API_KEY`. Nunca en el repo, nunca en logs. (H-02)
- [ ] **P-05 RLS en prod**: Resolver Q-005: confirmar si OVHcloud Postgres gestionado permite `CREATE ROLE` o si el rol `vetlla_app` se aprovisiona desde consola. Añadir comprobación de arranque que falle si `APP_DATABASE_URL` no está configurado en producción. (H-04)
- [ ] **P-06 Backups**: Habilitar backups automáticos + PITR en Postgres OVHcloud. Documentar y EJECUTAR un restore de prueba antes del primer piloto. Definir RTO/RPO. (H-14)
- [ ] **P-07 `.env` en git**: Verificar `.gitignore` incluye `.env`. Si está trackeado, eliminar del historial. (H-16)

### NECESARIO ANTES DEL PRIMER PILOTO CON DATOS REALES

- [ ] **P-08 Pipeline CI→Deploy**: Job `deploy` en CI que publique imagen a registry UE y ejecute `migrate:deploy` en staging automáticamente tras `build-test` verde en `main`. (H-05)
- [ ] **P-09 Migraciones zero-downtime**: Documentar y adoptar política expand/contract. Auditar las 38 migraciones existentes en busca de destructivas. (H-18)
- [ ] **P-10 Rotación de secretos**: Runbook documentado de rotación cero-downtime para cada secreto crítico (`AUTH_SECRET` con doble-secret rollover, `VAPID_PRIVATE_KEY` con re-suscripción, passwords DB). (H-15)
- [ ] **P-11 Correlation ID**: Inyectar `x-request-id` en middleware y propagarlo al logger. Imprescindible para diagnosticar incidentes en producción. (H-10)
- [ ] **P-12 Error tracking UE**: Integrar GlitchTip (auto-alojado) o Sentry EU-region. Alertas sobre error rate y latencia. (H-11)
- [ ] **P-13 E2E en CI**: Activar el job Playwright con los flujos críticos: login, MAR offline, prescripción, auditoría, portal familia. Ya está el plan en el comentario del CI. (H-07)
- [ ] **P-14 `dev-setup.sh` completo**: Añadir `app-role-bootstrap.sql` y `app-role.sql` al script de arranque local. Eliminar divergencia dev ↔ CI. (H-17)
- [ ] **P-15 `env.ts` fail-fast**: Validar en startup las variables de producción críticas (`AI_VLLM_BASE_URL` si provider != stub, `EMAIL_API_URL` si provider = http, `VAPID_*` si se requiere push). (H-19)

### CALIDAD OPERATIVA (antes de GA, después del piloto)

- [ ] **P-16 Healthcheck completo**: Separar `/api/health/live` y `/api/health/ready`. Verificar `APP_DATABASE_URL` explícitamente, comprobar variables críticas en startup. (H-12)
- [ ] **P-17 Métricas y dashboards**: Golden signals (latencia p50/p99, error rate, throughput) exportados a Prometheus + Grafana auto-alojado UE. (H-13)
- [ ] **P-18 Pin de SHAs en CI actions**: Fijar `pnpm/action-setup`, `actions/checkout`, `actions/setup-node` a SHA inmutable. (H-08)
- [ ] **P-19 `psql` en CI sin `apt-get`**: Eliminar la instalación dinámica de `postgresql-client`. (H-06)
- [ ] **P-20 Branch hardcoded en demo workflow**: Eliminar `ref: claude/vetlla-saas-mvp-spec-PuHOW` del `demo-screenshots.yml`. (H-09)
- [ ] **P-21 On-call y runbooks de incidente**: Documentar runbook básico: ¿quién recibe la alerta? ¿cómo escalar? ¿cómo hacer un rollback de migración? ¿cómo conectar a la BD de producción en emergencia?

---

## Estado del CI (lectura estática)

El pipeline actual (`ci.yml`) tiene la secuencia correcta tras el fix de INC-1:
1. Bootstrap del rol `vetlla_app` **antes** de `migrate:deploy` (el error que lo tenía rojo días atrás).
2. Gate dedicado `[INC-1] RLS isolation gate` con `pnpm --filter @vetlla/db test` (visibilidad explícita).
3. `Unit tests (all packages)` en paso separado.

**Riesgos restantes en CI que podrían volver a ponerlo rojo:**
- Si una migración futura referencia un objeto que no existe (p. ej. una extensión Postgres no instalada en `postgres:16-alpine`), el paso `Apply migrations` romperá de nuevo de forma no obvia.
- El paso `apt-get install postgresql-client` puede fallar por razones de red (H-06); introduce no-determinismo.
- El `Build` de Next.js fallará si se añade una variable de entorno requerida sin actualizar el workflow `env:`. El patrón ya ocurrió con `AUTH_SECRET`; puede repetirse con `EMAIL_API_URL` u otras.

**Lo que NO está en CI y debería estarlo para que "verde" signifique algo en producción:**
- Tests Playwright E2E (H-07): los flujos críticos no tienen cobertura automatizada.
- Verificación de que las variables de producción críticas están documentadas en `.env.example` (drift silencioso).

---

## Resumen del estado de deploy UE

El ADR-0011 tiene el proveedor decidido (OVHcloud HDS, 2026-06-09). Lo que falta, en orden de dependencia:

```
Q-004 (Angel: credenciales + DPA) 
  → P-01 (DPA firmado)
  → P-02 + P-03 (Dockerfile + IaC)
  → P-04 (secretos en vault)
  → P-05 (resolver Q-005: rol vetlla_app en Postgres gestionado)
  → P-06 (backups habilitados)
  → P-08 (pipeline CI→deploy automático)
  → P-09 (migraciones expand/contract)
  → Primer deploy staging
  → P-06 (probar restore real)
  → Primer piloto con datos reales
```

Todo el bloque P-02 a P-09 está bloqueado en origen por Q-004 (credenciales OVHcloud, decisión y coste de Angel). Sin mover Q-004, el equipo no puede cerrar INC-3.
