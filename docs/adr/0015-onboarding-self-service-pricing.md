# ADR 0015 — Onboarding self-service y pricing por plaza/módulo

- **Estado:** Aceptada
- **Fecha:** 2026-06-11
- **Hito:** Iteración MVP → producto vendible (post-INC-1)

## Contexto

El principio #1 del producto ("cloud-native: alta de un centro en minutos") y el
criterio de aceptación nº 1 del MVP ("operador se da de alta…") no tenían
implementación: el único tenant se creaba por seed. Además, el spec exigía
"soporte en el modelo de datos para pricing por plaza/módulo" y no existía
ningún modelo de plan. Sin ambas cosas no hay producto vendible: ni un canal de
entrada para clientes nuevos ni una base sobre la que facturar.

## Decisión

### Onboarding self-service (`/registro` + `signup.register`)

- **Endpoint tRPC público** (`publicProcedure`) que crea en una transacción:
  Tenant (plan `TRIAL`, `trialEndsAt = +30 días`) + usuario `DIRECTOR` +
  primer `Center`. Usa `asPlatformAdmin` (bypass RLS por GUC) porque el tenant
  aún no existe; su superficie está acotada: **solo crea, nunca lee**.
- Slug único derivado del nombre (sufijo aleatorio si colisiona); email único
  global (es la clave de login); contraseña con bcrypt (mismo coste que el
  resto del sistema); consentimiento explícito (RGPD) como `z.literal(true)`.
- Alta auditada (`SIGNUP` en AuditLog del nuevo tenant).
- Tras registrar: redirección a `/login?registered=1` (sin autologin: menos
  superficie en el endpoint público).

### Pricing por plaza/módulo

- **El dato persistido es mínimo**: `Tenant.plan` (`TRIAL | ESENCIAL |
  PROFESIONAL`) y `Tenant.trialEndsAt`. El **catálogo** (precio por plaza
  ocupada/mes, módulos por tier, días de prueba) vive **en código**
  (`apps/web/src/lib/plans.ts`) para iterarlo sin migración.
- Unidad de facturación: **plaza ocupada** (residente `ACTIVO` con cama
  asignada), no plaza instalada — alinea el coste con el valor que recibe el
  centro y con el benchmark del sector (GdR: 2 €/residente/mes, único precio
  público conocido).
- Cifras iniciales (hipótesis a validar con pilotos, Q-002): ESENCIAL
  3 €/plaza/mes; PROFESIONAL 5 €/plaza/mes (incluye copiloto IA y portal de
  familias). TRIAL = producto completo 30 días.
- Tenants existentes migran a `PROFESIONAL` (no se degrada funcionalidad a
  clientes previos al pricing).
- UI: página `/plan` (Dirección) con consumo y coste estimado; banner global
  de TRIAL con días restantes. **No hay pasarela de pago** en este alcance:
  el cambio de plan es por contacto (facturación completa está fuera del MVP
  por roadmap).

## Consecuencias

- A favor: canal de entrada self-service real (demo → prueba → cliente sin
  tocar operaciones); el modelo de datos de pricing queda listo para conectar
  facturación (Stripe u otro) sin re-modelar.
- En contra / riesgos: el endpoint público de registro es superficie de abuso
  (mitigado: validación estricta, unicidad, sin lectura; **pendiente**:
  rate-limiting/captcha en INC-3 cuando haya edge/CDN del proveedor).
  El enforcement de fin de trial es informativo (banner), no bloqueante —
  decisión pendiente de negocio sobre qué hacer al caducar (avisar vs bloquear).

## Verificación

Runtime real (next start + Postgres con RLS): registro público → tenant TRIAL
con director, centro y AuditLog `SIGNUP` → login del director con sesión y
tenant correctos. 5 tests unitarios del catálogo/cálculo (`plans.test.ts`).
