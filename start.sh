#!/usr/bin/env bash
# Jemma in one command. A stranger clones the repo, runs ./start.sh, and Jemma runs on their machine
# with made-up data and recorded AI answers. No keys, no accounts, no model.
#
#   ./start.sh           set everything up and run Jemma (Ctrl-C stops the app, the database keeps running)
#   ./start.sh --stop    stop the app and the local database
#   ./start.sh --force   replace an existing .env.local (the old one is saved as .env.local.bak)
#   ./start.sh --ci      same set-up, but the app runs in the background and the script exits 0 once it answers
#
# It needs Docker (running), Node 22 or newer, and pnpm (or corepack, which comes with Node).
# Logs go to .jemma/logs/. Works on macOS and Linux (bash 3.2 or newer).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

STATE="$ROOT/.jemma"
LOGS="$STATE/logs"
PIDFILE="$STATE/pids"
WEB_PORT=3000
AGENT_PORT=8787
WEB_BASE="http://localhost:$WEB_PORT"
AGENT_BASE="http://localhost:$AGENT_PORT"
STEPS=6

# The models the recorded answers were made with. The key of a recorded answer includes the model id,
# so these ids must match exactly or every answer would be a miss.
REC_TEXT_MODEL="nvidia/nemotron-3.5-super-vl:free"
REC_TEXT_FALLBACKS="nvidia/nemotron-3-ultra-550b-a55b:free"
REC_VISION_MODEL="nvidia/nemotron-3.5-super-vl:free"
REC_VISION_FALLBACKS="google/gemma-4-31b-it:free"

CI_MODE=0
STOP=0
FORCE=0

# Keep the tools quiet and private: no telemetry, no prompts.
export DO_NOT_TRACK=1
export NEXT_TELEMETRY_DISABLED=1
export WRANGLER_SEND_METRICS=false
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Settings left over in the shell would beat the files this script writes. Jemma runs on the local stack only.
unset SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_URL SUPABASE_PROJECT_ID SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD \
  NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY AGENT_URL EVENTS_SECRET CHILD_PIN_PEPPER AI_MODE \
  LLM_PROVIDER LLM_MODEL LLM_MODEL_FALLBACKS VISION_PROVIDER VISION_MODEL VISION_MODEL_FALLBACKS \
  FIX_AFTER_DAYS READ_CONFIDENCE_MIN

usage() {
  cat <<'EOF'
Jemma in one command.

  ./start.sh           set everything up and run Jemma (Ctrl-C stops the app, the database keeps running)
  ./start.sh --stop    stop the app and the local database
  ./start.sh --force   replace an existing .env.local (the old one is saved as .env.local.bak)
  ./start.sh --ci      same set-up, but the app runs in the background and the script exits 0 once it answers

You need: Docker (running), Node 22 or newer, and pnpm (or corepack, which comes with Node).
The first run downloads a few GB for the local database and takes about 10 minutes.
Logs are in .jemma/logs/
EOF
}

for arg in "$@"; do
  case "$arg" in
    --ci) CI_MODE=1 ;;
    --stop) STOP=1 ;;
    --force) FORCE=1 ;;
    -h | --help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n\n' "$arg" >&2; usage >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- small helpers

step() { printf '\n[%s/%s] %s\n' "$1" "$STEPS" "$2"; }
say() { printf '%s\n' "$*"; }
fail() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

tail_log() {
  if [ -f "$LOGS/$1.log" ]; then
    printf '\nLast lines of .jemma/logs/%s.log:\n' "$1" >&2
    tail -n 25 "$LOGS/$1.log" >&2 || true
  fi
}

# run_logged NAME COMMAND...: runs the command, shows its output and keeps a copy in .jemma/logs/NAME.log.
run_logged() {
  local name="$1"
  shift
  mkdir -p "$LOGS"
  "$@" 2>&1 | tee -a "$LOGS/$name.log"
}

is_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# http_ok URL TEXT: true when URL answers 200 and the page holds TEXT. Uses node, so curl is not needed.
http_ok() {
  node -e '
    const [url, want] = process.argv.slice(1)
    fetch(url, { signal: AbortSignal.timeout(8000) })
      .then(async (r) => { const t = await r.text(); process.exit(r.status === 200 && t.includes(want) ? 0 : 1) })
      .catch(() => process.exit(1))
  ' "$1" "${2:-}" >/dev/null 2>&1
}

