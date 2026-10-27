# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p22.spec.ts >> parent start, add child, consent, waiting >> a parent with no child sees the start screen
- Location: e2e/p22.spec.ts:35:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/p\/add\?code=LU8U3R/
Received string:  "http://localhost:3222/p/add?code=lu8u3r"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    13 × locator resolved to <html lang="en" class="outfit_1c44b68d-module__Sjvs0W__variable kalam_49d7b1e0-module__2yNoqq__variable">…</html>
       - unexpected value "http://localhost:3222/p/add?code=lu8u3r"

```

```yaml
- banner:
  - link "Back":
    - /url: /p
  - text: Add a child
- main:
  - heading "Link your child with the teacher's class code" [level=1]
  - text: Class code
  - textbox "Class code": LU8U3R
  - text: 6B Mathematics, Ms Banda Grade 6 · Hillview Primary Your child's name, as the school has it
  - textbox "Your child's name, as the school has it"
  - region "Once linked, you'll see":
    - heading "Once linked, you'll see" [level=2]
    - list:
      - listitem: Your child’s marks, gaps and the papers behind them
      - listitem: Ms Banda's notes and attendance
      - listitem: Tonight's lesson, ready to hand to your child
    - paragraph: Ms Banda says yes before you see anything.
  - button "Link your child"
  - link "No code? Add your child yourself":
    - /url: /p/add
