# Vetlla

SaaS cloud-native, multitenant y **API-first** para la gestión de centros del sector de la dependencia en España (residencias, centros de día, viviendas tuteladas), con un **copiloto de IA agéntica** como diferencial.

> Estado: **H0 — Andamiaje**. Ver `project_state.yaml` para el avance por hitos y `CLAUDE.md` para producto, stack y convenciones.

## Stack

Monorepo (pnpm + Turborepo) · Next.js (App Router) + TypeScript · tRPC · Prisma + PostgreSQL (RLS) · Auth.js · Tailwind + shadcn/ui · PWA offline · `@anthropic-ai/sdk` · Vitest + Playwright. Todo en región **UE** (requisito legal RGPD).

## Requisitos

- Node.js >= 20
- pnpm 10 (`corepack enable`)
- Docker (para Postgres local)

## Arranque local

**Un solo comando** (prepara todo y arranca la app):

```bash
pnpm run bootstrap          # o, equivalente:  bash scripts/dev-setup.sh
```

Comprueba prerrequisitos → crea `.env` (genera `AUTH_SECRET`) → provisiona Postgres (usa uno local o en la nube si existe; si no, lo levanta con Docker) → `pnpm install` → migraciones → datos demo → arranca la app. Es **idempotente** (puedes repetirlo). Si el puerto 3000 está ocupado, usa el 3100 automáticamente; o fuerza uno con `PORT=4000 pnpm run bootstrap`. Usa `pnpm run bootstrap --no-start` para preparar sin arrancar.

### Manual (paso a paso)

```bash
# 1. Dependencias
pnpm install

# 2. Configuración
cp .env.example .env            # ajusta AUTH_SECRET con: openssl rand -base64 32

# 3. Base de datos (Postgres en Docker)
docker compose up -d

# 4. Esquema + datos demo
pnpm db:generate                # genera el cliente Prisma
pnpm db:migrate                 # aplica migraciones
pnpm db:seed                    # tenant demo + un usuario por rol

# 5. Arrancar
pnpm dev                        # http://localhost:3000
```

### Usuarios demo

Tras el seed (contraseña común `vetlla1234`):

| Rol        | Email                       |
| ---------- | --------------------------- |
| Superadmin | `superadmin@vetlla.dev`     |
| Dirección  | `direccion@demo.vetlla.dev` |
| Sanitario  | `sanitario@demo.vetlla.dev` |
| Auxiliar   | `auxiliar@demo.vetlla.dev`  |
| Familiar   | `familiar@demo.vetlla.dev`  |

## Comandos

| Comando              | Descripción                               |
| -------------------- | ----------------------------------------- |
| `pnpm run bootstrap` | Bootstrap local completo (un comando)     |
| `pnpm dev`           | Arranca la app en desarrollo              |
| `pnpm build`         | Build de producción                       |
| `pnpm lint`          | ESLint                                    |
| `pnpm typecheck`     | Comprobación de tipos                     |
| `pnpm test`          | Tests unitarios (Vitest)                  |
| `pnpm test:e2e`      | Tests e2e (Playwright; requiere app + BD) |
| `pnpm format`        | Formatea con Prettier                     |
| `pnpm db:migrate`    | Aplica migraciones Prisma                 |
| `pnpm db:seed`       | Carga datos demo                          |

## Estructura

```
apps/web        Next.js (UI + tRPC + PWA)
packages/db     Prisma (schema, cliente, migraciones, seed)
packages/ai     Herramientas y prompts del copiloto (desde H5)
packages/ui     Componentes compartidos (desde H2)
docs/adr        Architecture Decision Records
```
