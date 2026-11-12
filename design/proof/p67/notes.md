# P67: a curriculum Jemma has never seen (Mathematics documents)

What was built, what was run, and what was not proven. Numbers are from the files named here. The first version of Jemma covers Mathematics only, so the documents a judge is pointed at are Mathematics documents (the brief P67-maths.md replaced the first three documents).

## What was built

- Three invented Mathematics documents with ground truth, two traps each (a topic in two terms, a topic of another grade): `fixtures/curriculum/unseen/` Grade 9 South Africa (table per term, 6 pages), Grade 5 South Africa (paragraphs, 5 pages), Grade 4 Kenya (three terms, a scan with no text layer, 4 pages). The three earlier documents (Natural Sciences, English, Science and Technology) are kept, with their bytes, in `other-subjects/`.
- Upload checks (first bytes, 10 MB, 40 pages, plain messages) and the server action body limit (`apps/web/next.config.ts`, 32 MB).
- Reading: vision first as before; only when it fails or gives no topic, and the PDF has a text layer, the text model reads the text (`unpdf` 2.1.0, exact pin). The tool log row `read_documents` says which way.
- Three term maps: a draft has only the terms that have topics.
- Decision 9: in the save tool for the map draft, code adds "Listed in Term X and Term Y. Which term is it taught in?" to every entry of a topic whose name (without case and extra spaces) sits in two or more terms when no entry has a question (`packages/profiling/src/logic/topic-questions.ts`). The tool answers and logs `codeQuestions`. "Keep in Term X" in the review screen now leaves one entry instead of two (`format.ts`).
- Live script `pnpm evals:unseen --cap 12 --run-id <id>` (the cap counts one run id; goes on from a stopped run id; waits 60 seconds after a provider no answer), scorer `evals/lib/unseen.ts` (Mathematics: the six Mathematics strands or one or two short lowercase words, the words outside the list are reported), EVALS.md section from the saved results.

## The live run (decision 5), run id 2026-11-12-maths-unseen

Free models: vision `nvidia/nemotron-3.5-super-vl:free` (fallback `google/gemma-4-31b-it:free`), text `nvidia/nemotron-3.5-super-vl:free` (fallback `nvidia/nemotron-3-ultra-550b-a55b:free`). 9 live calls, 0 repeats, 0 no answers, 0 network failures, cap 12 for this run id (3 left, unused). Run after decision 9 was built, so it measures the product as it ships. Files: `evals/results/unseen-curriculum/2026-11-12-maths-unseen/`.

| Document | Runs | Passes | No answer | Median seconds | Read by | Who asked about the topic listed in two terms |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Grade 9 Mathematics, ZA | 3 | 3 | 0 | 91.7 | vision | the model, the model, the model |
| Grade 5 Mathematics, ZA | 3 | 1 | 0 | 81.6 | vision | nobody, nobody, the model |
| Grade 4 Mathematics, Kenya | 3 | 3 | 0 | 82.2 | vision | the model, the model, the model |

- Every run found every topic of its document (14 of 14, 15 of 15, 12 of 12), none invented, all in the right terms, with the right grade and the right number of terms (the Kenya scan gave three terms in all 3 runs).
- The two fails (Grade 5 runs 1 and 2) failed one check: the topic "Perimeter and area" (Terms 2 and 3) was kept in both terms with no question. The model gave the later entry another name ("Perimeter and area of compound shapes" in run 1, "Perimeter and area again" in run 2), so code, which compares names only without case and extra spaces, did not see one topic listed twice and asked nothing. Code asked in none of the 9 runs; the model asked in 7. Not changed after the run: a fail stays a fail. A fuzzier match (one name inside the other, or "again", "continued") would catch these two but was not part of decision 9.
- Family words outside the Mathematics list that the scorer accepted: shape (9 runs), numbers (7), algebra (3), money (1), number (1), whole numbers (1).
- The text-reading fallback was not used by any live run (vision answered every run): proven by tests only.

## The earlier run, outside Mathematics (run 2026-11-11-18-26-unseen, kept as it was)

Grade 9 Natural Sciences 3 of 3; Grade 5 English 0 of 3; Grade 4 Science and Technology (Kenya) 0 of 2 judged runs: run 1 failed the same check, run 2 ended on the error "Failed to process successful response" (the body of that answer was not kept, so the model cannot be told from the provider; counted as a fail, not repeated), run 3 never reached a model (this Mac's network failed three times, 8 ledger lines in all, the missing call was dropped). EVALS.md shows this in the paragraph "Outside Mathematics (not part of what Jemma claims today)".

## What was proven, and how

- Browser spec `apps/web/e2e/p67.spec.ts`, run against a production build (`next start` on 3267, stand-in agent on 8767), phone and laptop: 7 passed, 1 skipped by design (the Grade 9 walk is on the phone only). It walks a model answer that keeps the topic of two terms in both terms: code's question shows on both entries and one answer leaves the topic in one term; the 9 MB PDF goes through; the three refusals; three terms for the Kenya scheme. Screenshots here, 390 and 1440 (`P67_PROOF=1`).
- Replay check: `demo-path.spec.ts` on the phone project against a local agent in `AI_MODE=replay`: passed (10.7 min), on the tree before decision 9 and after the first merge of develop. The recorded Grade 6 maps are tested to save unchanged (no topic in two terms, `codeQuestions` 0, same Needs you line): `packages/profiling/test/jobs/save-topic-map-questions.test.ts`. CI runs the demo path again.
- Agent Worker bundle (`wrangler deploy --dry-run`, nothing deployed): before 6265.57 KiB (gzip 1181.00 KiB), after 8718.22 KiB (gzip 1765.69 KiB). The agent test `apps/agent/test/unseen-curriculum.test.ts` runs unpdf inside workerd.
- CI found a fault the local run did not (runs 43259811910 and 43074864751): PDF.js (1.7 MB), once loaded by one test file, is sent inside the one message that starts the next Worker, and workerd refuses it ("WebSocket protocol error 1009"). Fixed by an own test project for the real-PDF.js test and a stand-in for `unpdf` in the other agent tests (`apps/agent/vitest.pdf.config.ts`, alias in `apps/agent/vitest.config.ts`). CI run 43292095544 (decision 9 and the Mathematics documents) failed on one stale line of my own agent test (it still looked for the words of the earlier plan), fixed in 35113db. CI run 43307272570 on b5721a7 passed. The last push adds one generated sentence to EVALS.md (in how many runs code asked, and why not in the others), asked for by the coordinator after the run; it is a third CI run for the Mathematics work.
- Scoring was frozen before any live call of the first run (ground truth and scorer last changed 11 Nov 18:55 local, first call 20:26); the Mathematics ground truth and the family rule were written before the Mathematics run, and nothing in the scorer was changed after its results. Added after the run, explanation only: the report says when a failed run named the repeated topic differently (`repeatedUnderOtherNames`).
