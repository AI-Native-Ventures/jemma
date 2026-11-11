# Curriculum documents Jemma has not seen

Three invented curriculum documents, each of a different shape, with a ground truth file next to it. They are for trying the curriculum reader on a document it was not made for, by hand or with `pnpm evals:unseen`.

Not copied from any ministry document. They were written for this repository: the topics, the order of the terms and every sentence are made up, and the school years and countries only say where such a plan could be used. No logo, no stamp and no name of a real school or ministry is in them.

| File | Class | Shape | Text layer |
| --- | --- | --- | --- |
| `grade9-natural-sciences-za.pdf` | Grade 9 Natural Sciences, South Africa | a table per term, four terms, 6 pages | yes |
| `grade5-english-za.pdf` | Grade 5 English, South Africa | paragraphs for each week, no tables, four terms, 5 pages | yes |
| `grade4-science-technology-ke.pdf` | Grade 4 Science and Technology, Kenya | a scheme of work, THREE terms, 4 page images, slightly skewed and grey like a scan | no |

Each document has two traps, like the sample plan in `fixtures/curriculum`:

- one topic is listed in two terms (a good reader puts it in one place and asks the teacher which term is right);
- one topic is marked as belonging to another grade (a good reader leaves it out or asks).

The `.json` file of each document is the ground truth that the scorer reads (`evals/lib/unseen.ts`): grade, subject, country, the number of terms, the topics with their term and strand family, and the two traps. For the Science and Technology document the subject has no list of family keys, so any short lowercase word is accepted for a family.

## How they were made

The `.html` files are the sources. `render.mjs` renders them headless with Playwright (no network): the first two are printed to PDF, which gives a text layer. The third is photographed sheet by sheet with a small skew, grey paper and noise, and the pictures are put into a PDF, which has no text layer at all.

```bash
pnpm --filter web exec node ../../fixtures/curriculum/unseen/render.mjs
```

Synthetic data only.
