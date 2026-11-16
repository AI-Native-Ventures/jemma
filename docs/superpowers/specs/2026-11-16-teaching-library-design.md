# Jemma teaching library: design

Status: DRAFT for owner approval. Written 16 Nov 2026 ~21:00 EAT. Pitch: 17 Nov 2026, afternoon.
Repo: AI-Native-Ventures/jemma, branch from `develop`. This file is committed by the first builder as
`docs/superpowers/specs/2026-11-16-teaching-library-design.md`.

## 1. Why

The owner (16 Nov): Jemma does not teach. Opening Grade 11 Functions shows three diagrams and then
practice starts. "How am I gonna learn trigonometry by three cards? ... textbooks have pages upon pages
upon pages. There's examples."

Cause (our design, not missing data):
- `packages/profiling/src/jobs/write_lesson.md` lines 22 to 24 cap the teaching part at 3 to 5 cards,
  OR 2 to 4 diagram steps, OR a 150 to 220 word audio script, then 15 questions (line 15).
- Line 28 fixes the voice "for a Grade 6 child", even in Grade 12.
- `fixtures/curriculum/caps/grade-*.json` hold topic NAMES only (488 topics, Grades 1 to 12). The model
  teaches from a title.

A learner with no teacher nearby must be able to open a topic and actually learn it, at textbook depth,
with worked examples.

## 2. Owner's rules (his words, binding)

1. A topic is big. It needs real teaching content at textbook depth with worked examples, not a short
   teaser before practice.
2. Learning style is EMPHASIS, NEVER EXCLUSION. Visual = a lot more diagrams, still some reading.
   Auditory = a voice explains instead of reading, diagrams still there. Reading = mostly text, still
   diagrams. Same content in every style, only the delivery changes.
3. Content comes from a lesson library written from the free textbooks (approach A, chosen 16 Nov).
4. All Grades 1 to 12 (chosen 16 Nov). Mathematics only (owner, 12 Nov).
5. Pitch topics that a person checks before the pitch: Grade 6 Common fractions, Grade 10
   Trigonometry, Grade 11 Functions.

## 3. Goals, non-goals, anti-goals

Goals
- Every one of the 488 CAPS topics (Grades 1 to 12) has 1 to 8 ordered lessons, written once,
  checked, stored, the same for every learner.
