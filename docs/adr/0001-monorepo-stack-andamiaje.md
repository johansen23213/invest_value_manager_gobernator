# ADR 0001 — Andamiaje: monorepo y stack base

- **Estado:** Aceptada
- **Fecha:** 2026-06-07
- **Hito:** H0

## Contexto

Vetlla es un SaaS multitenant, API-first y offline-first con un copiloto de IA.
Necesitamos una base que permita compartir tipos extremo a extremo, iterar rápido
por hitos y mantener todo en región UE.

## Decisión

- **Monorepo** con pnpm workspaces + Turborepo. Paquetes: `apps/web`, `packages/db`
  (y `packages/ui`, `packages/ai` cuando se necesiten en H2/H5).
- **Next.js (App Router) + TypeScript estricto** como app única (UI + API).
- **tRPC** como capa de API tipada (API-first con tipos compartidos cliente/servidor,
  sin generación de cliente). El modelo de IA no tocará la BD: usará estas
  herramientas tipadas (preparado para H5).
- **Prisma + PostgreSQL** como ORM/DB. La RLS por `tenant_id` se añade en H1.
- **Auth.js (NextAuth) v5** con provider de **credenciales** y **sesiones JWT**.
  El adaptador Postgres se incorporará al añadir OAuth/email (credenciales requiere
  estrategia JWT, no de base de datos).
- **Tailwind CSS** (shadcn/ui se añade en H2). Base con tipografía mayor y objetivos
  táctiles de 44px pensando en el flujo de auxiliares.
- **Zod** para validación; **Vitest** (unidad) + **Playwright** (e2e).
- **Una sola fuente de `.env`** en la raíz, cargada con `dotenv-cli` en los scripts
  que necesitan entorno (Next y Prisma viven en carpetas distintas).
- Validación de entorno con Zod (`apps/web/src/env.ts`): falla rápido si falta config.

## Consecuencias

- Tipos compartidos extremo a extremo desde el día 1; añadir routers/módulos es barato.
- `NODE_ENV` no se fija en `.env`: lo gestionan las herramientas (forzarlo rompía el
  build de producción de Next, generando errores de prerender en las páginas de error).
- La augmentación de `JWT` de Auth.js no es fiable bajo pnpm estricto (es un reexport de
  `@auth/core/jwt`); los valores del token se convierten explícitamente en el callback.
- Pendientes para hitos siguientes: RLS y aislamiento por test (H1), shadcn/ui y
  paquete `ui` (H2), paquete `ai` con tool use (H5), e2e en CI con BD de test.
