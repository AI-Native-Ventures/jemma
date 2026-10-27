# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: demo-path.spec.ts >> the whole demo path
- Location: e2e/demo-path.spec.ts:77:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=f3e1]:
  - main [ref=f3e4]:
    - generic [ref=f3e5]:
      - generic [ref=f3e6]:
        - link "Close" [ref=f3e7] [cursor=pointer]:
          - /url: /t/b4f18162-5088-419f-9a29-9b27c55488a0
        - generic [ref=f3e10]:
          - generic [ref=f3e11]: Class Test 1
          - generic [ref=f3e12]: 5 papers snapped at 21:13
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
              - generic [ref=f3e46]: Needs you
            - listitem [ref=f3e47]:
              - generic [aria-hidden] [ref=f3e48]: "N"
              - generic [ref=f3e49]: Naledi
              - generic [ref=f3e50]: 7/10
              - img "Marked" [ref=f3e51]
        - region [ref=f3e53]:
          - heading "What Jemma did" [level=2] [ref=f3e55]
          - list [ref=f3e56]:
            - listitem [ref=f3e57]:
              - generic [ref=f3e58]: 21:14
              - generic [ref=f3e59]: Read 1 paper.
            - listitem [ref=f3e60]:
              - generic [ref=f3e61]: 21:14
              - generic [ref=f3e62]: Read 1 paper. 1 unsure, sent to you.
            - listitem [ref=f3e63]:
              - generic [ref=f3e64]: 21:14
              - generic [ref=f3e65]: Read 1 paper.
        - link "Back to class" [ref=f3e66] [cursor=pointer]:
          - /url: /t/b4f18162-5088-419f-9a29-9b27c55488a0
  - alert [ref=f3e67]: Jemma
