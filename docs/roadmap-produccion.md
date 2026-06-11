# Roadmap MVP → Producción — Vetlla

> **Autor:** CIO (cio-vetlla) · **Fecha:** 2026-06-10 · **Ciclo de gobierno #1**
> **Fuente de estado:** `project_state.yaml` · **Principios:** `CLAUDE.md`
> **Objetivo de Angel:** iterar el MVP (H0–H6 completos; H5 a falta de re-validar con modelo real)
> para aproximarlo a un producto **listo para producción**.

Este documento es **gobierno, no implementación**: análisis de brechas (gap analysis) frente a
"listo para productivo", organizado por áreas, con severidad/impacto, y una secuencia priorizada
de épicas con responsable (`.claude/agents/`) y criterios de aceptación verificables.

## Restricción del entorno (afecta a qué se puede *cerrar* aquí)

En este entorno **no hay Postgres ni modelo de IA real**. En consecuencia:

- Lo que dependa de **BD** (tests de aislamiento RLS de tablas nuevas, migraciones aplicadas) se
  puede **diseñar, escribir y revisar**, pero **no se da por cerrado** hasta verificarse con
  Postgres (en CI o local). Se marca explícitamente como `PENDIENTE-BD`.
- Lo que dependa de **modelo real** (benchmark es/ca del copiloto) queda `PENDIENTE-MODELO`.
- Lo que dependa de **credenciales / contrato** (OVHcloud, DPA, dominio UE) es decisión de
  **Angel** (coste/negocio) → se formula como `open_question`.

Esto **prioriza** el roadmap: el incremento #1 debe ser algo de **alto valor que SÍ sea
verificable aquí** (lógica pura, CI, tipos, contratos), dejando lo `PENDIENTE-BD/MODELO/Angel`
encadenado pero no bloqueante.

---

## 1. Gap analysis por áreas

Severidad: **Crítica** (bloquea producción / riesgo legal) · **Alta** (necesario antes de
piloto con datos reales) · **Media** (calidad de producto) · **Baja** (mejora).

### A) Seguridad / RGPD (datos de salud, art. 9)

| # | Brecha | Sev. | Impacto |
|---|---|---|---|
| A1 | **DSAR no implementado**: no hay export ni borrado/anonimización del interesado (art. 15–17 RGPD). Para datos de salud es obligación legal, no opcional. | Crítica | Sin esto no se puede operar legalmente con datos reales de residentes. |
| A2 | **Rol de app no-propietario en Postgres** pendiente (deuda explícita de ADR-0002): hoy app y migraciones comparten un rol con `FORCE RLS` pero propietario de tablas → mitiga, no elimina, el riesgo de bypass. | Alta | Superficie de escalada si la app se ve comprometida. RLS es el control central de aislamiento. |
| A3 | **DPIA / RoPA finales** sin cerrar (datos art. 9 → DPIA obligatoria) y **DPA con OVHcloud** sin firmar. ADR-0008/0010/0011 aún no "Aceptada" definitiva. | Crítica | Requisito legal previo a tratar datos reales y a contratar el proveedor de inferencia. |
| A4 | **Gestión de secretos** de producción inexistente (solo `.env.example`). Sin rotación, sin vault. | Alta | `AUTH_SECRET`, `DATABASE_URL`, claves de IA deben vivir fuera del código y rotar. |
| A5 | **2FA** modelado pero no implementado (A-004). | Media | Cuentas de dirección/sanitario acceden a datos clínicos; 2FA es esperable en sanidad. |
| A6 | **Retención y minimización**: no hay políticas de retención/purga por tipo de dato ni cifrado en reposo verificado del lado app. | Alta | Minimización es principio RGPD-first; retención indefinida es un riesgo. |

### B) Fiabilidad / CI / Deploy UE

