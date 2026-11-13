# For judges

This page is the shortest path through Jemma on the live link: https://jemma-web.horizonsystems.workers.dev/demo. The code is at https://github.com/AI-Native-Ventures/jemma and the licence is MIT. To run it on your own machine instead, see the README ("Run it").

Every person, school and paper in the demo is made up. Please do not type real information about real children.

Entry rules and where each one is met are in [compliance.md](compliance.md). The one-page design is in [ARCHITECTURE.md](../ARCHITECTURE.md), and the evals are in [EVALS.md](../EVALS.md).

## The 5-minute path

Open the live link and go to `/demo`. You get your own private copy of Hillview Primary, a made-up school. Other judges cannot see it and you cannot see theirs.

1. **Sign in as Ms Banda (teacher).** Tap "Ms Banda", marked "Start here". You land on Curriculum.
2. **Approve the topic map.** Tap "Use the sample curriculum". Jemma reads it and drafts a topic map. Check it and approve it. Two topics carry a question for you on purpose: Jemma is not sure about them and asks.
3. **Snap the memo and five papers, then share the results.** On Snap, use the sample memo and the sample papers if you have none of your own. Jemma reads each photo, marks it, and puts anything it is unsure about in "Needs you". Open one paper and the class report to see the gaps and the reteach plan. Then tap **Share with parents** on the class home. Until you do, a parent and the learner see nothing from this test, and Jemma plans no lesson from it.
4. **Switch to Thandi M (parent).** Open `/demo/switch`, or go back to `/demo`. The class code is shown on the page. Add Amina with that code and tick the consent boxes. The link waits for the teacher, so switch to Ms Banda, open the link request and say yes, then switch back to Thandi and open Amina's profile. Look at Profile and the Learn tab: her gaps, the lesson Jemma planned for tonight, and "What helps", which says "Too early to tell" until a format has been tried 3 times.
5. **Switch to Amina (learner) and run tonight's session.** Warm-up, the lesson, then the questions. Amina never sees right or wrong or a score. At the end she sees only the questions she missed, why, and the right way.
6. **Switch back to Ms Banda or Thandi.** See the result and the updated gap stage (new, practising or fixed).
7. **Open Amina's Long view as Ms Banda.** Go to Learners, then Amina, then Long view. It shows her marks by strand across school years, and the patterns Jemma found: a strength or a struggle that held for three terms or more, for example fractions staying low from Grade 5 Term 3 to Grade 6 Term 2. Code finds each pattern and Jemma only words it. If the screen is empty, Jemma asks for one update when you open it and the pattern appears when it is done. While the update runs the screen says "Jemma is looking across the terms." Open one source under "Where this comes from" (a marked test, a past quiz or a teacher note). Tap **Looks right**. The card now says "Not shared. Talk to Thandi first." Tap **We have talked**. Only now is it shared.
8. **Switch to Thandi, then to Amina.** Thandi gets a notification and a card on Amina's profile, "From your talk with Ms Banda". It shows the words and where they come from, and nothing else. Amina has no screen for the Long view and sees nothing of it.
9. **Bring past records in (optional).** As Ms Banda go to Learners and tap **Add past records**, then **Use a sample file**. Jemma works out what each column of the file means and code reads every row. Check the rows with a problem first (an unknown learner, a repeated row, a topic Jemma is unsure of): pick the learner, change the strand or skip the row. Tap **Add to records**. The rows become records in each learner's Long view, and a source opens with the file name, the row and who added it. You can also paste a table or type **One result**.
10. **Practise any time (optional).** Sign in as any learner whose home says "Nothing new tonight" (Amina after tonight's session, or a learner of another class) and tap **Practise now**. The home says "Jemma is writing your practice." and offers the session in about a minute. It is the same session screens and the same results as tonight's. If the model fails, the home says "Jemma could not write your practice." and **Try again** asks again. A learner with nothing to practise yet reads "Practice starts after your teacher marks a test."
11. **Read the full log as Ms Banda.** On the class home tap "See the full log". Every tool Jemma used is listed with what went in and what came out, newest first. Every approval is listed with the name of the person who gave it: the topic map, the answer key, the link, the results you shared, the pattern you checked, the past records you added and the talk.

The demo page says the full path takes about 10 minutes. The 5 minutes above is the short version if you skip reading each screen: steps 1, 2, 5, 7 and 9 are the core.

Use **Reset demo** (`/demo/reset`) at any time. It puts your copy back to step 1 with fresh sample papers in about 10 seconds.

## Try a curriculum Jemma has not seen

Three invented Mathematics curriculum documents of different shapes are in the repository. They are not copied from any ministry document:

- `fixtures/curriculum/unseen/grade9-mathematics-za.pdf`: Grade 9 Mathematics, South Africa, a table for each of four terms.
- `fixtures/curriculum/unseen/grade5-mathematics-za.pdf`: Grade 5 Mathematics, South Africa, a paragraph for each week, no tables.
- `fixtures/curriculum/unseen/grade4-mathematics-ke.pdf`: Grade 4 Mathematics, Kenya, three terms, page pictures like a scan, no text.

To try one, make a class in that grade, open Curriculum and upload the file. The live link lets you make a Mathematics class in any grade, so make one in the grade of the file. The "Use the sample curriculum" button shows only for a Grade 6 Mathematics class in a demo school, so a class in another grade asks for your own file. Jemma takes a PDF, a JPG or a PNG of at most 10 MB and 40 pages for each document, and 30 MB for one upload, and says so when a file is too big or the wrong kind. What the curriculum reader did with each document, measured and scored by code, is in "A curriculum Jemma had never seen" in [EVALS.md](../EVALS.md). The first version of Jemma covers Mathematics only: three earlier documents about other subjects are kept in `fixtures/curriculum/unseen/other-subjects/`, and their results are in EVALS.md under "Outside Mathematics".

## Demo accounts

There is nothing to type. The demo page signs you in as any of these people in your own copy of the school. You do not need an email address. The first three are the big buttons on the demo page. The rest are under "More people at Hillview", and on the switch page.

| Person | Role | What they are |
| --- | --- | --- |
| Ms Banda | Teacher | Teaches 6B Mathematics (Grade 6) and 5A Mathematics (Grade 5). "Start here". |
| Thandi M | Parent | Amina's mother. |
| Amina | Learner | A Grade 6 learner in 6B Mathematics. |
| Mr Dlamini | Teacher | Teaches 7A Mathematics (Grade 7). |
| Ms Okafor | Teacher | Teaches 4A Mathematics (Grade 4). |
| Nomsa K | Parent | Mother of Neo (5A, Grade 5) and Lindiwe (7A, Grade 7): two children in different grades. |
| Peter A and Grace A | Parents | Both guardians of Nyokabi (4A, Grade 4). |
| Thabo, Lerato, Sipho, Naledi | Learners | With Amina, the five children of 6B Mathematics. |
| Neo, Busisiwe, Ayodele, Nia, Khanyi, Wanjiru | Learners | 5A Mathematics. Made up by code, with messy Mathematics records back to Grade 3. |
| Lindiwe, Nomvula, Mpho, Ama, Tafara, Yaw | Learners | 7A Mathematics. Made up the same way. |
| Nyokabi, Tapiwa, Folake, Thabiso, Baraka, Juma | Learners | 4A Mathematics. Made up the same way. |

Only Neo, Lindiwe and Nyokabi (and Amina, after step 3 of the demo path) have a linked parent. The other learners have none. A learner's login is made when you pick that learner.

Under the demo path there is also **Start from an empty school**: a second kind of copy with no class and one teacher, "You". Create a Mathematics class in any grade, open its learners screen, and tap **Add made-up learners**. That adds six learners with up to three years of messy history in the class's subject (Mathematics) and asks Jemma for their Long view. The button only shows in a demo school.

## What each role sees

Phone (390 px wide) has a bottom tab bar. A laptop (1024 px wide and up) has a left sidebar with the same tabs in the same order.

- **Teacher.** Tabs: Class, Learners, Snap, Tests, Curriculum. Sees the learners in their own class only. Gets a "Needs you" list for anything Jemma is unsure about (a dark photo, an unreadable name, an answer it could not read), a "What Jemma did" list with a link to the full log, class gaps with a reteach plan, notes, attendance, each learner's Long view and the year-end export.
- **Parent.** Tabs: Profile, Learn, Snap, Tests. Sees only linked children, and only after the teacher says yes. Sees a test only after the teacher shares it. Sees marks by topic, gaps, the planned lesson, activities, and the guidance card, and a Long view pattern only after the talk. Can snap homework, flag a mark, and set the child's login code and PIN.
- **Learner.** Tabs: Today, My gaps. Sees only themselves. One Start button on Today, or **Practise now** when nothing is planned. No score, no right or wrong, no Long view.

## Where the MCP server fits

Everything the agent does goes through Jemma's own MCP server (25 tools). You can connect your own MCP client to a local copy if you create a token. See [mcp-server.md](mcp-server.md). Tokens are created by whoever runs the server, not by the app.

## Known limits

- **What has run on the deployed demo.** The whole demo path ran on a phone against it on 11 and 13 November 2026 (7.5 minutes on 13 November, recorded answers only, no model call). The made-up school and the empty school that fills a class with made-up learners were used on 13 November, and past records were brought in from the sample files on 12 and 13 November. Uploads through the upload route were checked on 13 November: the Grade 9 plan that was refused 3 times of 3 is accepted, a memo photo, a paper photo and a parent's homework photo that hold the refused bytes are accepted, the same post from another website with a signed-in teacher's cookie is refused (403), and signed out it is sent to sign-in.
- **Free models are slow on a cache miss.** Jemma runs on free models, which have rate limits and fail often. Jemma retries, then tries a fallback model. A full uncached run of the demo path took about 15 to 25 minutes when it was recorded. The live link is meant to run in `cache` mode after a warm-up run: every sandbox starts from the same sample inputs, so papers, reports and lessons come back from storage in seconds. If you upload something new (your own photo, an edited paper), that call goes to a free model and can take minutes or fail. A failed job shows an error with a Retry button. One model call gets 4 minutes, then the next model in the list is tried. A job that shows no sign of life for 16 minutes is put back on the queue, twice at most, then marked failed. A first read of something new took between 15 and 90 seconds on the days it was measured.
- **No real teacher and no real learner has used Jemma.** The school, the people and the records are synthetic. No photo from a real phone camera and no rotated photo was tried either. The big photos were made on a computer from the sample sheets: a 1.5 MB memo photo was stored as 187 KB at 2000 px, and a 1.6 MB paper photo as 204 KB and was read and marked in 32 seconds.
- **The Long view on the deployed demo.** It was opened there on 11, 12 and 13 November 2026, at 390 px and 1440 px, with patterns, their sources and the teacher's two buttons. It was also run on a local stack: the screens by a browser spec on a phone and a laptop (`apps/web/e2e/p52.spec.ts`), the pattern finder and the tools by tests, and the model's wording on a local agent with recorded answers.
- **The Share with parents card** is covered by the demo-path spec on a phone, on a clean machine in CI. Its own browser spec (`apps/web/e2e/p50b.spec.ts`) ran on 11 November (4 of 4: its two tests on a phone and on a laptop), and its screenshots are in `design/proof/p50b`.
- **Three browser specs written on 13 November were never run:** `apps/web/e2e/p75.spec.ts` (big photos), `apps/web/e2e/p77.spec.ts` (failed reads) and the time zone test in `apps/web/e2e/p73.spec.ts`. The hosted database could not serve them that day.
- **Failed reads were seen on the deployed demo in one place only:** the memo card ("Jemma could not read the memo.") and its "Try the same photo again". A failed paper on the papers screen, the Needs you item that opens that screen, the parent's screen for a photo that could not be read, and a real model call that times out and goes to the next model are covered by unit tests only.
- **A stuck job being put back on the queue** was seen twice on a hosted database: once on the earlier one, where it moved old test leftovers, and once on 13 November 2026 on the current one, with a job marked as stuck by hand, which was put back within 17 seconds and finished. A job that died on its own (a model that never answers, a database that is down) has not been watched live.
- **The free hosted database ran out on 13 November 2026.** The hosted demo runs on a free Supabase project and could not start for about three hours that day: two days of test runs against that project had used up the CPU allowance of its machine, and creating the demo's logins timed out. The demo was moved to a fresh project the same day.
- **Privacy inside one school.** A teacher can add a learner who is in another teacher's class of the same school to their own class (Class settings, "Add a learner", under "Already at your school"). Nobody is asked: not the other teacher, not the family, and the learner stays in the other class too. From then on the teacher can read that learner's marks, records, notes and Long view. A class of the school that the teacher can already see can also be copied into a new class. Only learners of the same school can be added, and a teacher of another school can read nothing. This is left as it is on purpose.
- **Laptop runners send learner data to that laptop.** When a job runs on the owner's laptop (goose, Claude Code or Jemma Desktop), the prompt and the tool results, with learner data in them, reach that machine and the model it uses.
- **Uploads.** A photo over 1 MB is made smaller in the browser (its longest side at most 2000 px) before it is sent. A PDF is sent whole. The curriculum screen takes a PDF, a JPG or a PNG of at most 10 MB and 40 pages for each document, and 30 MB for one upload.
- **The evals** ran task by task, not as the single `pnpm evals` command in one go, and never against the local database. The photo task reads a rendered paper, not a photo taken with a phone.
- **A curriculum Jemma had never seen.** Three invented Mathematics documents were read live on the free models and scored by code ([EVALS.md](../EVALS.md), "A curriculum Jemma had never seen"): Grade 9 South Africa passed 3 of 3 runs, the Grade 4 Kenya scan (three terms) 3 of 3, and Grade 5 South Africa 1 of 3. In both fails the model named the topic that the plan lists in two terms differently in the later term, so the question that code adds for a topic with the same name in two terms never fired (code asked in none of the 9 runs, the model asked in 7); the text-reading fallback was never needed live, so only tests cover it. On 13 November 2026 curriculum documents were also read on the deployed demo: the Grade 5 South Africa plan and the Grade 4 Kenya scan, then the Grade 9 South Africa plan, uploaded, read, its questions answered and approved at 08:12, and a 5 MB PDF read in 68 seconds. Those tries are not scored runs and are not in EVALS.md.
- **The operator route is off on the hosted demo.** The owner's laptop doing the demo's AI work with Claude Code was proven on a local agent worker only. Curriculum PDFs are read by the cloud model only.
- **Jemma Desktop.** The Mac app in `apps/desktop` runs jobs on your Claude Code or Codex subscription. It is unverified: it was not run for this submission. Pair it by entering the six-character code shown in the signed-in Jemma web app; build the unsigned Mac app with `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter desktop dist`.
- **Practise now needs a live model.** With recorded answers only (the one-command run) a practice asks for an answer that was never recorded, so it fails and the learner's home offers **Try again**. A practice never opens or reopens a gap. No real learner has used it, and how long the model takes for one was not measured.
- **Mathematics only.** The demo school has four Mathematics classes, in Grades 4 to 7, and the class form offers Grades 1 to 12. Only 6B has hand-made history (the five children of the demo path); the learners of the other classes are made up by code. Other subjects are not offered yet, and the only reads of another subject by a model were three curriculum documents (EVALS.md, "Outside Mathematics": 3 of 3, 0 of 3 and 0 of 2 judged runs passed).
- **Email sign-in is not part of the path.** The sign-in screen asks for a 6-digit code that is emailed to you, and the demo does not use it. If you try it, the email may arrive as a magic link instead of a code, depending on how the mail template is set. This was not tested against a real inbox for this document. Use the demo page.
- **Some links lead to "Coming after the challenge".** A few screens link to features that are not built, such as messaging a teacher, starting from another teacher's map, adding another teacher's code, deleting or downloading a family's data, deleting an account, moving a class up or archiving it at the end of the year, and a sign-up for a Grade 8 to 12 learner.
- **No email, SMS or WhatsApp.** Jemma only shows notifications inside the app.
- **Phones and laptops only.** Built and checked at 390 px (phone) and 1440 px (laptop). Light theme only.

More is in the README ("What is not finished") and in [architecture.md](architecture.md) ("What is not built").
