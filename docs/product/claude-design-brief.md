# Claude Design brief

Oct 26, 2026 · @Basheer

Copy the block below into Claude Design to start the v1 screens. It carries every decision from steps 1 to 3, so Claude Design needs nothing else.

```text
Design the screens for Jemma v1: one responsive web app used on phones (390 wide) and laptops (1440 wide). Light theme only.

WHAT JEMMA IS
Jemma is each school child's own AI tutor. Teachers photograph tests, Jemma marks them, finds what each child gets wrong and why, teaches each gap in one of three formats (short reading cards, a diagram, or a 3 minute audio memo), quizzes the child, and reports to teacher and parent. It also keeps a learner profile over time: marks, gaps, teacher notes, attendance, activities, and a subject guidance card. Teacher feeds Jemma, parent supports at home, the child fixes their own gaps with their Jemma.

BRAND
Lowercase "jemma" wordmark in Outfit Bold; the dot on the j is a small diamond gem. Ink #1F1D36, coral #FF6A4D, background #F7F7FA, white cards. Font: Outfit. Calm, warm, confident. Never use em dashes in any copy. Use made-up people only.

RULES FOR EVERY SCREEN
1. One job per screen. Each home screen answers one question.
2. Headline first: one plain sentence from Jemma, details on tap.
3. Evidence on tap: any claim ("struggles with adding fractions") opens the test, the question and the photo of the paper.
4. "Needs you": one list of everything Jemma needs a person for (check an unsure paper, approve a map or answer key). Top of teacher and parent homes.
5. "What Jemma did": a short activity log of the agent's steps ("Read 5 papers, 1 unsure, sent to Ms Banda").
6. Phone: bottom tab bar with Snap (camera) in the middle. Laptop: left sidebar with the same tabs, list and detail side by side.
7. The class or child name sits in the header; tap it to switch. Gear for that space's settings.
8. Children never see scores or right/wrong during a quiz. Results come at the end. Parents and teachers see marks.
9. Format results say "Too early to tell" until there is enough data. Never label a child with a learning style.

DEMO CAST (all made up)
Hillview Primary, South Africa. Teacher: Ms Banda, Grade 6 Mathematics. Learners: Amina, Thabo, Lerato, Sipho, Naledi. Parent: Thandi M, Amina's mother. Money in rand. Topic in focus: adding fractions with different denominators (common mistake: adds tops and bottoms, 1/2 + 1/4 = 2/6).

SCREENS, IN DEMO ORDER
Shared
- Sign in, then pick a role: Teacher, Parent, Learner.

Teacher (tabs: Class, Learners, Snap, Tests, Curriculum)
- Your classes: a card per class with learner count and Needs you count.
- Curriculum: upload the curriculum document, see Jemma's draft topic map (topics per term, which topic needs which), edit, approve.
- Snap: create a test, approve the answer key Jemma read from the memo photo, snap papers back to back with progress ("3 of 5 read").
- Needs you review: the paper photo beside Jemma's reading of each answer and its mark; fix and confirm.
- Class home ("What does my class not get?"): Needs you, top 3 class gaps with the common mistake, latest test, What Jemma did.
- Gap detail: which learners are stuck, the mistake pattern, a 10 minute reteach activity.
- Learners: each learner with average, top gap and attendance; open one to add a quick observation note.
- Tests: class result per test, then per question, then who missed it.

Parent (tabs: Profile, Learn, Snap, Tests)
- Your children: one short card per child (photo, name, grade, school, one status line). Add a child with the teacher's class code.
- Profile ("Is my child okay?"): Jemma's one-line status, Needs you, marks per topic with change, what Jemma has noticed with evidence, teacher notes, attendance, activities, and a subject guidance card ("What to focus on next and why").
- Topic detail: missed questions with the paper photo, lessons done, which format helped.
- Learn ("What's tonight?"): tonight's session, this week's plan, what helps Amina.
- Session result: how it went, the gap's stage change.
- Snap and confirm: pick what it is, photograph, check what Jemma read, confirm.
- Add an activity (sport, club, music).

Child: Amina (tabs: Today, My gaps)
- Today ("What do I do now?"): one big Start button with topic, minutes and format; gaps fixed so far.
- Session: warm-up question, then Learn in one of three formats (reading cards, a fraction-bar diagram, an audio player with transcript), then 5 questions one at a time with no right/wrong shown, then results ("Let's look at these 2 together" with why and the right way), then progress (gap moves from New to Practising).
- My gaps: topics grouped by stage: New, Practising, Fixed.

STATES TO SHOW
Jemma working ("Reading 3 of 5 papers"), an error with a retry button, an empty state for a new class, and a judge's "Try the demo" entry with a reset button.

DELIVER
Phone versions of every screen above. Laptop versions of Teacher class home, Needs you review, Curriculum, and parent Profile.
```