| # | Brecha | Sev. | Impacto |
|---|---|---|---|
| B1 | **CI no ejecuta los tests de aislamiento RLS de `packages/db`** ni Playwright E2E. El job corre `pnpm test` con Postgres de servicio, pero la garantía central del producto (aislamiento de tenants) **no está protegida por la pipeline**. | Crítica | Una regresión de RLS podría mezclar datos de tenants y pasar CI verde. Es el invariante #1 del producto. |
| B2 | **No hay pipeline de deploy a UE** (IaC, build de imagen, migraciones en deploy, dominio, TLS). El despliegue es manual/inexistente. | Crítica | No hay camino reproducible a producción; "alta de centro en minutos" no es real sin esto. |
| B3 | **Migraciones en deploy sin estrategia de rollback/zero-downtime** verificada (expand/contract). | Alta | Una migración mala puede tumbar producción multitenant. |
| B4 | **Resolución manual de conflictos de sync** (CareRecord) pendiente (deuda H3): hoy se registran y gana el más reciente, sin UI de revisión. | Media | Pérdida silenciosa de datos clínicos divergentes; aceptable en MVP, no en producción clínica. |
| B5 | **Backups / PITR de Postgres y plan de DR** no definidos. | Alta | Pérdida de datos clínicos sin recuperación = inaceptable. |

### C) Copiloto / IA (H5)

| # | Brecha | Sev. | Impacto |
|---|---|---|---|
| C1 | **Benchmark es/ca con modelo real pendiente** (cierra H5): el arreglo de prompts v2 (2026-06-10) no está re-validado; sin esto no se sabe si la calidad es "suficiente para piloto". | Alta | El copiloto es el **diferencial declarado**; H5 no se puede cerrar sin esta evidencia. |
| C2 | **Proveedor real sin cablear** (OVHcloud vLLM open-weight): solo config, pero depende de credenciales (Angel) + adaptador `vllm.ts`. | Alta | Hoy el copiloto solo corre con StubProvider; no es funcional para piloto. |
| C3 | **Entrada por voz (Whisper UE)** es stub (A-002). | Baja | UX para auxiliares mejora mucho con voz, pero no bloquea. |
| C4 | **Transparencia art. 50 / AI Act**: presente en UI, pero falta checklist de cumplimiento cerrado y clasificación de riesgo documentada como "aceptada". | Media | Obligación AI Act desde ago-2026; barato de cerrar, alto coste si se omite. |

### D) Datos / migraciones pendientes

| # | Brecha | Sev. | Impacto |
|---|---|---|---|
| D1 | **MAR offline (ADR-0012, "Propuesta")** sin implementar: el pase de medicación aún se registra online. A pie de cama sin red, no se puede registrar medicación. | Alta | Contradice "UX para auxiliares offline-first" en un flujo clínico crítico (medicación). |
| D2 | **M-11 editor de UI de dosis por franja (`momentDoses`)** pendiente (motor y schema hechos). | Media | Funcionalidad a medias; el dato existe pero no se puede capturar bien desde UI. |
| D3 | **Roles personalizados por tenant (ADR-0013)** diferidos por decisión consciente hasta demanda real. | Baja | Decisión ya tomada; solo seguimiento. |

### E) UX / Accesibilidad

| # | Brecha | Sev. | Impacto |
|---|---|---|---|
| E1 | **i18n ca-ES parcial**: pantallas de gestión en castellano; ca cubre login/shell/portal. | Media | Cataluña es mercado relevante; producto no plenamente bilingüe. |
| E2 | **WCAG 2.1 AA sin auditoría automatizada en CI** (axe). Se cuidó por diseño, no se mide en pipeline. | Media | Regresiones de accesibilidad pasan inadvertidas. |
| E3 | **E2E offline real en navegador** no ejecutado en CI (cubierto por integración). | Media | El flujo estrella (tablet sin red) no tiene red de seguridad automatizada. |

### F) Observabilidad