- Each lesson teaches first (explanation, diagrams, several worked examples line by line, a "your
  turn" with hint, the usual mistakes, a summary), then has practice on that lesson only.
- One stored lesson renders in three deliveries (Read, Pictures, Listen).
- A learner reaches the lessons from My maths (each topic) and from a practice session's Learn step.
- The three pitch topics are read and fixed by a person (coordinator) and walked by the owner.

Non-goals (tonight)
- Other subjects. Afrikaans or other languages.
- Teacher or parent screens for the library.
- Per-child generated full lessons (approach C, rejected).
- Human check of all 488 topics (machine checks only outside the pitch topics).
- Linking library lesson progress into gaps, diagnosis, Long view or the teacher's reports.

Anti-goals (failure even if it "works")
- Unchecked maths shown to a learner as if it were checked.
- A lesson built on a source without that source's credit, or on a source whose licence does not
  allow adapting (CC BY-ND, CC BY-NC) without the owner's yes.
- Breaking the demo path or the recorded AI answers. `write_lesson.md` and the lesson schemas the
  model is handed (`PrimaryLessonSchema`, `SeniorLessonSchema`, hash pinned by tests) do NOT change.
- A delivery that drops a channel (a Listen lesson with no diagrams, a Pictures lesson with no text).

## 4. Constraints

- Pitch 17 Nov afternoon. Everything merged to `develop`, deployed to the preview
  (https://jemma-web.horizonsystems.workers.dev) and walked at 390 then 1440 by late morning.
- Database: Supabase project jemma-demo-2. No builder test or script may write to it. Builders write
  JSON files and an import script; the coordinator runs the import.
- Never run the `supabase` CLI on this Mac. psql with `SUPABASE_DB_URL` only (coordinator).
- Models through the existing AI SDK setup (`packages/profiling/src/ai/models.ts`), provider chosen by
  env (`LLM_PROVIDER`, default `deepseek`), never hardcoded.
- Web runs on Cloudflare Workers: the library cannot be bundled into the web app (size); it lives in
  the database and is read per lesson.
- Migration number: `0030_teaching_library.sql` (agreed with jemma-94: 0028_ai_usage is applied,
  P139 may take 0029).
- Machines: jemma-94 runs 6 workers on the owner's Mac until ~22:30 EAT and merges into develop until
  22:30. Worker 1 (generator) runs on Farhana's Mac (ssh farhana, M1 8 GB, one heavy step at a time).
  Worker 2 (screens) runs on the owner's Mac; browser proofs only after 22:30. Teaching branches merge
  after jemma-94's, rebased on develop. Message jemma-94 before any deploy.
- Maths display: P135 and P136 (tonight) change how maths is typeset on learner and teacher screens.
  Lesson text uses the same maths notation and renderer as the learner session (`apps/web/app/k/
  session/_parts/typeset.ts` and what P135 merges).

## 5. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | Library written once per topic from the textbook as reference, checked by code and a second model, stored | Real upfront work; textbook depth; maths checked before a child sees it; opens instantly | CHOSEN by owner |
| B | Show textbook sections word for word with credit, add voice and practice | Fastest and trusted words, but feels like a PDF reader; ND licence blocks adding diagrams inside the text; Grades 1 to 3 have no Siyavula maths book | Rejected |
| C | AI writes a full lesson live per child (current way, bigger) | Least build, but unchecked maths reaches children, minutes of waiting, every child different | Rejected |

## 6. The design

### 6.1 Content shape (new schema, separate from the session lesson)

New file `packages/profiling/src/schemas/teaching.ts`. It is NOT handed to `write_lesson` and does not
touch the pinned schemas.

```
TopicLessons = {
  grade, term, topicName (exact CAPS name), family, capsName,
  source: { kind: 'siyavula' | 'caps' | 'none', title, address, sections? },
  lessons: TeachingLesson[]          // 1 to 8, in teaching order
}

TeachingLesson = {
  position, title, minutes,           // minutes: 10 to 25
  objectives: string[],               // 2 to 4, "You will be able to ..."
  keyWords: { word, meaning }[],      // 0 to 8
  blocks: Block[],                    // 8 to 30, in order
  summary: string[],                  // 3 to 6 lines
  practice: Question[]                // 5 to 8, reuse QuestionSchema (wide/senior shape), easiest first
}

Block =
  | { kind: 'explain', text, speech }                        // text: short paragraphs, maths in the session notation
  | { kind: 'diagram', spec, caption, speech }               // spec: DiagramSpecSchema or SeniorDiagramSpecSchema
  | { kind: 'worked', problem, steps: { line, reason }[], answer, answerKind, speech, diagram? }  // 2 to 8 steps
  | { kind: 'try', question: Question, hint, speech }        // the learner answers; steps shown after
  | { kind: 'mistake', wrong, right, why, speech, diagram? } // the usual mistake next to the right way
```

Rules every lesson meets:
- At least 3 `worked` blocks per lesson (2 for Grade 1 to 3), each harder than the one before.
- At least 1 `try` block per lesson, after the worked examples it practises.
- At least 1 `mistake` block per lesson.
- Diagrams: at least one diagram per key idea where a diagram kind fits the topic (see 6.6). Visual
  delivery depends on there being many.
- Every block has `speech`: the words a voice says for it, maths said in words ("x squared plus 3"),
  no symbols. Listen delivery reads `speech`, never `text`.
- Voice and level fit the grade: Grades 1 to 3 very short sentences and concrete objects; Grades 10
  to 12 precise terms (domain, range, asymptote) defined in `keyWords`.
- Grades 1 to 3: more `diagram` blocks, fewer words per block, answers mostly `whole` or `choice`.

### 6.2 Three deliveries of one lesson (rendering only)

The same blocks, in the same order, in every delivery. The delivery changes emphasis:

| | Read | Pictures | Listen |
|---|---|---|---|
| explain | full text | text shortened to its first sentence with "More" to open the rest | voice plays `speech`; text collapsed under "Show words" |
| diagram | shown, normal size | shown large, first on the screen | shown; voice reads caption |
| worked | all steps visible | steps revealed one tap at a time, diagram first | voice reads each step as it is revealed |
| try / mistake | as written | diagram first | voice reads; learner answers on screen |

Default delivery = the learner's best format from `format_trials` (existing data: diagram ->
Pictures, reading -> Read, audio -> Listen; no trials -> Read). A switch at the top (Read / Pictures /
Listen) changes it any time; the choice is remembered on the device.

Voice: the browser's speech (as `LearnAudio` already falls back to). Pre-recorded Workers AI audio
(`packages/profiling/src/speech.ts`) only for the three pitch topics, if time allows. Builder decides.

### 6.3 Where the learner meets it

1. My maths -> strand -> each topic row gets a "Learn" button beside "Practise"
   (`apps/web/app/k/maths/[family]/page.tsx`, `apps/web/app/k/Practise.tsx`). It opens the topic's
   lesson list: titles, minutes, a tick for each finished lesson, "Start" or "Continue".
2. Lesson screen (new route, e.g. `/k/learn/[topicLessonId]`): blocks in order, progress at the top,
   the delivery switch, then practice. Practice uses the existing `QuestionScreen` and marking.
   Finishing it saves progress (right / total) and ticks the lesson.
3. Practice session Learn step (`apps/web/app/k/session/[sessionId]/SessionFlow.tsx`): when the
   session's topic has library lessons, the Learn step shows a "Learn it first" panel (lesson list with
   ticks, "Start lesson 1" or "Continue", and "I know this, go to practice") instead of the generated
   cards/diagram/audio. When the topic has no library lessons, the Learn step is unchanged.
   The generated lesson is still written and its questions are still used: `write_lesson` is untouched,
   so recorded answers keep matching.

