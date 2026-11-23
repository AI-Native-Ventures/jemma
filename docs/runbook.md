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
- The GitHub workflow `.github/workflows/ci.yml` runs `./start.sh --ci`, `pnpm typecheck`, `pnpm test` and the phone demo-path test on a clean Ubuntu machine, on every push. A second job, "Feature specs in a browser", starts the same stack and runs the browser specs of the newer features (`apps/web/e2e`) on the local database, some with the real agent and the recorded answers and some with a stand-in agent that runs no job.
- To refresh the recorded answers after a new recording on the team's hosted project: `pnpm --filter @jemma/profiling exec tsx ../../scripts/export-replays.ts` (read only, writes the fixture), then commit `fixtures/ai-replays.json.gz`. Check the size (under 40 MB) and that no real email or key is in it: a test does this.
- Scripts that use the service key (`export-replays`, `live-smoke`, `proof/run-real-job`) run only against the local stack or a project whose address contains `JEMMA_ALLOWED_SUPABASE_REF`. Set it to the ref of your project: the built-in default is the team's earlier dev project, which is no longer in use.

## Env vars

Copy `.env.example` to `.env.local` at the repo root. `apps/web` reads it, and `bash .superset/setup.sh` copies it to `apps/agent/.dev.vars` for the agent worker.

| Var | What it does |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | The local stack, or your hosted project. The service key is server and agent only. |
| `LLM_PROVIDER`, `LLM_MODEL` | Text model. The hosted demo uses `workers-ai` (Cloudflare Workers AI) and `@cf/deepseek-ai/deepseek-v4.1-flash-1017`: see "Cloudflare Workers AI (the hosted demo)". Free runs of your own use `openrouter` and an OpenRouter `:free` id. The paid OpenRouter listing of a model, the same id without `:free`, is built and not used by the hosted demo: see "Paid hosting (built, off on the preview)". |
| `LLM_MODEL_FALLBACKS` | Comma list of ids (same provider) tried in order when the model still fails with a 5xx or overload after its retries, or is gone, unpaid or refuses the caller, or does not answer in time (any error moves on to the next id, except a call the caller cancelled): 90 seconds for a paid OpenRouter id (no `:free`), 4 minutes for every other. The hosted demo lists the backups here: `@cf/zai-org/glm-5.3-flash,@cf/thinkingmachines/inkling-2-small,openrouter:nvidia/nemotron-3.5-super-vl:free,openrouter:nvidia/nemotron-3-ultra-550b-a55b:free` (150 seconds a try for a `workers-ai` id, 2 minutes for a free OpenRouter id after it). An id may start with `<provider>:` (`openrouter`, `workers-ai`, `deepseek`, `anthropic`, `google`, `openai`, `opencode`) to use that provider for the id, so one list can mix providers; only the exact name of one of these before the first colon counts, so `nvidia/nemotron-3.5-super-vl:free` has no prefix. The prefix is not part of the replay key. |
| `VISION_PROVIDER`, `VISION_MODEL`, `VISION_MODEL_FALLBACKS` | Same for photos (memo, papers, the curriculum PDF). |
| `TTS_PROVIDER`, `TTS_MODEL` | Lesson audio: `workers-ai` and `@cf/deepgram/aura-2-en`. |
| `CF_ACCOUNT_ID`, `CF_AI_TOKEN` | Only for calling Workers AI over REST, outside a Worker (for example a local script): the Cloudflare account id and a Workers AI API token (a secret, never written in the repository). Inside the agent the built-in `AI` binding is used and these are not set; with a token set the binding is not used. With neither a token nor the binding, `workers-ai` is a plain error that says so (not in `replay`, which never calls a model). |
| `AI_RECORDED_IDS` | Comma list of model ids that recorded answers were saved under. In `cache` and `replay` they are looked up after the model ids and never called. Unset: only the model ids are looked up. |
| `AI_MODE` | `live` (call the model), `record` (call it and store the answer in `ai_replays`), `replay` (use the stored answer, never call a model, a miss is an error), `cache` (use the stored answer when the key exists, else call the model and store it). |
| `AI_MODEL_RANKING` | Agent only, with `LLM_PROVIDER=openrouter`. `artificial-analysis` switches on the dynamic model list (below). Unset or anything else: the model lists above, exactly as before. |
| `AA_API_KEY` | Agent only, a secret. The key of the Artificial Analysis API, sent as `x-api-key`. Used only with `AI_MODEL_RANKING`. Without it the dynamic list ranks the newest free models first. |
| `AI_ROUTE` | `cloud` (default): the agent does the AI work as above. `operator`: each job tries recorded answers first, then the owner's laptop (the operator runner below), and only when no laptop is online the agent's own model. |
| `AI_ROUTE_TAG` | Routing tag of this stack, default `default`. A hand-off carries it and only an operator runner with the same `OPERATOR_TAG` takes the event, so two stacks that share one database never take each other's events. |
| `DEMO_SANDBOX_DAYS` | Agent only. An unused demo copy older than this many days is removed by the agent's hourly cron. Default 7, `0` switches the sweep off. |
| `LANDING_URL` | Web app only (the live app sets it in `apps/web/wrangler.jsonc`). The address of the landing site: when it is set, a visitor who is not signed in at `/` is sent there. Not set on a run of your own, so `/` shows the built-in landing page. |
| `JEMMA_DEMO` | Web app only. `1` turns on the demo copy of a made-up school (`/demo`, the design kit at `/kit`, the sample papers and files, made-up learners). `./start.sh` sets it for local runs and CI; the live app leaves it unset, so all of that is off there. The unit tests run with it on. |
| `JEMMA_EMAIL_CODES` | Web app only. `1` shows "Email me a code instead" on the sign-in page. A code needs an email sender: `./start.sh` sets it (the local stack catches the emails). The live app leaves it unset until an email sender of its own is set up in Supabase (the built-in one only reaches the project team). |
| `OPENROUTER_API_KEY` | Key for the free models. |
| `AGENT_URL` | Where the web app posts events, `http://localhost:8787` locally. |
| `EVENTS_SECRET` | Shared secret between web and agent for `POST /events`. |
| `READ_CONFIDENCE_MIN` | Answers read below this go to Needs you (default 0,8). |

