# Teaching library generator

Writes the lessons of the teaching library offline, one JSON file per topic, with open-weights models: OpenCode's free models through the OpenCode CLI, or cheap paid ones through OpenRouter (`TEACH_BACKEND`). No database, no server, nothing deployed. The design is in `docs/superpowers/specs/2026-11-16-teaching-library-design.md`, the plan in `docs/superpowers/plans/2026-11-16-teaching-library.md`.

## Run it

```
pnpm teach:generate --dry-run                       # which files it would write
pnpm teach:generate --grade 6 --topic "Common fractions"
pnpm teach:generate                                 # every topic, pitch topics first, then Grades 12 down to 1
pnpm teach:generate --report                        # calls, failures, limit hits and average seconds per model, from the ledger
pnpm teach:import > lessons.sql                     # one SQL transaction with every ready lesson (it connects to nothing)
```

Two backends, chosen by `TEACH_BACKEND`:

- `opencode` (the default): OpenCode's free models. Daily free limits apply: a limited model rests for an hour.
- `openrouter`: the repo's AI SDK OpenRouter provider. The key is read from the file named by `TEACH_OPENROUTER_KEY_FILE` (outside the repo, never printed, never in the ledger). Default chain: `z-ai/glm-5.3-flash` (writes first), `deepseek/deepseek-v4.1-flash-1017` (checks: the reviewer is the next model after the writer), `deepseek/deepseek-v4-flash` (backup). Every call asks for low reasoning effort and usage accounting; the ledger records tokens (in, cached, out) and dollars per call. `--max-usd N` (default 8) stops the run when the dollars in the ledger, of every run so far, reach N. A rate limit (HTTP 429) rests a model two minutes; no credit (402) or a refused key (401, 403) stops the run.

```
TEACH_BACKEND=openrouter TEACH_OPENROUTER_KEY_FILE=/path/to/key.txt pnpm teach:generate --samples --max-usd 1
```

Prompts are built with the fixed text first (rules, schema, the topic's reference, identical for every lesson of a topic) and the part that changes last (the lesson, its objectives, the problems to fix), so a provider's prompt cache can serve the front.

Options: `--samples` (the five sample topics), `--max-usd N`, `--grade N`, `--topic "<name without (Term N)>"`, `--concurrency 4`, `--limit-calls N` (stops when the ledger holds N calls), `--max-lessons N` (at most N lessons a topic), `--retry-failed`, `--max-wait-min 120` (the longest the run waits for models that are out of free quota), `--timeout-sec 300`.

`TEACH_MODELS` (a comma list such as `opencode/hy4-flash-free,opencode/beam-free`) replaces the ranked default chain in `chain.ts`. Only `opencode/<name>-free` models are accepted.

## What it does for one topic

1. Reads the reference: a Siyavula chapter (Creative Commons Attribution, Grades 7 to 12) cached under `content/reference/` (git-ignored), or the CAPS facts of the topic. Grade 6 Common fractions uses the Grade 7 Siyavula chapter on fractions, and its credit line says so.
2. One outline call: 1 to 8 lesson titles with objectives.
3. For each lesson: a write call, the code checks (`checks.ts`), a review call by a different model, and one rewrite with the problems listed when anything is wrong. Still wrong: the lesson is `failed`.
4. Writes `content/lessons/grade-<n>/<slug>.json` whole (temp file and rename). Both term rows of a topic ("Common fractions" and "Common fractions (Term 4)") share one file.

## Safe to stop and start

- Finished topics are skipped. Progress is saved after every lesson in `content/lessons/.progress/` (git-ignored), so a stopped topic carries on from its saved lessons.
- A topic with a failed lesson, or one that failed twice, is skipped until `--retry-failed`; then only the failed lessons are written again and the ready ones stay as they are. `content/lessons/fail-list.json` says what failed and why.
- `content/lessons/ledger.jsonl` has one line per model call (time, model, kind, seconds, tokens, ok, limited). It is the counter of any call cap.
- A model that answers "Free usage limit reached" is left alone for 60 minutes. The ledger remembers it: a restarted run does not ask a model again whose latest ledger line, less than an hour old, is a limit. When every model is resting the run sleeps (in 5 minute steps) until the first one is back, up to `--max-wait-min`.
- Ctrl-C stops after the topics in progress; a second Ctrl-C stops at once.

## How a model is called

`opencode.ts` runs `opencode run --pure --print-logs --log-level ERROR --format json --title teach -m <model> "<message>" -f prompt.md` in a fresh empty folder with its own config (every tool and permission denied, no MCP servers, no plugins) and `XDG_CONFIG_HOME` pointing at an empty folder, so nothing of the machine's own OpenCode setup is loaded. A model that is out of free quota prints nothing and OpenCode retries for ever, so the limit is read from stderr and only the child process it started is killed.

## Tests

`pnpm exec vitest run scripts/teach/test/<file>`. None of them touches the network, a database or a model (a fake runner and a fake `opencode` program stand in).
