# Jemma runbook

How to run Jemma locally, record AI answers once and replay them, and reset a demo. Synthetic data only. Tests and browser specs run against the local database (`./start.sh`). A hosted Supabase project is for the demo, not for test runs.

## Never run the tests against a small hosted project

Do not run the test suite or the browser specs against a small hosted Supabase project. Every browser spec makes its own demo copy (a school, its logins, its files) and many database tests write rows. On 13 November 2026 two days of such runs against the free project behind the live demo used up the CPU allowance of its machine: creating the demo's logins timed out, and the live demo could not start for about three hours. It was moved to a fresh project the same day.

- `./start.sh` and CI use a local database. Run `pnpm test` and the Playwright specs against that one.
- Use a hosted project for the live demo, and for the one-off steps of a recording (see "Record the answers once"). The steps for a fresh project (migrations, sign-in settings, recorded answers) are in the README, "Run against your own Supabase project".
- A run against a hosted project that already looks slow (a sign-in that does not finish) is a reason to stop and wait, not to start it again.

## One command

`./start.sh` at the repo root sets up and runs everything on a clean machine with Docker and Node 22 or newer: the packages, a local Supabase stack (`supabase/config.toml`), `.env.local` and `apps/agent/.dev.vars` from that stack's own values, the recorded AI answers (`fixtures/ai-replays.json.gz`, loaded by `scripts/load-replays.ts`), the agent worker on :8787 (`pnpm --filter agent dev:local`, which uses `apps/agent/wrangler.local.jsonc` and has no `AI` binding) and the web app on :3000. It runs in `AI_MODE=replay`, so no key and no model are needed.

- `./start.sh --stop` stops the app and the local database. `./start.sh --force` replaces an existing `.env.local` (saved as `.env.local.bak`). `./start.sh --ci` runs the same set-up in the background and exits 0 when both health checks pass. Logs are in `.jemma/logs/`.
- It never overwrites an `.env.local` that points anywhere but the local stack. The Docker check comes first: without a running Docker it stops at step 1.
- The Supabase command line is only ever called as `start`, `stop`, `status -o env` and `db reset --local`, through one helper in `start.sh`, with `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` and `SUPABASE_DB_PASSWORD` unset and `DO_NOT_TRACK=1` set (the CLI otherwise uses a stored login and reads those from dotenv files). `start.sh` stops before calling it if an env file sets one of them, if `.env.local` holds a `SUPABASE_URL` that is not localhost or 127.0.0.1, or if `supabase/.temp` links a hosted project. A test (`packages/profiling/test/one-command.test.ts`) fails if `start.sh` uses any other subcommand. Do not run other `supabase` commands in this repo on a machine that holds a Supabase login.
- `db reset --local` rebuilds the local tables when `supabase/migrations` changed since the last run (the hash is in `.jemma/migrations.sha`). The recorded answers are loaded again after it.
- The GitHub workflow `.github/workflows/ci.yml` runs `./start.sh --ci`, `pnpm typecheck`, `pnpm test` and the phone demo-path test on a clean Ubuntu machine, on every push.
- To refresh the recorded answers after a new recording on the team's hosted project: `pnpm --filter @jemma/profiling exec tsx ../../scripts/export-replays.ts` (read only, writes the fixture), then commit `fixtures/ai-replays.json.gz`. Check the size (under 40 MB) and that no real email or key is in it: a test does this.
- Scripts that use the service key (`export-replays`, `live-smoke`, `proof/run-real-job`) run only against the local stack or a project whose address contains `JEMMA_ALLOWED_SUPABASE_REF`. Set it to the ref of your project: the built-in default is the team's earlier dev project, which is no longer in use.

## Env vars

Copy `.env.example` to `.env.local` at the repo root. `apps/web` reads it, and `bash .superset/setup.sh` copies it to `apps/agent/.dev.vars` for the agent worker.

| Var | What it does |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | The local stack, or your hosted project. The service key is server and agent only. |
| `LLM_PROVIDER`, `LLM_MODEL` | Text model. Free runs use `openrouter` and an OpenRouter `:free` id. |
| `LLM_MODEL_FALLBACKS` | Comma list of ids (same provider) tried in order when the model still fails with a 5xx or overload after its retries, or does not answer in 4 minutes. |
| `VISION_PROVIDER`, `VISION_MODEL`, `VISION_MODEL_FALLBACKS` | Same for photos (memo, papers, the curriculum PDF). |
| `TTS_PROVIDER`, `TTS_MODEL` | Lesson audio: `workers-ai` and `@cf/deepgram/aura-2-en`. |
| `AI_MODE` | `live` (call the model), `record` (call it and store the answer in `ai_replays`), `replay` (use the stored answer, never call a model, a miss is an error), `cache` (use the stored answer when the key exists, else call the model and store it). |
| `AI_ROUTE` | `cloud` (default): the agent does the AI work as above. `operator`: each job tries recorded answers first, then the owner's laptop (the operator runner below), and only when no laptop is online the agent's own model. |
| `AI_ROUTE_TAG` | Routing tag of this stack, default `default`. A hand-off carries it and only an operator runner with the same `OPERATOR_TAG` takes the event, so two stacks that share one database never take each other's events. |
| `DEMO_SANDBOX_DAYS` | Agent only. An unused demo copy older than this many days is removed by the agent's hourly cron. Default 7, `0` switches the sweep off. |
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
- Free models fail often. Every model call retries a 429 or 5xx with backoff (2, 5, 10, 20 s), then tries the next id in the fallback list. One call gets 4 minutes: a timeout is not tried again on the same model, the next id in the list gets the call. A job that shows no sign of life for 16 minutes is put back on the queue, twice at most, then marked failed (see "When a job stops half way" in [architecture.md](architecture.md)).
- OpenRouter's free tier is about 20 requests a minute. Papers are read three at a time and diagnoses three at a time.

