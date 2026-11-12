# P67: a curriculum Jemma has never seen

What was built, what was run, and what was not proven. Numbers are from the files named here.

## What was built

- Three invented documents with ground truth: `fixtures/curriculum/unseen/` (Grade 9 Natural Sciences ZA, Grade 5 English ZA, Grade 4 Science and Technology Kenya, three terms, page images only).
- Upload checks (first bytes, 10 MB, 40 pages, plain messages) and the server action body limit (`apps/web/next.config.ts`).
- Reading: vision first as before; only when it fails or gives no topic, and the PDF has a text layer, the text model reads the text (`unpdf` 2.1.0, exact pin). The tool log row `read_documents` says which way.
- Three term maps: a draft has only the terms that have topics.
- Live script `pnpm evals:unseen --cap 12`, scorer in `evals/lib/unseen.ts`, EVALS.md section from the saved results.

## What was proven, and how

- Browser spec `apps/web/e2e/p67.spec.ts`, run against a production build (`next build`, `next start` on 3267, stand-in agent on 8767): 7 passed, 1 skipped by design (the Grade 9 walk is on the phone only; the laptop screens are in the Kenya test). Screenshots in this folder, 390 and 1440 (`P67_PROOF=1`).
- Replay check: `demo-path.spec.ts` on the phone project against a local agent (`wrangler dev`, port 8767, `AI_MODE=replay`): 1 passed in 7.7 minutes.
- Agent Worker bundle (`wrangler deploy --dry-run`, nothing deployed): before 6265.57 KiB (gzip 1181.00 KiB), after 8718.22 KiB (gzip 1765.69 KiB). The agent test `apps/agent/test/unseen-curriculum.test.ts` runs unpdf inside workerd.
- CI found a fault the local run did not: the first CI runs (8ddc2fd and ca43886) passed 1404 tests but ended with 3 unhandled errors, "Worker exited unexpectedly ... WebSocket protocol error 1009, Message is too large" in `events.test.ts`, `mcp-http.test.ts` and `health.test.ts` of the agent project. Cause (found by reading the pool source and reproducing it locally with `CI=true vitest run --project agent --no-file-parallelism --maxWorkers=1`, 4 to 5 crashes): once PDF.js (`unpdf`, 1.7 MB) has been loaded by one test file, Vitest sends it inside the one message that starts the next Worker, and workerd refuses the message. Fix: the one test that really loads PDF.js in workerd (`apps/agent/test/unseen-curriculum.test.ts`) is its own project (`apps/agent/vitest.pdf.config.ts`, listed in the root `vitest.config.ts`), and in the other agent tests `unpdf` is a stand-in (`apps/agent/test/stubs/unpdf.ts`, an alias in `apps/agent/vitest.config.ts`). After it, the same sequential command passes 3 times (7 files, 31 tests). The deployed Worker still bundles the real `unpdf`. A lazy `import('unpdf')` did not help (Vite counts dynamic imports in the graph) and made the bundle larger (10417.97 KiB), so it was dropped.
- Whole repo: `pnpm test` first pass 105 files passed, 12 failed (all on jemma-demo: statement timeouts, a hook timeout, one duplicate `classes_join_code_key` after a retried insert); those 12 files rerun once, one at a time: 12 passed, 168 tests. `pnpm typecheck`: all five packages green.

## The live run (decision 5), run id 2026-11-11-18-26-unseen

Models: vision `nvidia/nemotron-3.5-super-vl:free` (fallback `google/gemma-4-31b-it:free`), text `nvidia/nemotron-3.5-super-vl:free` (fallback `nvidia/nemotron-3-ultra-550b-a55b:free`). Ledger: 8 of 12 live calls spent. Files: `evals/results/unseen-curriculum/2026-11-11-18-26-unseen/`.

| Document | Runs judged | Passes | Provider no answer | Median seconds | Read by |
| --- | ---: | ---: | ---: | ---: | --- |
| Grade 9 Natural Sciences, ZA | 3 | 3 | 0 | 321.8 | vision |
| Grade 5 English, ZA | 3 | 0 | 0 | 144.6 | vision |
| Grade 4 Science and Technology, Kenya | 2 of 3 | 0 | 0 | 245.0 | vision |

- Grade 9: run 1 found 14 of 15 topics (missed "Series and parallel circuits"), still a pass. All three flagged "Electric circuits" with a question and left out the Grade 7 topic.
- Grade 5 English: every run found 15 of 15 topics in the right terms with no invented topic, and failed one check: "Writing a paragraph" (listed in Terms 2 and 3) was kept in both terms, or renamed in the second, with no question for the teacher.
- Kenya: run 1 found 12 of 12 with three terms (no empty fourth term), and failed the same check ("Sources of light", Terms 1 and 3). Run 2 ended after 254.8 s on the job error "Failed to process successful response" with no draft (an HTTP answer the SDK could not read; the saved result has no cause or body, so it cannot be told apart from a provider fault). It is scored as a fail, as the earlier worker's rule had it, and was not repeated (repeats are for provider no-answers only). Run 3: three tries died on this Mac's own network ("teacher: fetch failed") before any model was asked; they are not on the ledger and were not judged.
- The text-reading fallback was not used by any live run (vision answered every judged run), so it is proven by tests only.
- Not done: Kenya run 3. No live call was made in this session: the coordinator's yes did not arrive (asked three times between about 16:45 and 18:00 on 12 Nov, waited until 18:31).
- To finish it: `pnpm evals:unseen --cap 12 --run-id 2026-11-11-18-26-unseen` goes on from the saved folder (it keeps every run that has a result, never writes over a file, and makes 1 live call, plus up to 3 repeats for a provider no-answer), then `pnpm evals:report`, then change the numbers in the two sentences of docs/judges.md and README.md.

- Scoring was frozen before any live call: the ground truth and `scoreDraft` were last changed in commit 81544bb (11 Nov 18:55 local), the first live call was at 20:26 local. Later changes to `evals/lib/unseen.ts` only add the resume plan and the counting helpers.
