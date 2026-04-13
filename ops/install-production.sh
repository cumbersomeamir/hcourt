#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARED_DIR="${HC_SHARED_DIR:-$HOME/.config/hcourt}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*"
}

ensure_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    source "$NVM_DIR/nvm.sh"
  else
    log "nvm is required at $NVM_DIR"
    exit 1
  fi
}

copy_env_file() {
  local source_file="$1"
  local target_file="$2"
  if [[ -f "$source_file" ]]; then
    install -m 600 "$source_file" "$target_file"
  fi
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-30}"
  local delay="${3:-2}"
  local response

  for ((i = 1; i <= attempts; i++)); do
    if response="$(curl -fsS "$url" 2>/dev/null)"; then
      printf '%s' "$response"
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

ensure_nvm
nvm install >/dev/null
nvm use >/dev/null

mkdir -p "$ROOT_DIR/logs" "$SHARED_DIR"

copy_env_file "$SHARED_DIR/backend.env.local" "$ROOT_DIR/backend/.env.local"
copy_env_file "$SHARED_DIR/frontend.env.local" "$ROOT_DIR/frontend/.env.local"

log 'Installing backend dependencies from scratch'
rm -rf "$ROOT_DIR/backend/node_modules" "$ROOT_DIR/backend/.next"
(cd "$ROOT_DIR/backend" && npm ci)

log 'Verifying backend native/runtime dependencies'
(cd "$ROOT_DIR/backend" && npm run verify:runtime)

log 'Building backend'
(cd "$ROOT_DIR/backend" && npm run build)

log 'Installing frontend dependencies from scratch'
rm -rf "$ROOT_DIR/frontend/node_modules" "$ROOT_DIR/frontend/.next"
(cd "$ROOT_DIR/frontend" && npm ci)

log 'Building frontend'
(cd "$ROOT_DIR/frontend" && npm run build)

log 'Starting PM2 processes'
(cd "$ROOT_DIR" && pm2 startOrRestart ecosystem.config.cjs --update-env)

log 'Waiting for backend health check'
backend_response="$(wait_for_http 'http://127.0.0.1:4000/api/health')"
printf '%s\n' "$backend_response" | grep -q '"success":true'

log 'Waiting for frontend health check'
wait_for_http 'http://127.0.0.1:3000/' >/dev/null

log 'Saving PM2 process list'
pm2 save >/dev/null

log 'Production install complete'
