# Curriculum documents Jemma has not seen

Three invented Mathematics curriculum documents, each of a different shape, with a ground truth file next to it. They are for trying the curriculum reader on a document it was not made for, by hand or with `pnpm evals:unseen`. The first version of Jemma covers Mathematics only, so these are the documents a judge is pointed at.

Not copied from any ministry document. They were written for this repository: the topics, the order of the terms and every sentence are made up, and the school years and countries only say where such a plan could be used. No logo, no stamp and no name of a real school or ministry is in them.

| File | Class | Shape | Text layer |
| --- | --- | --- | --- |
| `grade9-mathematics-za.pdf` | Grade 9 Mathematics, South Africa | a table per term, four terms, 6 pages | yes |
| `grade5-mathematics-za.pdf` | Grade 5 Mathematics, South Africa | paragraphs for each week, no tables, four terms, 5 pages | yes |
| `grade4-mathematics-ke.pdf` | Grade 4 Mathematics, Kenya | a scheme of work, THREE terms, 4 page images, slightly skewed and grey like a scan | no |

Each document has two traps, like the sample plan in `fixtures/curriculum`:

- one topic is listed in two terms (a good reader puts it in one place and asks the teacher which term is right);
- one topic is marked as belonging to another grade (a good reader leaves it out or asks).

The `.json` file of each document is the ground truth that the scorer reads (`evals/lib/unseen.ts`): grade, subject, country, the number of terms, the topics with their term and strand family, and the two traps. For Mathematics a family counts as allowed when it is one of the strands of Mathematics (`strandOrder('Mathematics')` in `packages/profiling/src/logic/strands.ts`) or one or two short lowercase words: a Grade 9 plan has algebra and geometry, which the Grade 6 list does not name. The report lists the words that were not in the list.

## The three earlier documents, outside Mathematics

`other-subjects/` holds three documents made first: Grade 9 Natural Sciences (South Africa), Grade 5 English (South Africa) and Grade 4 Science and Technology (Kenya, three terms, a scan), with their ground truth and sources. They are not deleted and their results are not hidden: the live results of run `2026-11-11-18-26-unseen` are still in `evals/results/unseen-curriculum/`, and EVALS.md shows them in one short paragraph headed "Outside Mathematics (not part of what Jemma claims today)". They are not run again.

## How they were made

The `.html` files are the sources. `render.mjs` renders them headless with Playwright (no network): the Grade 9 and Grade 5 plans are printed to PDF, which gives a text layer. The Kenya scheme is photographed sheet by sheet with a small skew, grey paper and noise, and the pictures are put into a PDF, which has no text layer at all.

```bash
pnpm --filter web exec node ../../fixtures/curriculum/unseen/render.mjs
```

The PDFs in `other-subjects/` were made once, and the saved live results were made from those exact files. `render.mjs --other-subjects` would make them again, so only use it on purpose.

Synthetic data only.