## Run the agent and the web app locally

```bash
bash .superset/setup.sh            # once: pnpm install and env
pnpm --filter agent dev            # agent worker on :8787 (wrangler dev)
PLAYWRIGHT_PORT=3237 pnpm --filter web exec playwright test demo-path --project=phone --workers=1
```

`pnpm --filter agent dev` uses the local queue and the `AI` binding. Workers AI speech goes through the remote binding, so run `wrangler login` once. Without it, the audio lesson is saved with no `audio_path` and the player uses browser speech.

Stop every dev server and wrangler you start, and only those. Never use `pkill`, `killall` or `kill $(pgrep -f ...)`: on a shared machine they also stop the servers of other projects. Keep the process id when you start the agent, and stop it by that id:

```bash
pnpm --filter agent exec wrangler dev --port 8787 & echo $! > .wrangler-dev.pid    # add --config wrangler.local.jsonc for the agent without the speech binding
kill "$(cat .wrangler-dev.pid)" && rm .wrangler-dev.pid                              # later: stops that agent and nothing else
```

`.wrangler-dev.pid` is ignored by git. A server you started in the foreground stops with Ctrl-C. If a port stays busy after the stop, `lsof -nP -iTCP:8787 -sTCP:LISTEN` names the process that holds it: stop it only when its command line holds the path of your own folder, and otherwise leave it alone. `./start.sh --stop` stops only the two servers that `./start.sh` started (their ids are in `.jemma/pids`) and then the local database. It does not stop a server you started by hand.

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
# optional: real speech for the audio lesson (the proxy's process id goes in a file, so it can be stopped by that id and nothing else)
mkdir -p ../../.jemma
pnpm --filter agent exec wrangler dev -c ../../packages/profiling/scripts/tts-proxy/wrangler.jsonc --port 8799 & echo $! > ../../.jemma/tts-proxy.pid
TTS_PROXY_URL=http://localhost:8799 AI_MODE=record \
  node --import tsx --import ./scripts/register-md.mjs scripts/live-smoke.ts --fresh
