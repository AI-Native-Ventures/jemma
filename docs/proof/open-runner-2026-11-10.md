# P49 open runner proof, 10 Nov 2026

## Result

Jemma's runner now has a third engine: Goose, an open-source agent, driving a free open-weights model on OpenRouter, with Jemma's own MCP server and one borrowed MCP server (the official filesystem server). Four full `class_report` jobs ran through the desktop runner path on `jemma-dev` (runs 1 to 3 first, run 4 after P50a was merged, see "Run 4"). All four finished `done` on the first model in the list (`nvidia/nemotron-3.5-super-vl:free`), with no fallback needed. In each run the model chose its own tool calls, saved the class report through Jemma's MCP server, wrote a Markdown copy of the report with the borrowed file server, and called `complete_job`.

The model chose its own calls. Only run 1 called `jemma get_job`. Runs 2, 3 and 4 did not need it: the runner's prompt already carries the job and its ids, so a run without `get_job` is correct. The proof script no longer requires it (the first version did; the table below applies the corrected rule to the same recorded transcripts).

Live AI use: 4 live goose runs against OpenRouter (cap 12), all four succeeded. Everything else (about fifteen goose runs while building and testing) ran against a scripted stand-in for OpenRouter on a loopback port, or against an address that does not answer, so no model was called.

## What was proven, and the evidence

| Run | Sandbox | Event | Model that did it | Goose seconds | Whole job seconds | Tokens in / out | Cost |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| 1 | `49b54d9f-9c34-438f-b5b7-0cc8e5793e23` | `cb1ba5ce-2d4f-4622-b5b6-c2c44d7bbea9` | `nvidia/nemotron-3.5-super-vl:free` | 48.7 | 51.0 | 83,886 / 3,496 | 0 |
| 2 | `000acccf-fd82-4dfe-beba-1e332e8c681e` | `5a779b0d-2232-44e0-8f65-ddf11e37dc04` | `nvidia/nemotron-3.5-super-vl:free` | 82.4 | 84.8 | 86,311 / 4,447 | 0 |
| 3 | `95e74454-0e5f-4c2e-8f9c-36208360c25b` | `65e6420d-f31f-43fa-b546-57dfd709cc57` | `nvidia/nemotron-3.5-super-vl:free` | 54.8 | 57.3 | 82,178 / 2,904 | 0 |
| 4 | `df8ecd0c-65f8-409e-8d46-31e7389e2ed3` | `bc95e9e3-3776-4945-b583-95cdd1b4ef4f` | `nvidia/nemotron-3.5-super-vl:free` | 56.6 | 60.1 | 87,319 / 4,304 | 0 |

"Whole job seconds" runs from starting the runner to the end of the goose run. Tokens are what Goose reported on its final `complete` line (all turns of the run added up).

Tool calls in order, as parsed from each run's stream-json (`server__tool`). All answered without error.

| Run | Calls |
| --- | --- |
| 1 | `jemma__get_job`, `jemma__get_class_results`, `jemma__get_memo`, `jemma__class_gap_report`, `files__write_file`, `jemma__complete_job` |
| 2 | `jemma__get_class_results`, `jemma__get_memo`, `files__create_directory`, `jemma__class_gap_report`, `files__write_file`, `jemma__complete_job` |
| 3 | `jemma__get_class_results`, `jemma__get_memo`, `jemma__class_gap_report`, `files__write_file`, `jemma__complete_job` |
| 4 | `jemma__get_class_results`, `jemma__get_memo`, `jemma__class_gap_report`, `files__write_file`, `jemma__complete_job` |

Checks per run (done by `scripts/proof/run-open-job.ts` after the run, from the database and the files). `jemma get_job` is not a check any more.

| Check | Run 1 | Run 2 | Run 3 | Run 4 |
| --- | --- | --- | --- | --- |
| Heartbeat row scoped to the synthetic teacher, `chosen = goose` | pass | pass | pass | pass |
| Event settled `done`, runner `desktop`, claimed by the teacher, no error | pass | pass | pass | pass |
| `get_class_results`, `class_gap_report`, `complete_job`, `files write_file` called and answered | pass | pass | pass | pass |
| Order: reads, then the save, then the file copy, then `complete_job` | pass | pass | pass | pass |
| Reteach row passes `ReteachSchema`, and `why`, `missing_basic`, `explanation` are set | pass | pass | pass | pass |
| Reteach row scoped to the sandbox class, test and school; topic belongs to the class map | pass | pass | pass | pass |
| Reteach row differs from the seeded row (written by this run) | pass | pass | pass | pass |
| Two `class_gap_report` activity rows, in the sandbox school and class | pass | pass | pass | pass |
| Report file exists and is not empty (1783, 2152, 1800, 2002 characters) | pass | pass | pass | pass |
| Report file cites question numbers | pass | pass | pass | pass |

