# Jemma runbook

How to run Jemma locally, record AI answers once and replay them, and reset a demo. Synthetic data only. The only Supabase project used here is jemma-dev.

## One command

`./start.sh` at the repo root sets up and runs everything on a clean machine with Docker and Node 22 or newer: the packages, a local Supabase stack (`supabase/config.toml`), `.env.local` and `apps/agent/.dev.vars` from that stack's own values, the recorded AI answers (`fixtures/ai-replays.json.gz`, loaded by `scripts/load-replays.ts`), the agent worker on :8787 (`pnpm --filter agent dev:local`, which uses `apps/agent/wrangler.local.jsonc` and has no `AI` binding) and the web app on :3000. It runs in `AI_MODE=replay`, so no key and no model are needed.

- `./start.sh --stop` stops the app and the local database. `./start.sh --force` replaces an existing `.env.local` (saved as `.env.local.bak`). `./start.sh --ci` runs the same set-up in the background and exits 0 when both health checks pass. Logs are in `.jemma/logs/`.
- It never overwrites an `.env.local` that points anywhere but the local stack. The Docker check comes first: without a running Docker it stops at step 1.
- The Supabase command line is only ever called as `start`, `stop`, `status -o env` and `db reset --local`, through one helper in `start.sh`, with `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` and `SUPABASE_DB_PASSWORD` unset and `DO_NOT_TRACK=1` set (the CLI otherwise uses a stored login and reads those from dotenv files). `start.sh` stops before calling it if an env file sets one of them, if `.env.local` holds a `SUPABASE_URL` that is not localhost or 127.0.0.1, or if `supabase/.temp` links a hosted project. A test (`packages/profiling/test/one-command.test.ts`) fails if `start.sh` uses any other subcommand. Do not run other `supabase` commands in this repo on a machine that holds a Supabase login.
- `db reset --local` rebuilds the local tables when `supabase/migrations` changed since the last run (the hash is in `.jemma/migrations.sha`). The recorded answers are loaded again after it.
- The GitHub workflow `.github/workflows/ci.yml` runs `./start.sh --ci`, `pnpm typecheck`, `pnpm test` and the phone demo-path test on a clean Ubuntu machine, on every push.
- To refresh the recorded answers after a new recording on jemma-dev: `pnpm --filter @jemma/profiling exec tsx ../../scripts/export-replays.ts` (read only, writes the fixture), then commit `fixtures/ai-replays.json.gz`. Check the size (under 40 MB) and that no real email or key is in it: a test does this.
- Scripts that use the service key (`export-replays`, `live-smoke`, `proof/run-real-job`) run only against the local stack or a project whose address contains `JEMMA_ALLOWED_SUPABASE_REF` (default: jemma-dev).

## Env vars

Copy `.env.example` to `.env.local` at the repo root. `apps/web` reads it, and `bash .superset/setup.sh` copies it to `apps/agent/.dev.vars` for the agent worker.

| Var | What it does |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | jemma-dev. The service key is server and agent only. |
| `LLM_PROVIDER`, `LLM_MODEL` | Text model. Free runs use `openrouter` and an OpenRouter `:free` id. |
| `LLM_MODEL_FALLBACKS` | Comma list of ids (same provider) tried in order when the model still fails with a 5xx or overload after its retries. |
| `VISION_PROVIDER`, `VISION_MODEL`, `VISION_MODEL_FALLBACKS` | Same for photos (memo, papers, the curriculum PDF). |
| `TTS_PROVIDER`, `TTS_MODEL` | Lesson audio: `workers-ai` and `@cf/deepgram/aura-2-en`. |
| `AI_MODE` | `live` (call the model), `record` (call it and store the answer in `ai_replays`), `replay` (use the stored answer, never call a model, a miss is an error), `cache` (use the stored answer when the key exists, else call the model and store it). |
| `OPENROUTER_API_KEY` | Key for the free models. |
| `AGENT_URL` | Where the web app posts events, `http://localhost:8787` locally. |
| `EVENTS_SECRET` | Shared secret between web and agent for `POST /events`. |
| `READ_CONFIDENCE_MIN` | Answers read below this go to Needs you (default 0,8). |

### Judges: `AI_MODE=cache`