kill "$(cat ../../.jemma/tts-proxy.pid)" && rm ../../.jemma/tts-proxy.pid    # afterwards: stops that proxy and nothing else
```

`.jemma/` is ignored by git. Stop the proxy when the run ends, the same way as the agent above: by its own process id, never by name.

- `--steps draft_map,approve_map,...` runs some steps on the sandbox in `scripts/.smoke-state.json`.
- Set `AI_MODE=replay` to run the same script without a model: a replay miss means a prompt changed since the recording, so record again.
- `seed_map` stores the fixture map instead of drafting one (when the model cannot).
- Rerun `record` after any change to a job prompt in `packages/profiling/src/jobs/*.md`, a schema, or a model id.

Answers land in the `ai_replays` table of the database the env points at (service role only).

The `map_records` job (the columns of a file of past records) is recorded by its own script, for the two sample files of `fixtures/records` ("Use a sample file" on the Add past records screen):

```bash
cd packages/profiling
node --import tsx --import ./scripts/register-md.mjs scripts/map-records-live.ts [--only tidy|messy] [--mode record|cache]
```

It makes a fresh demo school, runs the job live on the text model, prints what the model mapped and what code made of every row, and keeps the answer in `ai_replays`. It stops itself after 6 requests to the model host (retries count). Rerun it after any change to `jobs/map_records.md` or to the mapping schema.

## Evals

`pnpm evals` runs the eleven eval tasks (three runs each) on the real agent path with Goose and a free open-weights model, checks every outcome in code, and writes `EVALS.md` from the saved results in `evals/results/<run id>/`. `pnpm evals:report` rewrites `EVALS.md` from those files alone and fails if any of the 33 result files is missing. Never edit `EVALS.md` by hand.

- Needs Goose, `OPENROUTER_API_KEY` (a free key) and the database values in `.env.local` (the local stack, or your hosted project). It starts its own agent worker on port 8756 and stops it at the end.
- Every run makes its own sandbox and MCP token on the database and deletes both when it ends, also when it fails. The command ends with a sweep for leftovers and prints what it found.
- `pnpm evals --rehearse done --task class-report --runs 1` tests the flow with a fake goose: no model, nothing counted. Use it after any harness change.
- Live goose runs are counted in `evals/results/ledger.jsonl` (cap 45 for the eval packet). Free models are slow and busy at times: if the model is down, wait and run again.
- Details, the task list and how a task is built: `evals/README.md`.

## Run the operator runner

The operator runner lets the owner's Mac do the AI work for the hosted app, with the Claude Code that is signed in on that Mac (his own subscription). For every job the order is: a recorded answer if there is one (instant), else his laptop, else the free cloud model, and only when his laptop is off. It serves any school the cloud hands work to, so judges' sandboxes are served too. It only takes events the cloud handed over (never the events of a school that runs on a desktop), and only those with its own routing tag.

```bash
pnpm operator
```

What it needs:

- The repo with `pnpm install` done, and `.env.local` at the repo root with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `AGENT_URL` (the public URL of the agent worker the hosted app uses).
- `claude` installed and signed in (`claude auth status`). Set `JEMMA_RUNNER_AGENT=codex` to use Codex instead. No API key is used: provider keys and the Supabase keys are removed from the environment before the agent starts, so the subscription is what gets used.
- The goose variant: `JEMMA_RUNNER_AGENT=goose pnpm operator`. It needs `goose` installed and `OPENROUTER_API_KEY` in `.env.local` (a free OpenRouter key is enough; without it the command stops and says so). That key is the only provider key kept, for goose alone. The models come from `JEMMA_OPEN_MODEL` and `JEMMA_OPEN_MODEL_FALLBACKS` in `.env.local` or the shell (the shell wins), and the first one is named in the "operator starting" line. This variant was run live on 11 November on a local agent worker: 12 agent runs, all done, seven of today's nine AI jobs (not `draft_map`, and not `map_records`, which was added after the run), with the default free models. The runs and what was not shown are in [docs/proof/operator-goose-2026-11-11.md](proof/operator-goose-2026-11-11.md).
- The agent worker running with `AI_ROUTE=operator`. Without it the cloud does all AI work itself and the operator has nothing to do.
- Optional: `OPERATOR_CONCURRENCY` (jobs at a time, default 2), `OPERATOR_MAX_JOBS` (stop after that many agent runs) and `OPERATOR_TAG` (default `default`, must equal the agent's `AI_ROUTE_TAG`; give a test stack its own tag so it cannot touch anyone else's events on a shared database).

Known limit: curriculum PDFs are read by the cloud model. `draft_map` is never handed to the laptop (Claude Code cannot read a PDF that comes back through MCP), so it always runs on the agent's own model; every other AI job can run on the laptop.

It prints one line per job (time, event type, job, seconds, done or failed) and adds the same lines to `~/Jemma/operator.log`. On a Mac it runs `caffeinate` so the Mac does not go to sleep from idleness. Ctrl-C stops it cleanly: no new jobs, running jobs finish, its presence row is removed. Press Ctrl-C twice to quit at once.

The laptop must stay on, awake and online. Closing the lid or running the battery flat stops it. When it is off:

- The runner beats every 30 seconds. After 90 seconds without a beat (of its tag) the agent counts it as offline.
- A job that misses its recorded answer then runs on the agent's own model (the free cloud model), as it did before.
- Jobs already handed to the laptop go back to the cloud within a minute (the agent's cron runs every minute), marked `cloud_live` so they are never handed to a laptop again. This includes a job the laptop was running when it died.

Try it on one machine: put `AI_ROUTE=operator` and your own `AI_ROUTE_TAG` (for example `me-test`) in `apps/agent/.dev.vars`, start the agent, then run `OPERATOR_TAG=me-test AGENT_URL=http://localhost:8787 pnpm operator`. Give the agent a `LLM_MODEL` and `VISION_MODEL` that have no recordings to force every AI job to the operator.

## Reset

- A judge or you: open `/demo/reset` in the app (it rebuilds the sandbox in about 10 seconds).
- In code: `resetSandbox(admin, sandboxId)` from `supabase/seed`.
- Housekeeping: `deleteSandbox(admin, sandboxId)`. Old copies go by themselves: the agent's hourly cron (minute 17) runs `sweepOldSandboxes`, which removes up to 5 copies a run that are older than `DEMO_SANDBOX_DAYS` days with no sign-in and no activity since (their school, three users and files). A browser whose copy is gone lands on `/demo` and starts a new one.
- Smoke sandboxes are left in the database they ran against; delete them with `deleteSandbox` using the school id from `scripts/.smoke-state.json`.
- The sample test sheets (the memo and the 5 papers of Class Test 1) are `fixtures/papers/*.png`: `ensureSampleFiles` puts them in the `sample-papers` bucket on a new database, replaces a sheet whose size is not the real file's (a stand-in from an older version) and stops with "sample sheet <name>.png is not available in this runtime" rather than upload a stand-in, and the web app's Worker, which has no files on disk, reads them from its static assets (`apps/web/scripts/copy-sample-sheets.mjs` copies them into `public/sample-papers` before `next dev` and `next build`).

## Deploy a preview

Not part of P37 (Task 22 step 4). See the plan.
