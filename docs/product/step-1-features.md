# Jemma Feature Set

Oct 26, 2026 · @Basheer

Jemma is each child's own tutor. Teachers feed it marked tests, parents support at home, and the child fixes their own gaps with it. This page is step 1 of 3: features. Step 2 is screens and flows per role, step 3 is what ships first for the challenge.

## Decisions so far

Eight decisions are yours and agreed. Seven are my calls: change the Status to Agreed when you accept one, or comment on it.

| Decision | What it means | Status |
| --- | --- | --- |
| Core shape | Teacher feeds Jemma marked tests, parent supports at home, child fixes their own gaps with their Jemma | Agreed |
| Users | One app for teacher, parent and child. Role picked at signup. Teacher is admin of their class | Agreed |
| Ages | Grade 1 to 12. Older kids use Jemma on their own | Agreed |
| Child space | Each child is their own space. It opens on Profile, other features live in tabs | Agreed |
| Marks | Parents and teachers see marks | Agreed |
| Quiz results | Child sees results at the end, not per question. Adults can change this per test or subject | Agreed |
| Teen privacy | Grade 8 to 12: parent sees progress, marks and topics, not the teen's Ask Jemma chats. Jemma only talks schoolwork | Agreed |
| Curriculum | Teachers upload the curriculum for their subject. Jemma drafts the topic map, the teacher approves it. Works at any school, any country, any exam board | Agreed |
| Checking scans | Parent confirms every scan. Teacher reviews only the papers Jemma is unsure about | Claude's call |
| Answer key | Teacher approves one answer key per test before Jemma marks the papers | Claude's call |
| Linking | Teacher creates a class and shares a code. Parent enters it to link their child | Claude's call |
| Settings owner | Whoever sets a test owns its settings. Teacher: class tests. Parent: home practice and child defaults | Claude's call |
| Silent adapting | During a quiz Jemma eases the next question after a miss, without showing right or wrong | Claude's call |
| Format learning | Measured per child and topic. Says "too early to tell" until there is enough data. Never labels a child | Claude's call |
| Curriculum layers | Subject map, then exam style, then school, then child (see Curriculum) | Claude's call |

## The loop

&#91;embedded content: Jemma's loop: 3 ways in, 5 agent jobs, 2 ways out\]

Tests come in through three doors. Jemma's five jobs turn them into a lesson for the child and a report for the adults, and the child's answers feed the next round.

## Curriculum

Teachers own the curriculum. Each teacher uploads the curriculum for their own subject and grade, Jemma turns it into a topic map, and the teacher approves it. This works at any school, in any country, with any exam board.

1. **Upload:** the teacher snaps or uploads their syllabus, term plan or scheme of work (in South Africa: CAPS and the Annual Teaching Plan; IEB schools add their exam guidelines). Textbooks and past papers are optional extras.
2. **Jemma drafts the map:** topics per term in teaching order, which topic needs which, and the exam style from any past papers.
3. **Teacher approves:** reorders, renames, adds or removes topics. Nothing reaches a child until the teacher approves it.
4. **Classes use it:** every test question, lesson and gap is tagged to a topic on that map.
5. **Change any time:** the teacher can edit the map mid-year and Jemma re-tags past results.

| Layer | Who sets it | What it controls |
| --- | --- | --- |
| Subject map | The subject teacher, who approves Jemma's draft | Topics per term, order, which topic needs which |
| Exam style | The teacher, from past papers or exam guidelines | Question style and how marks are given |
| School | School admin or teachers | Textbooks, term dates |
| Child | Jemma, from tests | Where the child really is on the map, which can be below their grade |

- **No teacher on Jemma yet:** the parent picks a shared map for the child's grade, or Jemma drafts one from the textbook the parent snaps.
- **Basics below grade:** a Grade 6 child stuck on Grade 4 fractions needs the Grade 4 map. Jemma links a lower-grade map, or drafts the missing basics for the teacher to check.
- **Shared library (agreed):** once a teacher approves a map, other teachers can start from it and edit their own copy, and parents without a teacher can pick it. Only topic maps are shared, never uploaded textbooks (copyright).
- **IEB and NSC (not verified):** my understanding is both follow CAPS content and differ mainly in exam papers. With teacher-uploaded maps this matters less, because each school's teacher brings their own.

## Teacher

The teacher feeds Jemma and gets marking time back.

1. **Class setup:** create a class (grade, year, subjects, curriculum and exam board inherited from the school). Add learners by typing names or snapping the class register. Share one code with parents.
2. **Answer key first:** per test, snap the marking memo, or approve the key Jemma drafts from the textbook. One check per test, not per paper.
3. **Bulk snap:** snap each learner's paper back to back. Jemma matches the name to the learner, marks it, and asks the teacher to review only the papers it is unsure about.
4. **Class gaps:** topics ranked by how many learners got them wrong, with the most common mistake and a short reteach activity for tomorrow.
5. **Child view:** the same child space the parent sees. The teacher can fix any mark.

