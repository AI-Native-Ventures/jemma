# Teaching Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement your half of this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every CAPS Mathematics topic (Grades 1 to 12) gets 1 to 8 full, checked lessons, written once by free open-weights models through OpenCode, stored, and taught to learners in three deliveries (Read, Pictures, Listen).

**Architecture:** P143 (worker W1) builds an offline generator (`scripts/teach/`) that drives `opencode run` with a ranked chain of free open-weights models, checks every lesson by code and by a second model, and writes one JSON file per topic under `content/lessons/`, plus an import script that prints SQL. P144 (worker W2) builds migration 0030 and the learner screens that read the stored lessons. The lesson shape (`packages/profiling/src/schemas/teaching.ts`) is the contract between them and is fixed below.

**Tech Stack:** TypeScript, zod 4, Next.js (apps/web on Cloudflare Workers), Supabase Postgres, vitest, OpenCode CLI 1.18.x (`opencode run`).

**Spec:** `docs/superpowers/specs/2026-11-16-teaching-library-design.md` (committed with this plan as `docs/superpowers/plans/2026-11-16-teaching-library.md`). Section 9 of the spec is superseded by the MODEL ROUTE below.

## Global Constraints

- Branches from `origin/develop` (1f8cb93 or later). W1: `jemma/p141-teach-generator`. W2: `jemma/p142-teach-screens`. Never merge, never deploy, never apply a migration.
- No database access, no browser, no server on this Mac tonight (the Mac is full). Only NAMED DB-free test files: `pnpm exec vitest run <file>` or `pnpm --filter web exec vitest run <file>`. Never `pnpm test`, never a folder.
- `write_lesson.md`, `PrimaryLessonSchema`, `SeniorLessonSchema`, `LessonSchema`, `fixtures/ai-replays.json.gz` do not change by one byte.
- MODEL ROUTE (owner, 16 Nov): OpenCode free, open-weights models only, ranked by Artificial Analysis score. Default chain, best first: `opencode/hy4-flash-free`, `opencode/inkling-2-small-free`, `opencode/minimax-m3.1-flash-free`, `opencode/deepseek-v4.1-flash-free`, `opencode/glm-5.3-flash-free`, `opencode/mimo-v2.6-flash-free`, `opencode/beam-free`, `opencode/flint-40b-free`, `opencode/longcat-2.5-free`, `opencode/nemotron-3.5-lightning-free`. Override with env `TEACH_MODELS` (comma list). Never `iceman-free`, `big-pickle`, `jev-*`, or any non-OpenCode provider.
- No em dash (U+2014) anywhere. Plain words in learner copy.
- Credit line on Siyavula-based lessons: `Based on Siyavula Everything Maths, Grade {g}, {chapter}, CC BY 3.0` with the chapter address. CAPS-based: `Follows the CAPS Mathematics curriculum, Department of Basic Education`.
- Migration file name: `supabase/migrations/0030_teaching_library.sql`.
- Lesson storage key: `(grade, base_name, position, version)`, `base_name = withoutTermSuffix(capsName)` (same rule as `apps/web/lib/map-source.ts:22`).

## Review Focus

