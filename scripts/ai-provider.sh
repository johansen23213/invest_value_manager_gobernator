#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vetlla — cambia el proveedor de IA del copiloto en el .env LOCAL.
#
# El .env es local y está en .gitignore (secretos fuera de git), por eso esto
# es un script que ejecutas en tu máquina, no algo commiteado.
#
#   pnpm ai:local [modelo]   → usa Ollama en local (OpenAI-compatible). Gratis.
#                              Modelo por defecto: qwen2.5:14b (ajusta con el arg).
#   pnpm ai:stub             → vuelve al StubProvider determinista (sin red).
#
# Tras ejecutarlo, reinicia la app (Ctrl+C y `bash scripts/dev-setup.sh`).
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

c_info='\033[1;36m'; c_ok='\033[1;32m'; c_warn='\033[1;33m'; c_err='\033[1;31m'; c_off='\033[0m'
log() { printf "${c_info}▸ %s${c_off}\n" "$1"; }
ok()  { printf "${c_ok}✓ %s${c_off}\n" "$1"; }
warn(){ printf "${c_warn}! %s${c_off}\n" "$1"; }
die() { printf "${c_err}✗ %s${c_off}\n" "$1" >&2; exit 1; }

MODE="${1:-local}"
MODEL="${2:-qwen2.5:14b}"
OLLAMA_URL="http://localhost:11434"

# Asegurar que existe .env (créalo desde el ejemplo si falta).
if [ ! -f .env ]; then
  [ -f .env.example ] || die "No hay .env ni .env.example."
  cp .env.example .env
  ok ".env creado desde .env.example."
fi

# setenv KEY VALUE — fija (o reemplaza) una variable NO comentada en .env, idempotente.
setenv() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  # Elimina cualquier línea activa previa de esa clave (respeta las comentadas con '# ').
  grep -vE "^${key}=" .env > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" .env
}

case "$MODE" in
  stub)
    setenv AI_PROVIDER stub
    ok "Copiloto → StubProvider (determinista, sin red)."
    ;;

  local)
    log "Configurando el copiloto para Ollama local (modelo: ${MODEL})…"
    # Comprobaciones amables (no bloquean el escritura del .env, pero avisan).
    if ! command -v ollama >/dev/null 2>&1; then
      warn "No encuentro 'ollama' en el PATH. Instálalo (brew install ollama) y \`ollama serve\`."
    elif ! curl -s -o /dev/null --max-time 3 "${OLLAMA_URL}/api/tags"; then
      warn "Ollama no responde en ${OLLAMA_URL}. Arráncalo con: ollama serve &"
    elif ! ollama list 2>/dev/null | awk '{print $1}' | grep -qx "${MODEL}"; then
      warn "El modelo '${MODEL}' no está descargado."
      printf "  ¿Lo descargo ahora con 'ollama pull ${MODEL}'? [s/N] "
      read -r ans </dev/tty || ans=""
      case "$ans" in [sSyY]*) ollama pull "${MODEL}" ;; *) warn "Sigo sin descargarlo; hazlo con: ollama pull ${MODEL}" ;; esac
    else
      ok "Ollama operativo y '${MODEL}' disponible."
    fi

    setenv AI_PROVIDER vllm
    setenv AI_VLLM_BASE_URL "${OLLAMA_URL}/v1"
    setenv AI_VLLM_API_KEY ollama
    setenv AI_MODEL_VLLM_EXTRACTION "${MODEL}"
    setenv AI_MODEL_VLLM_REASONING "${MODEL}"
    ok "Copiloto → Ollama local (${MODEL}) para extracción y razonamiento."
    ;;

  *)
    die "Uso: pnpm ai:local [modelo] | pnpm ai:stub"
    ;;
esac

printf "\n"
log "Reinicia la app para aplicar:  Ctrl+C y luego  bash scripts/dev-setup.sh"
