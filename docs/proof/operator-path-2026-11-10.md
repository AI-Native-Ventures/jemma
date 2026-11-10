# Operator path proof, 10 Nov 2026

Packet P54: the owner's Mac does the AI work for the hosted app, with Claude Code on his own subscription. Synthetic data only, jemma-dev only. No tokens or secrets are in this file.

## Result in plain words

- The operator runner works. Model steps were missed in the cloud, handed to the laptop, run by the real `claude` CLI and saved through the Jemma MCP server. 17 of 23 agent runs finished as done: the memo, five papers read from photos, diagnose, class report, lesson and guidance.
- The whole demo path did **not** finish through Claude. Two blockers were found. Neither is in a file this packet owns, so neither is fixed in the branch:
  1. **The sample curriculum cannot be read.** `get_curriculum_doc` returns the PDF as an MCP embedded resource. Claude Code treats it as an opaque binary, and the runner starts Claude with `--tools ""`, so it cannot open a saved copy. `draft_map` failed honestly.
  2. **Diagnose cannot finish.** `update_learner_profile` needs a `resultId` for every wrong answer, but no read tool returns result ids (`get_class_results` leaves out `question_results.id`). With a three line patch (below, not committed) diagnose, class report, lesson and guidance all worked.
- Proof B (rescue) and proof C (recorded answers, no handoff) passed. The acceptance run (AI_ROUTE unset, replay, phone) passed on its second try.
- Agent runs used: 23 of the 30 allowed (3 of them by mistake, on another worker's events). Time spent in agent runs: 10.6 minutes.

## Setup

| Thing | Value |
| --- | --- |
| Claude Code | 2.1.322, signed in with the claude.ai subscription (Max plan). No API key. |
| Model | `ANTHROPIC_MODEL=claude-sonnet-5-5` set in the operator's environment. The model Claude actually used was not read back from a transcript. |
| Database | jemma-dev only. Migration 0017 applied; `claim_operator_event` later got the optional `only_handoffs` flag (see below). |
| Agent worker | local `wrangler dev` on 8754 with `AI_ROUTE=operator`, `LLM_MODEL` and `VISION_MODEL` set to `nvidia/nemotron-3.5-lightning:free` (no recordings), both fallback lists set to the same id (so none), `AI_MODE=replay` and `TTS_PROVIDER=none`. Replay mode means that even with no operator online the worker could not have called a free model. No Workers AI speech was used. |
| Web app | local dev server on 3254, phone project, headless, `--workers=1`, `SLOW_AI=1`. |
| Operator | `pnpm operator` from this worktree with `OPERATOR_MAX_JOBS` as the cap, `OPERATOR_ONLY_HANDOFFS=1` from run R2 on and `OPERATOR_TRACE` for the tool call lists. The script removes the Supabase keys and every provider key from the environment before Claude starts. |

## A: every agent run, in order

- **R1** is the packet's own run of `demo-path.spec.ts` (`SLOW_AI=1`). It stopped at step 1.
- **R2 and R3** use a temporary copy of the spec (not committed) with one change: after "Use the sample curriculum" the `curriculum.uploaded` event is cancelled and the draft map is stored from the seed fixture (`topicMapDraft()`), because Claude cannot read the PDF. Nothing else differs. R2 was before the keep-running fix, R3 after it.
- **R4** is `packages/runner/scripts/proof-tail.ts`: one `paper.checked` event on a `marked` sandbox, run with a local, uncommitted patch that adds `resultId` to `get_class_results`. Its first line (diagnose, 29 s) is a first go whose script ended too early (it took the `complete_job` done for the end); the second go is the other five lines. The tail stopped at the event's postconditions: the seeded `marked` sandbox has open gaps for three other learners with no planned session, and a `paper.checked` plan only plans the checked learner. That is the seed, not the operator.

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

Totals: 23 agent runs (17 done, 6 failed) and 1 plain-code step run inside the operator with no agent (`plan_next_session`). Agent time 639 seconds. Typical times: memo 31 s, each paper 24 s, diagnose 30 to 40 s, class report 34 s, lesson 97 s, guidance 23 s.

Vision through MCP image content worked: all ten paper reads and both memo reads saved their results (`get_paper` or `get_memo`, then `mark_paper` or `save_answer_key`, then `complete_job`).

## What failed and what I changed

1. **My mistake: foreign events (R1, three runs).** A live operator also serves events of desktop schools whose owner has no Desktop heartbeat in 2 minutes. That is the packet's design, but on the shared jemma-dev database it claimed three `observation.added` events from another worker's test sandbox and ran Claude on them. Their schools were deleted while the jobs ran, so the jobs failed. I stopped the operator at once and told the coordinator. Fix: `claim_operator_event(runner, only_handoffs default false)` and `OPERATOR_ONLY_HANDOFFS=1`: only events the cloud handed off are served. Calls with one argument behave as before. Every run after R1 used it. Production use should leave it off.
2. **`complete_job` marked the event done after every step (found in R2).** The MCP tool `complete_job` sets the event to done, so a plan with more steps looked finished. The spec's idle wait fired early and the one-event-per-school rule was open for a moment. Fix in `startOperator`: the event is put back to running within half a second and settled for good by `finish_operator_event`. Test: "complete_job marking the event done between steps is undone while the plan goes on". R3 then waited correctly and reported the real failure.
3. **Acceptance run, first try.** It failed at step 8: after "Save note" the 5 second default wait for the note ended while the button still said "Working" (a slow dev server, nothing to do with the AI path). The second try passed. I did not change the spec for it.
4. **Not changed, needs a decision:**
   - The curriculum PDF. Options: store extracted text at upload, return page images, or let the runner allow a Read tool for saved resources (`run.ts`, packet P49).
   - Result ids. The suggested fix, tested in R4 and not committed:

```diff
@@ -2,6 +2,7 @@ import { z } from 'zod'
 import { assertInSchool, defineTool } from '../context'
 
 const ResultSchema = z.object({
+  resultId: z.string(),
   n: z.number(),
   prompt: z.string(),
   answerRead: z.string(),
@@ -32,7 +33,7 @@ export const getClassResults = defineTool({
     if (marked.length === 0) return { testId, outOf: test.data.out_of, learners: [] }
     const [kids, results] = await Promise.all([
       db.from('children').select('id, first_name').in('id', marked.map((p) => p.child_id!)),
-      db.from('question_results').select('paper_id, n, prompt, answer_read, read_confidence, correct, mark, topic_name, misconception').in('paper_id', marked.map((p) => p.id)).order('n'),
+      db.from('question_results').select('id, paper_id, n, prompt, answer_read, read_confidence, correct, mark, topic_name, misconception').in('paper_id', marked.map((p) => p.id)).order('n'),
     ])
     if (kids.error) throw new Error(kids.error.message)
     if (results.error) throw new Error(results.error.message)
@@ -46,7 +47,7 @@ export const getClassResults = defineTool({
           firstName: kids.data.find((k) => k.id === p.child_id)?.first_name ?? '',
           paperId: p.id,
           total: p.total ?? rows.reduce((sum, r) => sum + r.mark, 0),
-          results: rows.map((r) => ({ n: r.n, prompt: r.prompt, answerRead: r.answer_read, confidence: r.read_confidence, correct: r.correct, mark: r.mark, topicName: r.topic_name, misconception: r.misconception })),
+          results: rows.map((r) => ({ resultId: r.id, n: r.n, prompt: r.prompt, answerRead: r.answer_read, confidence: r.read_confidence, correct: r.correct, mark: r.mark, topicName: r.topic_name, misconception: r.misconception })),
         }
       }),
     }
```

## B: the rescue

Run with `packages/runner/scripts/proof-rescue.ts` against the local agent (route operator, unrecorded model ids, replay mode). No operator process was running. A presence row made by the script stood in for an online operator for the instant of the miss, because the packet needs a handed-off event while no operator is there. The `enqueue` given to `checkOperatorTimeouts` only recorded the id, so nothing reached the queue and no model could run. Output (SELECTs of the event row):

```
operator rows seen in the last 90 s (before): 0
POST /events: 202
1. after the miss (SELECT): {"status":"queued","runner":"desktop","claimed_by":null,"attempts":1,"error":null,"payload":{"type":"observation.added","route":"operator","childId":"bb2ca7bc-b0ac-42ad-96c6-5e0f85af1c61"}}
operator rows seen in the last 90 s (now): 0
2. checkOperatorTimeouts returned: 1
   enqueue was asked for: ["0deb4aba-715d-4094-afed-31ae1906555b"]
   after the rescue (SELECT): {"status":"queued","runner":"cloud","claimed_by":null,"attempts":1,"error":null,"payload":{"type":"observation.added","route":"cloud_live","childId":"bb2ca7bc-b0ac-42ad-96c6-5e0f85af1c61"}}
3. after the cancel (SELECT): {"status":"cancelled","runner":"cloud","claimed_by":null,"attempts":1,"error":null,"payload":{"type":"observation.added","route":"cloud_live","childId":"bb2ca7bc-b0ac-42ad-96c6-5e0f85af1c61"}}
   recorded model answers before and after: [146,146]
```

The recorded answers count (`ai_replays`, no locks) was 146 before and after: no model ran.

## C: recorded answers, never handed off

Agent restarted with the normal recorded model ids, `AI_ROUTE=operator`, `AI_MODE=replay`, no operator running. The whole demo path was run (more than the one event the packet asks for): `demo-path.spec.ts`, phone, replay, passed in 6.2 minutes. A poller copied the events of the sandbox school every 5 seconds: 11 events (curriculum.uploaded, key.snapped, 5 paper.snapped, paper.checked, session.finished, observation.added, activity.added), all `done`, all `runner = cloud`, none with `payload.route`. A miss would have failed the event (replay again), and none did.

## Acceptance

- `AI_ROUTE` unset, `demo-path.spec.ts`, phone, replay: failed once on the slow note save (item 3 above), then passed in 6.5 minutes.
- The wait switch `SLOW_AI=1` only lengthens `AGENT_WAIT` (60 minutes) and the test timeout (4 hours). No assertion changed.

## How to rerun

1. Agent: `AI_ROUTE=operator`, `AI_MODE=replay`, `TTS_PROVIDER=none`, `LLM_MODEL` and `VISION_MODEL` (and both fallback lists) set to `nvidia/nemotron-3.5-lightning:free` in `apps/agent/.dev.vars`, then `pnpm --filter agent exec wrangler dev --port 8754`.
2. Operator: `ANTHROPIC_MODEL=claude-sonnet-5-5 AGENT_URL=http://localhost:8754 OPERATOR_MAX_JOBS=30 OPERATOR_ONLY_HANDOFFS=1 OPERATOR_TRACE=<file> pnpm operator`.
3. Spec: `SLOW_AI=1 AI_MODE=replay PLAYWRIGHT_PORT=3254 AGENT_URL=http://localhost:8754 pnpm --filter web exec playwright test demo-path --project=phone --workers=1`.
4. B: `AGENT_URL=http://localhost:8754 pnpm --filter @jemma/runner exec tsx scripts/proof-rescue.ts`. R4: the same with `scripts/proof-tail.ts` (needs the operator running and the result-id patch).

## NOT verified

- The Electron Desktop app (not started, not touched).
- The deployed preview agent. Everything ran on a local worker. The real cron (every minute) did not run; `checkOperatorTimeouts` was called directly.
- More than one judge at once. One sandbox school at a time was served; two schools at once is covered only by the unit test with a fake agent.
- Codex and goose as the operator's agent. Only Claude ran.
- Laptop sleep with the lid closed. `caffeinate` was seen to start and to stop with the process; sleep was not tried.
- The whole demo path through Claude. It never got past the tail of the papers: the curriculum PDF (blocker 1) and the result ids (blocker 2) stop it. Not run through Claude at all: `draft_map` (failed), the Sipho fix as its own step (R4 covers the same plan for another learner), `session.finished` (lesson after a session) and `observation.added` or `activity.added` guidance as separate events (guidance ran inside R4).
- Which model Claude really used (only the environment variable was set).
- That the lesson, guidance and diagnoses Claude saved are good. Only that they were saved and the event steps completed.
- A second operator on the same database, and the operator on a different network from the agent.
- The token of an event whose school is deleted while the job runs: the job fails (seen in R1 and R2). No token rows were left behind (checked: zero rows labelled `operator`).
