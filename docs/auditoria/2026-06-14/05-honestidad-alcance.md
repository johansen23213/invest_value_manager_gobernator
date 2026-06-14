# Auditoría de Honestidad de Alcance — Vetlla
**Fecha:** 2026-06-14  
**Auditor:** Pau (PM)  
**Metodología:** Solo lectura de código; sin ejecutar build, tests ni servidor. Se usa `project_state.yaml` como lista de afirmaciones a verificar y se contrasta con el código fuente real.

---

## 1. Tabla "Afirmado vs Real"

| # | Área | Afirmado en project_state | Realidad en el código | Brecha | Severidad |
|---|------|--------------------------|----------------------|--------|-----------|
| 1 | IA Copiloto — proveedores reales | "2 features estrella" funcionan (H5 in_progress con Slices 1-3 completos) | `bedrock.ts:28–30` y `vertex.ts:27–30`: ambos `complete()` lanzan `NotImplementedError` siempre. Solo `VllmProvider` es funcional pero requiere `AI_VLLM_BASE_URL` no configurado. `.env.example:63`: `AI_PROVIDER="stub"` es el default. | En entorno sin Ollama local explícitamente configurado, el copiloto usa SIEMPRE el StubProvider. Bedrock y Vertex son esqueletos que lanzan excepción. | ALTA |
| 2 | IA Copiloto — benchmark es/ca cerrado | project_state linea 812: "PENDIENTE DE VALIDAR: re-probar con modelo real". H5 marcado `in_progress` pero no cerrado | El propio project_state reconoce la validación como pendiente. El arreglo de prompts v2 existe (`careRecordExtraction.v2`, `carePlanDraft.v2`) pero nunca se ha probado con un modelo real en CI. | H5 lleva desde 2026-06-10 con la validación de prompts v2 pendiente. El "hito activo" lleva bloqueado sin cierre confirmado. | MEDIA |
| 3 | Push notifications — SW no recibe push | BA-2 marcado `done` ("SW + toggle"). project_state línea 291: "Cliente: service worker (push + notificationclick)". | `apps/web/public/sw.js` solo tiene `install`, `activate`, `fetch`. No existe ningún `addEventListener('push', ...)` ni `addEventListener('notificationclick', ...)`. El backend envía; el SW nunca entrega al usuario. | Las notificaciones push son completamente no-operativas de extremo a extremo aunque el backend esté configurado con VAPID. La afirmación "SW + toggle" es parcialmente falsa en la parte que importa (recepción). | CRITICA |
| 4 | Push notifications — VAPID sin claves | BA-2 marcado `done`. Variables en `.env.example`. | `apps/web/src/server/push/index.ts:90–93`: si faltan `VAPID_*`, la función hace no-op con warning. `.env.example:57–59`: las tres variables están comentadas. En ningún entorno configurado por defecto (dev, CI) hay claves VAPID. | Con SW inoperativo (punto 3) y claves VAPID no configuradas por defecto, las notificaciones push son doblemente no-operativas. La feature no puede probarse en ningún entorno estándar. | CRITICA |
| 5 | Email — prod sin proveedor cableado | AUTH-1 marcado `done`. "Email transaccional UE provider-agnóstico". | `.env.example:40`: `EMAIL_PROVIDER="http"` pero `EMAIL_API_URL` y `EMAIL_API_KEY` están comentadas sin valor. En producción, con `EMAIL_PROVIDER=http` y sin URL/KEY, la app lanza excepción (`index.ts:90–95`). En dev sin config explícita usa console (ok). | El `.env.example` establece `http` como default para producción pero no hay proveedor UE real configurado. Reset de contraseña e invitaciones no funcionarán hasta que Angel contrate el servicio (Scaleway TEM u OVHcloud). Técnicamente correcto (falla rápido), pero es una brecha operativa bloqueante para el primer piloto. | ALTA |
| 6 | Facturación — cobro digital | BA-4 marcado `done`. "Facturación básica (tarifas, copagos, facturas, ciclo)". | `facturacion.ts:36–38`: "Cobro digital / pasarela de pago → TODO Q-007. Remesas SEPA XML reales → TODO Q-007. Verifactu → TODO Q-012." El campo `sepaMandate` almacena solo la referencia textual, no genera remesas. No hay integración de pago real. | El módulo de facturación es un gestor de facturas en papel digital (DRAFT/ISSUED/PAID manual). No puede cobrar digitalmente a nadie. Se declara "done" sin aclarar que el cobro digital (la parte que genera valor) está completamente bloqueado. | ALTA |
| 7 | MFA — secreto TOTP en texto plano | BA-1 marcado `done`. "MFA TOTP + bloqueo de login". | `mfa.ts:18–20`: "El secreto TOTP se guarda en texto en la BD (mfa_secret). TODO Q-SEC: cifrar en reposo cuando se integre KMS EU-soberano." | La feature es funcional pero el secreto TOTP está sin cifrar en BD. Para datos de salud (art. 9 RGPD) con MFA como control de seguridad, el secreto en texto plano representa un riesgo de seguridad reconocido y no documentado en project_state como open_question. | MEDIA |
| 8 | i18n — pantallas de gestión nuevas | H6 y INC-8 marcados `done`. "i18n es/ca completos". Notes de H6: "Pantallas de gestión quedan en castellano (i18n extensible)." | Las pantallas de Épicas A-D y Bloque A (clínica, nutrición, turnos, admisiones, actividades, calidad, diagnósticos, inventario, facturación) tienen claves i18n definidas en `dictionaries.ts`. El catálogo es extenso (4000+ líneas). Sin embargo, la nota de H6 reconoce explícitamente que las pantallas de gestión "quedan en castellano". El inventario (`/inventario`) ni siquiera aparece en el nav de `layout.tsx`. | La cobertura i18n es real para los flujos del MVP original (login, shell, portal, medicación). Las pantallas de las Épicas A-D tienen claves definidas pero no hay evidencia de que el texto en castellano esté eliminado de los componentes TSX — solo hay claves en el diccionario. El inventario no tiene enlace de navegación. | BAJA-MEDIA |
| 9 | E2E en CI | INC-1 y checkpoints declaran "49 e2e totales". project_state línea 1107: `estado: NO_EN_CI`. | `playwright.config.ts`: `reuseExistingServer: !process.env.CI`. Los e2e están escritos y son 49 ficheros funcionales, pero `project_state` línea 1107 lo marca explícitamente `NO_EN_CI` (requiere playwright install + seed + next start que no están en CI). Los e2e del copiloto usan `StubProvider` determinista — no prueban IA real. | Los e2e existen pero no corren en CI de forma automática. El checkpoint "49 e2e" es verdadero en ejecución local pero el CI no los ejecuta en cada push. Esto está documentado en project_state (no es ocultación) pero la declaración de checkpoint "cerrado" con e2e verdes es engañosa si CI no los ejecuta. | MEDIA |
| 10 | Docs/foto residente | project_state menciona "Foto del residente sigue diferida (Q-004)". Schema tiene `IMAGEN` como tipo. | No existe ningún router de upload, ningún modelo Document con blob, ningún endpoint de object storage. Esto es coherente con la declaración de bloqueo por Q-004. | Brecha documentada, no ocultada. Pero la afirmación "expediente completo" en algunos sitios debe matizarse: sin fotos ni documentos binarios, el expediente está incompleto. | BAJA (documentada) |
| 11 | Copiloto — declarado como "diferencial de IA" en plan.ts | `dictionaries.ts:112`: `'plan.module.copiloto': 'Copiloto de IA'` aparece en la página de plan del tenant TRIAL. La app vende el copiloto como módulo incluido. | El copiloto funciona solo con StubProvider en todos los entornos configurados por defecto. Un tenant real en TRIAL no puede usar IA real porque falta proveedor, falta validación es/ca, y falta deploy UE (Q-004). | Se muestra "Copiloto de IA" como módulo incluido en el plan pero la funcionalidad de IA real no está disponible sin configuración manual que requiere decisiones de Angel (Q-004). | ALTA |
| 12 | Deploy UE | INC-3 aparece en sprints pero como `pendiente_bloqueado`. Criterio de aceptación del MVP: "Datos alojados en la UE [HECHO — ver docs/adr/0007]". | ADR-0007 cubre la decisión de diseño y el AuditLog. No hay deploy en producción UE (bloqueado por Q-004). La app solo corre en local con Postgres local. | La afirmación "HECHO" en el criterio de aceptación del MVP se refiere al diseño y al AuditLog, no al despliegue real. Un centro no puede usar Vetlla hoy. | ALTA (bloqueante de operación) |