### Judges: `AI_MODE=cache`

Every judge sandbox has the same synthetic inputs, so one warm-up run fills `ai_replays` and every later run is near instant. Set `AI_MODE=cache` on the preview agent, then run the demo path once (`demo-path.spec.ts` or by hand). After that a judge's papers, reports and lessons come from storage in seconds. A miss (an edited paper, a new prompt) calls the model live and stores the answer, so live runs still work.

A replay is keyed by the model id and the call, and an answer is stored under the id of the model that wrote it. With more than one id in `LLM_MODEL` and `LLM_MODEL_FALLBACKS` (or the vision pair), `cache` and `replay` look the call up under every id at once, the free ids first, before any model is called. So the paid id can be first and the answers recorded under the free ids (the whole demo path, `fixtures/ai-replays.json.gz`) still hit with no new call. Only a call with no answer under any id goes to a model (the first id of the list, the paid one when paid hosting is switched on), and its answer is stored under the id of the model that answered. `AI_RECORDED_IDS` adds ids to that lookup that are never called (the old free OpenRouter ids that the demo path was recorded under, now that the models are on Workers AI). Uuids and dates in a call are left out of the key, so an answer recorded in one sandbox replays in another.

### Cloudflare Workers AI (the hosted demo)

The hosted demo's AI runs on Cloudflare Workers AI: DeepSeek V4.1 Flash first, then GLM 5.3 Flash, then Inkling 2 Small (Thinking Machines), for text and for photos. All three are open weights: MIT for DeepSeek and GLM, Apache 2.0 for Inkling (Hugging Face `thinkingmachines/Inkling-2-Small`, not gated). The agent calls them through its built-in Workers AI binding (`env.AI`, set in `apps/agent/wrangler.jsonc`), so no API token and no account id are needed. For these models the binding takes the same OpenAI chat body as the REST endpoint and returns the same completion object (`bindingFetch` in `packages/profiling/src/ai/models.ts`). A binding error becomes status 429 (when the message says capacity, rate or too many) or 500, an output without `choices` becomes 502, so the retries and the fallbacks work as with any provider. Outside a Worker (a local script) the same models are called over REST at `https://api.cloudflare.com/client/v4/accounts/<account id>/ai/v1` with `CF_ACCOUNT_ID` and `CF_AI_TOKEN`. Prices read on 16 November 2026: DeepSeek V4.1 Flash $0.300 per million input tokens and $1.200 per million output tokens, GLM 5.3 Flash $0.150 and $0.500, Inkling 2 Small $0.300 and $1.000; the first 10,000 Neurons a day are free, and these models need a paid billing method on the Cloudflare account (binding calls are billed to the account like REST calls). About 1.3 US cents per lesson on DeepSeek. Measured in a probe on 16 November: a lesson in 46.9 seconds (15 of 15 answers correct) and a photo of five handwritten answers in 4.3 seconds on DeepSeek; GLM took 99.7 seconds for a lesson and 2.4 seconds for the photo. In a test on 16 November 2026 through Workers AI, Inkling 2 Small wrote a real Grade 10 lesson in 10.0 seconds with all 15 answers correct (3 of them in a format Jemma could not mark, which `save_lesson` drops) and read a handwriting photo right in 2.6 seconds. It went live on 16 November 2026 at 15:29 (East Africa Time) and the live check passed: a practice lesson was saved 32 seconds after the request, a paper photo was marked in 17 seconds, and every answer came from DeepSeek V4.1 Flash. When all three Cloudflare models fail the call falls back to the free OpenRouter models (Nemotron 3.5 Super VL, then Nemotron 3 Ultra for text or Gemma 4 31B for photos, 2 minutes a try each, so 3 Cloudflare tries of 150 seconds and 2 free tries of 120 seconds stay inside the 15 minutes of a queued job). When those fail too the first error goes up and the screen offers Try again.

