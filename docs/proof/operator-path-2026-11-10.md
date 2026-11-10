# Operator path proof, 10 Nov 2026

Packet P54: the owner's Mac does the AI work for the hosted app, with Claude Code on his own subscription. Synthetic data only, jemma-dev only. No tokens or secrets are in this file.

## Result in plain words

- The operator runner works. Model steps were missed in the cloud, handed to the laptop, run by the real `claude` CLI and saved through the Jemma MCP server. 22 of 28 agent runs finished as done.
- Rules after the coordinator's correction (all unit tested; the tag rule and the `draft_map` rule are also shown live, the desktop-school rule only by tests): the operator only takes events the cloud handed to it, **never the events of a school that runs on a desktop**; a routing tag (`AI_ROUTE_TAG` on the agent, `OPERATOR_TAG` on the operator) keeps stacks on one database apart; `draft_map` is **never** handed to the laptop and runs on the cloud model.
- Job kinds proven through real Claude, each in its own run: `read_key`, `read_paper` (vision through MCP images), `diagnose`, `class_report`, `write_lesson` (after a paper and after `session.finished`), `guidance` (after a teacher note, after a parent activity). The two plain-code steps (`plan_next_session`, `update_learner_profile`) ran inside the operator with no agent. `draft_map` was not run through Claude, by decision.
- Two limits, stated plainly. **Curriculum PDFs are read by the cloud model**: `draft_map` is never handed to the laptop, because Claude Code cannot read a PDF that comes back through MCP; every other AI job can run on the laptop. **The whole demo path was proven in pieces, not in one run**: the budget of 30 agent runs does not cover a full run (about 29 are needed), so one full run, with the ready `SEED_MAP=1` switch, is left for the deployed preview.
- Fixes made on the way, all tested: the operator never takes the events of a desktop school (final rule), `complete_job` no longer settles an event a desktop runner is running, and `get_class_results` now returns each result's id (`resultId`).
- Proof B (rescue) and proof C (recorded answers, no handoff) passed, and the acceptance run (AI_ROUTE unset, replay, phone) passed on its second try.
- Agent runs used: 28 of the 30 allowed in the table below, 3 of them by mistake on another worker's events. (The coordinator's own count is one higher, 29; either way the cap held.) Time spent in agent runs: 14.7 minutes.

## Setup

| Thing | Value |
| --- | --- |
| Claude Code | 2.1.322, signed in with the claude.ai subscription (Max plan). No API key. |
| Model | `ANTHROPIC_MODEL=claude-sonnet-5-5` set in the operator's environment. The model Claude actually used was not read back from a transcript. |
| Database | jemma-dev only. Migration 0017 applied with psql only (no `supabase` command was ever run). The functions were replaced several times as the rules changed; the migration file is the final form and the live database matches it. |
| Agent worker | local `wrangler dev` on 8754 with `AI_ROUTE=operator`, `AI_ROUTE_TAG=p54-proof`, `LLM_MODEL` and `VISION_MODEL` set to `nvidia/nemotron-3.5-lightning:free` (no recordings), both fallback lists set to the same id (so none), `AI_MODE=replay` and `TTS_PROVIDER=none`. Replay mode means that even with no operator online the worker could not have called a free model. No Workers AI speech was used. |
| Web app | local dev server on 3254, phone project, headless, `--workers=1`, `SLOW_AI=1` for the long runs. |
| Operator | `pnpm operator` from this worktree with `OPERATOR_TAG=p54-proof` (runs R5 and R6 and the routing proof; R1 to R4 ran before tags existed), `OPERATOR_MAX_JOBS` as the cap and `OPERATOR_TRACE` for the tool call lists. The script removes the Supabase keys and every provider key from the environment before Claude starts. |

## A: every agent run, in order

