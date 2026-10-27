# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p19.spec.ts >> register: mark everyone here, save stores 5 rows
- Location: e2e/p19.spec.ts:81:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Who\'s here today?', level: 1 })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Who\'s here today?', level: 1 }) with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Who\'s here today?', level: 1 })

```

```yaml
- heading "404" [level=1]
- heading "This page could not be found." [level=2]
- alert
```

# Test source

```ts
  1   | import { resolve } from 'node:path'
  2   | import { createServiceClient } from '@jemma/profiling/db'
  3   | import { expect, test, type Page, type TestInfo } from '@playwright/test'
  4   | import { openSandbox, type OpenedSandbox } from './helpers/sandbox'
  5   | 
  6   | const admin = () =>
  7   |   createServiceClient({
  8   |     SUPABASE_URL: process.env.SUPABASE_URL!,
  9   |     SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  10  |   })
  11  | 
  12  | const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)
  13  | 
  14  | /** Design match gate: boards are phone-size, so screenshots come from the phone project only. */
  15  | async function shot(page: Page, testInfo: TestInfo, board: string) {
  16  |   if (testInfo.project.name !== 'phone') return
  17  |   await page.evaluate(() => document.fonts.ready)
  18  |   await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  19  |   await page.screenshot({ path: actual(board), fullPage: true })
  20  | }
  21  | 
  22  | async function noHorizontalScroll(page: Page) {
  23  |   const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  24  |   expect(wide).toBe(false)
  25  | }
  26  | 
  27  | let sb: OpenedSandbox | undefined
  28  | test.afterEach(async () => {
  29  |   await sb?.cleanup().catch(() => undefined)
  30  |   sb = undefined
  31  | })
  32  | 
  33  | test('learners: headline, register card, rows, class code', async ({ page }, testInfo) => {
  34  |   sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  35  |   await page.goto(`/t/${sb.classId}/learners`)
  36  |   await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Everyone is marked\. \d learners? share(s)? one gap: [a-z ]+\.$/)
  37  |   await expect(page.getByText('Register for today')).toBeVisible()
  38  |   await expect(page.getByText(/not taken yet/)).toBeVisible()
  39  |   await expect(page.getByRole('link', { name: 'Take it' })).toBeVisible()
  40  |   await expect(page.getByText('Top gap')).toBeVisible()
  41  |   await expect(page.getByText('Average · days here')).toBeVisible()
  42  |   for (const name of ['Amina', 'Lerato', 'Naledi', 'Sipho', 'Thabo']) {
  43  |     await expect(page.getByRole('link', { name: new RegExp(`^${name[0]}\\s*${name}`) })).toBeVisible()
  44  |   }
  45  |   await expect(page.getByText('Parents link with this code')).toBeVisible()
  46  |   await expect(page.getByText(sb.joinCode)).toBeVisible()
  47  |   await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
  48  |   await noHorizontalScroll(page)
  49  |   await shot(page, testInfo, 'teacher-learners')
  50  | })
  51  | 
  52  | test('learner: summary, note saved shows under Earlier notes and queues observation.added', async ({ page }, testInfo) => {
  53  |   sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  54  |   await page.goto(`/t/${sb.classId}/learners/${sb.childId}`)
  55  |   await expect(page.getByRole('heading', { level: 1, name: 'Amina' })).toBeVisible()
  56  |   await expect(page.getByText('Average', { exact: true })).toBeVisible()
  57  |   await expect(page.getByText('Days this term')).toBeVisible()
  58  |   await expect(page.getByText('Open gaps')).toBeVisible()
  59  |   await expect(page.getByRole('heading', { name: 'Add a quick note' })).toBeVisible()
  60  |   await expect(page.getByRole('button', { name: 'Participation' })).toHaveAttribute('aria-pressed', 'true')
  61  |   await expect(page.getByText('Works well in a group and explains her thinking clearly.')).toBeVisible()
  62  |   await expect(page.getByText('Finished the decimals extension task without help.')).toBeVisible()
  63  | 
  64  |   await page.getByRole('button', { name: 'Confidence' }).click()
  65  |   await expect(page.getByRole('button', { name: 'Confidence' })).toHaveAttribute('aria-pressed', 'true')
  66  |   const text = 'Asked why we can\'t just add the bottoms. Keen to try the fraction strips tomorrow.'
  67  |   await page.getByLabel('Note').fill(text)
  68  |   await noHorizontalScroll(page)
  69  |   await shot(page, testInfo, 'teacher-learner')
  70  |   await page.getByRole('button', { name: 'Save note' }).click()
  71  |   const earlier = page.getByRole('region', { name: 'Earlier notes' })
  72  |   await expect(earlier.getByText(text)).toBeVisible()
  73  |   await expect(earlier.getByText(/Today · Confidence/)).toBeVisible()
  74  | 
  75  |   const { data } = await admin().from('observations').select('kind, text').eq('child_id', sb.childId).eq('text', text)
  76  |   expect(data).toEqual([{ kind: 'confidence', text }])
  77  |   const events = await admin().from('events').select('type, payload').eq('type', 'observation.added')
  78  |   expect(events.data?.some((e) => (e.payload as { childId?: string }).childId === sb!.childId)).toBe(true)
  79  | })
  80  | 
  81  | test('register: mark everyone here, save stores 5 rows', async ({ page }, testInfo) => {
  82  |   sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  83  |   await page.goto(`/t/${sb.classId}/register`)
> 84  |   await expect(page.getByRole('heading', { level: 1, name: "Who's here today?" })).toBeVisible()
      |                                                                                    ^ Error: expect(locator).toBeVisible() failed
  85  |   await expect(page.getByText("Everyone starts as here. Change anyone who's late or away.")).toBeVisible()
  86  |   await expect(page.getByText("Parents see attendance on their child's profile. Days count this term.")).toBeVisible()
  87  |   const sipho = page.getByRole('group', { name: 'Sipho' })
  88  |   await sipho.getByRole('button', { name: 'Late' }).click()
  89  |   await expect(sipho.getByRole('button', { name: 'Late' })).toHaveAttribute('aria-pressed', 'true')
  90  |   await page.getByRole('button', { name: 'Mark everyone here' }).click()
  91  |   await expect(sipho.getByRole('button', { name: 'Here' })).toHaveAttribute('aria-pressed', 'true')
  92  |   await page.getByRole('group', { name: 'Thabo' }).getByRole('button', { name: 'Away' }).click()
  93  |   await noHorizontalScroll(page)
  94  |   await shot(page, testInfo, 'teacher-register')
  95  | 
  96  |   const today = new Date().toISOString().slice(0, 10)
  97  |   await page.getByRole('button', { name: 'Save register' }).click()
  98  |   await page.waitForURL(new RegExp(`/t/${sb.classId}/learners$`))
  99  |   const { data } = await admin().from('attendance').select('child_id, status').eq('day', today)
  100 |   const rows = (data ?? []).filter((r) => true)
  101 |   const kids = await admin().from('enrolments').select('child_id').eq('class_id', sb.classId)
  102 |   const ids = new Set((kids.data ?? []).map((k) => k.child_id))
  103 |   const mine = rows.filter((r) => ids.has(r.child_id))
  104 |   expect(mine).toHaveLength(5)
  105 |   expect(mine.filter((r) => r.status === 'away')).toHaveLength(1)
  106 |   await expect(page.getByText(/taken/)).toBeVisible()
  107 | })
  108 | 
  109 | test('child profile: summary, marks by topic, notes, attendance', async ({ page }, testInfo) => {
  110 |   sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  111 |   await page.goto(`/t/${sb.classId}/learners/${sb.childId}/profile`)
  112 |   await expect(page.getByRole('heading', { level: 1 })).toContainText('Amina is at 60%.')
  113 |   await expect(page.getByText('Same profile Thandi')).toBeVisible()
  114 |   await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible()
  115 |   await expect(page.getByText('Nothing for Amina right now.')).toBeVisible()
  116 |   await expect(page.getByRole('heading', { name: 'Marks by topic' })).toBeVisible()
  117 |   await expect(page.getByText('Maths · change since Term 3')).toBeVisible()
  118 |   await expect(page.getByText('Adding fractions').first()).toBeVisible()
  119 |   await expect(page.getByText('Papers', { exact: true })).toBeVisible()
  120 |   await expect(page.getByText('See her paper or fix a mark')).toBeVisible()
  121 |   await expect(page.getByRole('heading', { name: 'What Jemma has noticed' })).toBeVisible()
  122 |   await expect(page.getByRole('heading', { name: 'Your notes' })).toBeVisible()
  123 |   await expect(page.getByRole('link', { name: 'Add a note' })).toBeVisible()
  124 |   await expect(page.getByText('Attendance', { exact: true })).toBeVisible()
  125 |   await expect(page.getByText('Tonight at home')).toBeVisible()
  126 |   await expect(page.getByText(/Adding fractions with different denominators · diagram · 12 minutes/)).toBeVisible()
  127 |   await noHorizontalScroll(page)
  128 |   await shot(page, testInfo, 'teacher-child-profile')
  129 | })
  130 | 
```