To switch it on, set these on the preview agent (the Cloudflare worker `jemma-agent`), no code change after this release:

- `LLM_PROVIDER` and `VISION_PROVIDER`: `workers-ai`
- `LLM_MODEL` and `VISION_MODEL`: `@cf/deepseek-ai/deepseek-v4.1-flash-1017`
- `LLM_MODEL_FALLBACKS`: `@cf/zai-org/glm-5.3-flash,@cf/thinkingmachines/inkling-2-small,openrouter:nvidia/nemotron-3.5-super-vl:free,openrouter:nvidia/nemotron-3-ultra-550b-a55b:free`
- `VISION_MODEL_FALLBACKS`: `@cf/zai-org/glm-5.3-flash,@cf/thinkingmachines/inkling-2-small,openrouter:nvidia/nemotron-3.5-super-vl:free,openrouter:google/gemma-4-31b-it:free`
- `AI_RECORDED_IDS`: `nvidia/nemotron-3.5-super-vl:free,nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free`

No `CF_ACCOUNT_ID` and no `CF_AI_TOKEN`: with a token set the agent would use REST instead of the binding, so do not set one. `AI_MODE` stays `cache` and `AI_MODEL_RANKING` stays unset. `AI_RECORDED_IDS` is what keeps the demo path's recorded answers (saved under the old free ids) hitting while every live call goes to Cloudflare first: an id that is only in that list is looked up and never called. The free fallback needs `OPENROUTER_API_KEY` on the agent (free models need no credit). To go back to Cloudflare only, set both fallback variables to `@cf/zai-org/glm-5.3-flash,@cf/thinkingmachines/inkling-2-small`.

To go back to the free OpenRouter models, set `LLM_PROVIDER=openrouter`, `LLM_MODEL=nvidia/nemotron-3.5-super-vl:free`, `LLM_MODEL_FALLBACKS=nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free`, `VISION_PROVIDER=openrouter`, `VISION_MODEL=nvidia/nemotron-3.5-super-vl:free` and `VISION_MODEL_FALLBACKS=nvidia/nemotron-3.5-super-vl:free,google/gemma-4-31b-it:free`. `AI_RECORDED_IDS` may stay set.