- alert
```

# Test source

```ts
  1   | import { mkdirSync } from 'node:fs'
  2   | import { resolve } from 'node:path'
  3   | import { createServiceClient } from '@jemma/profiling/db'
  4   | import { expect, test, type Page, type TestInfo } from '@playwright/test'
  5   | import { openSandbox, type OpenedSandbox } from './helpers/sandbox'
  6   | 
  7   | const admin = () =>
  8   |   createServiceClient({
  9   |     SUPABASE_URL: process.env.SUPABASE_URL!,
  10  |     SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  11  |   })
  12  | 
  13  | const ACTUAL = resolve(import.meta.dirname, '../../../design/actual')
  14  | 
  15  | /** Saves the full page at 390 wide, once (the phone project), for the design match gate. */
  16  | async function shot(page: Page, info: TestInfo, board: string) {
  17  |   if (info.project.name !== 'phone') return
  18  |   mkdirSync(ACTUAL, { recursive: true })
  19  |   await page.screenshot({ path: resolve(ACTUAL, `${board}.png`), fullPage: true })
  20  | }
  21  | 
  22  | /** Thandi's link is seeded as approved; removing it gives the state before she asks. */
  23  | async function unlink(sb: OpenedSandbox) {
  24  |   const { error } = await admin().from('parent_links').delete().eq('child_id', sb.childId)
  25  |   if (error) throw new Error(error.message)
  26  | }
  27  | 
  28  | let sb: OpenedSandbox | null = null
  29  | test.afterEach(async () => {
  30  |   await sb?.cleanup()
  31  |   sb = null
  32  | })
  33  | 
  34  | test.describe('parent start, add child, consent, waiting', () => {
  35  |   test('a parent with no child sees the start screen', async ({ page }, info) => {
  36  |     sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  37  |     await unlink(sb)
  38  |     await page.goto('/p')
  39  |     await expect(page.getByText('Welcome, Thandi')).toBeVisible()
  40  |     await expect(page.getByRole('heading', { level: 1 })).toHaveText("Let's add your child. It takes about a minute.")
  41  |     await expect(page.getByRole('heading', { name: 'Got a class code from a teacher?' })).toBeVisible()
  42  |     await expect(page.getByLabel('Class code')).toBeVisible()
  43  |     await expect(page.getByText("Ms Banda's class code is")).toContainText(sb.joinCode)
  44  |     await expect(page.getByRole('button', { name: /Add your child without a code/ })).toBeVisible()
  45  |     await expect(page.getByText('You can link their teacher later')).toBeVisible()
  46  |     await expect(page.getByRole('heading', { name: "What you'll see" })).toBeVisible()
  47  |     for (const line of ['Marks and gaps from every test', 'The paper behind each gap', 'A short lesson to do together at home']) {
  48  |       await expect(page.getByText(line)).toBeVisible()
  49  |     }
  50  |     await shot(page, info, 'parent-start')
  51  | 
  52  |     // The class code goes on to the add-child screen.
  53  |     await page.getByLabel('Class code').fill(sb.joinCode.toLowerCase())
  54  |     await page.getByRole('button', { name: 'Find the class' }).click()
> 55  |     await expect(page).toHaveURL(new RegExp(`/p/add\\?code=${sb.joinCode}`))
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  56  |   })
  57  | 
  58  |   test('add child finds the class from its code', async ({ page }, info) => {
  59  |     sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  60  |     await unlink(sb)
  61  |     await page.goto(`/p/add?code=${sb.joinCode}&child=Amina`)
  62  |     await expect(page.getByRole('heading', { level: 1 })).toHaveText("Link your child with the teacher's class code")
  63  |     await expect(page.getByLabel('Class code')).toHaveValue(sb.joinCode)
  64  |     await expect(page.getByText('6B Mathematics, Ms Banda')).toBeVisible()
  65  |     await expect(page.getByText('Grade 6 · Hillview Primary')).toBeVisible()
  66  |     await expect(page.getByLabel("Your child's name, as the school has it")).toHaveValue('Amina')
  67  |     await expect(page.getByRole('heading', { name: "Once linked, you'll see" })).toBeVisible()
  68  |     await expect(page.getByText("Amina's marks, gaps and the papers behind them")).toBeVisible()
  69  |     await expect(page.getByText("Ms Banda's notes and attendance")).toBeVisible()
  70  |     await expect(page.getByText("Tonight's lesson, ready to hand to Amina")).toBeVisible()
  71  |     await expect(page.getByText('Ms Banda says yes before you see anything.')).toBeVisible()
  72  |     await expect(page.getByRole('button', { name: 'Link Amina' })).toBeVisible()
  73  |     await expect(page.getByRole('link', { name: 'No code? Add your child yourself' })).toBeVisible()
  74  |     await shot(page, info, 'parent-add-child')
  75  | 
  76  |     // A code that matches no class says so and shows no class.
  77  |     await page.goto('/p/add?code=ZZZZZZ&child=Amina')
  78  |     await expect(page.getByText('No class has that code. Check it with the teacher.')).toBeVisible()
  79  |     await expect(page.getByText('6B Mathematics, Ms Banda')).toHaveCount(0)
  80  |   })
  81  | 
  82  |   test('a name that is not in the class does not go on', async ({ page }) => {
  83  |     sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  84  |     await unlink(sb)
  85  |     await page.goto(`/p/add?code=${sb.joinCode}&child=Nobody`)
  86  |     await page.getByRole('button', { name: /^Link / }).click()
  87  |     await expect(page).toHaveURL(/\/p\/add\?/)
  88  |     await expect(page.getByText("Ms Banda's class has no one called Nobody. Check the spelling.")).toBeVisible()
  89  |   })
  90  | 
  91  |   test('consent needs the two required boxes, then asks the teacher and waits', async ({ page }, info) => {
  92  |     sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  93  |     await unlink(sb)
  94  |     await page.goto(`/p/add/consent?code=${sb.joinCode}&child=Amina`)
  95  |     await expect(page.getByText('Amina · 6B Mathematics')).toBeVisible()
  96  |     await expect(page.getByText('Before you link')).toBeVisible()
  97  |     await expect(page.getByRole('heading', { level: 1 })).toHaveText(
  98  |       "Jemma keeps Amina's schoolwork so it can teach her. Is that okay with you?",
  99  |     )
  100 |     await expect(page.getByRole('heading', { name: 'What Jemma keeps' })).toBeVisible()
  101 |     await expect(page.getByText('Photos of her tests and homework')).toBeVisible()
  102 |     await expect(page.getByText('Only you, Ms Banda and Amina see it.')).toBeVisible()
  103 |     const guardian = page.getByLabel("I'm Amina's parent or legal guardian")
  104 |     const teach = page.getByLabel("Jemma can use Amina's schoolwork to teach her")
  105 |     const improve = page.getByLabel('Use her work, name removed, to make Jemma better')
  106 |     await expect(guardian).toBeChecked()
  107 |     await expect(teach).toBeChecked()
  108 |     await expect(improve).not.toBeChecked()
  109 |     await expect(page.getByText("South Africa's POPIA law treats under-18s as children, so we need your OK. Change this any time in Amina's settings.")).toBeVisible()
  110 |     await expect(page.getByRole('link', { name: 'Privacy in plain words' })).toBeVisible()
  111 |     await shot(page, info, 'parent-consent')
  112 | 
  113 |     // Unticking a required box blocks the request.
  114 |     await teach.uncheck()
  115 |     await page.getByRole('button', { name: 'Agree and ask Ms Banda' }).click()
  116 |     await expect(page).toHaveURL(/\/p\/add\/consent/)
  117 |     expect(await admin().from('parent_links').select('id').eq('child_id', sb.childId)).toMatchObject({ data: [] })
  118 | 
  119 |     await teach.check()
  120 |     await page.getByRole('button', { name: 'Agree and ask Ms Banda' }).click()
  121 |     await expect(page).toHaveURL(/\/p\/add\/pending/)
  122 | 
  123 |     await expect(page.getByText('Linking Amina')).toBeVisible()
  124 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('Waiting for Ms Banda to say yes.')
  125 |     await expect(page.getByText('6B Mathematics · Hillview Primary')).toBeVisible()
  126 |     await expect(page.getByText(/^Asked at \d\d:\d\d · Ms Banda$/)).toBeVisible()
  127 |     await expect(page.getByText("Ms Banda checks that you're Amina's parent. Most teachers answer within a school day.")).toBeVisible()
  128 |     await expect(page.getByText("Her answer shows up in Needs you on Amina's profile.")).toBeVisible()
  129 |     await expect(page.getByRole('link', { name: "Snap Amina's homework meanwhile" })).toBeVisible()
  130 |     await expect(page.getByText('In the demo you are Ms Banda too.')).toBeVisible()
  131 |     await expect(page.getByRole('button', { name: 'Switch to Ms Banda to approve' })).toBeVisible()
  132 |     await expect(page.getByRole('link', { name: "Approved already? Open Amina's profile" })).toBeVisible()
  133 |     await shot(page, info, 'parent-link-pending')
  134 | 
  135 |     // The request is recorded as pending, with the ticks, and the teacher has an item to answer.
  136 |     const db = admin()
  137 |     const { data: links } = await db.from('parent_links').select('status, consent').eq('child_id', sb.childId)
  138 |     expect(links).toEqual([{ status: 'pending', consent: { guardian: true, teach: true, improve: false } }])
  139 |     const { data: needs } = await db.from('needs_you_items').select('kind, status, title').eq('child_id', sb.childId).eq('kind', 'approve_link')
  140 |     expect(needs).toEqual([{ kind: 'approve_link', status: 'open', title: "Thandi M wants to see Amina's work" }])
  141 |   })
  142 | 
  143 |   test('nothing about the child is visible before the teacher approves', async ({ page }) => {
  144 |     sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  145 |     await unlink(sb)
  146 |     await page.goto(`/p/add/consent?code=${sb.joinCode}&child=Amina`)
  147 |     await page.getByRole('button', { name: 'Agree and ask Ms Banda' }).click()
  148 |     await expect(page).toHaveURL(/\/p\/add\/pending/)
  149 | 
  150 |     // The child's space is closed: profile, report and paper routes all answer not found.
  151 |     for (const path of ['', '/report', '/tests']) {
  152 |       const res = await page.goto(`/p/${sb.childId}${path}`)
  153 |       expect(res?.status(), path).toBe(404)
  154 |     }
  155 |     // The home sends a waiting parent back to the waiting page, which shows no marks or test names.
```