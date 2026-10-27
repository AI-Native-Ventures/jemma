# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: demo-path.spec.ts >> the whole demo path
- Location: e2e/demo-path.spec.ts:77:1

# Error details

```
Error: agent event paper.snapped failed while reading the 5 papers: Replay miss: 87af41075287c3802c75607114e205cd02706dcfab6faeed8899f3124617822c (nvidia/nemotron-3.5-super-vl:free: # Job: write_lesson You write one home lesson for one child, for a school in Sou ...  the whole lesson again as one JSON object with every field.)
```

# Page snapshot

```yaml
- generic [active] [ref=f3e1]:
  - main [ref=f3e4]:
    - generic [ref=f3e5]:
      - generic [ref=f3e6]:
        - link "Close" [ref=f3e7] [cursor=pointer]:
          - /url: /t/63a2ef55-4d08-4a09-b014-1d0e22f4e9bf
        - generic [ref=f3e10]:
          - generic [ref=f3e11]: Class Test 1
          - generic [ref=f3e12]: 5 papers snapped at 20:27
      - generic [ref=f3e13]:
        - generic [ref=f3e14]:
          - heading "Read 5 of 5 papers" [level=1] [ref=f3e18]
          - paragraph [ref=f3e21]: All read. Anything I'm unsure about is in Needs you.
        - region [ref=f3e22]:
          - heading "Papers" [level=2] [ref=f3e23]
          - list [ref=f3e24]:
            - listitem [ref=f3e25]:
              - generic [aria-hidden] [ref=f3e26]: A
              - generic [ref=f3e27]: Amina
              - generic [ref=f3e28]: 6/10
              - img "Marked" [ref=f3e29]
            - listitem [ref=f3e31]:
              - generic [aria-hidden] [ref=f3e32]: T
              - generic [ref=f3e33]: Thabo
              - generic [ref=f3e34]: 5/10
              - img "Marked" [ref=f3e35]
            - listitem [ref=f3e37]:
              - generic [aria-hidden] [ref=f3e38]: L
              - generic [ref=f3e39]: Lerato
              - generic [ref=f3e40]: 9/10
              - img "Marked" [ref=f3e41]
            - listitem [ref=f3e43]:
              - generic [aria-hidden] [ref=f3e44]: S
              - generic [ref=f3e45]: Sipho
              - generic [ref=f3e46]: 6/10
              - img "Marked" [ref=f3e47]
            - listitem [ref=f3e49]:
              - generic [aria-hidden] [ref=f3e50]: "N"
              - generic [ref=f3e51]: Naledi
              - generic [ref=f3e52]: 7/10
              - img "Marked" [ref=f3e53]
        - region [ref=f3e55]:
          - heading "What Jemma did" [level=2] [ref=f3e57]
          - list [ref=f3e58]:
            - listitem [ref=f3e59]:
              - generic [ref=f3e60]: 20:28
              - generic [ref=f3e61]: Marked 10 answers against your key
            - listitem [ref=f3e62]:
              - generic [ref=f3e63]: 20:28
              - generic [ref=f3e64]: Read 1 paper.
            - listitem [ref=f3e65]:
              - generic [ref=f3e66]: 20:28
              - generic [ref=f3e67]: Read 1 paper.
        - link "Back to class" [ref=f3e68] [cursor=pointer]:
          - /url: /t/63a2ef55-4d08-4a09-b014-1d0e22f4e9bf
  - button "Open Next.js Dev Tools" [ref=f3e74] [cursor=pointer]
  - alert [ref=f3e78]: Jemma
```

# Test source