pid_from_file() {
  [ -f "$PIDFILE" ] || return 0
  awk -F= -v k="$1" '$1 == k { print $2; exit }' "$PIDFILE"
}

# Stops a server this script started: the whole group it leads (pnpm, node, workerd), politely first.
stop_tree() {
  local pid="$1" own pgid
  is_alive "$pid" || return 0
  own="$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')"
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
  if [ "$pgid" = "$pid" ] && [ "$pgid" != "$own" ]; then
    kill -TERM -- "-$pid" 2>/dev/null || true
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    is_alive "$pid" || return 0
    sleep 1
  done
  if [ "$pgid" = "$pid" ] && [ "$pgid" != "$own" ]; then
    kill -KILL -- "-$pid" 2>/dev/null || true
  else
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

# The 2>/dev/null keeps the shell's own "Terminated" job notices off the screen.
stop_servers() {
  stop_tree "$(pid_from_file web)" 2>/dev/null
  stop_tree "$(pid_from_file agent)" 2>/dev/null
  rm -f "$PIDFILE"
}

# export_env_file: puts every KEY=value of .env.local into this process's environment (run it in a subshell). The web
# app's proxy does not see the repo-root .env.local on its own (Next only hands it values from the environment).
export_env_file() {
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | '#'*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in '' | *[!A-Za-z0-9_]*) continue ;; esac
    value="${value#\"}"
    value="${value%\"}"
    export "$key=$value"
  done <.env.local
}

# env_file_value KEY FILE: the value of KEY=value in a dotenv file (quotes removed).
env_file_value() {
  awk -F= -v k="$1" '$1 == k { v = substr($0, length(k) + 2); gsub(/^["'"'"']|["'"'"']$/, "", v); print v; exit }' "$2" 2>/dev/null || true
}

# ---------------------------------------------------------------- step 1: what you need

PNPM=(pnpm)

check_needs() {
  local problems=() node_major pnpm_major p

  case "$(uname -s)" in
    Darwin | Linux) ;;
    *) problems+=("This script runs on macOS and Linux. On Windows, use WSL 2 and run it from there.") ;;
  esac

  if ! command -v docker >/dev/null 2>&1; then
    problems+=("Docker is not installed. Get Docker Desktop from https://www.docker.com/products/docker-desktop , start it, then run ./start.sh again.")
  elif ! docker info >/dev/null 2>&1; then
    problems+=("Docker is not running. Start Docker Desktop (on Linux, start the Docker service) and wait until it says it is running, then run ./start.sh again.")
  fi

  if ! command -v node >/dev/null 2>&1; then
    problems+=("Node.js is not installed. Get Node 22 or newer from https://nodejs.org , then run ./start.sh again.")
  else
    node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    node_major="${node_major:-0}"
    if [ "$node_major" -lt 22 ]; then
      problems+=("Node.js $(node -v) is too old. Jemma needs Node 22 or newer. Get it from https://nodejs.org (or run: nvm install 22), then run ./start.sh again.")
    fi
  fi

  if command -v pnpm >/dev/null 2>&1; then
    pnpm_major="$(pnpm --version 2>/dev/null | cut -d. -f1)"
    case "$pnpm_major" in
      '' | *[!0-9]*) ;;
      *) if [ "$pnpm_major" -lt 9 ]; then problems+=("pnpm $(pnpm --version) is too old. Run: npm install -g pnpm@10.27.0 , then run ./start.sh again."); fi ;;
    esac
  elif command -v corepack >/dev/null 2>&1; then
    PNPM=(corepack pnpm)
    say "pnpm is not installed, so I will run it through corepack."
  else
    problems+=("pnpm is not installed. Run: npm install -g pnpm@10.27.0 (or run: corepack enable), then run ./start.sh again.")
  fi

  if [ "${#problems[@]}" -gt 0 ]; then
    printf '\nSTOPPED: something Jemma needs is missing.\n' >&2
    for p in "${problems[@]}"; do printf '  - %s\n' "$p" >&2; done
    exit 1
  fi
}

# An .env.local that points anywhere but the local stack is never overwritten without --force.
LOCAL_URL_PATTERN='^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?(/.*)?$'
KEEP_ENV=0