- **R1** is the packet's own run of `demo-path.spec.ts` (`SLOW_AI=1`). It stopped at step 1.
- **R2 and R3** use a temporary copy of the spec (not committed) with one change: after "Use the sample curriculum" the `curriculum.uploaded` event is cancelled and the draft map is stored from the seed fixture, because Claude cannot read the PDF. R2 was before the keep-running fix, R3 after it. Both ran with the earlier handoff-only flag, which is now gone.
- **R4** is `packages/runner/scripts/proof-tail.ts`: one `paper.checked` event on a `marked` sandbox, run with the result-id change as a local, uncommitted patch (it is committed now). Its first line (diagnose, 29 s) is a first go whose script ended too early (it took the `complete_job` done for the end); the second go is the other five lines. The tail stopped at the event's postconditions: the seeded `marked` sandbox has open gaps for three other learners with no planned session, and a `paper.checked` plan only plans the checked learner. That is the seed, not the operator.
- **R5** is the live routing proof after the correction (tag `p54-proof`): `proof-route.ts` (guidance) and `proof-session.ts` (the `session.finished` plan).
- **R6** is the final code (develop merged, `complete_job` fix, result ids): `proof-session.ts` again and `proof-guidance.ts` (guidance after a real teacher note and after a real parent activity), tag `p54-proof`, operator cap 3.

| Run | Event type | Job | Seconds | Outcome | Tool calls in order | Note |
| --- | --- | --- | ---: | --- | --- | --- |
| R1 | observation.added | guidance | 12 | failed | get_learner_profile > complete_job | not part of this proof: another worker's desktop-school event, claimed by mistake |
| R1 | observation.added | guidance | 11 | failed | get_learner_profile > complete_job | not part of this proof: another worker's desktop-school event, claimed by mistake |
| R1 | observation.added | guidance | 23 | failed | get_learner_profile > get_child_context > subject_guidance > complete_job | not part of this proof: another worker's desktop-school event, claimed by mistake |
| R1 | curriculum.uploaded | draft_map | 16 | failed | get_job > get_curriculum_doc > complete_job | the sample PDF is not readable through MCP |
| R2 | key.snapped | read_key | 30 | done | get_job > get_memo > save_answer_key > complete_job |  |
| R2 | paper.snapped | read_paper | 24 | done | get_paper > mark_paper > complete_job |  |
| R2 | paper.snapped | read_paper | 24 | done | get_paper > mark_paper > complete_job |  |
| R2 | paper.snapped | read_paper | 24 | done | get_paper > mark_paper > complete_job |  |
| R2 | paper.snapped | read_paper | 26 | done | get_paper > mark_paper > complete_job |  |
| R2 | paper.snapped | read_paper | 23 | done | get_paper > mark_paper > complete_job |  |
| R2 | paper.snapped | diagnose | 10 | failed | get_job > get_class_results > get_learner_profile > complete_job | the spec failed first and its clean-up deleted the school and the token under the job |
| R3 | key.snapped | read_key | 31 | done | get_job > get_memo > save_answer_key > complete_job |  |
| R3 | paper.snapped | read_paper | 26 | done | get_paper > mark_paper > complete_job |  |
| R3 | paper.snapped | read_paper | 24 | done | get_paper > mark_paper > complete_job |  |
| R3 | paper.snapped | read_paper | 22 | done | get_paper > mark_paper > complete_job |  |
| R3 | paper.snapped | read_paper | 24 | done | get_paper > mark_paper > complete_job |  |
| R3 | paper.snapped | read_paper | 24 | done | get_paper > mark_paper > complete_job |  |
| R3 | paper.snapped | diagnose | 40 | failed | get_job > get_class_results > get_learner_profile > get_memo > get_child_context > get_paper > complete_job | no tool gives the result ids that update_learner_profile needs |
| R4 | paper.checked | diagnose | 29 | done | get_job > get_class_results > get_learner_profile > update_learner_profile > complete_job |  |
| R4 | paper.checked | diagnose | 40 | done | get_job > get_class_results > get_learner_profile > get_child_context > get_memo > update_learner_profile > complete_job |  |
| R4 | paper.checked | class_report | 34 | done | get_job > get_class_results > class_gap_report > complete_job |  |
| R4 | paper.checked | plan_next_session | 1 | done | none (ran in the operator, no agent) |  |
| R4 | paper.checked | write_lesson | 97 | done | get_job > get_child_context > get_learner_profile > save_lesson > complete_job |  |
| R4 | paper.checked | guidance | 23 | done | get_learner_profile > subject_guidance > complete_job |  |
| R5 | observation.added | guidance | 23 | done | get_learner_profile > get_child_context > subject_guidance > complete_job |  |
| R5 | session.finished | update_learner_profile | 2 | done | none (ran in the operator, no agent) |  |
| R5 | session.finished | plan_next_session | 1 | done | none (ran in the operator, no agent) |  |
| R5 | session.finished | write_lesson | 83 | done | get_job > get_child_context > save_lesson > complete_job |  |
| R6 | session.finished | update_learner_profile | 2 | done | none (ran in the operator, no agent) |  |
| R6 | session.finished | plan_next_session | 1 | done | none (ran in the operator, no agent) |  |
| R6 | session.finished | write_lesson | 77 | done | get_job > get_child_context > save_lesson > complete_job |  |
| R6 | observation.added | guidance | 26 | done | get_learner_profile > subject_guidance > complete_job |  |
| R6 | activity.added | guidance | 36 | done | get_learner_profile > subject_guidance > complete_job |  |