Topic matching: a library entry matches a topic when grade and exact CAPS name match (CAPS maps,
own workspace, made-up school all use exact CAPS names). A teacher's own map with other names gets no
match and keeps today's flow. The demo class 6B path is expected to be unaffected (check).

### 6.4 Storage

Migration `0030_teaching_library.sql`:
- `topic_lessons`: id, grade int, term int, topic_name text, family text, position int, title text,
  content jsonb (one TeachingLesson), source jsonb, status text check in ('ready','failed'),
  checks jsonb (results of every check), model text, version int default 1, created_at.
  Unique (grade, topic_name, position, version). Index (grade, topic_name).
  RLS: select for every signed-in user where status = 'ready'; no insert/update/delete from the app.
- `topic_lesson_progress`: child_id, topic_lesson_id, started_at, finished_at, practice_right,
  practice_total. Primary key (child_id, topic_lesson_id). RLS: the learner (and their parent,
  same rule as other child rows) reads and writes their own.
- The library is global (not per school), keyed by grade + CAPS topic name.

Files in the repo (source of truth, reviewable): `content/lessons/grade-<n>/<topic-slug>.json`, one
TopicLessons per topic. `content/lessons/fail-list.json` lists topics/lessons that failed checks and
why. Import script `scripts/teach/import.ts` upserts ready lessons into `topic_lessons` (status
failed rows are not imported). The coordinator runs the import on jemma-demo-2.

### 6.5 Generator (offline, run on a Mac, not on Workers)

`scripts/teach/generate.ts`, resumable (skips topics whose file exists and passed), concurrency flag,
grade/topic filters, token and cost ledger per call written next to the content.