| # | Brecha | Sev. | Impacto |
|---|---|---|---|
| F1 | **Cero observabilidad**: no hay logging estructurado, métricas, error tracking ni health/readiness endpoints. | Alta | En producción no se podrá diagnosticar incidencias ni medir SLOs. Y el tracking debe ser **UE-resident** (no Datadog US por defecto). |
| F2 | **Sin alerting** sobre errores/latencia/saturación. | Media | Incidencias detectadas por el cliente, no por el equipo. |

### G) Soporte multicentro

| # | Brecha | Sev. | Impacto |
|---|---|---|---|
| G1 | **Onboarding self-service de tenant** ("alta en minutos") no existe: no hay flujo de alta de operador/centro sin seed manual. | Alta | Principio #1 (cloud-native, alta en minutos) no cumplido. |
| G2 | **Consola de Superadmin de plataforma** ausente (no opera dentro de tenant). | Media | No hay forma de operar la plataforma multicliente sin tocar BD. |
| G3 | **Modelo de pricing por plaza/módulo** soportado en datos pero sin facturación ni medición de uso. | Baja | Fuera del MVP por diseño; roadmap comercial. |

---

## 2. Las brechas más críticas (resumen ejecutivo)

1. **B1 — CI no protege el aislamiento RLS.** El invariante #1 del producto (un tenant nunca ve
   datos de otro) no está guardado por la pipeline. Cualquier cambio de schema/RLS puede
   regresar sin que CI lo note. **Verificable en este entorno** (es configuración de CI + ya
   existen los tests de `packages/db`). → candidato natural a incremento #1.
2. **A1/A3 — RGPD bloqueante para datos reales:** sin DSAR (export/borrado) y sin DPIA/DPA, no se
   puede operar legalmente con residentes reales. Requiere trabajo de Sofía + decisión de Angel
   (DPA/coste).
3. **B2 — No hay camino reproducible a producción UE.** Sin deploy/IaC/secretos, no hay
   "producto en producción". Requiere credenciales OVHcloud (Angel).
4. **C1/C2 — El diferencial (copiloto) no está validado ni cableado.** H5 no se cierra sin el
   benchmark es/ca con modelo real (PENDIENTE-MODELO) y sin proveedor (Angel).

---

## 3. Secuencia priorizada de incrementos (épicas)

Orden por: protege un **invariante/principio** × es **verificable aquí** × **desbloquea** lo
siguiente × **reversibilidad**. Lo `PENDIENTE-Angel/BD/MODELO` se encadena sin bloquear.

### INC-1 — Blindar el aislamiento RLS en CI (red de seguridad del invariante #1) ⭐ ELEGIDO
- **Responsable:** `quim-qa` (con `leo-devops` para la pipeline).
- **Por qué primero:** protege el principio central (multitenant/RLS) **sin BD real aquí porque
  CI ya levanta Postgres de servicio**; reversible; barato; desbloquea cualquier épica futura que
  toque schema (DSAR, MAR offline) al darles red de seguridad de aislamiento.
- **Criterios de aceptación (verificables):**
  - CI ejecuta **explícitamente** la suite de aislamiento RLS de `packages/db` (no solo `pnpm
    test` agregado): job/paso dedicado que falla si cualquier test de cross-tenant falla.
  - CI ejecuta **Playwright E2E** de los flujos críticos (login, atención, copiloto) contra la
    BD de servicio.
  - **Test de "tabla sin RLS"**: un test meta que enumera todas las tablas con `tenant_id` y
    falla si alguna no tiene `RLS + FORCE` y política → evita que una tabla nueva se cuele sin
    aislamiento. (Esto es lo que convierte B1 en una garantía estructural, no puntual.)
  - `pnpm lint && typecheck && build && test` verde en la pipeline.
- **Nota de entorno:** la *escritura* de tests y del workflow es verificable aquí (tipos, lint);
  la *ejecución verde con Postgres* se confirma en CI (PENDIENTE-BD marcado y resuelto por la
  propia pipeline de GitHub, no por este entorno local).