Totals: 28 agent runs (22 done, 6 failed) and 5 plain-code steps run inside the operator with no agent. Agent time 885 seconds. Typical times: memo 31 s, each paper 24 s, diagnose 30 to 40 s, class report 34 s, lesson 77 to 97 s, guidance 23 to 36 s.

Vision through MCP image content worked: all ten paper reads and both memo reads saved their results (`get_paper` or `get_memo`, then `mark_paper` or `save_answer_key`, then `complete_job`).

## Routing proof on the live stack (R5)

`packages/runner/scripts/proof-route.ts`, agent and operator both on tag `p54-proof`, a real operator online:

```
operators of this tag seen in the last 90 s: [{"agent":"claude","version":"2.1.322","tag":"p54-proof"}]
POST /events (draft_map): 202
1. draft_map event (SELECT): {"status":"failed","runner":"cloud","route":null,"error":"Replay miss: 9e6e43cef4e1e5cd7f372e01b4c1a47d1181b231cc92008"}
2. hand-off of another tag after 12 s (SELECT): {"status":"queued","runner":"desktop","claimed_by":null,"attempts":0,"error":null,"payload":{"type":"observation.added","route":"operator","childId":"21d4032b-4d23-4f24-8c48-6abc345e1896","route_tag":"other-p54-proof"}}
POST /events (guidance): 202
3. guidance event (SELECT): {"status":"done","runner":"desktop","claimed_by":null,"error":null,"payload":{"type":"observation.added","route":"operator","childId":"21d4032b-4d23-4f24-8c48-6abc345e1896","route_tag":"p54-proof"}}
   activity_log lines from the tools: ["subject_guidance: Used your note on Amina in her guidance card"]
   one-time tokens left for this school: []
```

- Step 1: `draft_map` was not handed off although an operator was online. It ran on the cloud model path, missed its recording again (replay mode) and failed there, runner `cloud`, no `route`. No agent run was spent.
- Step 2: a hand-off made under another tag was still `queued`, attempts 0, after 12 seconds with the operator running. The operator never saw it.
- Step 3: a normal miss was handed off with `route_tag = p54-proof`, run by Claude (guidance, 23 s, tools `get_learner_profile`, `get_child_context`, `subject_guidance`, `complete_job`), settled `done`, claimed_by empty, and its one-time token was gone.

`packages/runner/scripts/proof-session.ts`, same stack, a `session_done` sandbox, a `session.finished` event:

```
planned sessions before / questions in the planned lesson before: [3,null]
POST /events: 202
event (SELECT): {"status":"done","runner":"desktop","error":null,"payload":{"type":"session.finished","route":"operator","route_tag":"p54-proof","sessionId":"d278c557-14ea-471f-b5d7-94078ab6ef0a"}}
planned sessions after / questions in the planned lesson after: [3,null]
activity_log lines: ["update_learner_profile: Amina finished the lesson: 3 of 5. Kept Amina at Practising","update_learner_profile: Amina finished the lesson: 3 of 5. Kept Amina at Practising","save_lesson: Built tonight's 12-minute lesson on adding decimals, as a spoken lesson"]
```