# The Supabase command line quietly uses the stored login and reads SUPABASE_PROJECT_ID from the dotenv files in this
# folder, which could reach a hosted project. So it is never called while anything here could point it there.
cli_guard() {
  local f url
  for f in .env .env.local .env.development .env.development.local .env.production .env.production.local supabase/.env supabase/.env.local; do
    [ -f "$f" ] || continue
    if grep -Eq '^[[:space:]]*(export[[:space:]]+)?SUPABASE_(PROJECT_ID|ACCESS_TOKEN|DB_PASSWORD)[[:space:]]*=[[:space:]]*[^[:space:]#]' "$f"; then
      fail "$f sets SUPABASE_PROJECT_ID, SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD, which could point the Supabase command line at a hosted project, so I did not run it. Remove that line, or run ./start.sh --force to set .env.local aside, then run ./start.sh again."
    fi
  done
  if [ -f .env.local ]; then
    url="$(env_file_value SUPABASE_URL .env.local)"
    if [ -n "$url" ] && ! printf '%s' "$url" | grep -Eq "$LOCAL_URL_PATTERN"; then
      fail ".env.local points at a Supabase project that is not on this machine, so I did not run the Supabase command line. Move it away, or run ./start.sh --force to set it aside (saved as .env.local.bak)."
    fi
  fi
  for f in supabase/.temp/project-ref supabase/.temp/linked-project.json; do
    if [ -e "$f" ]; then
      fail "$f links this folder to a hosted Supabase project, so I did not run the Supabase command line. Delete the supabase/.temp folder, then run ./start.sh again."
    fi
  done
}

# The only door to the Supabase command line, and it only opens for the local stack: start, stop, status and
# db reset --local. Never link, projects, services, db push, --linked or --project-ref. A test reads this file to keep it so.
sb() {
  cli_guard
  env -u SUPABASE_ACCESS_TOKEN -u SUPABASE_PROJECT_ID -u SUPABASE_DB_PASSWORD DO_NOT_TRACK=1 "${PNPM[@]}" exec supabase "$@"
}

check_env_file() {
  local url key
  [ -f .env.local ] || return 0
  if [ "$FORCE" = 1 ]; then
    # Set aside now, before the Supabase command line runs, so it never sees it.
    mv .env.local .env.local.bak
    say "Your old .env.local is saved as .env.local.bak"
    return 0
  fi
  url="$(env_file_value SUPABASE_URL .env.local)"
  if ! printf '%s' "$url" | grep -Eq "$LOCAL_URL_PATTERN"; then
    fail ".env.local already exists and does not point at the local stack, so I left it alone. Move it away, or run ./start.sh --force to replace it (the old file is saved as .env.local.bak)."
  fi
  for key in SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY AGENT_URL EVENTS_SECRET CHILD_PIN_PEPPER AI_MODE; do
    if [ -z "$(env_file_value "$key" .env.local)" ]; then
      fail ".env.local points at the local stack but has no $key. Run ./start.sh --force to write a fresh one (the old file is saved as .env.local.bak)."
    fi
  done
  KEEP_ENV=1
}

# Running already? Say so. Something else on our ports? Say so, before anything is downloaded.
check_ports() {
  local web agent
  web="$(pid_from_file web)"
  agent="$(pid_from_file agent)"
  if is_alive "$web" && is_alive "$agent" && http_ok "$AGENT_BASE/health" '{"ok":true}' && http_ok "$WEB_BASE/demo"; then
    say ""
    say "Jemma is already running. Open $WEB_BASE/demo"
    say "Run ./start.sh --stop to stop it."
    exit 0
  fi
  if is_alive "$web" || is_alive "$agent"; then
    say "An earlier run of Jemma is half running. Stopping it first."
    stop_servers
  fi
  if port_busy "$WEB_PORT"; then
    fail "Port $WEB_PORT is already in use by something else. Close it, then run ./start.sh again."
  fi
  if port_busy "$AGENT_PORT"; then
    fail "Port $AGENT_PORT is already in use by something else. Close it, then run ./start.sh again."
  fi
}

# ---------------------------------------------------------------- --stop

if [ "$STOP" = 1 ]; then
  say "Stopping Jemma."
  stop_servers
  say "The app is stopped."
  if command -v node >/dev/null 2>&1 && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && [ -d node_modules/supabase ]; then
    if command -v pnpm >/dev/null 2>&1; then PNPM=(pnpm); elif command -v corepack >/dev/null 2>&1; then PNPM=(corepack pnpm); else fail "pnpm is not installed, so I cannot stop the local database."; fi
    cli_guard
    sb stop 2>&1 || say "The database could not be stopped. Check Docker."
    say "The local database is stopped."
  else
    say "Docker is not running or Jemma was never installed here, so there is no local database to stop."
  fi
  exit 0
