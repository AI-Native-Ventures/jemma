# P73 decision 8: every control that opens "Coming after the challenge"

Found by grepping the phrase in `apps/web` (tests left aside), then every place that uses a component that opens the sheet
(`ComingSheet`, `ComingButton`, `ComingLink`). The four definitions of the sheet are not controls:
`app/t/_p21-client.tsx`, `app/(auth)/_coming.tsx`, `app/p/[childId]/beyond/_coming.tsx`, `app/p/account/_ui.tsx`.

Rule used: change nothing where the thing is really not built. Where the thing exists, point the control at it.
Paths below are under `apps/web/`.

| # | Control (what it says) | File | Does the thing exist? | What I did |
|---|---|---|---|---|
| 1 | Curriculum: "Or start from a map another teacher approved" (twice, empty and draft-ready screens) | `app/t/[classId]/curriculum/parts.tsx` (`ComingLink`), used at `curriculum/page.tsx` lines 43 and 107 | No. Nothing shares or copies an approved map between teachers. | Verdict only. No edit (parts.tsx belongs to another worker). |
| 2 | New class: "Snap the register instead. Jemma reads the names from your class list" | `app/t/new/NewClassForm.tsx` line 183 | No. No job reads a photo of a class list. (The `/t/[classId]/register` screens are the daily attendance register, a different thing.) | Nothing. |
| 3 | Teacher account: "School plan" | `app/t/account/AccountClient.tsx` (`ComingRow`), used at `app/t/account/page.tsx` line 43 | No. No plans or billing in the app. | Nothing. |
| 4 | Teacher account: "Messages from parents" | same, `page.tsx` line 44 | No. No messages table or screen. | Nothing. |
| 5 | Teacher account: "Delete my account" | `AccountClient.tsx` (`DeleteAccount`), `page.tsx` line 61 | No. No delete route or action for accounts. | Nothing. |
| 6 | Link request: "Not sure? Message her first" | `app/t/[classId]/link-requests/[linkId]/Decision.tsx` | No. No messaging between teacher and parent. | Nothing. |
| 7 | Year end: "Move 6B up after the last day of term" and "Archive 6B after the last day of term" (one button, its words follow the choice) | `app/t/[classId]/year-end/YearEnd.tsx` (the primary button) | No. Nothing moves a class up or archives it (no archived state in the schema, no action). The CSV download beside it is real and works. | Nothing. |
| 8 | Parent account: "Edit your details" | `app/p/account/page.tsx` line 27 | No for parents. The teacher account has a real `EditDetails` (`saveName`), but `app/p/account/actions.ts` only has `signOut`. | Nothing. |
| 9 | Parent account: "Notifications (In the app, lesson ready and lesson finished)" | `app/p/account/page.tsx` | YES. The notifications screen is `/p/[childId]/notifications`; the bell on the parent home opens it for the first child. | CHANGED: the row is now a link to `/p/{first child}/notifications`, the same place the home bell goes. With no child the row keeps the sheet. The words of the row are unchanged. |
| 10 | Parent data: "Get a copy" (Download everything, a ZIP) | `app/p/data/page.tsx` line 21 | No. No export route or job. | Nothing. |
| 11 | Parent data: "Delete {name}'s data" and "Delete my account" | `app/p/data/page.tsx` lines 53 and 55 | No. No delete action (`app/p/data/actions.ts` only saves the "improve" consent). | Nothing. |
| 12 | Parent child settings: "Edit" next to the child's grade and school | `app/p/[childId]/settings/page.tsx` line 31 | No. `settings/actions.ts` only sets the PIN. | Nothing. |
| 13 | Parent child settings: "Add another teacher's code" | `app/p/[childId]/settings/page.tsx` line 61 | No, and `/p/add` is not it. `/p/add` links a child to a class by code, but for a child that is already linked `createLinkRequest` (`lib/data/p22.ts`) answers with the existing link and sends the parent to the "waiting" screen, so pointing here would show a false "waiting". | Nothing. |
| 14 | Parent beyond-class screen: "Message {teacher}" | `app/p/[childId]/beyond/page.tsx` line 41 | No. No messaging. | Nothing. |
| 15 | Role choice: "Learner, Grade 8 to 12. I fix my own gaps with my Jemma." | `app/(auth)/role/page.tsx` line 96 | No for self sign-up: `chooseRole` accepts only teacher and parent. The learner app exists (`/k`) but a learner gets in with a code and PIN from a parent or teacher, and the line right under the cards already links "Sign in with your code" (`/k/sign-in`). `e2e/shared.spec.ts` expects this sheet. | Nothing. |
| 16 | Help: "Report a problem" and "Message the Jemma team" | `app/(auth)/help/HelpList.tsx` lines 95 and 96 | No. No feedback endpoint, and no support address to point at. | Nothing. |
| 17 | Privacy: "Full privacy policy" and "Terms of use" | `app/(auth)/privacy/page.tsx` lines 127 and 128 | No. Only the `/privacy` summary page exists; there is no longer policy or terms page. | Nothing. |
| 18 | Learner audio lesson: "EN" pill (Listening in English. Change language) | `app/k/session/_parts/LearnAudio.tsx` lines 205 and 230 | No. One speech language (English). | Nothing. |
| 19 | UI kit page: "Open sheet" | `app/kit/client.tsx` (`KitSheet`) | Not a product control. It is the design kit page (`/kit`, not indexed) showing the sheet component. | Nothing. |

## Summary

- 19 rows, 1 changed (row 9), 18 left as they are because the thing is not built or the control is not a product promise.
- Judgement calls the coordinator may want to reverse: row 9 (changed) and row 15 (left, there is an e2e spec that expects the sheet).
- The existing e2e specs that expect the sheet open these rows: `p21` rows 2, 4, 6 and 7; `p23` row 14; `p26` rows 11 and 13; `p27` row 18; `p30` row 1; `shared` rows 15 and 17. None of them clicks the Notifications row (row 9). `p26` "parent-account" still sees the row's words.