Per topic:
1. Reference text:
   - Grades 10 to 12: the matching Siyavula Everything Maths chapter/sections (siyavula.com reader),
     fetched once and cached under `content/reference/` (gitignored if licence unclear).
   - Grades 4 to 9: Siyavula's Grade 4 to 9 Mathematics books where a matching chapter exists
     (availability per grade still to confirm).
   - Grades 1 to 3: the CAPS Foundation Phase document's clarification notes for the topic
     (DBE PDF, address in `fixtures/curriculum/caps/README.md`; `packages/profiling/src/ai/pdf-text.ts`
     can extract text).
   - No reference found: `source.kind = 'none'`, the topic still gets written, the reviewer is told.
   The three pitch topics MUST have a reference.
2. Outline call: grade, term, topic, capsName, contentArea, the topics before and after it in the
   year, reference text -> 1 to 8 lesson titles with objectives (Grades 1 to 3: 1 to 3 lessons).
3. Write call per lesson -> TeachingLesson JSON (generateJson with the schema, as existing jobs do).
4. Checks (all must pass):
   - Schema and the rules in 6.1 (counts, speech present, step counts).
   - Maths check by code: every `worked` answer and every `try`/`practice` answer is markable by the
     existing marking (`logic/answers.ts`, `logic/meaning.ts`); for numeric work the last step equals
     the answer; arithmetic in steps is re-evaluated where a step is a plain calculation.
   - Diagram check by code: spec parses; simple sanity (fraction bar shaded <= parts, triangle angles
     sum to 180 when all given, graph parameters finite).
   - Credit check by code: a lesson whose source is set carries the credit line (see 6.7).
   - Review call (a different model from the writer where configured: env `TEACH_REVIEW_PROVIDER` /
     `TEACH_REVIEW_MODEL`): returns { ok, problems[] } on maths accuracy, grade level, CAPS fit,
     whether it actually teaches the objectives, whether every delivery would work.