### INC-2 — DSAR + retención (RGPD operable con datos reales)
- **Responsable:** `sofia-dpo` (diseño/criterio) + `nuria-backend` (implementación) + `marc-arquitecto` (ADR).
- **Criterios:** export estructurado por interesado (residente) art. 15/20; borrado/anonimización
  art. 17 que respeta integridad clínica y AuditLog; políticas de retención por tipo de dato;
  todo en AuditLog; **test de aislamiento** de cualquier tabla nueva (PENDIENTE-BD).
- **Dependencia:** decisión de Angel sobre **política de retención** (cuánto se guarda cada tipo)
  → `open_question`.

### INC-3 — Camino a producción UE (deploy + secretos + backups)
- **Responsable:** `leo-devops` + `sofia-dpo` (residencia UE) + `marc-arquitecto` (ADR de deploy).
- **Criterios:** IaC reproducible en región UE; migraciones en deploy con expand/contract; gestión
  de secretos (no en repo) + rotación; backups/PITR + plan DR documentado; health/readiness.
- **Dependencia:** **credenciales OVHcloud + DPA** (Angel, coste/contrato) → `open_question`.

### INC-4 — Cerrar H5 (benchmark es/ca + cablear OVHcloud + AI Act)
- **Responsable:** `iris-ai` + `sofia-dpo` (AI Act/DPIA).
- **Criterios:** adaptador `vllm.ts` OpenAI-compatible con `fetch` mockeado (verificable aquí);
  benchmark es/ca de las 2 features con modelo real (PENDIENTE-MODELO); enrutado por feature si el
  PIA no llega; checklist AI Act/art.50 cerrado; ADR-0008/0010/0011 a "Aceptada".
- **Dependencia:** credenciales OVHcloud (Angel) + entorno con modelo.

### INC-5 — Observabilidad UE-resident
- **Responsable:** `leo-devops` + `sofia-dpo` (que el tracking no saque PII fuera de UE).
- **Criterios:** logging estructurado con correlación de request/tenant (sin PII de salud en
  logs); métricas + health; error tracking **alojado en UE**; alerting básico de SLOs.

### INC-6 — MAR offline (ADR-0012) + M-11 editor de dosis por franja
- **Responsable:** `nuria-backend` (motor puro + migración) + `dani-frontend` (cola/UI) + `quim-qa` (RLS).
- **Criterios:** `applyMedicationAdminPush`/`mergeAdministration` puros con tests (verificable aquí);
  migración + RLS+FORCE + **test de aislamiento** de la tabla de conflictos (PENDIENTE-BD); badge
  `PENDIENTE_SYNC` en MAR; editor de `momentDoses` en prescribir.

### INC-7 — Onboarding self-service de tenant + consola Superadmin
- **Responsable:** `dani-frontend` + `nuria-backend` + `elena-ux`.
- **Criterios:** un operador se da de alta y crea centro/plazas/residentes sin seed manual
  (cumple principio #1); consola mínima de Superadmin para operar la plataforma sin tocar BD.

### INC-8 — Pulido producto: ca-ES completo, axe en CI, E2E offline, 2FA
- **Responsable:** `dani-frontend` + `elena-ux` + `quim-qa`.
- **Criterios:** i18n ca completo en gestión; axe-core en pipeline; E2E offline real; 2FA opcional.

---

## 4. Decisión de gobierno: incremento #1

**INC-1 — Blindar el aislamiento RLS en CI.** Razonamiento en `project_state.yaml` (ciclo
2026-06-10) y resumido en §2/§3 de este documento. Responsable: `quim-qa` con `leo-devops`.

**Primer paso accionable para `quim-qa`:** inventariar la suite de aislamiento de `packages/db`
y los E2E de Playwright existentes; proponer (a) cómo invocarlos como paso dedicado en
`.github/workflows/ci.yml` y (b) el **test meta** que enumera tablas con `tenant_id` y exige
`RLS + FORCE + política`. Sin tocar producto: solo red de seguridad. Antes de escribir, confirmar
con el CIO el diseño del test meta (es el que convierte la garantía en estructural).