```ts
  1   | import { createServiceClient, type JemmaDb } from '@jemma/profiling/db'
  2   | import { expect, test, type Page } from '@playwright/test'
  3   | import { signInWithPassword } from './helpers/session'
  4   | import { openSandbox } from './helpers/sandbox'
  5   | 
  6   | // The judges' demo path on a `start` sandbox, with the real agent worker running (`pnpm --filter agent dev`)
  7   | // and the web app posting events to AGENT_URL. The agent's AI_MODE decides the speed: `replay` answers from
  8   | // ai_replays in seconds, `record` calls the free models and stores what they say (about 20 minutes).
  9   | // Run: PLAYWRIGHT_PORT=3237 pnpm --filter web exec playwright test demo-path --project=phone --workers=1
  10  | // See docs/runbook.md.
  11  | 
  12  | const LIVE = (process.env.AI_MODE ?? 'replay') !== 'replay'
  13  | const AGENT_WAIT = LIVE ? 25 * 60_000 : 90_000
  14  | 
  15  | const db = (): JemmaDb =>
  16  |   createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })
  17  | 
  18  | type Logins = Record<'teacher' | 'parent' | 'learner', { email: string; password: string }>
  19  | 
  20  | const SAMPLE_BUCKET = 'sample-papers'
  21  | 
  22  | const eventCount = async (schoolId: string) => (await db().from('events').select('id').eq('school_id', schoolId)).data?.length ?? 0
  23  | 
  24  | /**
  25  |  * Waits until the agent has nothing queued or running for this school and has seen more than `since` events
  26  |  * (the count taken before the click that sends the next one). A failed event stops the test with its error.
  27  |  */
  28  | async function agentIdle(schoolId: string, what: string, since: number): Promise<void> {
  29  |   const admin = db()
  30  |   const started = Date.now()
  31  |   let quiet = 0
  32  |   while (Date.now() - started < AGENT_WAIT) {
  33  |     const { data } = await admin.from('events').select('type, status, error').eq('school_id', schoolId)
  34  |     const rows = data ?? []
  35  |     const failed = rows.find((e) => e.status === 'failed')
> 36  |     if (failed) throw new Error(`agent event ${failed.type} failed while ${what}: ${failed.error}`)
      |                       ^ Error: agent event paper.snapped failed while reading the 5 papers: Replay miss: 87af41075287c3802c75607114e205cd02706dcfab6faeed8899f3124617822c (nvidia/nemotron-3.5-super-vl:free: # Job: write_lesson You write one home lesson for one child, for a school in Sou ...  the whole lesson again as one JSON object with every field.)
  37  |     const busy = rows.some((e) => e.status === 'queued' || e.status === 'running')
  38  |     quiet = busy || rows.length <= since ? 0 : quiet + 1
  39  |     if (quiet >= 3) return
  40  |     await new Promise((r) => setTimeout(r, 2000))
  41  |   }
  42  |   throw new Error(`the agent did not finish ${what} in ${AGENT_WAIT / 1000} seconds`)
  43  | }
  44  | 
  45  | async function sampleFile(path: string, name: string) {
  46  |   const { data, error } = await db().storage.from(SAMPLE_BUCKET).download(path)
  47  |   if (error || !data) throw new Error(`sample file ${path}: ${error?.message}`)
  48  |   return { name, mimeType: 'image/png', buffer: Buffer.from(await data.arrayBuffer()) }
  49  | }
  50  | 
  51  | /** The same phone, a different person: replaces the sign-in cookies. */
  52  | async function signInAs(page: Page, logins: Logins, role: keyof Logins) {
  53  |   await signInWithPassword(page, logins[role].email, logins[role].password)
  54  | }
  55  | 
  56  | type LessonQuestion = { prompt: string; answer: string; choices?: string[]; render?: string; terms?: string[] }
  57  | 
  58  | /** What the child taps or types for one question: the right answer, or something that is not. */
  59  | async function answerQuestion(page: Page, q: LessonQuestion, right: boolean) {
  60  |   const wrongChoice = (choices: string[]) => choices.findIndex((c, i) => c !== q.answer && String.fromCharCode(65 + i) !== q.answer)
  61  |   const rightChoice = (choices: string[]) => choices.findIndex((c, i) => c === q.answer || String.fromCharCode(65 + i) === q.answer)
  62  |   if (q.choices?.length) {
  63  |     const i = right ? rightChoice(q.choices) : wrongChoice(q.choices)
  64  |     await page.getByRole('button', { pressed: false }).nth(Math.max(i, 0)).click()
  65  |   } else if (q.render === 'fraction_sum' && q.terms?.length === 2) {
  66  |     const [top, bottom] = (right ? q.answer : '1/99').split('/')
  67  |     await page.getByLabel('Top number').fill(top!)
  68  |     await page.getByLabel('Bottom number').fill(bottom ?? '1')
  69  |   } else {
  70  |     await page.getByLabel('Your answer').fill(right ? q.answer : '0')
  71  |   }
  72  |   await page.getByRole('button', { name: 'Next', exact: true }).click()
  73  | }
  74  | 
  75  | test.use({ actionTimeout: 30_000 })
  76  | 
  77  | test('the whole demo path', async ({ page }) => {
  78  |   test.setTimeout(LIVE ? 60 * 60_000 : 8 * 60_000)
  79  |   const admin = db()
  80  |   const health = await fetch(`${process.env.AGENT_URL}/health`).catch(() => null)
  81  |   expect(health?.ok, `the agent worker must be running at ${process.env.AGENT_URL} (pnpm --filter agent dev)`).toBe(true)
  82  | 
  83  |   const sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
  84  |   try {
  85  |     const { data: box } = await admin.from('demo_sandboxes').select('school_id, logins').eq('id', sb.sandboxId).single()
  86  |     const schoolId = box!.school_id
  87  |     const logins = box!.logins as Logins
  88  |     const base = `/t/${sb.classId}`
  89  | 
  90  |     // 1. Teacher uploads the curriculum, Jemma drafts the map, the teacher approves it.
  91  |     await page.goto(`${base}/curriculum`)
  92  |     let seen = await eventCount(schoolId)
  93  |     await page.getByRole('button', { name: 'Use the sample curriculum' }).click()
  94  |     await agentIdle(schoolId, 'drafting the map', seen)
  95  |     await page.goto(`${base}/curriculum`)
  96  |     await page.getByRole('link', { name: 'Check the draft map' }).click()
  97  |     await expect(page.getByRole('heading', { level: 1 })).toContainText(/topics in \d terms?/)
  98  |     await page.getByRole('button', { name: 'Approve map' }).click()
  99  |     await page.waitForURL(`**${base}/curriculum`)
  100 |     await expect(page.getByText(/^Approved /)).toBeVisible()
  101 |     const map = await admin.from('curriculum_maps').select('id, status').eq('class_id', sb.classId).single()
  102 |     expect(map.data?.status).toBe('approved')
  103 |     const topics = await admin.from('topics').select('id').eq('map_id', map.data!.id)
  104 |     expect(topics.data!.length).toBeGreaterThan(5)
  105 | 
  106 |     // 2. Teacher snaps the memo, Jemma reads the key, the teacher approves it.
  107 |     await page.goto(`${base}/snap`)
  108 |     await expect(page.getByRole('heading', { name: 'Which test are we marking?' })).toBeVisible()
  109 |     seen = await eventCount(schoolId)
  110 |     await page.locator('input[type=file][capture]').setInputFiles(await sampleFile('class-test-1/memo.png', 'memo.png'))
  111 |     await page.waitForURL(/\/snap\/[0-9a-f-]+\/key$/)
  112 |     const testId = page.url().match(/snap\/([0-9a-f-]+)\/key/)![1]!
  113 |     await agentIdle(schoolId, 'reading the memo', seen)
  114 |     await page.reload()
  115 |     await expect(page.getByRole('heading', { name: /I read \d+ answers from the memo/ })).toBeVisible()
  116 |     for (const yes of await page.getByRole('button', { name: /^Yes, / }).all()) await yes.click().catch(() => undefined)
  117 |     await page.getByRole('button', { name: 'Approve key, snap papers' }).click()
  118 |     await page.waitForURL(/\/papers$/)
  119 |     const key = await admin.from('answer_keys').select('status, items').eq('test_id', testId).single()
  120 |     expect(key.data?.status).toBe('approved')
  121 |     expect((key.data!.items as unknown[]).length).toBe(10)
  122 | 
  123 |     // 3. The 5 sample papers: Jemma reads and marks them, finds the gaps, writes the class report and each lesson.
  124 |     seen = await eventCount(schoolId)
  125 |     await page.getByRole('button', { name: 'Use the sample papers' }).click()
  126 |     await expect(page.getByRole('heading', { name: '5 papers in. Snap the next one, or add a page.' })).toBeVisible({ timeout: 30_000 })
  127 |     await page.getByRole('link', { name: 'Done snapping · 5 papers' }).click()
  128 |     await page.waitForURL(/\/progress$/)
  129 |     await agentIdle(schoolId, 'reading the 5 papers', seen + 4)
  130 |     const papers = await admin.from('papers').select('id, child_id, status, total, name_read').eq('test_id', testId)
  131 |     expect(papers.data).toHaveLength(5)
  132 |     expect(papers.data!.every((p) => p.status === 'marked' || p.status === 'needs_you')).toBe(true)
  133 |     const gaps = await admin.from('gaps').select('child_id').eq('stage', 'new').in('child_id', papers.data!.map((p) => p.child_id).filter((c): c is string => !!c))
  134 |     expect(gaps.data!.length).toBeGreaterThan(0)
  135 |     const reteach = await admin.from('reteach_plans').select('topic_name').eq('test_id', testId)
  136 |     expect(reteach.data!.length).toBeGreaterThan(0)
```