---

## 2. Análisis por área crítica

### 2.1 IA / Copiloto

**Lo que funciona de verdad:** La arquitectura provider-agnóstica (`packages/ai/src/provider.ts`) es real y bien diseñada. El `StubProvider` es determinista y testeable. Los routers `copilot.ts` (draftCareRecord, confirmCareRecord, draftCarePlan, confirmCarePlan) están implementados con RLS, RBAC y AuditLog correctos. Los prompts v2 existen.

**Lo que NO funciona:** Bedrock (`bedrock.ts:28–30`) y Vertex (`vertex.ts:27–30`) lanzan `NotImplementedError` explícita. `VllmProvider` es funcional pero requiere configuración manual (Ollama local o OVHcloud). El `.env.example` tiene `AI_PROVIDER="stub"` como default. Los e2e del copiloto prueban el StubProvider, no un modelo real. El benchmark es/ca que cierra H5 lleva pendiente desde 2026-06-10.

**Veredicto:** El copiloto es una demo funcional con datos deterministas. No es "IA" en ningún entorno configurado por defecto. La afirmación de "2 features estrella" es verdadera para el flujo UX; falsa para la inteligencia que la sustenta.

### 2.2 Push Notifications

**El problema más grave de la auditoría.** El SW en `apps/web/public/sw.js` (líneas 8, 12, 16) solo maneja `install`, `activate` y `fetch`. No existe ningún handler `push` ni `notificationclick`. El comentario en `push.ts:37` ("El service worker escucha el evento `push`") apunta a `apps/web/src/server/push/payload.ts` para "la forma exacta del objeto", pero el SW nunca llega a recibirlo. El backend puede enviar notificaciones VAPID a los push services, pero el navegador del usuario nunca las mostrará porque el SW no las procesa. BA-2 se marcó `done` con "SW + toggle" pero el toggle (suscripción/gestión) funciona y el backend envía, pero la recepción está rota.

