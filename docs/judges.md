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
7. **Open Amina's Long view as Ms Banda.** Go to Learners, then Amina, then Long view. It shows her marks by strand across school years, and the patterns Jemma found: a strength or a struggle that held for three terms or more, for example fractions staying low from Grade 5 Term 3 to Grade 6 Term 2. Code finds each pattern and Jemma only words it. If the screen is empty, Jemma asks for one update when you open it and the pattern appears when it is done. Open one source under "Where this comes from" (a marked test, a past quiz or a teacher note). Tap **Looks right**. The card now says "Not shared. Talk to Thandi first." Tap **We have talked**. Only now is it shared.
8. **Switch to Thandi, then to Amina.** Thandi gets a notification and a card on Amina's profile, "From your talk with Ms Banda". It shows the words and where they come from, and nothing else. Amina has no screen for the Long view and sees nothing of it.
9. **Read the full log as Ms Banda.** On the class home tap "See the full log". Every tool Jemma used is listed with what went in and what came out, newest first. Every approval is listed with the name of the person who gave it: the topic map, the answer key, the link, the results you shared, the pattern you checked and the talk.

The demo page says the full path takes about 10 minutes. The 5 minutes above is the short version if you skip reading each screen: steps 1, 2, 5, 7 and 9 are the core.

Use **Reset demo** (`/demo/reset`) at any time. It puts your copy back to step 1 with fresh sample papers in about 10 seconds.

## Demo accounts

There is nothing to type. The demo page signs you in as any of these people in your own copy of the school. You do not need an email address. The first three are the big buttons on the demo page. The rest are under "More people at Hillview", and on the switch page.

| Person | Role | What they are |
| --- | --- | --- |
| Ms Banda | Teacher | Teaches 6B Mathematics (Grade 6) and 5A Mathematics (Grade 5). "Start here". |
| Thandi M | Parent | Amina's mother. |
| Amina | Learner | A Grade 6 learner, in 6B Mathematics, 6B English and 6B Natural Sciences. |
| Mr Dlamini | Teacher | Teaches 6B English and 7A English (Grade 7). |
| Ms Okafor | Teacher | Teaches 6B Natural Sciences and 4A Natural Sciences (Grade 4). |
| Nomsa K | Parent | Mother of Neo (Grade 5) and Thandiwe (Grade 4): two children in different grades. |
| Peter A and Grace A | Parents | Both guardians of Yaw (Grade 7). |
| Thabo, Lerato, Sipho, Naledi | Learners | With Amina, the five children of 6B. Their records go back to Grade 4 in all three subjects. |
| Neo, Busisiwe, Ayodele, Nia, Khanyi, Wanjiru | Learners | 5A Mathematics. Made up by code, with messy records back to Grade 3. |
| Yaw, Zuri, Dumisani, Aisha, Makena, Tafara | Learners | 7A English. |
| Thandiwe, Lindiwe, Nomvula, Naomi, Abena, Kamau | Learners | 4A Natural Sciences. |

Only Neo, Thandiwe and Yaw (and Amina, after step 4) have a linked parent. The other learners have none. A learner's login is made when you pick that learner.

Under the demo path there is also **Start from an empty school**: a second kind of copy with no class and one teacher, "You". Create a class in any grade and subject, open its learners screen, and tap **Add made-up learners**. That adds six learners with up to three years of messy history in the class's subject and asks Jemma for their Long view. The button only shows in a demo school.

## What each role sees

Phone (390 px wide) has a bottom tab bar. A laptop (1024 px wide and up) has a left sidebar with the same tabs in the same order.

- **Teacher.** Tabs: Class, Learners, Snap, Tests, Curriculum. Sees the learners in their own class only. Gets a "Needs you" list for anything Jemma is unsure about (a dark photo, an unreadable name, an answer it could not read), a "What Jemma did" list with a link to the full log, class gaps with a reteach plan, notes, attendance, each learner's Long view and the year-end export.
- **Parent.** Tabs: Profile, Learn, Snap, Tests. Sees only linked children, and only after the teacher says yes. Sees a test only after the teacher shares it. Sees marks by topic, gaps, the planned lesson, activities, and the guidance card, and a Long view pattern only after the talk. Can snap homework, flag a mark, and set the child's login code and PIN.
- **Learner.** Tabs: Today, My gaps. Sees only themselves. One Start button on Today. No score, no right or wrong, no Long view.

## Where the MCP server fits

Everything the agent does goes through Jemma's own MCP server (22 tools). You can connect your own MCP client to a local copy if you create a token. See [mcp-server.md](mcp-server.md). Tokens are created by whoever runs the server, not by the app.

## Known limits

- **Free models are slow on a cache miss.** Jemma runs on free models, which have rate limits and fail often. Jemma retries, then tries a fallback model. A full uncached run of the demo path took about 15 to 25 minutes when it was recorded. The live link is meant to run in `cache` mode after a warm-up run: every sandbox starts from the same sample inputs, so papers, reports and lessons come back from storage in seconds. If you upload something new (your own photo, an edited paper), that call goes to a free model and can take minutes or fail. A failed job shows an error with a Retry button.
- **No real teacher and no real learner has used Jemma.** The school, the people and the records are synthetic.
- **The Long view was not exercised on the deployed demo.** It was run on a local stack: the screens by a browser spec on a phone and a laptop (`apps/web/e2e/p52.spec.ts`), the pattern finder and the tools by tests, and the model's wording on a local agent with recorded answers.
- **The Share with parents card** is covered by the demo-path spec on a phone, on a clean machine in CI. Its own browser spec (`apps/web/e2e/p50b.spec.ts`) was never run, and there is no screenshot of the card.
- **The evals** ran task by task, not as the single `pnpm evals` command in one go, and never against the local database. The photo task reads a rendered paper, not a photo taken with a phone.
- **The operator route is off on the hosted demo.** The owner's laptop doing the demo's AI work with Claude Code was proven on a local agent worker only. Curriculum PDFs are read by the cloud model only.
- **Jemma Desktop.** The Mac app in `apps/desktop` runs jobs on your Claude Code or Codex subscription. It is unverified: it was not run for this submission. Pair it by entering the six-character code shown in the signed-in Jemma web app; build the unsigned Mac app with `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter desktop dist`.
- **English and Maths only.** The demo has one class: Grade 6 Mathematics. Other subjects and grades are not seeded.
- **Email sign-in is not part of the path.** The sign-in screen asks for a 6-digit code that is emailed to you, and the demo does not use it. If you try it, the email may arrive as a magic link instead of a code, depending on how the mail template is set. This was not tested against a real inbox for this document. Use the demo page.
- **Some links lead to "Coming after the challenge".** A few screens link to features that are not built, such as messaging a teacher, starting from another teacher's map, and adding another teacher's code.
- **No email, SMS or WhatsApp.** Jemma only shows notifications inside the app.
- **Phones and laptops only.** Built and checked at 390 px (phone) and 1440 px (laptop). Light theme only.

More is in the README ("What is not finished") and in [architecture.md](architecture.md) ("What is not built").
