#!/usr/bin/env bash
# Boots a fresh Jemma worktree: install deps, bring in env, write the agent's .dev.vars.
set -euo pipefail

MAIN_ENV="/Users/mac/Desktop/Billion/Jemma/Jemma/.env.local"

pnpm install

if [ -f "$MAIN_ENV" ]; then
  cp "$MAIN_ENV" .env.local
  cp .env.local apps/agent/.dev.vars
  echo "setup: copied .env.local and wrote apps/agent/.dev.vars"
elif [ -f .env.local ]; then
  cp .env.local apps/agent/.dev.vars
  echo "setup: wrote apps/agent/.dev.vars from existing .env.local"
else
  echo "setup: no .env.local found, skipping env (create one from .env.example)"
fi
