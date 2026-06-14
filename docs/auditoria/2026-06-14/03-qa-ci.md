# Auditoría QA/CI — Vetlla (2026-06-14)
# Auditor: quim-qa | Rol: adversarial, solo lectura

---

## Resumen ejecutivo

La infraestructura de CI tiene una arquitectura sólida en su núcleo (gate RLS dinámico,
prueba estática de cobertura por tabla, tests de integración con Postgres real), pero
presenta tres categorías de hueco que, combinadas, dejan riesgos sin red de seguridad
antes de producción:

1. **Los 49 tests e2e NUNCA corren en CI.** El paso de Playwright está documentado en el
   yml como "PENDIENTE (INC-1)" sin ETA. Todos los flujos críticos cubiertos solo por e2e
   (copiloto, portal de familias, visitas, comunicaciones, MAR de punta a punta) son
   **zero-verified en pipeline**.

2. **Siete routers del Bloque A (MFA, Push, Valoraciones, Admisiones, Actividades,
   Diagnósticos, Inventario) no tienen tests de integración de router** — solo tests de
   lógica pura de `lib/*.ts`. Esto significa que el RBAC del endpoint, el filtrado de
   tenant via `ctx.db`, y la rechazo de roles no autorizados nunca se ejercitan en CI.

3. **22 de los 37 permisos declarados en `rbac.ts` no tienen ni un test** en
   `rbac.test.ts`. El RBAC de los módulos nuevos (billing, admissions, activities,
   inventory, shifts, etc.) se da por "funcional" sin prueba alguna.

El gate de aislamiento RLS dinámico (`rls.test.ts`, paso `[INC-1]`) **es correcto y
corre en CI** conectando como `vetlla_app` (NOSUPERUSER NOBYPASSRLS). Ese invariante
está protegido. El resto de la suite tiene huecos significativos.

---

## 1. Salud del gate de CI

### 1.1 Estructura del job

El único job (`build-test`) ejecuta en serie:
```
install → generate Prisma client → bootstrap app role → migrate:deploy →
create non-owner app role → lint → build → typecheck →
[INC-1] RLS gate (@vetlla/db test) → Unit tests (all packages)
```

No hay `continue-on-error` ni `|| true` en ningún paso. El `ON_ERROR_STOP=1` está en los
scripts psql. El job falla correctamente ante cualquier error de paso.

### 1.2 Gate RLS dinámico

Correcto. `rls.test.ts` usa `forTenant()` que internamente usa `prisma` de `client.ts`,
que conecta via `APP_DATABASE_URL` (vetlla_app, NOSUPERUSER NOBYPASSRLS) en CI. El test
`describe.skipIf(!hasDb)` activa porque `DATABASE_URL` está definida en el job env. Las
pruebas de WITH CHECK y fallo-en-cerrado corren contra Postgres real.

### 1.3 Cobertura del gate RLS estático (`rls-coverage.test.ts`)

La lista `expectedKnown` de 59 tablas incluye todas las tablas de las migraciones del
Bloque A (Jun 14). El test de inventario en la lista coincide con las migraciones. No se
detectan tablas huérfanas.

### 1.4 Mecanismo de bypass vía GUC (observación de seguridad)

El bypass de RLS se implementa como política SQL: `USING (current_setting('app.bypass_rls', TRUE) = 'on' OR ...)`.
Esto significa que **cualquier sesión de `vetlla_app` que ejecute `set_config('app.bypass_rls', 'on', TRUE)` puede ver todos los tenants**. El atributo de rol `NOBYPASSRLS` solo previene el bypass nativo de PostgreSQL, no el de esta política custom.

En el contexto actual (solo el código de la app fija el GUC, vetlla_app sin acceso directo externo), el riesgo es mitigado. Pero si vetlla_app se expone o si hay una inyección SQL, el bypass funcional es `set_config(...)` sin privilegios especiales. El modelo "NOBYPASSRLS" da una falsa sensación de protección fuerte.

### 1.5 e2e AUSENTE en CI

El paso de Playwright está marcado como `PENDIENTE` en el yml (líneas 138–162) con
instrucciones para habilitarlo pero **sin fecha ni criterio de cierre**. Los 49 tests
e2e se mencionan en `project_state.yaml` como "49 e2e parse" — lo que significa que el
código compila, no que se ejecuten.

