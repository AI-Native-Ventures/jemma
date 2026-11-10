# Jemma runbook

How to run Jemma locally, record AI answers once and replay them, and reset a demo. Synthetic data only. The only Supabase project used here is jemma-dev.

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
| `AI_ROUTE` | `cloud` (default): the agent does the AI work as above. `operator`: each job tries recorded answers first, then the owner's laptop (the operator runner below), and only when no laptop is online the agent's own model. |
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

## Run the operator runner

The operator runner lets the owner's Mac do the AI work for the hosted app, with the Claude Code that is signed in on that Mac (his own subscription). For every job the order is: a recorded answer if there is one (instant), else his laptop, else the free cloud model, and only when his laptop is off. It serves any school, so judges' sandboxes are served too.

```bash
pnpm operator
```

What it needs:

- The repo with `pnpm install` done, and `.env.local` at the repo root with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `AGENT_URL` (the public URL of the agent worker the hosted app uses).
- `claude` installed and signed in (`claude auth status`). Set `JEMMA_RUNNER_AGENT=codex` to use Codex instead. No API key is used: provider keys and the Supabase keys are removed from the environment before the agent starts, so the subscription is what gets used.
- The agent worker running with `AI_ROUTE=operator`. Without it the cloud does all AI work itself and the operator only serves schools that run on a desktop.
- Optional: `OPERATOR_CONCURRENCY` (jobs at a time, default 2) and `OPERATOR_MAX_JOBS` (stop after that many agent runs).

It prints one line per job (time, event type, job, seconds, done or failed) and adds the same lines to `~/Jemma/operator.log`. On a Mac it runs `caffeinate` so the Mac does not go to sleep from idleness. Ctrl-C stops it cleanly: no new jobs, running jobs finish, its presence row is removed. Press Ctrl-C twice to quit at once.

The laptop must stay on, awake and online. Closing the lid or running the battery flat stops it. When it is off:

- The runner beats every 30 seconds. After 90 seconds without a beat the agent counts it as offline.
- A job that misses its recorded answer then runs on the agent's own model (the free cloud model), as it did before.
- Jobs already handed to the laptop go back to the cloud within a minute (the agent's cron runs every minute), marked `cloud_live` so they are never handed to a laptop again. This includes a job the laptop was running when it died.

Try it on one machine: put `AI_ROUTE=operator` in `apps/agent/.dev.vars`, start the agent, then run `AGENT_URL=http://localhost:8787 pnpm operator`. Give the agent a `LLM_MODEL` and `VISION_MODEL` that have no recordings to force every AI job to the operator.

## Reset

- A judge or you: open `/demo/reset` in the app (it rebuilds the sandbox in about 10 seconds).
- In code: `resetSandbox(admin, sandboxId)` from `supabase/seed`.
- Housekeeping: `deleteSandbox(admin, sandboxId)`.
- Smoke sandboxes are left in jemma-dev; delete them with `deleteSandbox` using the school id from `scripts/.smoke-state.json`.

## Deploy a preview

Not part of P37 (Task 22 step 4). See the plan.
