# ---------------------------------------------------------------------------
# Vetlla — Dockerfile de producción multistage (OPS-C01)
#
# Arquitectura monorepo: pnpm workspaces + Turborepo.
# La app Next.js usa `output: 'standalone'` → el stage de runtime solo
# necesita .next/standalone/ + .next/static/ (sin pnpm ni node_modules fuente).
#
# Fases:
#   1. base      — Node + pnpm, sin código.
#   2. deps      — pnpm install (solo prod deps necesarias para el build).
#   3. builder   — next build (genera .next/standalone/).
#   4. runner    — imagen mínima de runtime: copia solo el artefacto standalone.
#
# Requisitos de entorno (nunca en este fichero — se inyectan en runtime):
#   DATABASE_URL       — conexión owner para migrate:deploy (schema=public).
#   APP_DATABASE_URL   — conexión vetlla_app (no-owner, RLS activo). OBLIGATORIO.
#   AUTH_SECRET        — secreto de sesión Auth.js.
#   EMAIL_PROVIDER     — 'console' | 'http'.
#   AI_PROVIDER        — 'stub' | 'vllm' | 'bedrock'.
#   (ver .env.example y docs/devops/despliegue-ue.md para la lista completa)
#
# Orden de arranque correcto (no cambia este Dockerfile):
#   1. Provisionar vetlla_app en la BD (app-role-bootstrap.sql) — UNA VEZ.
#   2. prisma migrate deploy (DATABASE_URL = owner).
#   3. Ejecutar app-role.sql (DATABASE_URL = owner) tras cada migración nueva.
#   4. Arrancar este contenedor (NODE_ENV=production + APP_DATABASE_URL set).
#   Ver runbook completo en docs/devops/despliegue-ue.md.
#
# Hosting UE: bloqueado en Q-004 (Angel). Ver ADR-0011 y el runbook.
# ---------------------------------------------------------------------------

# --- 1. Base: Node + pnpm fijados a versiones concretas ---------------------
FROM node:22-alpine AS base

# pnpm se instala vía corepack (incluido en Node 16+, pero hay que activarlo).
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# --- 2. Deps: install del monorepo ------------------------------------------
FROM base AS deps

# Copiar manifiestos necesarios para que pnpm resuelva el workspace.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/ai/package.json ./packages/ai/
COPY packages/ui/package.json ./packages/ui/

# --frozen-lockfile garantiza reproducibilidad.
RUN pnpm install --frozen-lockfile

# --- 3. Builder: next build con standalone output ---------------------------
FROM base AS builder

WORKDIR /app

# Copiar node_modules resueltos del stage anterior.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copiar el código fuente completo del monorepo.
COPY . .

# Generar el cliente Prisma (necesario para el build de Next.js).
# DATABASE_URL ficticia: el build no conecta a BD, pero Prisma la exige para
# generar el cliente. Se sobreescribe en runtime con la URL real.
ENV DATABASE_URL="postgresql://vetlla:placeholder@localhost:5432/vetlla?schema=public"
ENV APP_DATABASE_URL="postgresql://vetlla_app:placeholder@localhost:5432/vetlla?schema=public"
# Desactivar telemetría de Prisma y Next.js en el build.
ENV PRISMA_TELEMETRY_INFORMATION="false"
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @vetlla/db generate
RUN pnpm --filter @vetlla/web build

# --- 4. Runner: imagen mínima de runtime ------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Usuario no-root para el proceso de la app (mínimo privilegio).
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid  1001 nextjs

# Copiar el artefacto standalone generado por Next.js.
# .next/standalone incluye server.js + node_modules mínimos (sin pnpm).
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# Activos estáticos (CSS, JS, imágenes) — servidos por el servidor standalone.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# public/ (manifest.json, sw.js, iconos, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# El standalone de Next.js genera apps/web/server.js (ruta relativa al monorepo).
CMD ["node", "apps/web/server.js"]
