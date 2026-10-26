# Step 3: v1 for the challenge

Oct 26, 2026 · @Basheer

v1 is one demo path of the full agent loop: Maths only, one web app for phone and laptop, shown to judges as a video and a live link. Build 28 Oct to 1 Nov, test and fix 2 to 7 Nov, submit by 9 Nov.

## Decisions for v1

All five are yours.

| Decision | What it means |
| --- | --- |
| Time | 2 weeks max to submit, really 1 week of build so there is a week to test and fix |
| Platform | One web app that installs to the phone home screen and runs on laptop. Native app store apps after the challenge |
| Subject | Maths for the challenge, more subjects coming soon |
| Formats | All three: reading, diagram, audio memo |
| Judges | Both a demo video and a live link they log into themselves |

## Plan

&#91;embedded content: Plan: 4 phases, 3 gates, 26 Oct to 9 Nov\]

Each phase starts only when the gate before it passes. If the demo path is not working by 1 Nov, we cut more, not move the test week.

## The demo path judges see

This is the test v1 must pass, on made-up learners only.

1. **Teacher** uploads a Grade 6 Maths curriculum. Jemma drafts the topic map. The teacher edits and approves it.
2. **Teacher** snaps the answer key and 5 papers. Jemma reads and marks them and flags one it is unsure about. The teacher checks it. Class gaps appear: "4 of 5 add tops and bottoms".
3. **Parent** enters the class code and sees Amina's Profile: marks, gaps, and the evidence behind each gap down to the photo.
4. **Amina** opens Today and runs a session: learn in one format, 5 questions, results at the end. Her gap moves from new to practising.
5. **Teacher and parent** see the session result and the updated gaps.

Judges get logins for all three roles and a reset button that puts the demo back to the start.

## Not in v1

All of these stay in the design and come after the challenge.

- Subjects other than Maths, native app store apps
- Shared map library, Ask Jemma chat, Wins tab
- Teen invites, "Who's learning?" picker with PINs, Grade 1 to 3 mode
- "Find my level" check, adult setting overrides, several teachers per child
- Format learning from real use (it needs weeks of data, so the demo shows it on made-up history)

## Risks

| Risk | What we do |
| --- | --- |
| The AI misreads handwriting and marks wrongly | Tuesday test of 3 vision models on the same papers; you pick on accuracy and cost. Doubtful answers go to the teacher's Needs you list |
| 5 build days is tight | Demo path only, everything else cut, several build agents in parallel |
| Judges break the demo data | Reset button back to the starting state |
| An AI call fails live in front of judges | Retry with a clear message, lessons saved once made, never a crash screen |
| Challenge rules ask for something we did not plan (for example a specific agent tool) | Need the rules this week |

## Still open

- [ ] Challenge rules, found on a third-party listing (official brief not seen): Jemma must include its own MCP server with at least 3 tools, one of which updates or analyses learner profiles; submit a public code repo, demo video, text description and technical docs. Confirm against your acceptance email; pick an open-source licence
- [x] Hosting: free cloud Supabase (database, login, photos) + Cloudflare Workers at $5 a month (app and agent). Preview links with made-up data approved
- [ ] Vision model: you pick after Tuesday's test. You and 2 to 3 helpers handwrite about 10 made-up papers by Tuesday morning