## Parent

The parent supports at home and can run Jemma alone if the school is not on it.

1. **Children list:** a short card per child. Tapping a card opens that child's space, Profile first.
2. **Snap a test that came home:** Jemma reads the child's answers and the teacher's ticks. The parent confirms before it saves.
3. **Tonight:** sees the planned session. Sits with Grade 1 to 3 children, hands the phone over for Grade 4 to 7.
4. **Results:** how each session went, plus marks and progress per subject and topic.
5. **Settings per child:** quiz feedback timing, score shown or hidden, and what they see of a teen's activity.

## Child

The child is who Jemma is for: they learn their gaps and fill them with their own Jemma. How they use it changes with age.

| Grade | Device | How they learn |
| --- | --- | --- |
| 1 to 3 | Parent's phone, parent beside them | Audio and pictures first, tap answers, no typing |
| 4 to 7 | Shared family phone, "Who's learning?" picker | Reads and taps alone, parent nearby |
| 8 to 12 | Own phone, own login | Works alone, exam prep for their board (NSC, IEB or other) |

Every child gets:

1. **Today:** one short lesson on their top gap, then 5 questions.
2. **My gaps:** each topic shows its stage: new, practising, fixed. Fixed only after passing similar questions again a week later, so it sticks.
3. **Wins:** gaps fixed so far, so progress is visible.
4. **Ask Jemma (Grade 4 and up):** snap homework or a textbook page and ask. Jemma explains step by step and never just hands over the answer.
5. **Snap own work (Grade 8 and up):** their own tests and homework feed the same profile parent and teacher see.

## A learning session

One gap per session, 10 to 15 minutes, built on retrieval practice, spacing and feedback.

1. **Warm-up:** 2 quick questions on gaps fixed earlier, so they stay fixed.
2. **Learn:** one gap in one format: 4 short cards, 1 diagram, or a 3 minute audio memo. Uses an example from the child's own textbook.
3. **Try:** 5 questions, one at a time. No right or wrong shown during the quiz. After a miss, Jemma quietly makes the next question easier or steps back to a missing basic.
4. **Results at the end:** each missed question shows why and the right way, framed as "let's look at these 2 together". Total score hidden by default.
5. **Progress:** the gap moves stage and effort is praised.

Adults can switch feedback to after each question, per test or per subject.

## Agent jobs

Jemma does five jobs on its own. People only approve the exceptions, through a "needs you" list.

| Job | What it does | Example |
| --- | --- | --- |
| Reader | Turns a photo into questions, answers and marks. Flags what it is unsure of | 38 of 40 papers read cleanly, 2 sent to the teacher to check |
| Diagnoser | Finds why an answer is wrong and traces it back to missing basics on the curriculum map | 1/2 + 1/4 = 2/6 means "adds tops and bottoms", which points to equivalent fractions (Grade 4) |
| Planner | Picks the next gap (basics first), the format to try, and when to review. Re-plans when a new test lands | Tonight: equivalent fractions, diagram, 12 minutes |
| Tutor | Writes lessons and questions from the child's textbook and curriculum. Adapts during the session | Swaps a hard question for an easier one after a miss |
| Reporter | Tells each person what matters to them | Teacher: "18 of 40 add tops and bottoms. Reteach tomorrow, 10 minute activity ready" |

## How information is packaged

Every screen answers one question, and every claim can be checked.

- **One question per home screen.** Child: "What do I do now?" Parent: "Is my child okay, and what's tonight?" Teacher: "What does my class not get?"
- **Three layers:** headline, then evidence, then the raw paper. Never raw data first.
- **Every claim taps through to its source:** which test, which question, the photo of the page.
- **Checkable claims build trust,** which matters because accuracy comes first.
- **Calm screens:** one job per screen, nothing crammed together.

## Proposed cuts from v1

These wait until after the challenge unless you say otherwise.

- Local-language audio
- Payments
- Parent-teacher chat
- Offline mode
- A Jemma-checked national map per country (teachers' maps cover v1)

## Open questions

- [x] Can teachers start from maps other teachers already approved? Yes: shared library
- [ ] Challenge deadline, and what the judges must see working
- [ ] Subjects for v1: all of them, or Maths and English first
- [ ] Vision model and text-to-speech providers (cost and privacy)
- [ ] Sending children's data to a hosted AI model: consent and safeguards

Next: Step 2: Screens and flows