Impacto: CI puede estar en verde mientras flujos críticos de UI están rotos (login MFA,
copiloto, portal de familias, visitas, etc.).

---

## 2. Cobertura real por dominio — routers del Bloque A

| Router | Lib test (puro) | DB integration test | Router/RBAC test | e2e spec |
|---|---|---|---|---|
| mfa.ts | totp.test.ts, mfa-recovery.test.ts | NINGUNO | NINGUNO | NINGUNO |
| push.ts | push/payload.test.ts | NINGUNO | NINGUNO | NINGUNO |
| valoraciones.ts | valoracion-alertas.test.ts | NINGUNO | NINGUNO | NINGUNO |
| facturacion.ts | facturacion.test.ts | facturacion.integration.test.ts | NINGUNO | NINGUNO |
| admisiones.ts | ocupacion-forecast.test.ts | NINGUNO | NINGUNO | NINGUNO |
| actividades.ts | actividades.test.ts | NINGUNO | NINGUNO | NINGUNO |
| indicadores.ts | indicadores-calidad.test.ts | indicadores-calidad.integration.test.ts | NINGUNO | NINGUNO |
| diagnosticos.ts | diagnosticos.test.ts | NINGUNO | NINGUNO | NINGUNO |
| inventario.ts | inventario.test.ts | NINGUNO | NINGUNO | NINGUNO |

**Routers más expuestos (sin tests de integración en BD ni e2e):**
- `mfa.ts`: el flujo completo TOTP (setup→confirm→disable→recovery) nunca se ejercita contra BD.
- `admisiones.ts`: la transacción que crea un `Resident` al admitir (`ADMITTED`) no tiene cobertura.
- `actividades.ts`: la carrera de aforo (Serializable) y la lista de espera no se prueban contra BD.
- `push.ts`: ningún test de ningún tipo verifica que `subscribe/unsubscribe/listMine` funcionen.
- `diagnosticos.ts`: la transición de estado (`ACTIVO→CRONICO→RESUELTO`) nunca se testa en BD.
- `inventario.ts`: la reducción de stock (`validateOutbound`) nunca toca Postgres en tests.

---

## 3. RBAC: permisos sin cobertura de test

De 37 permisos declarados en `apps/web/src/lib/rbac.ts`, `rbac.test.ts` solo prueba 15.
Los 22 permisos sin ningún test son:

```
activities:manage, activities:read, admissions:manage, admissions:read,
billing:manage, billing:read, careplan:read, comms:broadcast, comms:read,
conflicts:review, dsar:manage, inventory:manage, inventory:read,
medication:read, quality:read, requests:create, requests:manage,
residents:write, shifts:manage, shifts:read, visits:manage, visits:request
```

Lo que falta no es solo que `hasPermission()` sea correcto para estos permisos, sino que:
- El router rechace con FORBIDDEN cuando el rol no tiene el permiso.
- Un FAMILIAR no acceda a endpoints de billing, shifts, admissions, inventario.
- Un AUXILIAR no pueda gestionar admisiones ni inventario (solo leer).

Ninguno de estos casos está cubierto en ninguna capa de test (ni unit, ni integración, ni e2e activo en CI).

---

## 4. e2e: 49 tests que no corren

### 4.1 Tests existentes vs flujos críticos del MVP

| Spec file | Flujo cubierto | Corre en CI |
|---|---|---|
| smoke.spec.ts | Pantalla de login visible | NO |
| copiloto.spec.ts | Frase→CareRecord (StubProvider) | NO |
| copiloto-pia.spec.ts | Borrador PIA (StubProvider) | NO |
| medicacion-mar.spec.ts | MAR: alergias, estados, prescribir/no | NO |
| prescripcion.spec.ts | Prescripción con alergia bloqueante | NO |
| equipo-rbac.spec.ts | RBAC equipo: filtro roles, acceso denegado | NO |
| auditoria.spec.ts | AuditLog dirección vs familiar | NO |
| resumen-360.spec.ts | Vista 360 residente | NO |
| expediente-fase1.spec.ts | Expediente clínico avanzado | NO |
| visitas.spec.ts | Portal familiar visitas (VIS-FAM1/FAM2) | NO |
| comunicaciones.spec.ts | Comunicados+mensajería familiar | NO |
| solicitudes.spec.ts | ServiceRequest familiar | NO |

### 4.2 Flujos críticos del MVP SIN e2e

