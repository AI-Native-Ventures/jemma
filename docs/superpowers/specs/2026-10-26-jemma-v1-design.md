# Jemma v1 design (Agentic Africa Challenge)

Date: 26 Oct 2026. Status: approved by Basheer 26 Oct; updated 27 Oct to match the Claude Design screens.
Build plan: docs/superpowers/plans/2026-10-27-jemma-v1-build.md.
Human-readable version (features, screens, flows): Claude Doc "Jemma Feature Set",
https://claude.ai/artifact/TSXRfqZmR9pFZn8iVGCrmA (tabs: Step 1 Features, Step 2 Screens and flows, Step 3 v1).

Marked **[Basheer]** = decided by Basheer. Marked **[Claude's call]** = my decision, open to change.
Everything unmarked is description.

## 1. Intent

Jemma is each school child's own AI tutor. Teachers feed it marked tests, parents support at home,
and the child learns their gaps and fills them with "their Jemma". [Basheer]

The agent reads photographed tests, marks them, works out why answers are wrong, plans what to teach
next, teaches each gap in one of three formats (short reading, diagram, short audio memo), quizzes the
child, and reports to teacher and parent. Over time it measures which format helps this child with
this kind of topic. [Basheer]

Why: Basheer wants a product that actually helps children learn, not a report generator. Accuracy
matters more than anything; a wrong mark shown confidently destroys trust. [Basheer]

## 2. Users

| Role | Who | Main job in Jemma |
| --- | --- | --- |
| Teacher | Class or subject teacher, acts as admin of their class | Uploads curriculum, snaps tests, sees class gaps |
| Parent | Parent or guardian, may have several children in different grades | Sees marks and gaps, supports sessions at home |
| Child | Grade 1 to 12 | Learns and fixes gaps with Jemma |

One app, role picked at signup. [Basheer] Parents see marks. [Basheer]

## 3. Goals for v1

v1 exists to win the challenge: one demo path of the full agent loop, working end to end on synthetic
data, shown to judges as **both a demo video and a live link they log into themselves**. [Basheer]

Demo path (the acceptance test for v1):

1. Teacher uploads a Grade 6 Maths curriculum document. Jemma drafts a topic map. Teacher edits and approves it.
2. Teacher creates a test, snaps the answer key (memo), then snaps 5 learner papers. Jemma reads and marks
   them, flags at least one it is unsure about. Teacher reviews the flagged one. Class gaps appear with the
   common mistake (for example "4 of 5 add tops and bottoms").
3. Parent enters the class code, links their child, and sees the child's Profile: marks, gaps, and the
   evidence behind each gap down to the photo of the paper.
4. Child opens Today and runs a session: warm-up, learn (one of three formats), 5 questions with no
   right/wrong shown, results at the end. The gap moves from "new" to "practising".
5. Teacher and parent see the session result and the updated gaps.
6. Non-academic profile [Basheer, 26 Oct: notes, attendance, activities + subject guidance]: the
   teacher adds a quick observation and marks attendance; the parent adds an extracurricular activity;
   the Profile combines them with the academic picture over time, and Jemma writes an age-appropriate
   subject guidance card ("what to focus on next and why", with evidence). Build order if time runs
   short [Claude's call]: guidance card, then teacher notes, then attendance, then activities.
   MCP tools gain `add_observation`, `record_attendance`, `add_activity` and `subject_guidance`.

### Challenge requirements (found 26 Oct on a third-party listing, fundsforNGOs; official brief not seen yet)

- Build open-source learner profiling tools for educators and guardians: combine academic and
  non-academic information over time, produce understandable reports, support age-appropriate subject
  or career guidance. Example inputs: quiz results, attendance, classroom participation, extracurricular
  activities, teacher observations.
- **Required: a team-built MCP server with at least three different tools, at least one of which
  actively updates or analyses learner profiles.**
- Submission: public code repository, demo video, text description, technical documentation.
- Consequences for v1 [Claude's call]: Jemma exposes its agent jobs as tools on its own MCP server
  (running on Cloudflare Workers), and the orchestrator calls those tools as an MCP client, so the MCP
  server is the real engine, not a side demo. Minimum tool set: `read_and_mark_paper`,
  `update_learner_profile` (diagnoses and writes gaps), `plan_next_session`, `generate_lesson`,
  `get_learner_profile`, `class_gap_report`.
- Licence [Basheer, 26 Oct: split]: the MCP server and profiling tools live in their own package under
  Apache 2.0, which meets the open-source rule. The Jemma app (screens, school features) is
  source-available: free for families and up to 10 users, schools pay (candidate: Business Source
  License with that free-use grant). Keep the two in separate folders with separate LICENSE files from
  day one so nothing app-only leaks into the open package. Licence files are written at submission;
  a lawyer checks the wording before any launch. Repo stays private until then.

## 4. Non-goals for v1 (in the full design, built after the challenge)

- Subjects other than Maths. Maths only for the challenge, more subjects "coming soon". [Basheer]
- Native app store apps. v1 is one responsive web app. [Basheer]
- Shared curriculum map library, Ask Jemma chat, Wins tab.
- Teen invites, "Who's learning?" shared-phone picker and per-child PINs, Grade 1 to 3 mode.
- "Find my level" placement check. Adult setting overrides (v1 uses defaults only).
- Multiple teachers per child. One class teacher per child in v1.
- SMS, WhatsApp, email notifications. [Basheer] (In-app only; in v1 a notification list inside the app is enough.)
- Languages other than English. [Basheer]
- Real format learning from live data (needs weeks); the demo shows it on seeded synthetic history.

## 5. Anti-goals (failure even if it works)

- Jemma shows a wrong mark or a made-up gap with no way to see the evidence or fix it.
- Cluttered screens, everything crammed onto one home screen. Basheer rejects this hard.
- Labelling a child with a fixed "learning style". Format results are per child, per topic, measured,
  and say "too early to tell" until there is enough data.
- Showing the child right/wrong during a quiz, or a running score.
- Any real learner data in the system.

## 6. Constraints

- **Time:** build Wed 28 Oct to Sun 1 Nov 2026. Basheer tests and we fix Mon 2 to Sat 7 Nov. Submit by Mon 9 Nov. [Basheer: 2 weeks max, really 1 week of build]
- **Data:** synthetic learners only. No real names, photos or records of real children.
- **AI:** every model call goes through the Vercel AI SDK with the provider chosen by env, never hardcoded.
  Text reasoning uses `LLM_PROVIDER` (default `deepseek`). Vision and text-to-speech use their own
  env-selected providers (section 9).
- **Untrusted content:** everything read from photos, uploads and model output is data, never
  instructions. A test paper that says "ignore your instructions" changes nothing. Model calls get no
  tools that reach outside their job.
- **No outbound messaging** (email, SMS, WhatsApp) and no arbitrary SQL, shell or filesystem access from the agent.
- **Copy:** no em dashes anywhere in UI copy or docs.
- **Ask Basheer first:** before deploying anywhere, choosing a software licence, making the repo public,
  using real learner data, or downloading large model or container images. Repo stays private, no LICENSE file.
- **Brand:** lowercase "jemma" wordmark (Outfit 700, the j's dot is a diamond gem). Ink #1F1D36,
  coral #FF6A4D. Font Outfit. Logo canvas: https://claude.ai/artifact/LDjRE9qhiygfSobDD4x1Vb (board D).

## 7. Product decisions in force

Full list with status lives in the Claude Doc, tab Step 1. The ones that shape v1:

| Decision | Source |
| --- | --- |
| Teacher feeds, parent supports, child fixes own gaps with their Jemma | Basheer |
| Each child is their own space; opens on Profile; other features in tabs | Basheer |
| Quiz: child sees results at the end, not per question | Basheer |
| Curriculum: teacher uploads the curriculum for their subject; Jemma drafts the topic map; teacher approves before any child uses it | Basheer |
| Phone + laptop for every role; everything works on both | Basheer |
| Teacher approves one answer key per test before papers are marked | Claude's call |
| Parent confirms every scan they make; teacher reviews only papers Jemma is unsure about | Claude's call |
| Linking: teacher shares a class code, parent enters it, teacher says yes before the parent sees anything | Claude's call (teacher yes added 27 Oct from the designs: a code alone would expose a child's marks) |
| Teacher snaps papers with the phone's own camera, one photo per page (live in-browser camera after the challenge) | Claude's call, 27 Oct |
| Child signs in with a login code and a 4-digit PIN the parent sets | Claude's call, 27 Oct, from the designs |
| During a quiz Jemma silently eases the next question after a miss | Claude's call |

## 8. The agent

Five jobs. Each is a server-side step with typed input and output (zod schemas). People approve only
the exceptions, through one "Needs you" list per teacher and per parent.

| Job | Input | Output | Human checkpoint |
| --- | --- | --- | --- |
| Map drafter | Uploaded curriculum document (PDF or photos) | Topics per term in teaching order, prerequisite links, common misconceptions per topic | Teacher edits and approves the map |
| Reader | Answer key photo(s); learner paper photo(s); test question list | Per question: question text, learner's answer as read, mark, confidence 0 to 1, crop region if available | Answer key: teacher approves. Papers: anything under the confidence threshold or with an unreadable name goes to Needs you |
| Diagnoser | Marked answers, topic map | Per wrong answer: topic, misconception label (from the topic's list or "other" with text), suspected missing prerequisite | None in v1 (shown with evidence, editable later) |
| Planner | Child's gaps with stages, session history, format trial history | Next session: topic, format, difficulty, warm-up items | None |
| Tutor | Planned session, topic, child's grade | Lesson content in the chosen format, 5 questions in 3 difficulty levels with answers and explanations | None in v1 (synthetic data); flagging bad content is post-v1 |
| Reporter | Marks, gaps, sessions | Class gap summary with the most common mistake and a short reteach activity; parent summary per child | None |

### Orchestration [Claude's call]

Jemma is an agent, not a fixed pipeline: an orchestrator uses Vercel AI SDK tool calling with the
jobs above as its tools. It is woken by events (curriculum uploaded, answer key approved, paper
snapped, session finished), decides which jobs to run and in what order, and can re-run a job or
route to Needs you when a result looks doubtful. Every step it takes is written to an activity log
shown to teacher and parent as "What Jemma did" (for example "Read 5 papers, 1 unsure, sent to
Ms Banda"). Each tool has a zod schema and touches only its own records.

### Test paper format [Claude's call]

A printed sheet with numbered questions and answer spaces; the learner writes answers and working by
hand. Whole marks per question in v1 (part marks for method come later). Question types: fraction and
decimal arithmetic, short word problems, multiple choice. Jemma reads the question list and the
correct answers from the memo photo; the teacher approves that key before papers are marked.

### Learning session [Basheer for shape and feedback timing, Claude's call for numbers]

1. Warm-up: 2 questions on gaps marked fixed earlier (skipped if none).
2. Learn: one gap, one format.
   - Reading: 3 to 5 short cards.
   - Diagram: a maths diagram rendered by the app from a structured spec (section 9).
   - Audio: a script of about 3 minutes, turned into speech, with the transcript shown.
3. Try: 5 questions, one at a time, no right or wrong shown. After a miss the next question drops one
   difficulty level; after two correct in a row it rises one.
4. Results at the end: each missed question with why and the right way ("Let's look at these 2 together").
   No total score for the child. Parent and teacher see everything.
5. Progress: gap stage moves. Stages: new, practising (after the first session), fixed (after a later
   session at least N days on scores 4 or 5 of 5; N configurable, short for the demo).

### Format learning [Claude's call]

The Planner rotates formats across sessions on the same or similar topics at similar difficulty and
records results per child, topic and format. "What helps" shows "too early to tell" until each format has
at least 3 sessions for that child. The demo child is seeded with synthetic history so a result shows.

## 9. Stack

Hosting [Basheer, 26 Oct]: free cloud Supabase for database, login and photos, plus Cloudflare Workers
on the paid plan ($5 a month) for the web app and the agent. Code runs on Basheer's Mac during the build
and points at the cloud Supabase project; Cloudflare preview links let Basheer test on his phone from
anywhere. Preview links carry synthetic data only. Budget: "not much", so testing leans on free model
tiers and saved model answers. Limits checked 26 Oct: Supabase free = 500 MB database, 1 GB storage,
50,000 monthly users, 2 projects, paused after 1 week without activity. Cloudflare Workers free = 10 ms
CPU per request (too little), paid = 30 s default CPU, 10 million requests a month included, Queues
available.

The rest is [Claude's call]:

- **App:** Next.js (App Router) with TypeScript and Tailwind CSS, as one responsive web app, deployed to
  Cloudflare Workers through the OpenNext Cloudflare adapter. The builder may pick a Workers-native
  framework instead if it is clearly faster to ship.
  Installable to the phone home screen (web app manifest, minimal service worker).
  Phone layout: bottom tab bar. Wide screens (laptop): left sidebar with the same tabs, list and detail side by side.
- **Camera:** browser file input with camera capture; multiple pages per paper; laptop can upload images or PDFs.
- **Backend:** Supabase (Postgres, Auth, Storage, row-level security). Email sign-in for v1 (phone OTP needs a paid SMS provider).
- **Text model:** Vercel AI SDK, provider from `LLM_PROVIDER` (default `deepseek`), model name from env.
  Basheer has keys for Anthropic, Google Gemini, OpenAI, OpenRouter and OpenCode, but not DeepSeek, so
  `deepseek` is reached through OpenRouter unless a DeepSeek key is added.
- **Saved model answers:** a record and replay layer in front of every model call. Tests and repeated
  local runs replay saved answers for the same input, so they cost nothing; live mode is used for the
  demo. Free tiers (for example Gemini's) may use requests to train models, which is acceptable only
  because all v1 data is synthetic; switch to paid tiers before any real child uses Jemma.
- **Vision model:** Vercel AI SDK, provider from `VISION_PROVIDER`, model from env. Chosen by a spike on Tue 27 Oct:
  run 3 candidate vision models on the same set of synthetic handwritten Grade 6 Maths papers, compare
  read accuracy, marking accuracy, speed and cost per paper, and Basheer picks (cost is his call).
- **Text-to-speech:** provider from `TTS_PROVIDER`; my pick after a quick quality and cost check. Audio
  cached per lesson so it is generated once.
- **Diagrams:** the model returns a JSON spec for a fixed set of maths diagram components (fraction bar,
  number line, area model, place-value chart, simple bar chart, labelled shape), rendered as SVG by app
  code. No raw model-written SVG.
- **Jobs:** reading and marking 5 papers must not block the screen; work runs as background jobs on
  Cloudflare Queues with progress shown ("3 of 5 read").
- **Deploys:** Cloudflare preview links with synthetic data are approved. Making anything public beyond
  the judges' link still needs Basheer's OK.

## 10. Data model sketch [Claude's call, builder may refine]

school, user (role: teacher, parent, learner), class (grade, year, subject, teacher, join code),
child (name, grade, school), enrolment (child to class), parent_link (parent to child),
curriculum_map (class, status draft/approved, source file), topic (map, term, order, name, prerequisites,
misconceptions), test (class, title, topics), answer_key (test, items, status), paper (test, child, pages,
status), question_result (paper, question, read answer, mark, confidence, topic, misconception),
gap (child, topic, stage, evidence links), session (child, topic, format, status), session_item
(question, difficulty, answer, correct), format_trial (child, topic, format, score), needs_you_item
(owner, kind, ref, status).

Row-level security: a teacher sees children enrolled in their classes; a parent sees linked children;
a learner sees themself. Photos in private storage, served by signed URLs.

## 11. Screens in v1

Per the Claude Doc, tab Step 2, cut to the demo path:

- **Shared:** sign up, sign in, role pick.
- **Teacher:** Your classes; class setup with join code; Curriculum (upload, draft map, approve);
  Snap (create test, answer key, snap papers, progress); Needs you review (photo beside Jemma's reading);
  Class home with top gaps; Gap detail; Learners list; Tests with per-question results.
- **Parent:** Your children (skipped with one child); add child with class code; Profile (headline,
  Needs you, marks per subject and topic, what Jemma noticed with evidence); Topic detail with evidence;
  Learn (tonight, this week, what helps); Session result; Tests with marked paper view.
- **Child (own login in v1):** Today with one Start button; session screens (warm-up, learn in each of
  3 formats, try, results, progress); My gaps.

Designs (27 Oct, Claude Design): https://claude.ai/artifact/NWLDuYt2x2ygnAadGUp9cG, copied to design/v1-screens/.
98 boards are v1, 40 are marked "After the challenge". The build plan ranks v1 boards into Tier 1 (judges' demo path) and Tier 2.

## 12. Demo accounts and data

- Accounts: teacher "Ms Banda", parent "Thandi M", child "Amina" (Grade 6), plus 4 more synthetic
  learners in the class, all at a fictional "Hillview Primary".
- Synthetic paper photos: handwritten Grade 6 fraction tests with realistic mistakes, made by the team.
- Seeded history for Amina so "What helps" and stage changes have something to show.
- Judges use a live link [Claude's call]: each judge presses "Try the demo" and gets their own sandbox
  school copied from the seed, with teacher, parent and child logins inside it, so judges never collide.
  Reset rebuilds only that sandbox. Snap offers "Use sample papers" with ready synthetic photos, so
  judges can run the whole loop without their own photos. AI calls run live; lessons and audio are
  saved after first generation.
- Demo curriculum document [Claude's call]: South African CAPS Intermediate Phase Mathematics plus the
  Grade 6 Annual Teaching Plan (public DBE documents; availability not verified yet). Four terms. The
  Map drafter must pull Grade 6 out of a multi-grade document. Examples use rand and South African names.

## 12b. Screen designs [Claude's call]

Basheer designed the screens in Claude Design on Tue 27 Oct (link in section 11). The build matches
the look and layout of every screen covered there and follows the same patterns for screens it does not
cover. The existing parent canvas counts as direction. Backend work starts Wed 28 Oct; UI starts as
soon as the designs land.

## 13. Left to the builder

Exact library versions, schema details, job runner, confidence threshold tuning, UI component approach,
test setup, how the demo reset works, and the order of build.

## 14. Still open

- Confirm the challenge requirements above against the official brief (Basheer's acceptance email).
- Open-source licence for the public repo (Basheer's call).
- Vision provider, picked by Basheer after the Tue 27 Oct spike. Test papers: Basheer and 2 to 3
  helpers handwrite about 10 synthetic Grade 6 papers from a printable pack and photograph them by Tue
  morning; ground truth is a table made from the photos and checked by Basheer.
- Supabase project and Cloudflare account access (Basheer logs in or gives tokens at build start).