5. A failed lesson is rewritten once with the problems listed, then re-checked. Still failing ->
   status 'failed', written to the fail list. A topic with any failed lesson keeps its passing lessons;
   if lesson 1 fails, the topic shows no library (today's flow).

### 6.6 Diagram coverage (known limit)

Existing kinds: fraction_bar, number_line, area_model, place_value, bar_chart, shape_2d, grid_area,
coordinate_plane (line, parabola, hyperbola, exponential, trig graphs), triangle. Topics needing
circles/geometry constructions, 3D objects, transformations, histograms/box plots, probability trees
get fewer diagrams. New diagram kinds are NOT in tonight's scope unless the builder finishes early;
the generator must never invent a diagram kind.

### 6.7 Sources and credit

- Siyavula's online reader (siyavula.com/read/za/mathematics/grade-N/...) states: "All Siyavula
  textbook content made available on this site is released under the terms of a Creative Commons
  Attribution License" (CC BY 3.0, checked 16 Nov 2026 on the Grade 11 page). CC BY allows adapting
  with credit. Embedded videos and simulations are excluded: never use them.
- Chapter and section addresses follow the pattern
  `/read/za/mathematics/grade-11/functions/05-functions-01` (Grade 11 Functions: 5.1 Quadratic,
  5.2 Average gradient, 5.3 Hyperbolic, 5.4 Exponential, 5.5 to 5.7 sine, cosine, tangent).
- Every lesson built on Siyavula shows, at the end of the lesson and in `source`: "Based on Siyavula
  Everything Maths, Grade N, chapter X, CC BY 3.0" with a link.
- Before using Siyavula pages for a grade, the generator records the licence line found on that
  grade's page; a page without the CC BY line is not used (topic falls back to the CAPS document).
- Grades 1 to 3: the CAPS document (Department of Basic Education, public) as reference, written in
  our own words, credited "Follows the CAPS Mathematics curriculum, Department of Basic Education".

## 7. Acceptance gates (in order)

1. Generator on 6 sample topics (Grade 1, 3, 6 Common fractions, 9, 10 Trigonometry, 11 Functions):
   every lesson passes all checks; a planted wrong worked-example answer is caught by the code check;
   a lesson with a source and no credit line fails. Coordinator reads all 6 outputs.
2. Screens: Grade 6 Common fractions, Grade 10 Trigonometry, Grade 11 Functions in all three
   deliveries at 390 then 1440: no sideways overflow, no page errors, the switch works, practice saves
   progress, My maths shows "Learn", the session Learn step shows "Learn it first" for a library topic
   and is unchanged for a non-library topic. Unit tests for the schema, checks and delivery rules.
   `demo-path.spec.ts` green locally and in CI; replay fixture untouched.
3. Full run over 488 topics: at least 95 percent of topics have lesson 1 ready; fail list written;
   cost and tokens reported from the ledger.
4. Coordinator reads every lesson of the three pitch topics and fixes or regenerates any problem.
5. Merged to develop, migration applied and import run on jemma-demo-2 by the coordinator, preview
   deployed, the three pitch topics walked on the preview at 390 then 1440, proof page with
   screenshots and an honest NOT-verified list, opened for the owner.

## 8. Left to the builder

- Exact route names, component split, how blocks animate or reveal.
- Prompt wording for the outline, writer and reviewer calls (must follow 6.1 and 6.5).
- How reference chapters map to CAPS topics (a mapping table is fine).
- Concurrency and retry settings within the existing model helpers.
- Whether Workers AI audio is pre-recorded for the pitch topics.

## 9. Builder-check answers and coordinator calls (16 Nov ~21:30 EAT)

Answered from the repo:
- Demo class 6B uses its own topic names ("Equivalent fractions" etc.), never an exact CAPS name, so
  it never matches the library and its demo path is unaffected.
- P135 changes only how notation is rendered, not the notation the model writes: generation can
  start before P135 merges.
- A session resumes from its stored items (`beginSession`), so leaving the Learn step for a lesson
  and coming back works.
- Library practice needs its own server action (marking today writes `session_items`): reuse
  `finishAnswer`, never send answers to the client.
- `format_trials` has `topic_family`, `format`, `score`: default delivery is chosen per family.

Coordinator calls (builder follows these):
- MODEL ROUTE: no Cloudflare API token exists (owner chose the agent's built-in AI binding). The
  generator calls Workers AI through a NEW, separate Worker `jemma-teach`: one POST endpoint, header
  secret (random, generated by the coordinator, stored as a wrangler secret and in a 600 file on the
  Mac running the script), rate limit, calls `env.AI` with the model given (allow-list: writer
  `@cf/deepseek-ai/deepseek-v4.1-flash-1017`, reviewer `@cf/zai-org/glm-5.3-flash`), returns the
  completion. It never touches `jemma-agent` or `jemma-web`. Coordinator deploys it (after telling
  jemma-94) and deletes it after the run. Reuse the workers-ai provider code from P121d/e
  (`packages/profiling/src/ai/models.ts`) where it fits.
- REVIEWER = GLM 5.3 Flash (different family from the DeepSeek writer).
- SHARED LESSONS FOR REPEATED TERMS: 488 rows hold ~265 base names ("Common fractions" and
  "Common fractions (Term 4)"). One lesson set per (grade, base name), base name = CAPS name with
  the " (Term N)" suffix removed. Every term row opens the same set. Storage key uses the base name.
- ORDER AND CUT LINE: pitch topics first (Gr 6 Common fractions, Gr 10 Trigonometry, Gr 11
  Functions), then Grades 10 to 12, 7 to 9, 4 to 6, 1 to 3. Whatever has passed by 10:00 EAT on
  17 Nov is imported for the pitch; the run continues and later imports add the rest.
- ANSWERS: `worked` answers are display-only (shown, never typed): checked by the reviewer, plus the
  code check where the answer is a number or expression. `try` and `practice` must be markable by
  existing marking: domain, range, inequality, describe-the-graph and similar become `choice`
  (A to D) or `point`/`equation`/`number`. No new answer kinds tonight.
- PITCH TOPICS use the same writer; the coordinator reads every lesson of them and regenerates or
  fixes by hand.