### Paid hosting (built, off on the preview)

Paid hosting of the same open-weights model is built (P113) and switched off on the preview: the OpenRouter account has no credit, and the owner chose not to use it. Before the move to Cloudflare Workers AI the preview agent's `LLM_MODEL` and `VISION_MODEL` were `nvidia/nemotron-3.5-super-vl:free`. To switch paid hosting on, add credit to the OpenRouter account and give the preview agent (the Cloudflare worker `jemma-agent`) these four variables, text and photos alike, and no code change:

- `LLM_MODEL` and `VISION_MODEL`: `nvidia/nemotron-3.5-super-vl`
- `LLM_MODEL_FALLBACKS` and `VISION_MODEL_FALLBACKS`: `nvidia/nemotron-3.5-super-vl:free,nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free`

`LLM_PROVIDER` and `VISION_PROVIDER` stay `openrouter`, `AI_MODE` stays `cache`. The OpenRouter account needs credit. To go back to free only (how the preview ran before Workers AI), put the `:free` id in `LLM_MODEL` and `VISION_MODEL` and drop it from the fallbacks. A local run and CI keep their own values and are unchanged.

### Dynamic model list

With `AI_MODEL_RANKING=artificial-analysis` (and `LLM_PROVIDER` or `VISION_PROVIDER` set to `openrouter`) the agent picks its free models itself, every hour, instead of using only the ids in the env. Without that variable nothing changes: CI, local runs, the evals and goose keep using the env lists. For each model call:

1. **Read two lists.** OpenRouter's public list of models (`https://openrouter.ai/api/v1/models`, no key) says what each model can do. Artificial Analysis's free list (`https://artificialanalysis.ai/api/v2/language/models/free`, key in `AA_API_KEY`, sent as `x-api-key`) gives each model an Intelligence Index score. It comes in pages (`?page=1`, `?page=2`, and so on, up to 200 models a page): the pages are read one after the other while the answer says `has_more`, at most 10 pages. Each read (each page) has 5 seconds. If one page fails, the whole Artificial Analysis list counts as unread. An answer is kept for 1 hour in each worker, so most calls read nothing. A list that could not be read is asked for again after 5 minutes.
2. **Keep only models that can do the job.** A free listing (the id ends in `:free`) that takes tools and has a context of at least 131072 tokens. For a photo job it must also take images, so a text-only model never gets a photo job. Closed and open models are both allowed.
3. **Rank them.** With Artificial Analysis data: only models that have a score, best first (a tie goes to the larger context, then the id), and the first 4 are kept. A model is matched to its Artificial Analysis row by name. Both names are written in lowercase, `.`, `_` and spaces become `-`, parenthesised words in an Artificial Analysis name (`(Reasoning)`, `(Max)`) are dropped, and the trailing words `it`, `instruct`, `chat`, `preview`, `free` and `reasoning` are taken off, again and again. Size words (`31b`, `a4b`) and `vl` are kept, because they separate different models. The OpenRouter name, with and without its creator (`nemotron-3-ultra-550b-a55b` and `nvidia-nemotron-3-ultra-550b-a55b`), must equal the row's slug or its name, because Artificial Analysis slugs sometimes start with the creator. When several rows match (a reasoning and a non-reasoning run) the highest score counts. A model with no match, or with a match that has no score, is unrated and left out. Most rows of the free list have no score.
4. **No Artificial Analysis data** (no `AA_API_KEY`, or the read failed): the same ranking with OpenRouter's own copy of the index (`benchmarks.artificial_analysis.intelligence_index` in its list, models without it are left out), and only if no candidate has one, the 4 newest free models.
5. **Add the env ids.** The ids of `LLM_MODEL` and `LLM_MODEL_FALLBACKS` (or the vision pair) follow in their order, with no repeats. A paid id (no `:free`, the first model of "Paid hosting (built, off on the preview)") goes before the ranked ones and stays even if it is not free. A free id that OpenRouter no longer lists is skipped. For a photo job an id that OpenRouter lists as text-only is skipped.
6. **When a list is missing.** Without OpenRouter's list the env list is used as it is. If nothing is left after the filters, the env list is used. The list is never empty.