Los siguientes flujos no tienen ningún spec e2e ni ningún test de router:

- **Login con MFA activo** (dos pasos): no existe ningún spec. `mfa.test.ts` solo prueba la lógica criptográfica, no el flujo de login.
- **Alta de centro desde /registro (self-service onboarding)**: el router `signup.ts` no tiene test de ningún tipo.
- **Atención offline: ciclo completo tablet→sin red→sincronización**: cubierto por `care-sync.integration.test.ts` a nivel de función, pero sin e2e de navegador.
- **Administración de dosis desde el MAR y resolución de alerta**: `mar.test.ts` prueba lógica pura, pero el flujo de UI+router no se ejercita en CI.
- **Portal familiar mínimo (solo lectura de su residente)**: el aislamiento `family.portal` tiene cobertura en `family-links` de DB pero no hay e2e activo.

### 4.3 Test frágil detectado: VIS-CHK-NEG

`apps/web/e2e/visitas.spec.ts`, test `VIS-CHK-NEG` (línea 137) aserta un error toast
usando el locator `page.getByText(/error|no encontrad|no correspond|no válid|no es de hoy/i)`.
Este selector de texto libre es frágil: si el mensaje de error cambia, el test pasa igual
(el `first()` sobre `.or()` podría resolver en el elemento `[role="alert"]` vacío). Además,
la nota en `project_state.yaml` reconoce que "check-in positivo no tiene e2e" — el flujo
de éxito de check-in nunca se verifica.

### 4.4 `loginAs()` no maneja el paso MFA

`apps/web/e2e/helpers/auth.ts` (línea 35) hace login directo por credenciales y espera
salir de `/login`. Si los usuarios demo del seed tuvieran MFA activo, todos los tests e2e
fallarían. Como el seed no activa MFA por defecto, los tests funcionan, pero esto significa
que **el flujo de login con MFA nunca se testea en e2e**.

---

## 5. Tests frágiles / falsos positivos

### 5.1 `skipIf(!hasDb)` depende de `DATABASE_URL`, no de `APP_DATABASE_URL`

Todos los integration tests usan `const hasDb = Boolean(process.env.DATABASE_URL)` para
decidir si ejecutar. Sin embargo, la conexión real se hace via `APP_DATABASE_URL` (si está
definida). Si en algún entorno solo está `APP_DATABASE_URL` pero no `DATABASE_URL`, los
tests de integración se saltarían silenciosamente sin aviso, reportando "0 tests ejecutados"
como si todo fuera verde. En CI actual esto no ocurre porque ambas están definidas.

### 5.2 `rbac.test.ts` no cubre roles nuevos contra permisos nuevos

`rbac.test.ts` nunca prueba roles como FAMILIAR o AUXILIAR contra los nuevos permisos
(billing, admissions, activities, inventory, shifts). El test `hasPermission('AUXILIAR', 'users:read')` 
pasa, pero un error en la matriz RBAC de `activities:manage` para AUXILIAR no sería detectado.

### 5.3 `mar.test.ts` — assert de alerta con datos controlados

Los tests de `lib/mar.test.ts` usan fechas fijas (no `Date.now()`) para probar alertas de
no-administrado. Esto es correcto y no frágil. Sin embargo, el test no verifica que el
router `medications.alertsToday` retorne las alertas correctas desde BD, solo la lógica pura.

### 5.4 `indicadores-calidad.integration.test.ts` aserta conteos, no identidades

El test de RLS verifica que "tenant B no ve datos de tenant A" comprobando que `count=0`
para queries de tenant B. Es suficiente para probar el aislamiento, pero si hubiera un
leak parcial (una fila en vez de ninguna), el test seguiría pasando si el conteo esperado
no es 0 en algún caso edge.

---

## 6. Criterios de aceptación del MVP — estado real

| Criterio (project_state.yaml §acceptance_criteria) | Nivel de cobertura | Corre en CI |
|---|---|---|
| Alta de centro/residente | DB integration (rls.test.ts indirect) + e2e smoke (no ejecutado) | PARCIAL |
| Atención offline sin duplicados | care-sync.integration.test.ts (DB) | SI |
| Alertas medicación (no-administrado) | mar.test.ts (lógica pura) — router NO probado | PARCIAL |
| Copiloto frase→registro + PIA | copiloto.spec.ts / copiloto-pia.spec.ts (e2e no activo) | NO |
| Portal familiar solo lectura | family.integration tests + visitas/comunicaciones.spec.ts (no activo) | PARCIAL |
| Aislamiento RLS entre tenants | rls.test.ts + rls-coverage.test.ts + 17 integration tests | SI (VERDE) |
| AuditLog de toda acción | audit.integration.test.ts | SI |