### 2.3 Email

Funciona correctamente en dev (ConsoleEmailProvider). En producción requiere `EMAIL_API_URL` y `EMAIL_API_KEY` configuradas — si no, falla rápido y visiblemente. La guardia está bien implementada (`index.ts:34–39`). La brecha es operativa, no de código: sin contratar un proveedor de email transaccional UE, el primer piloto con usuarios reales no puede enviar resets de contraseña ni invitaciones.

### 2.4 Facturación

El módulo es real y correcto para lo que hace: gestionar tarifas, perfiles de facturación e invoices con numeración correlativa race-safe. El modelo de datos es sólido. La brecha es que se presenta como "Facturación básica (done)" sin dejar claro que el cobro digital (pasarela Q-007), la domiciliación SEPA y Verifactu están completamente fuera. Para un centro que necesite cobrar, el módulo actual es una hoja Excel mejorada.

### 2.5 i18n

La nota de H6 ya reconoce la limitación: "Pantallas de gestión quedan en castellano." El catálogo de claves en `dictionaries.ts` es extenso y cubre es y ca para la mayoría de los módulos. La brecha real es que no se puede verificar (sin ejecutar la app) si los TSX de las pantallas nuevas usan `t('clave')` o tienen strings hardcodeados. El inventario no tiene enlace de navegación en el layout principal, aunque su router y su page.tsx existen.

### 2.6 Deploy / Producción

Ningún centro puede usar Vetlla hoy. El producto no tiene ningún entorno de producción activo. La afirmación del criterio de aceptación del MVP "Datos alojados en la UE [HECHO — ver docs/adr/0007]" referencia una decisión de diseño, no una realidad operativa. Esto está implícitamente reconocido en el project_state (Q-004 abierta) pero no se comunica con la misma claridad en los hitos cerrados.

### 2.7 MFA — secreto TOTP en texto plano

El secreto TOTP se guarda en `mfa_secret` sin cifrar en la BD. El código lo reconoce con `TODO Q-SEC` pero no hay open_question en project_state para este riesgo. Para datos de salud art. 9 RGPD, este es un riesgo de seguridad que debe escalarse a Angel antes del primer piloto con datos reales.

---

## 3. Lo que SÍ está bien implementado (para no distorsionar)

- **RLS multitenant**: real, verificado con `vetlla_app` no-superusuario, test meta estático (56 tests). El aislamiento es genuino.
- **AuditLog**: inmutable (trigger BEFORE UPDATE), RLS, cobertura correcta.
- **DSAR art.15/17**: mecanismo real con `exportResidentData` y `anonymizeResident`, aunque la política de retención (Q-003) queda abierta.
- **Onboarding self-service**: flujo completo y verificado en runtime.
- **Care offline + sync**: LWW por campo, IndexedDB, cola outbox — implementación real y testeada.
- **MAR + prescripción**: completo, con offline, con RLS.
- **Épicas A-D (clínica, nutrición, turnos, exitus/social/ACP)**: routers y UI completos y testeados.
- **SuperApp (solicitudes, comunicados, mensajería, visitas)**: completos backend+UI.
- **Observabilidad capa app**: logger JSON sin PII, /api/health real.
- **MFA TOTP + bloqueo de login**: funcional (salvo cifrado del secreto).

---

## 4. Resumen de hallazgos por severidad

| Severidad | Nº | Hallazgo |
|-----------|-----|----------|
| CRITICA | 2 | SW de push no tiene handler `push`/`notificationclick` (BA-2 marcado done pero inoperativo); VAPID sin claves por defecto (doble bloqueo) |
| ALTA | 4 | Copiloto usa StubProvider en todos los entornos estándar (diferencial de IA no activo); copiloto vendido como módulo incluido sin poder activarse; email transaccional sin proveedor real contratado; deploy UE inexistente (nadie puede usar el producto) |
| MEDIA | 3 | H5 con validación es/ca pendiente desde 2026-06-10 (hito no cerrado honestamente); MFA secreto TOTP en texto plano (riesgo RGPD no documentado como open_question); e2e no corren en CI (checkpoint "49 e2e verdes" es local-only) |
| BAJA | 2 | i18n pantallas de gestión: claves definidas pero no verificables sin ejecución; inventario sin enlace de navegación (router y page existen pero módulo inaccesible desde UI principal) |