```

# Test source

```ts
  34  |     const rows = data ?? []
  35  |     const failed = rows.find((e) => e.status === 'failed')
  36  |     if (failed) throw new Error(`agent event ${failed.type} failed while ${what}: ${failed.error}`)
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
  78  |   test.setTimeout(LIVE ? 60 * 60_000 : 20 * 60_000)
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
> 134 |     expect(gaps.data!.length).toBeGreaterThan(0)
      |                               ^ Error: expect(received).toBeGreaterThan(expected)
  135 |     const reteach = await admin.from('reteach_plans').select('topic_name').eq('test_id', testId)
  136 |     expect(reteach.data!.length).toBeGreaterThan(0)
  137 |     await page.goto(base)
  138 |     await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  139 | 
  140 |     // 4. Teacher fixes Sipho Q7: through Needs you when Jemma was unsure, else on the marked paper.
  141 |     const sipho = papers.data!.find((p) => p.name_read === 'Sipho')!
  142 |     const check = await admin.from('needs_you_items').select('id').eq('school_id', schoolId).eq('kind', 'check_answer').eq('status', 'open').eq('ref_id', sipho.id)
  143 |     seen = await eventCount(schoolId)
  144 |     if (check.data?.length) {
  145 |       await page.goto(`${base}/needs-you/${check.data[0]!.id}`)
  146 |       await page.getByRole('button', { name: '0,6', exact: true }).click()
  147 |       await expect(page.getByText('0,6 matches the key. Question 7 gets 1 mark.')).toBeVisible()
  148 |       await page.getByRole('button', { name: "Confirm Sipho's paper" }).click()
  149 |     } else {
  150 |       await page.goto(`${base}/papers/${sipho.id}/fix?q=7`)
  151 |       await page.getByRole('button', { name: 'Right', exact: true }).click()
  152 |       await page.getByRole('button', { name: 'Save' }).click()
  153 |     }
  154 |     await expect.poll(async () => (await admin.from('question_results').select('mark').eq('paper_id', sipho.id).eq('n', 7).single()).data?.mark, { timeout: 30_000 }).toBe(1)
  155 |     await agentIdle(schoolId, 'redoing the class report after the fix', seen)
  156 | 
  157 |     // 5. Switch to Thandi, link Amina, switch back to approve, open Amina's profile.
  158 |     await signInAs(page, logins, 'parent')
  159 |     await page.goto(`/p/add?code=${sb.joinCode}&child=Amina`)
  160 |     await page.getByRole('button', { name: 'Link Amina' }).click()
  161 |     await page.getByRole('button', { name: 'Agree and ask Ms Banda' }).click()
  162 |     await expect(page).toHaveURL(/\/p\/add\/pending/, { timeout: 30_000 })
  163 |     const link = await admin.from('parent_links').select('id, status').eq('child_id', sb.childId).single()
  164 |     expect(link.data?.status).toBe('pending')
  165 |     await signInAs(page, logins, 'teacher')
  166 |     await page.goto(`${base}/link-requests/${link.data!.id}`)
  167 |     await page.getByRole('button', { name: 'Yes, approve' }).click()
  168 |     await expect(page).toHaveURL(new RegExp(`${base}$`), { timeout: 60_000 })
  169 |     await signInAs(page, logins, 'parent')
  170 |     await page.goto(`/p/${sb.childId}`)
  171 |     await expect(page.getByRole('heading', { level: 1 })).toContainText('Amina')
  172 |     await expect(page.getByRole('region', { name: 'Marks by topic' })).toBeVisible()
  173 | 
  174 |     // 6. Parent hands over, Amina does the session. No right or wrong on screen; she misses two tries.
  175 |     const session = await admin.from('sessions').select('id, lesson_id, status').eq('child_id', sb.childId).eq('status', 'planned').not('lesson_id', 'is', null).single()
  176 |     expect(session.error).toBeNull()
  177 |     const lesson = await admin.from('lessons').select('format, content, audio_path').eq('id', session.data!.lesson_id!).single()
  178 |     const content = lesson.data!.content as { warmup: LessonQuestion[]; questions: LessonQuestion[] }
  179 |     const byPrompt = new Map([...content.warmup, ...content.questions].map((q) => [q.prompt, q]))
  180 |     await page.goto(`/p/${sb.childId}/learn`)
  181 |     await page.getByRole('link', { name: /^Start, then hand Amina the phone/ }).click()
  182 |     await page.waitForURL(`**/p/${sb.childId}/learn/handover`)
  183 |     await page.getByRole('button', { name: 'Amina has the phone' }).click()
  184 |     seen = await eventCount(schoolId)
  185 |     await page.waitForURL(`**/k/session/${session.data!.id}`)
  186 |     let tries = 0
  187 |     let answered: string | null = null
  188 |     for (let guard = 0; guard < 400 && !(await page.getByRole('heading', { name: /^You finished/ }).isVisible()); guard++) {
  189 |       const prompt = await page.locator('h1[data-prompt]').first().getAttribute('data-prompt', { timeout: 500 }).catch(() => null)
  190 |       if (prompt && prompt === answered) {
  191 |         await page.waitForTimeout(300) // the next question is still loading
  192 |       } else if (prompt) {
  193 |         const isTry = await page.getByText(/^Question \d+ of \d+$/).isVisible()
  194 |         if (isTry) tries++
  195 |         await answerQuestion(page, byPrompt.get(prompt)!, !(isTry && (tries === 2 || tries === 5)))
  196 |         answered = prompt
  197 |         // The child never sees right or wrong, a running score or a total during a quiz.
  198 |         if (isTry && tries < 5) await expect(page.getByText(/^(Right|Wrong|Correct|Well done|Score)\b/i)).toHaveCount(0)
  199 |       } else if (await page.getByRole('button', { name: "I'm ready" }).isVisible()) {
  200 |         answered = null
  201 |         await page.getByRole('button', { name: "I'm ready" }).click()
  202 |       } else if (await page.getByRole('button', { name: 'Next card' }).isVisible()) {
  203 |         await page.getByRole('button', { name: 'Next card' }).click()
  204 |       } else {
  205 |         await page.waitForTimeout(400)
  206 |       }
  207 |     }
  208 |     await expect(page.getByRole('heading', { name: /^You finished/ })).toBeVisible({ timeout: 30_000 })
  209 |     await page.getByRole('button', { name: 'Got it' }).click()
  210 |     await page.getByRole('button', { name: 'Done' }).click()
  211 |     await expect(page).toHaveURL(/\/k\/done$/)
  212 |     await expect(page.getByText(/Now pass the phone back to /)).toBeVisible()
  213 |     const done = await admin.from('sessions').select('status, right').eq('id', session.data!.id).single()
  214 |     expect(done.data?.status).toBe('done')
  215 |     expect(done.data?.right).toBe(tries - 2)
  216 |     await agentIdle(schoolId, 'moving the gap and planning the next lesson', seen)
  217 | 
  218 |     // 7. Ms Banda's class home and Thandi's session page show the result.
  219 |     await signInAs(page, logins, 'teacher')
  220 |     await page.goto(base)
  221 |     await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  222 |     await expect(page.getByText(/Amina/).first()).toBeVisible()
  223 |     await signInAs(page, logins, 'parent')
  224 |     await page.goto(`/p/${sb.childId}/sessions/${session.data!.id}`)
  225 |     await expect(page.getByRole('heading', { level: 1 })).toContainText('Amina')
  226 |     await expect(page.getByText(`${tries - 2} of ${tries}`)).toBeVisible()
  227 | 
  228 |     // 8. Teacher adds a note and marks the register; Thandi adds an activity; the guidance card updates.
  229 |     const card = async () => (await admin.from('guidance_cards').select('updated_at').eq('child_id', sb.childId).maybeSingle()).data?.updated_at ?? ''
  230 |     const before = await card()
  231 |     seen = await eventCount(schoolId)
  232 |     await signInAs(page, logins, 'teacher')
  233 |     await page.goto(`${base}/learners/${sb.childId}`)
  234 |     await page.getByRole('button', { name: 'Confidence' }).click()
```