Any error from a model moves the call on to the next one (only a call the caller cancelled stops), and an error that says the model is gone, unpaid or refuses the caller (status 404 or 402, "no endpoints", "insufficient credits", "only available on agentic harnesses") is not tried again on the same model; this holds with the switch off as well. In the dynamic list a model whose try ends with a 4xx (other than 408 and 429) or such a message is left out of the ranked part for 1 hour, because OpenRouter refuses the free listing of some models to API callers (a pinned id is never left out). In the dynamic list a free model gets 2 minutes a try instead of 4 (a paid model keeps 90 seconds), so the longer list stays inside the 15-minute limit of a queued job. `cache` and `replay` look a recorded answer up under every id of the list and every id of the env, so answers recorded under a free id still hit with no model call.

To switch it on, set `AI_MODEL_RANKING=artificial-analysis` and `AA_API_KEY` (a secret); the model variables above stay as they are. To switch it off, remove `AI_MODEL_RANKING`: the next call uses the env lists.

Live finding, 16 November 2026: with the list switched on, the top-ranked model `thinkingmachines/inkling-2-small:free` was refused by OpenRouter for API callers ("only available on agentic harnesses"), the chain stopped on that error, and jobs failed in demo copies for about two minutes until the variable was removed. The fix (any error moves on to the next model, a model that refuses is left out of the ranking for 1 hour) was proven against the real lists from a laptop: Inkling refused, `nvidia/nemotron-3.5-super-vl:free` answered in 1.3 s, and the second call skipped Inkling (0.8 s). The preview agent runs with `AI_MODEL_RANKING` off since 16 November, for the deadline: its models are the env lists, not the ranking.

Model rankings: Artificial Analysis (artificialanalysis.ai), free API, used with attribution.

## Free model notes (27 Oct)

- `nvidia/nemotron-3.5-super-vl:free` reads the curriculum PDF, the memo and the papers correctly and also writes text.
- `nvidia/nemotron-3-ultra-550b-a55b:free` is the text fallback. It often answers `Internal server error` on a whole lesson.
- `google/gemma-4-31b-it:free` was down (`Internal error encountered`) and cannot do provider-side structured output reliably.
- Free models fail often. Every model call retries a 429 or 5xx with backoff (2, 5, 10, 20 s), then tries the next id in the fallback list. One call gets 4 minutes (90 seconds for a paid OpenRouter id, one without `:free`): a timeout is not tried again on the same model, the next id in the list gets the call. A job that shows no sign of life for 16 minutes is put back on the queue, twice at most, then marked failed (see "When a job stops half way" in [architecture.md](architecture.md)).
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
- `pnpm evals --provider ollama` runs the same tasks on a Gemma 4 model served by Ollama on this computer (its own cap of 6 runs, its run folder starts with `local-`). It has only been tried with a fake goose and was never run on a model: the steps are in `docs/proof/local-model-2026-11-15.md`.
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

The live preview runs on Cloudflare Workers, as three Workers named in their `wrangler.jsonc` files: the web app `jemma-web` at https://jemma.ainative.ventures (`apps/web`, built with `pnpm --filter web build:cf`), the agent `jemma-agent` (`apps/agent`) and the landing site `jemma-landing` at https://getjemma.ainative.ventures (`apps/landing`, static files, deployed with its own script: `pnpm --filter landing run deploy`). The web app's `LANDING_URL` variable sends a visitor who is not signed in at `/` to the landing site; a run on your own machine has none, so `/` shows a built-in landing page. The old workers.dev address of the web app still answers. The settings of the deployed agent (for example `AI_MODE=cache`) are not recorded in this repository, and the deploy commands were not run for this document.