---

## 7. Tabla de hallazgos — priorizada

| ID | Severidad | Descripción | Fichero(s) | Impacto | Recomendación |
|---|---|---|---|---|---|
| H-01 | CRITICO | 49 tests e2e no corren en CI. El gate "e2e parse" no ejecuta ninguno. Flujos críticos de copiloto, portal familiar, MFA, MAR y visitas no tienen verificación en pipeline. | `.github/workflows/ci.yml` líneas 138-162 | Regresiones en UI y flujos críticos pasan desapercibidas | Habilitar job e2e en CI (instrucciones ya en el yml). Responsable: leo-devops. ETA: antes de piloto real. |
| H-02 | CRITICO | Router `mfa.ts` (setup/confirm/disable/recovery) sin ningún test de integración ni e2e. MFA es un control de seguridad (RNF-SEG-002); su flujo completo nunca se verifica contra BD. | `apps/web/src/server/routers/mfa.ts`, ausencia de `packages/db/test/mfa.integration.test.ts` | Posible regresión en MFA sin detección: usuario atrapado, bypass de 2FA o fallo silencioso al activar/desactivar. | Añadir test de integración con BD: setup→confirm→status→disable con TOTP + con recovery code. |
| H-03 | CRITICO | 22 de 37 permisos de RBAC sin ningún test. Los módulos del Bloque A (billing, admissions, activities, inventory, shifts, requests, visits) no tienen prueba de que el router rechace roles no autorizados. | `apps/web/src/lib/rbac.test.ts` | Un error en la matriz de permisos para roles nuevos (FAMILIAR en billing, AUXILIAR en admissions) no se detectaría hasta producción. | Ampliar `rbac.test.ts` con todos los permisos del Bloque A. Añadir al menos un test de rechazo (FORBIDDEN) por router. |
| H-04 | ALTO | Router `admisiones.ts`: transacción `ADMITTED` (crea Resident + AuditLog) no tiene test de integración. La lógica de "reingreso" (residentId ya existe) tampoco está cubierta. | `apps/web/src/server/routers/admisiones.ts`, ausencia de `packages/db/test/admisiones.integration.test.ts` | Un fallo en la transacción podría crear un Resident huérfano o no liberar la plaza. | Test de integración que pruebe: LEAD→ADMITTED (crea Resident), re-ingreso (no duplica), RLS entre tenants. |
| H-05 | ALTO | Router `actividades.ts`: la serializable transaction de aforo (carrera) no se prueba en BD. La lógica de lista de espera (`primeroEnEspera`) solo tiene test puro. | `apps/web/src/server/routers/actividades.ts`, `apps/web/src/lib/actividades.test.ts` | Duplicados de inscripción en alta concurrencia no detectados hasta producción. | Test de integración: inscripción simultánea con aforo=1 (dos transacciones concurrentes). |
| H-06 | ALTO | Flujo de login con MFA no cubierto por ningún e2e. `loginAs()` en helpers de e2e no contempla el paso TOTP. Si el seed activara MFA, todos los e2e fallarían de forma opaca. | `apps/web/e2e/helpers/auth.ts` líneas 35-38 | El flujo de login MFA no se verifica nunca de extremo a extremo. | Añadir spec `mfa-login.spec.ts`. Actualizar `loginAs()` para aceptar parámetro TOTP opcional. |
| H-07 | ALTO | Router `signup.ts` (self-service onboarding: registra tenant+centro+director en transacción) sin ningún test. Es un criterio de aceptación del MVP. | `apps/web/src/server/routers/signup.ts`, ausencia de tests | Un error en la creación del primer tenant podría dejar la transacción parcialmente aplicada sin detección. | Test de integración en BD + al menos un e2e de `/registro`. |
| H-08 | MEDIO | `skipIf(!hasDb)` comprueba `DATABASE_URL` pero el cliente conecta por `APP_DATABASE_URL`. En entornos donde solo existe `APP_DATABASE_URL`, todos los tests de integración se saltarían silenciosamente. | `packages/db/test/rls.test.ts` línea 6, mismo patrón en todos los integration tests | Falso negativo posible: CI reporta verde sin haber ejecutado RLS. | Usar `Boolean(process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL)` como guard. |
| H-09 | MEDIO | `rbac.test.ts` no incluye ningún test para: billing, admissions, activities, inventory, shifts, requests, visits, comms, dsar, quality, conflicts, careplan:read, medication:read. | `apps/web/src/lib/rbac.test.ts` | Errores silenciosos en la matriz de permisos de módulos del Bloque A. | Añadir casos por permiso nuevo: al menos FAMILIAR y AUXILIAR contra los permisos que NO deben tener. |
| H-10 | MEDIO | Test `VIS-CHK-NEG` usa selector de texto libre (`/error\|no encontrad.../i`) sobre `.or()` que puede resolver en elemento vacío. El check-in positivo no tiene ningún e2e. | `apps/web/e2e/visitas.spec.ts` líneas 148-155 | Test que pasa sin verificar el comportamiento real. | Usar `data-testid="toast-error"` explícito. Añadir `VIS-CHK-POS` con visita de hoy. |
| H-11 | MEDIO | Router `push.ts` (subscribe/unsubscribe/listMine) sin ningún test de integración ni e2e. Las notificaciones push son el canal de alerta de la app. | `apps/web/src/server/routers/push.ts` | Regresión silenciosa en el canal push no detectada. | Test de integración en BD: subscribe→listMine→unsubscribe. RLS test ya en rls.test.ts (PushSubscription). |
| H-12 | BAJO | `rls.test.ts` usa `asPlatformAdmin()` (bypass GUC) para el setup, pero el bypass en producción es `set_config('app.bypass_rls','on',TRUE)` accesible por cualquier código que ejecute SQL como `vetlla_app`. El `NOBYPASSRLS` no previene este bypass custom. | `packages/db/src/rls.ts`, migrations `20260607010000_rls_tenant_isolation/migration.sql` | Si hubiera inyección SQL via `vetlla_app`, el GUC bypass es trivial de activar. | Documentar el riesgo. Considerar restringir `set_config` a funciones específicas o usar `current_user` en la política. Escalar a marc-arquitecto. |