1. A topic row named "Common fractions (Term 4)" must open the same lessons as "Common fractions" (W2 test: `libraryKey` strips the suffix; W1 test: generator groups both rows into one file).
2. A topic with no library lessons (teacher's own map, class 6B "Equivalent fractions") must look exactly as today: no Learn button, Learn step unchanged (W2 tests).
3. A model reply that is not JSON, is cut off, or wraps JSON in prose or code fences must not crash the run: the next model takes over (W1 test with fixture replies).
4. "Free usage limit reached" in OpenCode's output must park that model for 60 minutes and move on, never retry it in a tight loop (W1 test).
5. Listen delivery must never read raw LaTeX or symbols aloud: it reads `speech` only, and the checker rejects a `speech` containing `\`, `^`, `_{`, `$` (W1 check test, W2 delivery test).

---

## The contract: `packages/profiling/src/schemas/teaching.ts` (both workers create it EXACTLY like this)

```ts
import { z } from 'zod'
import { SeniorDiagramSpecSchema } from './diagram'
import { ANSWER_KINDS, QuestionSchema } from './lesson'

/** A picture in a teaching lesson: every primary and senior diagram kind. Never a kind outside this schema. */
export const TeachingDiagramSchema = SeniorDiagramSpecSchema

export const TeachingBlockSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('explain'), text: z.string().min(1), speech: z.string().min(1) }),
  z.object({ kind: z.literal('diagram'), spec: TeachingDiagramSchema, caption: z.string().min(1), speech: z.string().min(1) }),
  z.object({
    kind: z.literal('worked'),
    problem: z.string().min(1),
    steps: z.array(z.object({ line: z.string().min(1), reason: z.string().min(1) })).min(2).max(8),
    answer: z.string().min(1),
    answerKind: z.enum(ANSWER_KINDS),
    speech: z.string().min(1),
    diagram: TeachingDiagramSchema.optional(),
  }),
  z.object({ kind: z.literal('try'), question: QuestionSchema, hint: z.string().min(1), speech: z.string().min(1) }),
  z.object({ kind: z.literal('mistake'), wrong: z.string().min(1), right: z.string().min(1), why: z.string().min(1), speech: z.string().min(1), diagram: TeachingDiagramSchema.optional() }),
])
export type TeachingBlock = z.infer<typeof TeachingBlockSchema>

export const TeachingLessonSchema = z
  .object({
    position: z.number().int().min(1).max(8),
    title: z.string().min(1),
    minutes: z.number().int().min(5).max(30),
    objectives: z.array(z.string().min(1)).min(2).max(4),
    keyWords: z.array(z.object({ word: z.string().min(1), meaning: z.string().min(1) })).max(8),
    blocks: z.array(TeachingBlockSchema).min(8).max(30),
    summary: z.array(z.string().min(1)).min(3).max(6),
    practice: z.array(QuestionSchema).min(5).max(8),
  })
  .superRefine((l, ctx) => {
    if (!l.blocks.some((b) => b.kind === 'try')) ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'needs at least one try block' })
    if (!l.blocks.some((b) => b.kind === 'mistake')) ctx.addIssue({ code: 'custom', path: ['blocks'], message: 'needs at least one mistake block' })
  })
export type TeachingLesson = z.infer<typeof TeachingLessonSchema>

export const TeachingSourceSchema = z.object({
  kind: z.enum(['siyavula', 'caps', 'none']),
  title: z.string(),
  address: z.string().optional(),
  licence: z.string().optional(),
  credit: z.string(),
})
export type TeachingSource = z.infer<typeof TeachingSourceSchema>

export const LessonStatusSchema = z.object({
  position: z.number().int().min(1).max(8),
  status: z.enum(['ready', 'failed']),
  problems: z.array(z.string()),
  writer: z.string(),
  reviewer: z.string(),
})

/** One file under content/lessons/grade-<n>/<slug>.json: every lesson of one topic of one grade. */
export const TopicLessonsSchema = z.object({
  grade: z.number().int().min(1).max(12),
  baseName: z.string().min(1),
  family: z.string().min(1),
  capsNames: z.array(z.string().min(1)).min(1),
  terms: z.array(z.number().int().min(1).max(4)).min(1),
  source: TeachingSourceSchema,
  lessons: z.array(TeachingLessonSchema).min(1).max(8),
  status: z.array(LessonStatusSchema),
  generatedAt: z.string(),
})
export type TopicLessons = z.infer<typeof TopicLessonsSchema>