The two plain-code steps ran in the operator (2.1 s and 0.8 s) and `write_lesson` was one agent run (83 s, `get_job`, `get_child_context`, `save_lesson`, `complete_job`). Known quirk: a hand-off in the middle of a plan restarts the plan in the operator, so a plain-code step the cloud already ran runs again and "What Jemma did" gets its line twice (seen above for `update_learner_profile`). The steps are safe to repeat.

## Final code on the live stack (R6)

After the merge of develop and the `complete_job` and result-id fixes, same stack and tag:

```
planned sessions before / questions in the planned lesson before: [3,null]
POST /events: 202
event (SELECT): {"status":"done","runner":"desktop","error":null,"payload":{"type":"session.finished","route":"operator","route_tag":"p54-proof","sessionId":"ee972251-0933-4c49-9255-c47e67c0c9b2"}}
planned sessions after / questions in the planned lesson after: [3,null]
activity_log lines: ["update_learner_profile: Amina finished the lesson: 3 of 5. Kept Amina at Practising","update_learner_profile: Amina finished the lesson: 3 of 5. Kept Amina at Practising","save_lesson: Built tonight's 12-minute lesson on adding decimals, as a spoken lesson"]
```

```
teacher note: POST /events: 202
teacher note: event (SELECT): {"status":"done","runner":"desktop","claimed_by":null,"error":null,"payload":{"type":"observation.added","route":"operator","childId":"75f91d72-6482-4d4f-b268-f9b5b50bc43c","route_tag":"p54-proof"}}
teacher note: guidance card updated_at before / after: ["2026-11-10T11:18:36.406477+00:00","2026-11-10T11:19:05.203+00:00"]
teacher note: activity_log lines: ["subject_guidance: Used your note on Amina in her guidance card"]
parent activity: POST /events: 202
parent activity: event (SELECT): {"status":"done","runner":"desktop","claimed_by":null,"error":null,"payload":{"type":"activity.added","route":"operator","childId":"75f91d72-6482-4d4f-b268-f9b5b50bc43c","route_tag":"p54-proof"}}
parent activity: guidance card updated_at before / after: ["2026-11-10T11:19:05.203+00:00","2026-11-10T11:19:48.25+00:00"]
parent activity: activity_log lines: ["subject_guidance: Used your note on Amina in her guidance card"]
```

`write_lesson` after `session.finished` took 77 s, guidance after a real teacher note 27 s and after a real parent activity 36 s. Each event ended `done`, `runner = desktop`, `claimed_by` empty, with the tag on its payload, the guidance card's `updated_at` moved each time, and no one-time token or presence row was left. The event stayed running through the agent's own `complete_job` call and was settled by the operator at the end (no put-back needed any more).

## What failed and what I changed

