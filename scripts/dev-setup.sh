#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vetlla — arranque del entorno local de desarrollo (un solo comando).
#
# Idempotente: puedes ejecutarlo tantas veces como quieras.
#   ./scripts/dev-setup.sh             prepara todo y arranca la app (pnpm dev)
#   ./scripts/dev-setup.sh --no-start  prepara todo pero no arranca el servidor
#
# Base de datos: usa un Postgres local si ya está corriendo en localhost:5432
# (p. ej. Postgres.app o Homebrew); si no, lo levanta con Docker si está
# disponible. Requisitos: Node 20+, pnpm 10+, y Postgres.app/Homebrew o Docker.
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

PG_HOST=localhost
PG_PORT=5432

# --- 1. Prerrequisitos (Node + pnpm) -----------------------------------------
log "Comprobando prerrequisitos…"
command -v node >/dev/null 2>&1 || die "Falta Node.js 20+  → https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR detectado; se requiere 20 o superior."
command -v pnpm >/dev/null 2>&1 || die "Falta pnpm 10+  → 'corepack enable' o 'npm i -g pnpm'"
ok "Node $(node -v), pnpm $(pnpm -v)."

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

# --- 3. Postgres --------------------------------------------------------------
pg_reachable() { (exec 3<>"/dev/tcp/${PG_HOST}/${PG_PORT}") 2>/dev/null; }

if pg_reachable; then
  log "Postgres detectado en ${PG_HOST}:${PG_PORT} (no uso Docker)."
  if command -v psql >/dev/null 2>&1; then
    # Crear rol 'vetlla' (no superusuario, para que la RLS se aplique) si falta.
    if ! psql -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='vetlla'" 2>/dev/null | grep -q 1; then
      log "Creando rol 'vetlla'…"
      psql -d postgres -v ON_ERROR_STOP=1 \
        -c "CREATE ROLE vetlla LOGIN PASSWORD 'vetlla_dev_password';" \
        || die "No pude crear el rol 'vetlla'. Créalo a mano:  psql -d postgres -c \"CREATE ROLE vetlla LOGIN PASSWORD 'vetlla_dev_password';\""
    fi
    # Crear base de datos 'vetlla' (propiedad del rol) si falta.
    if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='vetlla'" 2>/dev/null | grep -q 1; then
      log "Creando base de datos 'vetlla'…"
      createdb -O vetlla vetlla || die "No pude crear la BD 'vetlla'.  Créala a mano:  createdb -O vetlla vetlla"
    fi
    ok "Rol y base de datos 'vetlla' listos."
  else
    log "Postgres está corriendo pero no encuentro 'psql' en el PATH."
    log "Si usas Postgres.app, añade sus binarios al PATH y reintenta:"
    log '  export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"'
    log "Continúo asumiendo que ya existen el rol 'vetlla' y la BD 'vetlla'."
  fi
elif docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  log "No hay Postgres local; lo levanto con Docker…"
  docker compose up -d postgres
  log "Esperando a que Postgres esté listo…"
  for i in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U vetlla -d vetlla >/dev/null 2>&1; then
      ok "Postgres (Docker) aceptando conexiones."
      break
    fi
    [ "$i" -eq 30 ] && die "Postgres (Docker) no respondió. Revisa 'docker compose logs postgres'."
    sleep 2
  done
else
  die "No encuentro Postgres en ${PG_HOST}:${PG_PORT} ni Docker en marcha.
  Opción sin Docker (recomendada en Mac):
    1) Instala Postgres.app  → https://postgresapp.com
    2) Ábrelo y pulsa 'Initialize' / 'Start'
    3) (una vez) añade sus binarios al PATH:
         export PATH=\"/Applications/Postgres.app/Contents/Versions/latest/bin:\$PATH\"
    4) Vuelve a ejecutar:  pnpm setup
  Alternativa con Homebrew:  brew install postgresql@16 && brew services start postgresql@16"
fi

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
