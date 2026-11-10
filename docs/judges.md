# For judges

This page is the shortest path through Jemma on the live link. The live link is to be announced with the submission: `<live link>`. Licence: to be announced.

Every person, school and paper in the demo is made up. Please do not type real information about real children.

## The 5-minute path

Open the live link and go to `/demo`. You get your own private copy of Hillview Primary, a made-up school. Other judges cannot see it and you cannot see theirs.

1. **Sign in as Ms Banda (teacher).** Tap "Ms Banda", marked "Start here". You land on Curriculum.
2. **Approve the topic map.** Tap "Use the sample curriculum". Jemma reads it and drafts a topic map. Check it and approve it. Two topics carry a question for you on purpose: Jemma is not sure about them and asks.
3. **Snap the memo and five papers.** On Snap, use the sample memo and the sample papers if you have none of your own. Jemma reads each photo, marks it, and puts anything it is unsure about in "Needs you". Open one paper and the class report to see the gaps and the reteach plan. Then tap **Share with parents** on the class home. Until you do, a parent and the learner see nothing from this test, and Jemma plans no lesson from it.
4. **Switch to Thandi M (parent).** Open `/demo/switch`, or go back to `/demo`. The class code is shown on the page. Add Amina with that code and tick the consent boxes. The link waits for the teacher, so switch to Ms Banda, open the link request and say yes, then switch back to Thandi and open Amina's profile. Look at Profile and the Learn tab: her gaps, the lesson Jemma planned for tonight, and "What helps", which says "Too early to tell" until a format has been tried 3 times.
5. **Switch to Amina (learner) and run tonight's session.** Warm-up, the lesson, then the questions. Amina never sees right or wrong or a score. At the end she sees only the questions she missed, why, and the right way.
6. **Switch back to Ms Banda or Thandi.** See the result and the updated gap stage (new, practising or fixed).

The demo page says the full path takes about 10 minutes. The 5 minutes above is the short version if you skip reading each screen: steps 1, 2, 5 and 6 are the core.

Use **Reset demo** (`/demo/reset`) at any time. It puts your copy back to step 1 with fresh sample papers in about 10 seconds.

## Demo accounts

There is nothing to type. The demo page signs you in as one of three people in your own copy of the school. You do not need an email address.

| Person | Role | What they are |
| --- | --- | --- |
| Ms Banda | Teacher | Teaches class 6B Mathematics, Grade 6. |
| Thandi M | Parent | Amina's mother. |
| Amina | Learner | A Grade 6 learner. |

The other learners in the class are Thabo, Lerato, Sipho and Naledi.

## What each role sees

Phone (390 px wide) has a bottom tab bar. A laptop (1024 px wide and up) has a left sidebar with the same tabs in the same order.

- **Teacher.** Tabs: Class, Learners, Snap, Tests, Curriculum. Sees the learners in their own class only. Gets a "Needs you" list for anything Jemma is unsure about (a dark photo, an unreadable name, an answer it could not read), a "What Jemma did" log, class gaps with a reteach plan, notes, attendance and the year-end export.
- **Parent.** Tabs: Profile, Learn, Snap, Tests. Sees only linked children, and only after the teacher says yes. Sees marks by topic, gaps, the planned lesson, activities, and the guidance card. Can snap homework, flag a mark, and set the child's login code and PIN.
- **Learner.** Tabs: Today, My gaps. Sees only themselves. One Start button on Today. No score, no right or wrong.

## Where the MCP server fits

Everything the agent does goes through Jemma's own MCP server (20 tools). You can connect your own MCP client to the live agent if the team gives you a token. See [mcp-server.md](mcp-server.md). Tokens are created by the team, not by the app.

## Known limits

- **Free models are slow on a cache miss.** Jemma runs on free models, which have rate limits and fail often. Jemma retries, then tries a fallback model. A full uncached run of the demo path took about 15 to 25 minutes when it was recorded. The live link is meant to run in `cache` mode after a warm-up run: every sandbox starts from the same sample inputs, so papers, reports and lessons come back from storage in seconds. If you upload something new (your own photo, an edited paper), that call goes to a free model and can take minutes or fail. A failed job shows an error with a Retry button.
- **English and Maths only.** The demo has one class: Grade 6 Mathematics. Other subjects and grades are not seeded.
- **Synthetic data only.** No real learner is in the system.
- **Email sign-in is not part of the path.** The sign-in screen asks for a 6-digit code that is emailed to you, and the demo does not use it. If you try it, the email may arrive as a magic link instead of a code, depending on how the mail template is set. This was not tested against a real inbox for this document. Use the demo page.
- **Some links lead to "Coming after the challenge".** A few screens link to features that are not built, such as messaging a teacher, starting from another teacher's map, and adding another teacher's code.
- **No email, SMS or WhatsApp.** Jemma only shows notifications inside the app.
- **Jemma Desktop.** The Mac app in `apps/desktop` runs jobs on your Claude Code or Codex subscription. Pair it by entering the six-character code shown in the signed-in Jemma web app; build the unsigned Mac app with `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter desktop dist`.
- **Phones.** Built and checked at 390 px (phone) and 1440 px (laptop). Light theme only.