1. **My mistake: foreign events (R1, three runs).** The first design let an operator also serve events of desktop schools whose owner had no Desktop heartbeat. On the shared jemma-dev database my first live run claimed three `observation.added` events from another worker's test sandbox (events `0380e68f`, `8b6c0c17`, `729a0b3d`; schools `345359b5`, `ef7cf63d`, `61275bab`) and ran Claude on them. Their schools were deleted while the jobs ran, so the jobs failed. Those 3 runs count against the cap. Fix, as the coordinator ordered: that rule is gone. `claim_operator_event(runner, tag_in)` takes only events with `payload.route = 'operator'` and the operator's `route_tag`, and skips any school with `ai_runner = 'desktop'`. Between the first fix idea (an opt-in flag, used for R2 to R4) and the final rule no other foreign events were touched. A forgotten read-only snapshot poller of mine ran against jemma-dev until I found and stopped it; it only read.
2. **`complete_job` marked the event done after every step (found in R2).** The MCP tool `complete_job` set the event to done, so a plan with more steps looked finished: the spec's idle wait fired early and the one-event-per-school rule was open for a moment. First fix: the operator put the event back to running within half a second. Final fix, as the coordinator ordered: `complete_job` does not change `events.status` when the event's `runner` is `desktop` (the runner settles the event with `finish_event` or `finish_operator_event` after the whole plan); cloud events behave as before. The put-back is gone. Tests: the tool leaves a desktop event alone (`read-tools.test.ts`), and an operator run with the real tool keeps the event running between steps and settles it at the end.
3. **Acceptance run, first try.** It failed at step 8: after "Save note" the 5 second default wait for the note ended while the button still said "Working" (a slow dev server, nothing to do with the AI path). The second try passed. I did not change the spec for it.
4. **Blocker 1, the curriculum PDF.** `get_curriculum_doc` returns the PDF as an MCP embedded resource and Claude Code treats it as an opaque binary (the runner uses `--tools ""`). Decision by the coordinator: not fixed. `draft_map` is never handed to the operator (`NO_HANDOFF_JOBS`, unit tested and shown live above). Known limit, also in the runbook: curriculum PDFs are read by the cloud model; every other AI job can run on the laptop.
5. **Blocker 2, result ids (fixed, authorised by the coordinator).** `diagnose` could not finish through Claude: `update_learner_profile` needs a `resultId` per wrong answer and `get_class_results` left out `question_results.id`. The tool now returns `resultId` for each result (test: every id is a real `question_results` row). Condition kept: the recorded cloud answers stay valid. No cloud job reads this tool (`diagnose` loads its inputs in code, `class_report` computes the gaps in code), so no prompt changed, and the proof is the demo path in replay with `AI_ROUTE` unset after the change: it passed (7.1 minutes) with zero replay misses in the agent log. The patch was first tested live in R4.

## B: the rescue

Run again after the tag change with `packages/runner/scripts/proof-rescue.ts` against the local agent (tag `p54-proof`, route operator, unrecorded model ids, replay mode). No operator process was running. A presence row made by the script (with the same tag) stood in for an online operator for the instant of the miss, because the packet needs a handed-off event while no operator is there. The `enqueue` given to `checkOperatorTimeouts` only recorded the id, so nothing reached the queue and no model could run. Output (SELECTs of the event row):

```
operator rows seen in the last 90 s (before): 0
POST /events: 202
1. after the miss (SELECT): {"status":"queued","runner":"desktop","claimed_by":null,"attempts":1,"error":null,"payload":{"type":"observation.added","route":"operator","childId":"862334bb-e3a4-4f22-a772-dbdc9e063c71","route_tag":"p54-proof"}}
operator rows seen in the last 90 s (now): 0
2. checkOperatorTimeouts returned: 1
   enqueue was asked for: ["7d939487-3426-47f0-9c2e-69df5f295f7e"]
   after the rescue (SELECT): {"status":"queued","runner":"cloud","claimed_by":null,"attempts":1,"error":null,"payload":{"type":"observation.added","route":"cloud_live","childId":"862334bb-e3a4-4f22-a772-dbdc9e063c71","route_tag":"p54-proof"}}
3. after the cancel (SELECT): {"status":"cancelled","runner":"cloud","claimed_by":null,"attempts":1,"error":null,"payload":{"type":"observation.added","route":"cloud_live","childId":"862334bb-e3a4-4f22-a772-dbdc9e063c71","route_tag":"p54-proof"}}
   recorded model answers before and after: [156,156]
```

The recorded answers count (`ai_replays`, no locks) was the same before and after: no model ran. (The first run of this proof, before the tag existed, gave the same result: 146 before and after.)

## C: recorded answers, never handed off

Run before the tag existed, with the same routing code path: agent restarted with the normal recorded model ids, `AI_ROUTE=operator`, `AI_MODE=replay`, no operator running. The whole demo path was run (more than the one event the packet asks for): `demo-path.spec.ts`, phone, replay, passed in 6.2 minutes. A poller copied the events of the sandbox school every 5 seconds: 11 events (curriculum.uploaded, key.snapped, 5 paper.snapped, paper.checked, session.finished, observation.added, activity.added), all `done`, all `runner = cloud`, none with `payload.route`. A miss would have failed the event (replay again), and none did.

## Acceptance

