# Operator path with goose, 11 Nov 2026

Packet P57: the owner's Mac does the hosted app's AI work with goose (open source, Apache-2.0) and a free open-weights model on OpenRouter, instead of Claude Code. Synthetic data only, on the team's demo database. No paid model, no Claude Code run and no Codex run were used. No tokens or secrets are in this file.

## Result in plain words

- It works. Model steps missed the recorded answers in the cloud, were handed to the laptop, and goose ran them through Jemma's own MCP server. 12 agent runs, all 12 finished as done. Three plain-code steps ran inside the operator with no agent.
- Seven of the eight AI job kinds ran through goose, each at least once: `read_key` (2), `read_paper` (2), `diagnose` (1), `class_report` (1), `write_lesson` (2), `guidance` (3) and `long_view` (1). The eighth, `draft_map`, was not run, by design: it is never handed to the laptop, because a curriculum PDF cannot come back through MCP (the same limit as in the Claude proof).
- The borrowed MCP server worked inside the same runs. In the `class_report` and `guidance` runs goose wrote a Markdown copy of what it saved into the reports folder with the official filesystem server: four `write_file` calls, three files (two guidance runs were for the same learner, so the second wrote over the first).
- Vision worked through MCP on an open-weights model. goose read the memo (10 answers, which the teacher step of the spec approved) and a snapped paper (Amina's, 6 of 10, the same score the seeded demo expects for that paper).
- The 10 runs whose model was read back were all answered by the first model in the list, `nvidia/nemotron-3.5-super-vl:free`. No run fell back to another model. The model of 2 runs (6 and 9) was not recorded (see below).
- One event ended `failed`, and goose did not cause it. The `paper.checked` event in `proof-tail.ts` stops at its postconditions with "no planned session" for three other learners, because the seeded `marked` sandbox has open gaps for them and a `paper.checked` plan only plans the checked learner. The Claude proof (R4) stopped the same way. All four jobs that goose ran inside it finished as done.
- Agent time was 756 seconds (12.6 minutes) for the 12 runs, 48 tool calls in all, 794,043 tokens in and 53,515 out for the 10 runs whose tokens were read back. The cost was 0 (free tier).

## Setup

| Thing | Value |
| --- | --- |
| goose | 1.45.0, started by the operator for every job (one process per model tried). No sign-in: it uses an OpenRouter key from `.env.local`, which the operator keeps for goose only and removes for Claude Code and Codex. |
| Models | The default list, nothing set: `nvidia/nemotron-3.5-super-vl:free` first, then `nvidia/nemotron-3.5-lightning:free`, `nvidia/nemotron-3-ultra-550b-a55b:free`, `google/gemma-4-31b-it:free`. All free OpenRouter ids. |
| Database | The team's demo database (migrations 0001 to 0019, recorded answers loaded). Every script made its own made-up school and deleted it at the end. A read-only check afterwards found no one-time token, no presence row and no unsettled event of this tag. |
| Agent worker | local `wrangler dev` on 8756 with `wrangler.local.jsonc` (no Workers AI binding). The settings were given on the command line, `.dev.vars` was not touched: `AI_ROUTE=operator`, `AI_ROUTE_TAG=p57-goose`, `AI_MODE=replay`, `TTS_PROVIDER=none`, and `LLM_MODEL`, `VISION_MODEL` and both fallback lists set to `nvidia/nemotron-3.5-lightning:free`, an id with no recording (the recorded answers hold three other ids). A routed event always replays first, so every model step missed and was handed to the laptop. A throwaway worker showed first that a `--var` on the command line wins over the same name in `.dev.vars` in this wrangler version. |
| Web app | local dev server on 3256, started by Playwright, phone project, headless, `--workers=1`, `SLOW_AI=1 SEED_MAP=1`. |
| Operator | `JEMMA_RUNNER_AGENT=goose OPERATOR_TAG=p57-goose OPERATOR_MAX_JOBS=14 OPERATOR_CONCURRENCY=1 pnpm operator` from the worktree, `OPERATOR_TRACE` pointing outside the repo. Its first line was `operator starting: goose (nvidia/nemotron-3.5-super-vl:free), 1 at a time, tag p57-goose`. The tag kept it away from every other stack's events. |
| Other goose runs | Before each script I checked that no goose process was running (`pgrep -x goose`). None was, each time. A goose run that another worker started in the middle of a multi-step event could not have been seen. |
| Model and tokens per run | Read from the runner's own `log_external_calls` rows (`engine`, `model` and token counts) by a read-only SELECT every 3 seconds, because each script deletes its school when it ends. Tool call counts come from the operator trace. |

## The runs, in order

- **proof-tail**: `packages/runner/scripts/proof-tail.ts`, one `paper.checked` event on a `marked` sandbox.
- **proof-guidance**: `proof-guidance.ts`, a real teacher note and then a real parent activity, each one event.
- **proof-session**: `proof-session.ts`, a `session.finished` event on a `session_done` sandbox.
- **demo path, pass 1 and 2**: a temporary copy of `demo-path.spec.ts` (not committed, deleted after) that runs steps 1 to 3 of the spec with `SEED_MAP=1` and stops at the first marked paper. Once the operator was running the first paper event, the copy cancelled the other four paper events of the school, so only one paper was read per pass. Pass 1 lost the model of the paper read (the school was deleted a moment before its run row was written). Pass 2 waited for the event to settle first and caught both rows.
- **long view**: one `long_view.requested` event on a `marked` sandbox, from a temporary script (not committed). It was not in the packet's list. I added it with spare runs under the cap, to cover the last job kind that could go through the laptop.

| Run | Script | Event type | Job | Seconds | Outcome | Tool calls | Model that answered | Tokens in / out |
| ---: | --- | --- | --- | ---: | --- | ---: | --- | --- |
| 1 | proof-tail | paper.checked | diagnose | 52 | done | 5 | nvidia/nemotron-3.5-super-vl:free | 80,691 / 4,540 |
| 2 | proof-tail | paper.checked | class_report | 53 | done | 6 | nvidia/nemotron-3.5-super-vl:free | 114,646 / 5,255 |
| code | proof-tail | paper.checked | plan_next_session | 1 | done | 0 (no agent) | - | - |
| 3 | proof-tail | paper.checked | write_lesson | 120 | done | 3 | nvidia/nemotron-3.5-super-vl:free | 77,207 / 10,628 |
| 4 | proof-tail | paper.checked | guidance | 57 | done | 5 | nvidia/nemotron-3.5-super-vl:free | 102,625 / 6,189 |
| 5 | proof-guidance | observation.added | guidance | 61 | done | 5 | nvidia/nemotron-3.5-super-vl:free | 104,346 / 6,656 |
| 6 | proof-guidance | activity.added | guidance | 56 | done | 5 | not recorded | not recorded |
| code | proof-session | session.finished | update_learner_profile | 2 | done | 0 (no agent) | - | - |
| code | proof-session | session.finished | plan_next_session | 1 | done | 0 (no agent) | - | - |
| 7 | proof-session | session.finished | write_lesson | 90 | done | 3 | nvidia/nemotron-3.5-super-vl:free | 72,482 / 8,429 |
| 8 | demo path, pass 1 | key.snapped | read_key | 44 | done | 4 | nvidia/nemotron-3.5-super-vl:free | 56,532 / 2,248 |
| 9 | demo path, pass 1 | paper.snapped | read_paper | 83 | done | 3 | not recorded | not recorded |
| 10 | demo path, pass 2 | key.snapped | read_key | 53 | done | 3 | nvidia/nemotron-3.5-super-vl:free | 59,315 / 3,842 |
| 11 | demo path, pass 2 | paper.snapped | read_paper | 38 | done | 3 | nvidia/nemotron-3.5-super-vl:free | 57,968 / 2,305 |
| 12 | long view | long_view.requested | long_view | 51 | done | 3 | nvidia/nemotron-3.5-super-vl:free | 68,231 / 3,423 |

Every run is done, so there is no failure note to give. The model and tokens of runs 6 and 9 are "not recorded": the other 10 runs have them.

Tool calls in order, per job (the number before is the run):

- 1 `diagnose`: jemma.get_class_results > jemma.get_learner_profile > jemma.get_child_context > jemma.update_learner_profile > jemma.complete_job
- 2 `class_report`: jemma.get_job > jemma.get_class_results > jemma.class_gap_report > files.create_directory > files.write_file > jemma.complete_job
- 3 `write_lesson`: jemma.get_child_context > jemma.save_lesson > jemma.complete_job
- 4 `guidance`: jemma.get_learner_profile > jemma.subject_guidance > files.list_allowed_directories > files.write_file > jemma.complete_job
- 5 `guidance` (teacher note): jemma.get_learner_profile > jemma.subject_guidance > files.create_directory > files.write_file > jemma.complete_job
- 6 `guidance` (parent activity): the same five calls as run 5
- 7 `write_lesson` (after a session): jemma.get_child_context > jemma.save_lesson > jemma.complete_job
- 8 `read_key`: jemma.get_job > jemma.get_memo > jemma.save_answer_key > jemma.complete_job
- 9 `read_paper`: jemma.get_paper > jemma.mark_paper > jemma.complete_job
- 10 `read_key`: jemma.get_memo > jemma.save_answer_key > jemma.complete_job
- 11 `read_paper`: jemma.get_paper > jemma.mark_paper > jemma.complete_job
- 12 `long_view`: jemma.get_learner_history > jemma.save_long_view > jemma.complete_job

Totals: 12 agent runs (12 done) and 3 plain-code steps with no agent. Typical times: key 44 to 53 s, paper 38 to 83 s, diagnose 52 s, class report 53 s, lesson 90 to 120 s, guidance 56 to 61 s, long view 51 s.

## What the scripts saw

```
proof-tail: final event row: paper.checked, status failed, runner desktop,
  error "Jemma did not finish: no planned session for child ...; ... ; ..." (three learners)
  the jobs of this event that ran on goose: diagnose, class_report, write_lesson, guidance, each done
  activity_log lines written by the tools: update_learner_profile (3 gaps), class_gap_report (4 class gaps),
  class_gap_report (a 10 minute reteach), save_lesson (a 12-minute lesson)
  planned sessions 4, the planned lesson has 15 questions and 2 warm-up items
proof-guidance: teacher note: event done, runner desktop, claimed_by empty, route_tag p57-goose,
  the guidance card's updated_at moved, activity_log: subject_guidance "Used your note on Amina in her guidance card"
  parent activity: the same, the card moved again
proof-session: event done, route_tag p57-goose, activity_log: update_learner_profile (twice, the repeat
  after a hand-off that the Claude proof describes), save_lesson "Built tonight's 12-minute lesson"
long view: event done, two patterns saved as drafts for the teacher, activity_log:
  save_long_view "Updated a learner's Long view. 2 patterns wait for you."
```

For each event that ended done: `runner = desktop`, `claimed_by` empty, the tag on its payload, and no one-time token or presence row left over. The agent's own `complete_job` call did not settle an event in the middle of a plan; the operator settled it at the end.

The two demo path passes each ended `passed` (3.8 and 2.7 minutes). In both, the spec's own checks held: the sample curriculum map was approved, the memo was read and the key had 10 items and was approved, and the five sample papers were queued. Per pass the events were: `key.snapped` done, one `paper.snapped` done, four `paper.snapped` cancelled by the spec copy. In pass 2 the read paper's marks were 0, 0, 1, 0, 1, 1, 1, 0, 1, 1 for questions 1 to 10 (6 of 10). The Jemma server's own call log for the school showed, in order, `get_memo`, `save_answer_key`, `complete_job`, one `agent_run` row, then `get_paper`, `mark_paper`, `complete_job` and a second `agent_run` row.

## Three small fixes made on the way

All three are in this branch, each with tests written first.

1. **The trace was empty for goose.** The operator kept a line of the agent's stream only when `"assistant"` showed in its first 80 characters. A goose line puts `"role":"assistant"` near character 72 to 90, so `toolCalls` in the trace and the job report was always empty for goose. The rule is now the function `keepsToolLine(agent, line)`: claude and codex exactly as before, goose looks for `"role":"assistant"` in the first 200 characters. Tests (`operator-stream.test.ts`, 6): the goose sample file gives the same tool call list from the kept lines as from the whole file, and claude and codex keep the same lines as the old rule. The tool call numbers in the table above come from this.
2. **The goose model list ignored `.env.local`.** `gooseModels()` read only the shell environment. The operator script now builds the list from the merged environment (the file under the shell), prints its first model in the start line, and hands the same list to every agent run (`models` option of `startOperator`). Tests: `operatorModels` in `operator-env.test.ts` (2 new) and two in `operator.test.ts` (the fake run receives the model that is only in the merged env, first; with no list the run gets none). This was shown by unit tests only. The live runs here used the default list.
3. **The open-job script had its own project check.** `scripts/proof/run-open-job.ts` carried a copy of `assertDevProject` that named the old project. It now imports the shared guard from `packages/profiling/scripts/env`. `scripts-guard.test.ts` (4 new tests) checks that `run-real-job`, `run-open-job` and `export-replays` use the shared guard and have no copy, and that no script under `scripts/` or `packages/*/scripts/` other than `env.ts` holds a 20-letter project ref.

## How to rerun

1. Agent: from `apps/agent`, `pnpm exec wrangler dev --port 8756 --config wrangler.local.jsonc --show-interactive-dev-session=false --var AI_ROUTE:operator --var AI_ROUTE_TAG:p57-goose --var AI_MODE:replay --var TTS_PROVIDER:none --var LLM_MODEL:nvidia/nemotron-3.5-lightning:free --var LLM_MODEL_FALLBACKS:nvidia/nemotron-3.5-lightning:free --var VISION_MODEL:nvidia/nemotron-3.5-lightning:free --var VISION_MODEL_FALLBACKS:nvidia/nemotron-3.5-lightning:free`.
2. Operator: `JEMMA_RUNNER_AGENT=goose OPERATOR_TAG=p57-goose OPERATOR_MAX_JOBS=14 OPERATOR_CONCURRENCY=1 OPERATOR_TRACE=<a file> AGENT_URL=http://localhost:8756 pnpm operator`, with `OPENROUTER_API_KEY` in `.env.local`.
3. Scripts, each with `AGENT_URL=http://localhost:8756`: `pnpm --filter @jemma/runner exec tsx scripts/proof-tail.ts`, then `proof-guidance.ts`, then `proof-session.ts`.
4. The demo path up to the first marked paper: `SLOW_AI=1 SEED_MAP=1 AI_MODE=replay PLAYWRIGHT_PORT=3256 AGENT_URL=http://localhost:8756 pnpm --filter web exec playwright test <a spec that stops at the first marked paper> --project=phone --workers=1`. The stopping copy is not in the repository.

## NOT verified

- **The deployed preview.** Everything ran on a local agent worker against the demo database. The real cron did not run. The operator route is still off on the hosted demo.
- **The whole demo path through goose in one run.** The spec copy stopped at the first marked paper. Not run through goose: the other four papers, the class report and lessons after the share, Sipho's fix, the register, and the last steps of the spec. The same job kinds ran separately in `proof-tail`, `proof-guidance` and `proof-session`.
- **`draft_map`.** Never handed to the laptop, so it was not run through goose.
- **That what the free models saved is good.** Only that the saves went through and the event steps completed. One paper was marked 6 of 10, the score the seeded demo expects for it, but I did not compare the 20 answers of both passes with the paper by hand. Lesson, guidance and long view texts were not read for quality.
- **A fallback model.** No run needed one, so the fallback to the next model inside an operator run was not seen live. It is covered by the goose unit tests (`goose-run.test.ts`) only.
- **The model of runs 6 and 9.** Not recorded: the school was deleted before the read-only poll saw their run rows (my reading of why, not checked further). The other 10 rows name the first model.
- **`JEMMA_OPEN_MODEL` set only in `.env.local`.** Fix 2 above is unit-tested, but the live runs used the default list.
- **Two schools at once.** The operator ran one job at a time (`OPERATOR_CONCURRENCY=1`) so as to stay inside the free tier.
- **Free tier limits under load.** A goose process of another worker could not have been seen if it started in the middle of one of my events; the check was made before each script.
- **Claude Code and Codex.** Not run in this packet. Only goose.
- **Laptop sleep with the lid closed, and an operator on another network from the agent.**