fi

step 1 "Checking what you need (Docker, Node 22 or newer, pnpm)."
check_needs
check_env_file
cli_guard
check_ports
say "Everything needed is here."

# ---------------------------------------------------------------- step 2: packages

step 2 "Installing the packages (pnpm install). A minute or two the first time."
if ! run_logged install "${PNPM[@]}" install --frozen-lockfile; then
  tail_log install
  fail "pnpm install did not finish. Check your network and run ./start.sh again."
fi

# ---------------------------------------------------------------- step 3: database and file storage

step 3 "Starting the local database and file storage (Supabase in Docker). The first time this downloads a few GB and takes about 10 minutes."
cli_guard
if ! run_logged supabase sb start; then
  tail_log supabase
  fail "The local database did not start. Usual causes: Docker has too little memory (give it 4 GB or more), the network dropped while images downloaded (run ./start.sh again), or another Supabase project is using ports 54321 to 54324 (stop it, then run ./start.sh again)."
fi
# `supabase start` sets up a brand new database from supabase/migrations. A database from an earlier run, or one
# made from older migrations, is rebuilt (local database only) so the tables always match the files.
migrations_hash() {
  node -e '
    const fs = require("node:fs"), crypto = require("node:crypto"), dir = "supabase/migrations"
    const hash = crypto.createHash("sha256")
    for (const name of fs.readdirSync(dir).sort()) { hash.update(name); hash.update(fs.readFileSync(dir + "/" + name)) }
    process.stdout.write(hash.digest("hex"))
  '
}
MIGRATIONS_NOW="$(migrations_hash)"
MIGRATIONS_DONE="$(cat "$STATE/migrations.sha" 2>/dev/null || true)"
if [ "$MIGRATIONS_NOW" != "$MIGRATIONS_DONE" ]; then
  say "Setting up the database tables from supabase/migrations (local database only)."
  if ! run_logged supabase sb db reset --local; then
    tail_log supabase
    fail "The database tables could not be set up. The log is in .jemma/logs/supabase.log"
  fi
  mkdir -p "$STATE"
  printf '%s' "$MIGRATIONS_NOW" >"$STATE/migrations.sha"
fi
say "The local database is up, with every table and storage bucket in place."

# ---------------------------------------------------------------- step 4: settings

step 4 "Writing the settings (.env.local and apps/agent/.dev.vars) from the local database's own values."

status_value() {
  printf '%s\n' "$SB_STATUS" | awk -F= -v k="$1" '$1 == k { v = substr($0, length(k) + 2); gsub(/^"|"$/, "", v); print v; exit }'
}