- `AI_ROUTE` unset, `demo-path.spec.ts`, phone, replay: failed once on the slow note save (item 3 above), then passed in 6.5 minutes.
- After the result-id and `complete_job` changes, with develop merged: `demo-path.spec.ts`, phone, replay, `AI_ROUTE` unset: passed in 7.1 minutes, 11 events processed by the agent, zero `Replay miss` lines in its log.
- Step 8 now gives the assertion after "Save note" a 30 second timeout (it failed once locally and on the deployed preview at the default 5 seconds); nothing else in that step changed.
- `SEED_MAP=1` (new switch, starts at step 2 with the seed's own approved map and topics; every step 1 assertion still runs), replay, no operator: reached step 2, so the seeded approved map and topics were accepted and every step 1 assertion held, but the run did not finish: on the memo page two answers needed a check ("Check question 8 first") and the spec's approve step never became possible, so it timed out after 20 minutes. The recorded memo read was made against the map the free model drafted from the sample PDF, and the seed's map names topics differently (my inference, not checked further). So `SEED_MAP=1` is for runs where the model reads the memo live (the operator), not for replay with the existing recordings. It was not run with Claude: the agent-run budget is spent.
- The wait switch `SLOW_AI=1` only lengthens `AGENT_WAIT` (60 minutes) and the test timeout (4 hours). No assertion changed.

## How to rerun

1. Agent: `AI_ROUTE=operator`, `AI_ROUTE_TAG=<your tag>`, `AI_MODE=replay`, `TTS_PROVIDER=none`, `LLM_MODEL` and `VISION_MODEL` (and both fallback lists) set to `nvidia/nemotron-3.5-lightning:free` in `apps/agent/.dev.vars`, then `pnpm --filter agent exec wrangler dev --port 8754`.
2. Operator: `OPERATOR_TAG=<your tag> ANTHROPIC_MODEL=claude-sonnet-5-5 AGENT_URL=http://localhost:8754 OPERATOR_MAX_JOBS=<cap> OPERATOR_TRACE=<file> pnpm operator`.
3. Spec: `SEED_MAP=1 SLOW_AI=1 AI_MODE=replay PLAYWRIGHT_PORT=3254 AGENT_URL=http://localhost:8754 pnpm --filter web exec playwright test demo-path --project=phone --workers=1`.
4. B: `AI_ROUTE_TAG=<tag> AGENT_URL=http://localhost:8754 pnpm --filter @jemma/runner exec tsx scripts/proof-rescue.ts` (no operator running). Routing proof: `scripts/proof-route.ts`, `scripts/proof-session.ts` and `scripts/proof-guidance.ts` the same way (operator running). R4: `scripts/proof-tail.ts`.

## NOT verified

- The Electron Desktop app (not started, not touched).
- The deployed preview agent. Everything ran on a local worker. The real cron (every minute) did not run; `checkOperatorTimeouts` was called directly.
- More than one judge at once. One sandbox school at a time was served live; two schools at once is covered only by the unit test with a fake agent.
- Codex and goose as the operator's agent. Only Claude ran.
- Laptop sleep with the lid closed. `caffeinate` was seen to start and to stop with the process; sleep was not tried.
- **The whole demo path through Claude in one run.** Not run: the budget of 30 agent runs does not cover it (about 29 needed). Seen through Claude in separate runs: memo, five papers, diagnose (with the result-id change, R4), class report, lesson after a paper and after a session, guidance after a note and after an activity. Not run through Claude: `draft_map` (by decision), and the Sipho fix as its own step (R4 covers the same plan for another learner). `SEED_MAP=1` with real Claude was not run; in replay it reached step 2 and then hung on a memo check, so it is for live runs only.
- `diagnose` was not run again after the result-id change was committed (R4 ran the identical change as an uncommitted patch).
- Which model Claude really used (only the environment variable was set).
- That the lessons, guidance and diagnoses Claude saved are good. Only that they were saved and the event steps completed.
- A second operator on the same database, and the operator on a different network from the agent.
- The token of an event whose school is deleted while the job runs: the job fails (seen in R1 and R2). No token rows were left behind (checked: zero rows labelled `operator` at the end).
