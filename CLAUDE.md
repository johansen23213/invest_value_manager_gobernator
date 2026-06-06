# Vetlla — SaaS de gestión sociosanitaria

> **Producto:** SaaS cloud-native, multitenant y API-first para centros del sector de la dependencia en España (residencias de mayores, centros de día, viviendas tuteladas/supervisadas).
> **Diferencial:** copiloto de IA agéntica que automatiza el trabajo administrativo pesado. No buscamos completitud funcional (eso lo tiene el líder, ResiPlus), sino ser cloud-native de verdad, API-first y con IA útil.
> **Estado:** planificación del MVP. Fuente de verdad del avance: `project_state.yaml`.

---

## Qué estamos construyendo (MVP)

El MVP demuestra el **bucle de uso diario** + el **diferencial de IA**, no el ERP entero.

**Dentro:** multitenancy + auth + RBAC; gestión de centros/unidades/plazas/camas y ocupación; expediente sociosanitario del residente (datos, contactos, dependencia, alergias, diagnósticos, escalas Barthel/Tinetti); atención directa offline-first desde tablet (constantes, ABVD, deposiciones, ingesta, incidencias); medicación + MAR básico con alertas de no-administrado; PIA/PAI con objetivos y seguimiento; portal de familias (solo lectura); IA Copilot (2 features estrella); soporte en el modelo de datos para pricing por plaza/módulo.

**Fuera (roadmap):** facturación/contabilidad completa, cuadrantes/turnos, mantenimiento, transporte, integraciones farmacia/administración, apps nativas (la PWA cubre el MVP), copiloto de cumplimiento normativo.

---

## Principios de producto (no negociables)

1. **Cloud-native, multitenant.** Cero instalación. Alta de un centro en minutos.
2. **API-first.** Toda la UI se apoya en una API tipada y documentada (tRPC).
3. **IA agéntica como diferencial**, no un chatbot decorativo. Humano siempre en el bucle para datos clínicos.
4. **UX para auxiliares**, no para informáticos: a pie de cama, pocos toques, offline, sincroniza al recuperar red.
5. **RGPD-first / datos de salud (art. 9 RGPD).** Residencia de datos en la **UE obligatoria**. Privacidad y auditoría desde el diseño.

---

## Stack técnico

- **Monorepo:** pnpm workspaces + Turborepo.
- **App:** Next.js (App Router) + TypeScript estricto. Server Components + capa API tipada con **tRPC**. **PWA** (service worker + manifest) para uso offline en tablet.
- **UI:** Tailwind CSS + shadcn/ui. Accesible (WCAG 2.1 AA), tipografía grande y objetivos táctiles amplios para el flujo de auxiliares.
- **ORM/DB:** Prisma + **PostgreSQL** con **Row-Level Security (RLS)**.
- **Auth:** Auth.js (NextAuth) con adaptador Postgres. Sesiones seguras, contraseña + 2FA opcional.
- **Offline:** IndexedDB local + cola de sincronización. Resolución de conflictos: last-write-wins por campo + registro de conflictos, para `CareRecord`.
- **IA:** SDK oficial de Anthropic (`@anthropic-ai/sdk`). **Último Claude Sonnet** para el copiloto, **Haiku** para extracción/clasificación de bajo coste. Los identificadores de modelo se resuelven contra `docs.claude.com` (no hardcodear a ciegas); se centralizan en `packages/ai`. Transcripción de voz: motor con despliegue UE/on-prem (nunca enviar audio de salud fuera de la UE).
- **Validación:** Zod en todas las entradas.
- **Tests:** Vitest (unidad) + Playwright (e2e de flujos críticos).
- **Hosting:** todo en **región UE** (Postgres en proveedor EU; app con datos en UE). Requisito legal.

---

## Estructura del repo

```
.
├── apps/
│   └── web/            # Next.js (App Router): UI + tRPC + PWA
├── packages/
│   ├── db/             # Prisma schema, cliente, migraciones, seed, RLS
│   ├── ai/             # Herramientas (tool use) y prompts del copiloto, versionados
│   └── ui/             # Componentes compartidos (shadcn/ui)
├── docs/
│   └── adr/            # Architecture Decision Records (1 fichero por decisión)
├── CLAUDE.md           # Este fichero
├── project_state.yaml  # Única fuente de verdad del avance
└── docker-compose.yml  # Postgres local
```

---

## Multitenancy (regla central)

- Postgres compartido con `tenant_id` en **cada** tabla + **RLS**. Toda query filtra por tenant vía RLS, no solo en código de aplicación.
- Contexto de tenant resuelto en el middleware de auth e inyectado en cada request.
- Aislamiento **verificado con tests**: un tenant nunca ve datos de otro, bajo ninguna ruta ni query.

## Roles (mínimo privilegio)

`Dirección/gestor` · `Sanitario (médico/enfermería)` · `Auxiliar` · `Familiar` (solo lectura del residente vinculado) · `Superadmin` (plataforma). Permisos por **rol** y por **pertenencia al tenant**.

## Capa de IA (reglas)

- El modelo **nunca toca la BD directamente**: llama herramientas tipadas que validan permisos, rol y tenant (respetan RLS).
- **Humano siempre en el bucle** para datos clínicos; nada se guarda sin confirmación/aprobación.
- Cada acción del copiloto queda en `AuditLog`.
- Nada de PII de salud sale de la UE. Prompts y herramientas versionados en el repo.

---

## Convenciones

- **TypeScript estricto.** ESLint + Prettier.
- **Commits convencionales** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`…).
- Variables de entorno documentadas en `.env.example`; secretos fuera del código.
- **i18n desde el inicio:** `es-ES` y `ca-ES` (catalán). Formatos de fecha/número locales.
- Decisiones de arquitectura no triviales → `docs/adr/`.
- Cada hito se cierra con: **tests en verde + `project_state.yaml` actualizado + resumen corto**. No avanzar de hito sin checkpoint.

---

## Forma de trabajo

Construcción **hito a hito** (ver `project_state.yaml`). Parar en cada checkpoint a confirmar antes de avanzar. La fuente de verdad del avance, decisiones y estado es siempre `project_state.yaml`.
