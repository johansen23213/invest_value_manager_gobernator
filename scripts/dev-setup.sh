#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vetlla — arranque del entorno local de desarrollo (un solo comando).
#
# Idempotente: puedes ejecutarlo tantas veces como quieras.
#   ./scripts/dev-setup.sh             prepara todo y arranca la app (pnpm dev)
#   ./scripts/dev-setup.sh --no-start  prepara todo pero no arranca el servidor
#
# Requisitos: Node 20+, pnpm 10+, Docker (con Docker Compose v2).
# Al terminar tendrás la app en http://localhost:3000 con datos demo.
# ---------------------------------------------------------------------------
set -euo pipefail

# Situarse en la raíz del repo (este script vive en scripts/)
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

c_info='\033[1;36m'; c_ok='\033[1;32m'; c_err='\033[1;31m'; c_off='\033[0m'
log()  { printf "${c_info}▸ %s${c_off}\n" "$1"; }
ok()   { printf "${c_ok}✓ %s${c_off}\n" "$1"; }
die()  { printf "${c_err}✗ %s${c_off}\n" "$1" >&2; exit 1; }

START=1
[ "${1:-}" = "--no-start" ] && START=0

# --- 1. Prerrequisitos --------------------------------------------------------
log "Comprobando prerrequisitos…"
command -v node   >/dev/null 2>&1 || die "Falta Node.js 20+  → https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR detectado; se requiere 20 o superior."
command -v pnpm   >/dev/null 2>&1 || die "Falta pnpm 10+  → 'corepack enable' o 'npm i -g pnpm'"
command -v docker >/dev/null 2>&1 || die "Falta Docker  → https://docs.docker.com/get-docker"
docker compose version >/dev/null 2>&1 || die "Falta Docker Compose v2 ('docker compose')."
ok "Node $(node -v), pnpm $(pnpm -v), Docker disponible."

# --- 2. Fichero .env ----------------------------------------------------------
if [ ! -f .env ]; then
  log "Creando .env a partir de .env.example…"
  cp .env.example .env
  ok ".env creado."
fi
# Generar AUTH_SECRET real si falta, sigue el placeholder o está vacío.
if ! grep -q '^AUTH_SECRET=' .env \
   || grep -qE '^AUTH_SECRET=.*change-me' .env \
   || grep -qE '^AUTH_SECRET="?"?[[:space:]]*$' .env; then
  SECRET="$(openssl rand -base64 32)"
  tmp="$(mktemp)"
  if grep -q '^AUTH_SECRET=' .env; then
    sed "s|^AUTH_SECRET=.*|AUTH_SECRET=\"${SECRET//&/\\&}\"|" .env > "$tmp" && mv "$tmp" .env
  else
    cp .env "$tmp" && printf '\nAUTH_SECRET="%s"\n' "$SECRET" >> "$tmp" && mv "$tmp" .env
  fi
  ok "AUTH_SECRET generado."
fi

# --- 3. Postgres (Docker) -----------------------------------------------------
log "Levantando Postgres (docker compose)…"
docker compose up -d postgres
log "Esperando a que Postgres esté listo…"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-vetlla}" -d "${POSTGRES_DB:-vetlla}" >/dev/null 2>&1; then
    ok "Postgres aceptando conexiones."
    break
  fi
  [ "$i" -eq 30 ] && die "Postgres no respondió a tiempo. Revisa 'docker compose logs postgres'."
  sleep 2
done

# --- 4. Dependencias ----------------------------------------------------------
log "Instalando dependencias (pnpm install)…"
pnpm install

# --- 5. Base de datos: cliente + esquema + datos demo -------------------------
log "Generando cliente Prisma…"
pnpm db:generate
log "Aplicando migraciones…"
pnpm --filter @vetlla/db migrate:deploy
log "Sembrando datos demo…"
pnpm db:seed

# --- 6. Listo -----------------------------------------------------------------
cat <<'EOF'

──────────────────────────────────────────────────────────────────────
  ✓ Entorno listo.  App → http://localhost:3000

  Usuarios demo (contraseña común: vetlla1234)
    Dirección  direccion@demo.vetlla.dev   (ve todo)
    Sanitario  sanitario@demo.vetlla.dev   (medicación / PIA)
    Auxiliar   auxiliar@demo.vetlla.dev    (atención a pie de cama)
    Familiar   familiar@demo.vetlla.dev    (portal solo lectura)
    Superadmin superadmin@vetlla.dev       (plataforma)
──────────────────────────────────────────────────────────────────────
EOF

if [ "$START" -eq 1 ]; then
  log "Arrancando la app (pnpm dev)…  (Ctrl+C para parar)"
  exec pnpm dev
else
  log "Listo. Arranca cuando quieras con:  pnpm dev"
fi