Every judge sandbox has the same synthetic inputs, so one warm-up run fills `ai_replays` and every later run is near instant. Set `AI_MODE=cache` on the preview agent, then run the demo path once (`demo-path.spec.ts` or by hand). After that a judge's papers, reports and lessons come from storage in seconds. A miss (an edited paper, a new prompt, a new model id) calls the model live and stores the answer, so live runs still work. Warm up with a healthy primary model: a recording made by a fallback model is stored under the fallback's id and the primary is tried first on the next run.

A replay is keyed by the model id and the call, so record and replay with the same `LLM_MODEL` and `VISION_MODEL` (and the same prompts). Uuids and dates in a call are left out of the key, so an answer recorded in one sandbox replays in another.

## Free model notes (27 Oct)

- `nvidia/nemotron-3.5-super-vl:free` reads the curriculum PDF, the memo and the papers correctly and also writes text.
- `nvidia/nemotron-3-ultra-550b-a55b:free` is the text fallback. It often answers `Internal server error` on a whole lesson.
- `google/gemma-4-31b-it:free` was down (`Internal error encountered`) and cannot do provider-side structured output reliably.
- Free models fail often. Every model call retries a 429, 5xx or timeout with backoff (2, 5, 10, 20 s), then tries the next id in the fallback list.
- OpenRouter's free tier is about 20 requests a minute. Papers are read three at a time and diagnoses three at a time.

## Run the agent and the web app locally

```bash
bash .superset/setup.sh            # once: pnpm install and env
pnpm --filter agent dev            # agent worker on :8787 (wrangler dev)
PLAYWRIGHT_PORT=3237 pnpm --filter web exec playwright test demo-path --project=phone --workers=1
```

`pnpm --filter agent dev` uses the local queue and the `AI` binding. Workers AI speech goes through the remote binding, so run `wrangler login` once. Without it, the audio lesson is saved with no `audio_path` and the player uses browser speech.

Stop every dev server and wrangler you start (`pkill -f "wrangler dev"`).

The agent reads `apps/agent/.dev.vars` (not your shell env). Set `AI_MODE`, `LLM_MODEL`, `VISION_MODEL` and the `*_FALLBACKS` there for the run, and restart `pnpm --filter agent dev`. `wrangler dev` has to reach Cloudflare once for the `AI` binding: if it exits with `Failed to start the remote proxy session ... Connect Timeout`, start it again.

### The demo-path test

`apps/web/e2e/demo-path.spec.ts` walks the five steps of board `Main` on a `start` sandbox, phone project only:

1. record once: agent `AI_MODE=cache`, test with `AI_MODE=cache` (about 15 to 25 minutes, free models)
2. check: agent `AI_MODE=replay`, test with `AI_MODE=replay` (about 8 minutes, no model call)

```bash
AI_MODE=replay PLAYWRIGHT_PORT=3237 pnpm --filter web exec playwright test demo-path --project=phone --workers=1
```

A `Replay miss` in an event's error names the job that asked (its model id and the start and end of its prompt): a prompt or a model id changed since the recording, so record again.

## Record the answers once (live smoke)

`live-smoke.ts` drives the real cloud jobs on a fresh `start` sandbox in demo-path order and prints seconds and a check for each step.

```bash
cd packages/profiling
# optional: real speech for the audio lesson
pnpm --filter agent exec wrangler dev -c ../../packages/profiling/scripts/tts-proxy/wrangler.jsonc --port 8799 &
TTS_PROXY_URL=http://localhost:8799 AI_MODE=record \
  node --import tsx --import ./scripts/register-md.mjs scripts/live-smoke.ts --fresh
```

- `--steps draft_map,approve_map,...` runs some steps on the sandbox in `scripts/.smoke-state.json`.
- Set `AI_MODE=replay` to run the same script without a model: a replay miss means a prompt changed since the recording, so record again.
- `seed_map` stores the fixture map instead of drafting one (when the model cannot).
- Rerun `record` after any change to a job prompt in `packages/profiling/src/jobs/*.md`, a schema, or a model id.

Answers land in the `ai_replays` table on jemma-dev (service role only).

## Reset

- A judge or you: open `/demo/reset` in the app (it rebuilds the sandbox in about 10 seconds).
- In code: `resetSandbox(admin, sandboxId)` from `supabase/seed`.
- Housekeeping: `deleteSandbox(admin, sandboxId)`.
- Smoke sandboxes are left in jemma-dev; delete them with `deleteSandbox` using the school id from `scripts/.smoke-state.json`.

## Deploy a preview

Not part of P37 (Task 22 step 4). See the plan.