The scoping and schema checks are the same ones the P48 proof used. Runs 1 to 3 were first scored with a version of the script that also required `get_job` first: run 1 passed 15 of 15 and runs 2 and 3 passed 13 of 15, the two misses being only the absent `get_job` (once as a missing call, once in the order check). Run 4 was scored by the corrected script and passed every check. The transcripts of runs 2 and 3 have reads, save, file copy and `complete_job` in the right order.

The report copies are in `docs/proof/open-runner/report-1.md` to `report-4.md`. Each names the questions the claims come from (for example "Q1, Q2, Q4" and "Source: marked test results, questions 1, 2 and 4"). Em dashes the model or goose wrote were replaced with a hyphen when the files were saved.

The raw stream-json of each run is in `docs/proof/open-runner/run-1.jsonl` to `run-4.jsonl`. Banner lines that are not JSON were dropped, one `jemma_attempt` line was added before each model's attempt, and the OpenRouter key, the bearer token and em dashes were removed. Before committing, all eight files were searched for the real OpenRouter key value (read from `.env.local`), for any authorization header text, and for the prefix OpenRouter keys start with: no match in any file. The bearer tokens were random per run, kept in memory, and deleted from `mcp_tokens` after each run (a follow-up query found zero `p49-open-runner-proof` rows, after run 4 as well).

## Run 4: the borrowed calls are logged (after merging P50a)

`develop` (with P50a: the `tool_calls` table, migration 0016 already on `jemma-dev`, and the real `log_external_calls` tool) was merged into this branch without conflicts. Then the local agent worker on port 8749 was started from the merged code and one more live `class_report` run was done (the 4th live run; model `nvidia/nemotron-3.5-super-vl:free`, 56.6 seconds, 87,319 tokens in and 4,304 out, event `bc95e9e3-3776-4945-b583-95cdd1b4ef4f`, sandbox `df8ecd0c-65f8-409e-8d46-31e7389e2ed3`). All checks passed, including the ones below. I checked the rows again with a separate SELECT afterwards.

- `log_external_calls` returned true (the runner's `onReport` callback gave `true`; the worker's `tools/list` had the tool).
- The `tool_calls` rows of that sandbox's school, in time order (6 rows):

| Time | via | server | tool | engine | model | event | Input, output |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 09:34:42 | mcp | jemma | get_class_results | none | none | none | in 49 characters, out 7,366 |
| 09:34:43 | mcp | jemma | get_memo | none | none | none | in 49, out 711 |
| 09:35:03 | mcp | jemma | class_gap_report | none | none | none | in 1,099, out 1,242 |
| 09:35:18 | runner | files | write_file | goose | `nvidia/nemotron-3.5-super-vl:free` | this event | in 176, out 171 |
| 09:35:22 | mcp | jemma | complete_job | none | none | this event | in 66, out 11 |
| 09:35:31 | runner | runner | agent_run | goose | `nvidia/nemotron-3.5-super-vl:free` | this event | in 2, out 53 |