/** The name a library entry is stored under: the CAPS name without a trailing " (Term N)". */
export const libraryKey = (name: string): string => name.replace(/\s*\(Term\s*\d+\)\s*$/i, '').trim() || name
```

Both add one line to `packages/profiling/src/schemas/index.ts`: `export * from './teaching'` (same line, same place: last line). Any change to this file goes through the coordinator first.

---

## W1: P143 generator (branch jemma/p141-teach-generator)

### Task 1: Contract, model runner and ranked chain

**Files:**
- Create: `packages/profiling/src/schemas/teaching.ts` (contract above), `scripts/teach/opencode.ts`, `scripts/teach/chain.ts`
- Modify: `packages/profiling/src/schemas/index.ts` (one line)
- Test: `scripts/teach/test/chain.test.ts`, `scripts/teach/test/opencode-parse.test.ts`, `packages/profiling/test/schemas/teaching.test.ts`

**Interfaces:**
- Produces: `runOpencode(model: string, prompt: string, opts: { timeoutMs: number }): Promise<{ text: string; tokensIn?: number; tokensOut?: number; limited: boolean; error?: string }>`; `extractJson(text: string): unknown | null`; `class Chain { constructor(models: string[], now?: () => number); next(exclude?: string[]): string | null; park(model: string, ms: number): void }`; `callJson<T>(chain: Chain, prompt: string, schema: z.ZodType<T>, opts: { exclude?: string[]; timeoutMs: number }): Promise<{ value: T; model: string } | null>`.

Rules for `runOpencode`: spawn `opencode run --pure --format json --title teach -m <model> -f <promptFile> "Follow the attached file. Reply with one JSON object only."` in a fresh empty temp dir that holds an `opencode.json` denying every tool and permission (read the OpenCode config docs for the exact keys; prove with one live run that the JSON events contain no tool call). `--title` is required: without it OpenCode spends a model call on a title. Kill only the child PID on timeout (300 s default). `limited = true` when stderr or events contain `Free usage limit reached`.

- [ ] Step 1: Tests. `teaching.test.ts`: a fixture lesson with 1 try + 1 mistake parses; without a try fails with "needs at least one try block"; `libraryKey('Common fractions (Term 4)') === 'Common fractions'`. `opencode-parse.test.ts`: `extractJson` returns the object from plain JSON, from a ```json fence, from prose + JSON, and null for cut-off JSON. `chain.test.ts`: `next()` returns models in order; a parked model is skipped until 60 min pass (fake clock); `callJson` moves to the next model when the reply fails the schema or `limited` is true, parks a limited model for 60 min, returns null when all fail.
- [ ] Step 2: Run them, see them fail.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them, see them pass.
- [ ] Step 5: Commit `[skip ci]`.

### Task 2: Sources, prompts and the outline + write + review calls

**Files:**
- Create: `scripts/teach/sources.ts`, `scripts/teach/prompts/outline.md`, `scripts/teach/prompts/write.md`, `scripts/teach/prompts/review.md`, `scripts/teach/topics.ts`
- Test: `scripts/teach/test/topics.test.ts`, `scripts/teach/test/sources.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `topicGroups(): { grade: number; baseName: string; family: string; capsNames: string[]; terms: number[]; before: string[]; after: string[] }[]` (from `fixtures/curriculum/caps/grade-*.json`, grouped by `libraryKey`, pitch topics first: Grade 6 `Common fractions`, Grade 10 `Trigonometry`, Grade 11 `Functions`; then Grades 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1); `referenceFor(group): Promise<{ source: TeachingSource; text: string }>`.

Sources: Grades 4 to 12 from Siyavula's reader (`https://www.siyavula.com/read/za/mathematics/grade-<n>`: chapter list, then section pages). Match a CAPS base name to a chapter by a hand table for the 3 pitch topics (Grade 11 Functions = chapter 5 sections 05-functions-01 to 07; find Grade 10 Trigonometry and Grade 6 fractions yourself) and by word overlap for the rest. Strip HTML to text, cache under `content/reference/grade-<n>/<slug>.txt` (gitignored), record the licence line found on the page; no "Creative Commons Attribution License" line = do not use the page. Reference text sent to the model is capped at 24,000 characters. Grades 1 to 3 and any unmatched topic: `source.kind = 'caps'`, reference = the CAPS name, content area, term and the topics before and after it. Never use embedded videos or simulations.

Prompts (new files, plain English): `outline.md` asks for 1 to 8 lesson titles + 2 to 4 objectives each (Grades 1 to 3: 1 to 3 lessons; Grades 10 to 12 big topics like Functions or Trigonometry: 5 to 8), following the reference's order. `write.md` asks for one `TeachingLesson` and carries every rule of spec 6.1: blocks teach in order, at least 3 `worked` blocks each harder (2 for Grades 1 to 3), at least 1 `try` after the worked examples, at least 1 `mistake`, a diagram for each key idea where a kind fits, `speech` on every block in words only (no symbols, no LaTeX), voice and level for the grade (spec 6.1 last two bullets), practice 5 to 8 easiest first, answers markable (same answer rules as `write_lesson.md` lines 17 and the senior kinds), domain/range/inequality/describe questions as `choice` A to D. Append the JSON schema of `TeachingLessonSchema` (`z.toJSONSchema`). `review.md` gives the lesson, grade, objectives and reference and asks for `{ ok: boolean, problems: string[] }` on maths accuracy, grade level, CAPS fit, whether it teaches the objectives, whether each delivery (Read, Pictures, Listen) would still have text, diagrams and voice.