random_hex() { node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'; }

if [ "$KEEP_ENV" = 1 ]; then
  say "Keeping your existing .env.local: it already points at the local database."
else
  SB_STATUS="$(sb status -o env 2>/dev/null)" || fail "Could not read the local database's settings. Run ./start.sh again."
  api_url="$(status_value API_URL)"
  anon_key="$(status_value ANON_KEY)"
  service_key="$(status_value SERVICE_ROLE_KEY)"
  db_url="$(status_value DB_URL)"
  [ -n "$anon_key" ] || anon_key="$(status_value PUBLISHABLE_KEY)"
  [ -n "$service_key" ] || service_key="$(status_value SECRET_KEY)"
  if [ -z "$api_url" ] || [ -z "$anon_key" ] || [ -z "$service_key" ]; then
    fail "The local database did not report its address and keys. Run ./start.sh --stop, then ./start.sh again."
  fi
  (
    umask 077
    {
      echo "# Written by ./start.sh for the local database on this machine. Nothing here is a real secret."
      echo "# Run ./start.sh --force to write it again."
      echo "SUPABASE_URL=$api_url"
      echo "SUPABASE_ANON_KEY=$anon_key"
      echo "SUPABASE_SERVICE_ROLE_KEY=$service_key"
      echo "SUPABASE_DB_URL=$db_url"
      echo "AGENT_URL=$AGENT_BASE"
      echo "EVENTS_SECRET=$(random_hex)"
      echo "CHILD_PIN_PEPPER=$(random_hex)"
      echo ""
      echo "# Recorded AI answers only: no model is called and no key is needed."
      echo "# The model ids are the ones the answers were recorded with."
      echo "AI_MODE=replay"
      echo "LLM_PROVIDER=openrouter"
      echo "LLM_MODEL=$REC_TEXT_MODEL"
      echo "LLM_MODEL_FALLBACKS=$REC_TEXT_FALLBACKS"
      echo "VISION_PROVIDER=openrouter"
      echo "VISION_MODEL=$REC_VISION_MODEL"
      echo "VISION_MODEL_FALLBACKS=$REC_VISION_FALLBACKS"
      echo ""
      echo "# Same as when the answers were recorded: a gap can be marked fixed after one practised session."
      echo "FIX_AFTER_DAYS=0"
      echo "READ_CONFIDENCE_MIN=0.8"
    } > .env.local.new
  )
  mv .env.local.new .env.local
fi
(
  umask 077
  cp .env.local apps/agent/.dev.vars
)
say "Settings are in place."

# ---------------------------------------------------------------- step 5: recorded answers

step 5 "Loading the recorded AI answers (no model is called, no key is needed)."
[ -f fixtures/ai-replays.json.gz ] || fail "fixtures/ai-replays.json.gz is missing. Run: git checkout fixtures/ai-replays.json.gz"
if ! run_logged replays "${PNPM[@]}" --filter @jemma/profiling exec tsx "$ROOT/scripts/load-replays.ts"; then
  tail_log replays
  fail "The recorded answers could not be loaded. The log is in .jemma/logs/replays.log. If the tables are missing, delete .jemma/migrations.sha and run ./start.sh again."
fi

# ---------------------------------------------------------------- step 6: the agent and the web app

AGENT_PID=""
WEB_PID=""

# shellcheck disable=SC2329  # runs from the trap below
cleanup() {
  trap - INT TERM
  say ""
  say "Stopping the app."
  stop_tree "$WEB_PID" 2>/dev/null
  stop_tree "$AGENT_PID" 2>/dev/null
  rm -f "$PIDFILE"
  say "The app is stopped. The local database is still running: ./start.sh starts the app again, ./start.sh --stop stops everything."
  exit 0
}

# wait_for LABEL URL TEXT SECONDS PID LOGNAME
wait_for() {
  local label="$1" url="$2" want="$3" limit="$4" pid="$5" log="$6" waited=0
  until http_ok "$url" "$want"; do
    if ! is_alive "$pid"; then
      tail_log "$log"
      stop_servers
      fail "The $label stopped before it was ready. The log is in .jemma/logs/$log.log"
    fi
    if [ "$waited" -ge "$limit" ]; then
      tail_log "$log"
      stop_servers
      fail "The $label did not answer at $url after $limit seconds. The log is in .jemma/logs/$log.log"
    fi
    sleep 2
    waited=$((waited + 2))
    if [ $((waited % 30)) -eq 0 ]; then say "  still waiting for the $label ($waited seconds)..."; fi
  done
}

step 6 "Starting the agent (port $AGENT_PORT) and the web app (port $WEB_PORT)."
mkdir -p "$LOGS"
: >"$LOGS/agent.log"
: >"$LOGS/web.log"

# Ctrl-C from here on stops whatever was started. Job control puts each server in its own process group,
# so one stop reaches everything it started.
trap cleanup INT TERM
set -m
(exec "${PNPM[@]}" --filter agent dev:local >"$LOGS/agent.log" 2>&1 </dev/null) &
AGENT_PID=$!
(export_env_file; exec "${PNPM[@]}" --filter web dev >"$LOGS/web.log" 2>&1 </dev/null) &
WEB_PID=$!
printf 'agent=%s\nweb=%s\n' "$AGENT_PID" "$WEB_PID" >"$PIDFILE"

wait_for "agent" "$AGENT_BASE/health" '{"ok":true}' 240 "$AGENT_PID" agent
say "The agent answers at $AGENT_BASE/health"
wait_for "web app" "$WEB_BASE/demo" "" 420 "$WEB_PID" web
say "The web app answers at $WEB_BASE/demo"

say ""
say "Jemma is running. Open $WEB_BASE/demo"
say "Logs are in .jemma/logs/"

if [ "$CI_MODE" = 1 ]; then
  say "Both servers run in the background. ./start.sh --stop stops them."
  exit 0
fi

say "Press Ctrl-C to stop the app. The local database keeps running; ./start.sh --stop stops it too."
while is_alive "$AGENT_PID" && is_alive "$WEB_PID"; do
  sleep 2
done
tail_log agent
tail_log web
stop_servers
fail "A server stopped on its own. The logs are in .jemma/logs/"
