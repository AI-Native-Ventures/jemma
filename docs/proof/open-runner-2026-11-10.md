# P49 open runner proof, 10 Nov 2026

## Result

Jemma's runner now has a third engine: Goose, an open-source agent, driving a free open-weights model on OpenRouter, with Jemma's own MCP server and one borrowed MCP server (the official filesystem server). Three full `class_report` jobs ran through the desktop runner path on `jemma-dev`. All three finished `done` on the first model in the list (`nvidia/nemotron-3.5-super-vl:free`), with no fallback needed. In each run the model chose its own tool calls, saved the class report through Jemma's MCP server, wrote a Markdown copy of the report with the borrowed file server, and called `complete_job`.

One thing did not match the packet: in runs 2 and 3 the model did not call `jemma get_job` (the prompt does not tell it to, and the event id and ids are already in the prompt). Run 1 did. The other four required calls were made in every run. This is recorded as a failed check below, not hidden.

Live AI use: 3 live goose runs against OpenRouter (cap 12), all three succeeded. Everything else (about fifteen goose runs while building and testing) ran against a scripted stand-in for OpenRouter on a loopback port, or against an address that does not answer, so no model was called.

## What was proven, and the evidence

| Run | Sandbox | Event | Model that did it | Goose seconds | Whole job seconds | Tokens in / out | Cost |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| 1 | `49b54d9f-9c34-438f-b5b7-0cc8e5793e23` | `cb1ba5ce-2d4f-4622-b5b6-c2c44d7bbea9` | `nvidia/nemotron-3.5-super-vl:free` | 48.7 | 51.0 | 83,886 / 3,496 | 0 |
| 2 | `000acccf-fd82-4dfe-beba-1e332e8c681e` | `5a779b0d-2232-44e0-8f65-ddf11e37dc04` | `nvidia/nemotron-3.5-super-vl:free` | 82.4 | 84.8 | 86,311 / 4,447 | 0 |
| 3 | `95e74454-0e5f-4c2e-8f9c-36208360c25b` | `65e6420d-f31f-43fa-b546-57dfd709cc57` | `nvidia/nemotron-3.5-super-vl:free` | 54.8 | 57.3 | 82,178 / 2,904 | 0 |

"Whole job seconds" runs from starting the runner to the end of the goose run. Tokens are what Goose reported on its final `complete` line (all turns of the run added up).

Tool calls in order, as parsed from each run's stream-json (`server__tool`). All answered without error.

| Run | Calls |
| --- | --- |
| 1 | `jemma__get_job`, `jemma__get_class_results`, `jemma__get_memo`, `jemma__class_gap_report`, `files__write_file`, `jemma__complete_job` |
| 2 | `jemma__get_class_results`, `jemma__get_memo`, `files__create_directory`, `jemma__class_gap_report`, `files__write_file`, `jemma__complete_job` |
| 3 | `jemma__get_class_results`, `jemma__get_memo`, `jemma__class_gap_report`, `files__write_file`, `jemma__complete_job` |

Checks per run (done by `scripts/proof/run-open-job.ts` after the run, from the database and the files):

| Check | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| Heartbeat row scoped to the synthetic teacher, `chosen = goose` | pass | pass | pass |
| Event settled `done`, runner `desktop`, claimed by the teacher, no error | pass | pass | pass |
| `jemma get_job` called and answered | pass | FAIL (not called) | FAIL (not called) |
| `get_class_results`, `class_gap_report`, `complete_job`, `files write_file` called and answered | pass | pass | pass |
| Order: `get_job`, reads, save, file copy, `complete_job` (script check) | pass | FAIL (get_job absent; the other calls are in the right order) | FAIL (get_job absent; the other calls are in the right order) |
| Reteach row passes `ReteachSchema`, and `why`, `missing_basic`, `explanation` are set | pass | pass | pass |
| Reteach row scoped to the sandbox class, test and school; topic belongs to the class map | pass | pass | pass |
| Reteach row differs from the seeded row (written by this run) | pass | pass | pass |
| Two `class_gap_report` activity rows, in the sandbox school and class | pass | pass | pass |
| Report file exists and is not empty (1783, 2152, 1800 characters) | pass | pass | pass |
| Report file cites question numbers | pass | pass | pass |

The scoping and schema checks are the same ones the P48 proof used. In the script's own pass count, run 1 passed 15 of 15 and runs 2 and 3 passed 13 of 15: the two failures in each are the missing `get_job` call, counted once as a missing call and once in the ordering check (the order check expects `get_job` first).

The report copies are in `docs/proof/open-runner/report-1.md`, `report-2.md` and `report-3.md`. Each names the questions the claims come from (for example "Q1, Q2, Q4" and "Source: marked test results, questions 1, 2 and 4"). Em dashes the model or goose wrote were replaced with a hyphen when the files were saved.

The raw stream-json of each run is in `docs/proof/open-runner/run-1.jsonl`, `run-2.jsonl`, `run-3.jsonl`. Banner lines that are not JSON were dropped, one `jemma_attempt` line was added before each model's attempt, and the OpenRouter key, the bearer token and em dashes were removed. Before committing, all six files were searched for the real OpenRouter key value (read from `.env.local`), for any authorization header text, and for the prefix OpenRouter keys start with: no match in any file. The bearer tokens were random per run, kept in memory, and deleted from `mcp_tokens` after each run (a follow-up query found zero `p49-open-runner-proof` rows).

## Failures

- Live runs: none. 3 of 3 finished on the first model. The fallback models were never tried live, and `google/gemma-4-31b-it:free` (down on 10 Nov per the packet) was never reached.
- The borrowed-call report (`log_external_calls`) answered false in all three runs. The worker on this branch has 19 tools and `log_external_calls` is not one of them (checked with `tools/list` for each run). This is the expected path: P50a builds the tool. The runner swallowed it and the jobs were not affected. This is the unit-tested "tool missing" path, seen once for real.
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
- `log_external_calls` against the real tool. It did not exist on the worker used here.
- The default reports folder (`<home>/Jemma/reports`). The proof used a temp folder.
- Goose with a user who already has a goose config. The runner points goose at an empty config folder, and that was only checked on a Mac with no goose config at all.
- Whether the job still works when `npx` cannot reach npm (the file server is downloaded on first use).
- The Electron desktop app and its UI. Goose is not offered there. Nothing in this proof touched the desktop app.
- How often the model skips `get_job` (2 of 3 runs here) and whether other models in the list behave the same. No live run used the fallback models.
- Test-first order: the pure-code pieces (recipe, parser, report-calls) were written before their tests. Mutation checks were run afterwards (never treating a save as saved, and counting an errored answer as ok both fail tests).