---

## 8. Qué falta probar antes de producción (lista priorizada)

1. **E2E en CI**: habilitar el job de Playwright con Chromium (instrucciones ya en ci.yml). Sin esto, ninguno de los criterios de UI del MVP está verificado en pipeline.

2. **Test de integración MFA**: flujo completo setup→confirm→disable→recovery-code contra BD. Es un control de seguridad (art. 9 RGPD) sin ninguna cobertura de integración.

3. **Test de integración admisiones**: la transacción LEAD→ADMITTED que crea el Resident. Criterio de aceptación "alta de residente".

4. **RBAC de routers Bloque A**: al menos un test que verifique que FAMILIAR y AUXILIAR reciben FORBIDDEN en billing, admissions, shifts e inventario.

5. **Test de integración actividades (aforo concurrente)**: la serializable transaction es el mecanismo anti-duplicado; no hay cobertura.

6. **Test e2e de login con MFA**: actualizar `loginAs()` y añadir spec dedicado.

7. **Test de integración signup**: la transacción de onboarding (tenant+centro+director) sin cobertura alguna.

8. **Guardia `hasDb` corregida**: usar `APP_DATABASE_URL ?? DATABASE_URL` para que el guard sea consistente con el cliente.

---

## Riesgos residuales declarados (no cubribles aquí)

- Los 49 e2e solo se pueden verificar con Chromium real en CI. En este entorno, sin navegador, NO están verdes aunque el código compile.
- La corrección semántica de las políticas RLS de las migraciones del Bloque A (si las nuevas tablas quedan aisladas bajo `vetlla_app`) solo es verificable con Postgres. Los tests de `rls.test.ts` solo prueban un subconjunto de tablas explícitamente; la mayor parte de las tablas nuevas solo tienen verificación estructural (rls-coverage.test.ts, estático).

**Escalado a cio-vetlla**: el gate e2e en CI (H-01) es el riesgo de mayor radio de daño. Con el Bloque A construido y el piloto a la vista, operar sin e2e en pipeline significa que cualquier regresión de UI pasa invisible. Se recomienda tratarlo como P0 antes de dar acceso a datos reales.