- [ ] Step 1: Tests. `topics.test.ts`: 488 CAPS rows give fewer groups than rows; Grade 6 has one group `Common fractions` holding both term rows; the first three groups are the pitch topics in that order. `sources.test.ts` (no network: HTML fixture): text extraction drops script/style/nav; a page without the CC BY line returns `kind: 'caps'`.
- [ ] Steps 2 to 5: fail, implement, pass, commit `[skip ci]`.

### Task 3: Checks by code

**Files:**
- Create: `scripts/teach/checks.ts`
- Test: `scripts/teach/test/checks.test.ts`

**Interfaces:**
- Produces: `checkLesson(lesson: TeachingLesson, ctx: { grade: number; source: TeachingSource }): string[]` (empty = pass).

Checks: worked count (3, or 2 for grades 1 to 3); every `try.question` and `practice` question passes `answerProblem` (`packages/profiling/src/tools/save/save-lesson.ts:20`); every `worked` answer whose kind is markable passes the same key check; for `whole`, `decimal`, `fraction`, `mixed`, `money`, `number` worked answers the last step line contains the answer (normalised spaces); `speech` contains none of `\`, `^`, `_{`, `$`; diagram sanity: `fraction_bar` shaded <= parts, `triangle` with three angles given sums to 180, coordinate plane numbers finite.

- [ ] Step 1: Tests: one passing fixture; one per failure: a worked answer 12 whose last step says 13 (fails), speech with `\frac` (fails), 2 worked blocks in Grade 6 (fails), 2 worked blocks in Grade 2 (passes), practice answer `"x > 2"` with kind `number` (fails).
- [ ] Steps 2 to 5: fail, implement, pass, commit `[skip ci]`.

### Task 4: Generator, files, ledger, import SQL

**Files:**
- Create: `scripts/teach/generate.ts`, `scripts/teach/import.ts`, `content/lessons/.gitkeep`, `content/reference/.gitignore` (`*` and `!.gitignore`)
- Modify: root `package.json` scripts: `"teach:generate"`, `"teach:import"` (run with `node --import tsx`, like `evals`)
- Test: `scripts/teach/test/generate.test.ts`, `scripts/teach/test/import.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: CLI `pnpm teach:generate [--grade N] [--topic "<base name>"] [--concurrency 4] [--limit-calls N]`; files `content/lessons/grade-<n>/<slug>.json` (TopicLessons), `content/lessons/fail-list.json`, `content/lessons/ledger.jsonl` (one line per call: time, model, kind outline|write|review|rewrite, seconds, tokens if reported, ok); CLI `pnpm teach:import > out.sql`.

Per topic: reference, outline (callJson), then per lesson: write (callJson), `checkLesson`, review (callJson with `exclude: [writer]`), on any problem one rewrite (same writer first) with the problems, re-check + re-review, still failing -> status failed. Resumable: a topic whose file exists with every lesson ready is skipped. Concurrency default 4 topics at once. Writes are atomic (temp file + rename). `import.ts` prints one SQL transaction: `insert into topic_lessons (grade, base_name, family, position, title, content, source, status, checks, model, version) values ... on conflict (grade, base_name, position, version) do update set ...` for ready lessons only, values escaped with dollar quoting that cannot collide (`$jemma$` plus a check that the text does not contain it).

- [ ] Step 1: Tests with a fake runner (no network): one topic end to end writes a valid TopicLessons file; a lesson failing checks twice ends `failed` and is in the fail list; a second run skips the finished topic; `import.test.ts`: the SQL holds ready lessons only and survives a lesson text containing `'` and `$$`.
- [ ] Steps 2 to 5: fail, implement, pass, commit `[skip ci]`.

### Task 5: Live sample gate (LIVE MODEL EXCEPTION, cap 150 OpenCode calls)

- [ ] Step 1: One live call proves no tool events and records seconds per call (write it in the envelope).
- [ ] Step 2: `pnpm teach:generate --topic "Common fractions" --grade 6`, then Grade 10 `Trigonometry`, Grade 11 `Functions`, then one Grade 1 topic and one Grade 9 topic. Commit the 5 files.
- [ ] Step 3: Plant one wrong worked answer in a copy of a lesson and show `checkLesson` catches it (test already covers it; say so).
- [ ] Step 4: `pnpm typecheck`, docs test, em dash test, leak grep; push your branch with the granted command; last commit without `[skip ci]`; report CI.
- [ ] Step 5: Envelope (the worker's final report to the coordinator): per model calls / failures / limit hits / average seconds, which model wrote and reviewed each pitch lesson, the fail list, calls used.

## W2: P144 screens (branch jemma/p142-teach-screens)

### Task 6: Migration 0030 and types

**Files:**
- Create: `supabase/migrations/0030_teaching_library.sql`, `packages/profiling/src/schemas/teaching.ts` (contract above, byte-identical)
- Modify: `packages/profiling/src/db/types.ts` (by hand), `packages/profiling/src/schemas/index.ts` (one line)
- Test: `packages/profiling/test/schemas/teaching.test.ts` (same three cases as Task 1; if W1's file lands first, keep one copy)

Tables (additive only): `topic_lessons (id uuid pk default gen_random_uuid(), grade int not null, base_name text not null, family text not null, position int not null, title text not null, content jsonb not null, source jsonb not null, status text not null check (status in ('ready','failed')), checks jsonb not null default '{}', model text not null, version int not null default 1, created_at timestamptz not null default now(), unique (grade, base_name, position, version))`, index `(grade, base_name)`, RLS: select for `authenticated` where `status = 'ready'`, no write policy. `topic_lesson_progress (child_id uuid references children(id) on delete cascade, topic_lesson_id uuid references topic_lessons(id) on delete cascade, started_at timestamptz not null default now(), finished_at timestamptz, practice_right int, practice_total int, primary key (child_id, topic_lesson_id))`, RLS: copy the read rule of an existing per-child table (look at `0024_own_workspace.sql` and the RLS test pattern); writes only through server actions with the admin client (repo pattern).

- [ ] Steps: test, fail, implement, pass, commit `[skip ci]`. Tell the coordinator the file name at once (one line); he applies it.

### Task 7: Data and server actions

**Files:**
- Create: `apps/web/lib/data/teaching.ts`, `apps/web/app/k/learn/actions.ts`
- Test: `apps/web/test/p142-teaching-data.test.ts`

**Interfaces:**
- Produces: `libraryFor(grade: number, topicName: string): Promise<LibraryEntry[]>` with `LibraryEntry = { id: string; position: number; title: string; minutes: number; done: boolean; started: boolean }` (done/started for the signed-in child); `libraryNames(grade: number): Promise<Set<string>>` (base names with ready lessons, one query for a whole strand screen); `topicLesson(id: string): Promise<{ entry: LibraryEntry; lesson: TeachingLessonForChild; source: TeachingSource } | null>` where `TeachingLessonForChild` is the lesson with every `try.question.answer`, `practice[].answer` and their `steps` REMOVED (answers never reach the browser before an answer is sent); server actions `answerLessonQuestion(topicLessonId: string, where: { kind: 'try'; block: number } | { kind: 'practice'; index: number }, answer: string): Promise<{ correct: boolean; answer: string; steps?: string[]; rightWay: string }>` (marks with `markQuestion` / `finishAnswer` from `packages/profiling/src/logic/meaning.ts`), `finishTopicLesson(topicLessonId: string, right: number, total: number): Promise<void>`, `startTopicLesson(topicLessonId: string): Promise<void>`.
- The grade of a topic comes from the map it belongs to (the learner's class map or own-workspace map, as `apps/web/app/k/maths/[family]/page.tsx` already knows it); the name key is `libraryKey(topic.name)`.

- [ ] Step 1: Tests (pure functions only, no database): `forChild(lesson)` strips answers and steps from try and practice; `libraryKey` matching for a "(Term 4)" row; `answerLessonQuestion`'s pure core marks `x = 4` right for key `4` kind `number`.
- [ ] Steps 2 to 5: fail, implement, pass, commit `[skip ci]`.

### Task 8: Lesson list, Learn button, lesson reader with three deliveries, practice

**Files:**
- Create: `apps/web/app/k/learn/[topicId]/page.tsx` (lesson list), `apps/web/app/k/learn/[topicId]/[position]/page.tsx` (reader), `apps/web/app/k/learn/_parts/LessonReader.tsx`, `apps/web/app/k/learn/_parts/Block.tsx`, `apps/web/app/k/learn/_parts/DeliverySwitch.tsx`, `apps/web/app/k/learn/_parts/delivery.ts`, `apps/web/app/k/learn/_parts/LessonPractice.tsx`
- Modify: `apps/web/app/k/Practise.tsx` (a `LearnLink` next to the Practise button, shown only when the row's topic has library lessons), `apps/web/app/k/maths/[family]/page.tsx` (one `libraryNames` call, pass `hasLessons` per row)
- Test: `apps/web/test/p142-delivery.test.tsx`, `apps/web/test/p142-learn-link.test.tsx`

**Interfaces:**
- Consumes: Task 7.
- Produces: `type Delivery = 'read' | 'pictures' | 'listen'`; `defaultDelivery(trials: { format: 'reading' | 'diagram' | 'audio'; score: number }[]): Delivery` (best average score: diagram -> pictures, reading -> read, audio -> listen; none -> read); `blockView(block: TeachingBlock, d: Delivery): { showText: 'full' | 'first-sentence' | 'collapsed'; diagramFirst: boolean; diagramLarge: boolean; speak: boolean; revealSteps: boolean }` exactly per spec 6.2 table.

Reader: progress bar, title, objectives, key words, then blocks in order; worked steps revealed one tap at a time in Pictures and Listen, all visible in Read; try block uses the existing answer field (`MathAnswerField` for meaning kinds, choice buttons for `choice`) and `answerLessonQuestion`, then shows steps and right way; Listen uses `window.speechSynthesis` on `speech` with a play/pause per block and "Play all"; maths in text renders with `MathText` / `FractionText` from `apps/web/app/k/session/_parts/Frac.tsx`; summary; credit line with link; then practice (`LessonPractice`, same marking, score at the end, `finishTopicLesson`), then "Next lesson" or "Back to the lessons". Delivery switch (Read / Pictures / Listen) at the top, choice kept in `localStorage` key `jemma.delivery`. Copy is plain and short. Phone first (390 px), works at 1440 px, light theme, existing kit only.

- [ ] Step 1: Tests: `defaultDelivery` cases; `blockView` matrix: Listen never hides diagrams (diagram blocks and worked diagrams shown), Pictures never drops text (first sentence + More), Read shows diagrams; `LearnLink` renders only with `hasLessons` true and links to `/k/learn/<topicId>`.
- [ ] Steps 2 to 5: fail, implement, pass, commit `[skip ci]`.

### Task 9: "Learn it first" in the practice session

**Files:**
- Modify: `apps/web/app/k/session/[sessionId]/page.tsx` (fetch `libraryFor` for the session's topic), `apps/web/app/k/session/[sessionId]/SessionFlow.tsx` (new optional prop `library: LibraryEntry[]`; when non-empty the Learn step renders `LearnFirstPanel` instead of LearnCards/LearnDiagram/LearnAudio)
- Create: `apps/web/app/k/learn/_parts/LearnFirstPanel.tsx`
- Test: `apps/web/test/p142-learn-first.test.tsx`

Panel: "Learn it first" heading, the lesson list with ticks, "Start lesson 1" (or "Continue lesson N"), and "I know this, go to practice" (calls the existing `startTry`). Empty `library` = Learn step exactly as today.

- [ ] Step 1: Tests: empty library renders today's Learn component (spy); non-empty renders the panel; "I know this" calls the start-try handler.
- [ ] Steps 2 to 5: fail, implement, pass, commit.
- [ ] Step 6: `pnpm typecheck`, docs test, em dash test, button guard test, leak grep; push your branch with the granted command; report CI. Envelope (the worker's final report to the coordinator): what no browser saw (all screens: the coordinator proves them on the preview after the import).