- The runner rows: one `files` / `write_file` row (via `runner`, engine `goose`, the model id, `ok` true, input has `path` and `content`, output holds the file server's answer) and exactly one `agent_run` usage row whose output is `{"costUsd":0,"inputTokens":87319,"outputTokens":4304}`. The server trims any string over 2,000 characters in the log, so the report text in the `write_file` input shows as `<2002 characters>`; the path is kept.
- Server-side rows (via `mcp`): one for each Jemma tool the model called (`get_class_results`, `get_memo`, `class_gap_report`, `complete_job`), counts equal to the calls in the transcript. The server cannot tell which engine or model is behind a token, so those rows have no engine or model, and an event id only where the input carries one (`complete_job`).
- No token or key: the rows of that school were searched for the bearer token, the OpenRouter key and the word "bearer": no match. The saved stream is `docs/proof/open-runner/run-4.jsonl` with the same search (no match) and `report-4.md`.

## Failures

- Live runs: none. 3 of 3 finished on the first model. The fallback models were never tried live, and `google/gemma-4-31b-it:free` (down on 10 Nov per the packet) was never reached.
- In runs 1 to 3 the borrowed-call report (`log_external_calls`) answered false: the worker on this branch then had 19 tools and `log_external_calls` was not one of them (checked with `tools/list` for each run), because P50a was not merged yet. The runner swallowed it and the jobs were not affected, which is the unit-tested "tool missing" path seen once for real. After P50a was merged (run 4) it answered true.
- Rehearsal failures (stand-in provider, no live model). These are what the building and testing found, and each one changed the code:
  - Goose 1.45.0 with `--no-profile` ignores the recipe's own extensions. The model was offered `tools: []` and every call came back `-32002: Tool 'jemma__get_job' not found. Available tools: []`. Without `--no-profile` the same recipe offers all 16 file tools. `goose recipe validate` passes either way.
  - The filesystem server took goose's working folder as its allowed folder, so a write to the reports folder was refused (`Access denied - path outside allowed directories`). See the security note below.
  - A prompt containing `{{ x }}`, `{% x %}` or `{# x #}` makes goose reject the recipe (`Missing definitions for parameters in the recipe file: name`). Those openers are now written as template expressions that print them. A `{% raw %}` block does not work for `{{`.
  - A provider error answers with exit code 0 and is carried as plain assistant text, for example `Ran into this error: Server error: Server error (500 Internal Server Error) ...` or `Network error: Could not connect to 127.0.0.1:9`. The exit code says nothing about failure here. The runner decides from the tool calls only.
  - Goose keeps going when an extension fails to start (`Warning: Failed to start extension 'jemma' ... continuing without it` on stderr) and the model then talks about missing tools. The runner now fails the job at once with a plain note and does not try the other models.
  - A tool error from an MCP server (for example the file server refusing a path) arrives as `toolResult.status: "success"` with `value.isError: true`. The parser counts that as an error.
- Fallback rehearsal with the real goose: the stand-in answered HTTP 500 for the first model. Attempt 1 ended `failed` with goose's error text and no save, attempt 2 on the next model finished `done`, and the event settled `done`. Not a live proof.

## Security note: the borrowed server needs `--confine-roots`

Goose tells every MCP server its own working folder as a "root". The filesystem server's rule is that roots replace the folders given on its command line. So without `--confine-roots` the file server was limited to goose's working folder (the job's temp folder) and not to the reports folder. That folder holds the recipe file, and the recipe holds the bearer token. Checked with the real goose and the real server (stand-in provider, a recipe with a fake token):

- Without `--confine-roots`: `read_text_file` on the recipe succeeded and returned its text.
- With `--confine-roots`: the same read answered `Access denied - path outside allowed directories`, and `write_file` inside the allowed folder worked.

The recipe now passes `--confine-roots`, so the server can only see the reports folder, whatever folder goose reports. This is the "path-escape protection" the borrowed server is there for. It is guarded by an opt-in test (`test/goose-real.test.ts`, see below).

## Proof: goose stays out of the owner's own folders

Goose runs with `GOOSE_PATH_ROOT` set to a folder inside the job's temp folder, and `GOOSE_DISABLE_KEYRING=1`.

- Reads. `test/goose-real.test.ts` (opt-in, real goose, stand-in provider, no model) makes a stand-in home folder whose goose config folder holds a hints file with a canary string. Goose puts a hints file into the model's prompt. Run without `GOOSE_PATH_ROOT` (the control), the canary reached the model. Run through `runJob`, it did not. Removing `GOOSE_PATH_ROOT` from `gooseEnv` makes that test fail.
- Writes. In the same test, after a `runJob` run the stand-in home folder holds only the config folder the test made and npm's own `.npm` cache (from `npx`, not goose). The control run did create `.local/share/goose` and `.local/state/goose` there, so the check can see a write.
- The owner's real folders. Listing, sizes and mtimes of `~/.config/goose`, `~/.local/share/goose` and `~/.local/state/goose` (and the other places goose could use: `~/.cache/goose`, `~/Library/Application Support/goose`, `~/Library/Caches/goose`, `~/.goose`) were identical before and after the whole runner suite with `JEMMA_GOOSE_REAL=1` (58 tests, including the real-goose ones through `runJob`). Before and after also matched around the earlier real-goose test alone.
- Keychain. `GOOSE_DISABLE_KEYRING=1` is in the child's environment on every run (asserted by a unit test through the fake goose and by `gooseEnv`'s test). Goose printed no keychain prompt and no dialog appeared. I did not read keychain activity directly (the `security` command is off limits), so this is the setting plus no prompt, not an observation of the keychain.
- What the runner does not isolate: `npx` keeps its cache in the user's `~/.npm` (that is how the file server is fetched), and the reports folder is written by design.

Disclosure: before the isolation existed, my investigation runs of goose (09:20 to 09:35 on 10 Nov, stand-in provider and one unreachable-provider run) used the real goose folders, one mutation check of the isolation (about 10:38, on purpose, isolation removed) did the same, and the offline `goose recipe validate` and `--render-recipe` test ran without isolation until I found it and fixed it (it now uses a throwaway root). The coordinator's own spike also wrote there earlier. So `~/.local/share/goose` and `~/.local/state/goose` hold log files, `projects.json` and session database changes from today. `~/.config/goose` was never changed (its mtimes are from 28 Aug and 3 Nov). Those logs hold only stand-in prompts and fake values (for example the fake token `test-token` from a scratch recipe). None of the three live runs is in them (their prompts name Amina and none of the real logs does; those runs happened with the isolation on). I left those files alone because they are the owner's folders and the spike's files are mixed in with mine.

## Proof: the borrowed-call report matches the contract

The payload `reportCalls` sends to `log_external_calls` is `{ eventId, engine, model, usage, calls }`: `engine` is `claude`, `codex` or `goose`, `model` is a string or null, `usage` is `{ inputTokens, outputTokens, costUsd }` or null, and each call is `{ server, tool, input, output, ok, at }` with `at` an ISO time. Only calls whose server is not `jemma` go in, at most 50. Three tests check the exact key sets (an extra field on a call, such as the transcript's `answered`, is stripped): `test/report-calls.test.ts`, `test/goose-run.test.ts`, and `test/goose-real.test.ts` for a real goose run (calls `files.list_allowed_directories` and `files.write_file`, usage 30 / 6 for three requests of 10 / 2 tokens, model `stand-in/model:free`). After P50a was merged, the payload was also compared with the real tool's schema (`packages/profiling/src/tools/save/log-external-calls.ts`: `engine` is `claude`, `codex` or `goose`, `model` and `usage` can be null, at most 50 calls, each call has `server`, `tool`, `input`, `output`, `ok` and an ISO `at`, and a call to server `jemma` is rejected). It matches, and run 4 below was accepted by it.

## Why the borrowed server

Borrowed: the official MCP filesystem server, because sandboxed, allow-listed file access with path-escape protection is security code we should not write and audit ourselves.

## Versions and licences

- Goose 1.45.0 (`/Users/mac/.local/bin/goose`). Licence: Apache-2.0 (the `LICENSE` of the `block/goose` repository, read on 10 Nov 2026).
- `@modelcontextprotocol/server-filesystem` pinned to 2.2.0 (the npm `latest` on 10 Nov 2026, published 4 Nov). Its `package.json` says `SEE LICENSE IN LICENSE`, but the npm tarball has no licence file. Its README says MIT. The repository's root `LICENSE` says the MCP project is moving from MIT to Apache-2.0 (new code is Apache-2.0, code from authors who did not yet agree stays MIT). So: MIT, moving to Apache-2.0. Both are permissive.
- It runs through `npx -y @modelcontextprotocol/server-filesystem@2.2.0 --confine-roots <reports folder>`, started by goose from the recipe. First use downloads it from npm.
- `@modelcontextprotocol/sdk` 1.32.2 (the pin `packages/profiling` already uses) was added to `packages/runner` for the borrowed-call report.
- Models, in order: `JEMMA_OPEN_MODEL` (default `nvidia/nemotron-3.5-super-vl:free`), then `JEMMA_OPEN_MODEL_FALLBACKS` (default `nvidia/nemotron-3.5-lightning:free,nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free`). Each model is tried once. A model is only replaced when the run failed and no Jemma save tool had succeeded (or may have: a save that was asked and never answered counts as maybe saved). After a save, the job is never run again.
- Reports folder: `JEMMA_REPORTS_DIR`, default `<home>/Jemma/reports`, created if missing (mode 0700). The proof used a throwaway folder in the system temp directory, not the default.

## How the engine is built

- `packages/runner/src/goose.ts`: the recipe writer (file mode 0600 in the job's temp folder, the token never in argv), the model list, the reports folder, the extra prompt step for `class_report` and `guidance` (a plain Markdown copy of what was saved, written with the file server before `complete_job`).
- `packages/runner/src/run.ts`: the goose branch of `runJob`, with the fallback rule and the timeout (one timeout for the whole job, the whole process tree is killed).
- `packages/runner/src/transcript.ts`: `parseTranscript('goose', ...)`. `completed` is `done` only when `jemma__complete_job` was asked with status `done` and answered with success and no `isError`. It also returns `calls` (server, tool, input, output, ok, time) and `usage`. The existing `toolCalls` list of names is unchanged.
- `packages/runner/src/report-calls.ts`: after a run, calls the Jemma MCP tool `log_external_calls` with the borrowed calls (never Jemma's own, at most 50) and the usage. Any failure is swallowed.
- `packages/runner/src/agents.ts`: `detectGoose()` (installed, version, and signed in means `OPENROUTER_API_KEY` is set). `detectAgents()` still returns only `{ claude, codex }`.
- Goose runs with its own empty config folder (`GOOSE_PATH_ROOT` inside the job's temp folder) and `GOOSE_DISABLE_KEYRING=1`. No extension from the user's own goose setup can load, there is no keychain access, and goose's request logs (which hold the prompts) are deleted with the job's folder.

## Where this differs from the packet

1. `gooseArgs` has no `--no-profile` (see Failures). Isolation comes from the empty goose config folder instead.
2. The file server gets `--confine-roots` (see the security note).
3. `parseTranscript` keeps `toolCalls: string[]` as it was (an existing test and `scripts/proof/run-real-job.ts` use it). The structured list the packet calls `toolCalls` is `calls`.
4. `calls` and `usage` are filled for goose only. Claude and Codex give `calls: []` and `usage: null`. For them the borrowed-call report finds nothing to say and is skipped.
5. The `open-job` script runs through `node --import tsx --import ../profiling/scripts/register-md.mjs` because the job plan code loads the prompt `.md` files.
6. A goose run that cannot start the `jemma` extension fails at once and does not try other models.
7. `@modelcontextprotocol/sdk` is a declared dependency of `packages/runner` (same exact pin as `packages/profiling`), with 3 lines in `pnpm-lock.yaml`.
8. `apps/desktop/src/main.ts`: `NAMES` gets `goose: 'Goose'`. Without it the typecheck of `apps/desktop` fails on `Record<AgentName, string>`. The desktop UI does not offer goose.
9. The goose job prompt gets one extra sentence before the packet's copy step: "Extra step for this run, and it is allowed even though the lines above say to use only the Jemma tools."

## How to run it again

```bash
# agent worker on 8749 (local queue, AI_MODE replay so no cloud model is called)
pnpm --filter agent exec wrangler dev --port 8749 --var AI_MODE:replay --show-interactive-dev-session=false
# in another terminal: 3 runs, each in a fresh marked sandbox on jemma-dev; --live-used says how many live runs are already spent
pnpm --filter @jemma/runner open-job --runs 3 --live-used 0
```

Unit tests: `pnpm --filter @jemma/runner exec vitest run`. The opt-in test with the real goose and the real file server (needs goose and npm access, calls no model):

```bash
JEMMA_GOOSE_REAL=1 pnpm --filter @jemma/runner exec vitest run goose-real
```

## NOT VERIFIED

- Vision jobs on goose (`read_paper`, `read_key`, the memo and curriculum reads). The proof job is text only.
- `read_paper` and `write_lesson` on goose. Only `class_report` ran live.
- The `guidance` job and its report copy on goose. The prompt step is unit tested, never run live.
- Windows and Linux. Only macOS was used.
- The fallback with real free-model failures. It was proven with a stand-in provider (and with a fake goose in the unit tests), never with a real provider outage.
- The default reports folder (`<home>/Jemma/reports`). The proof used a temp folder.
- Goose with a user who already has a goose config. The runner points goose at an empty config folder, and that was only checked on a Mac with no goose config at all.
- Whether the job still works when `npx` cannot reach npm (the file server is downloaded on first use), when `npx` is not on goose's PATH (a desktop app started from Finder has a short PATH; nothing here adds to it), or on Node older than 24 (the file server declares node >= 24; npm printed an engines warning on Node 22.20.0 and the server still started).
- The Electron desktop app and its UI. Goose is not offered there. Nothing in this proof touched the desktop app.
- Whether the other models in the list choose the same calls. No live run used the fallback models.
- Test-first order: the pure-code pieces (recipe, parser, report-calls) were written before their tests. Mutation checks were run afterwards (never treating a save as saved, and counting an errored answer as ok both fail tests).
