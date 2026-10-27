# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: demo-path.spec.ts >> the whole demo path
- Location: e2e/demo-path.spec.ts:77:1

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '0,6', exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=f5e1]:
  - main [ref=f5e4]:
    - generic [ref=f5e7]:
      - heading "All checked. Confirm Sipho's paper." [level=1] [ref=f5e12]
      - generic [ref=f5e13]:
        - figure "Photo snapped 21:48, page 1 of 1 See whole paper" [ref=f5e14]:
          - generic [ref=f5e15]:
            - generic [ref=f5e17]:
              - img "Paper 4, page 1" [ref=f5e18]
              - generic [ref=f5e20]: Q1
            - link "Zoom" [ref=f5e22] [cursor=pointer]:
              - /url: /t/159fef03-7475-429e-878c-4588ebbef2b3/papers/94aa4317-93e1-4e33-8584-15113827f252?q=1
          - generic [ref=f5e26]:
            - generic [ref=f5e27]: Photo snapped 21:48, page 1 of 1
            - link "See whole paper" [ref=f5e28] [cursor=pointer]:
              - /url: /t/159fef03-7475-429e-878c-4588ebbef2b3/papers/94aa4317-93e1-4e33-8584-15113827f252
        - generic [ref=f5e29]:
          - region [ref=f5e30]:
            - heading "Question 1 says" [level=2] [ref=f5e31]
            - generic [ref=f5e32]:
              - button "2/6" [ref=f5e33] [cursor=pointer]
              - button "3/4" [ref=f5e34] [cursor=pointer]
              - button "Type it" [ref=f5e35] [cursor=pointer]
          - region [ref=f5e36]:
            - generic [ref=f5e37]:
              - heading "What Jemma read" [level=2] [ref=f5e38]
              - generic [ref=f5e39]: "Name matched: Sipho"
            - paragraph [ref=f5e40]: Tap any answer to fix it.
            - list [ref=f5e41]:
              - listitem [ref=f5e42]:
                - link "Q1 1/2 + 1/4 = 2/6 Wrong, 0 marks" [ref=f5e43] [cursor=pointer]:
                  - /url: "?q=1"
                  - generic [ref=f5e44]: Q1
                  - generic [ref=f5e45]: 1/2 + 1/4 =
                  - generic [ref=f5e46]: 2/6
                  - img "Wrong, 0 marks" [ref=f5e48]
              - listitem [ref=f5e50]:
                - link "Q2 2/3 + 1/6 = 3/9 Wrong, 0 marks" [ref=f5e51] [cursor=pointer]:
                  - /url: "?q=2"
                  - generic [ref=f5e52]: Q2
                  - generic [ref=f5e53]: 2/3 + 1/6 =
                  - generic [ref=f5e54]: 3/9
                  - img "Wrong, 0 marks" [ref=f5e56]
              - listitem [ref=f5e58]:
                - link "Q3 3/4 – 1/2 = 1/4 Right, 1 mark" [ref=f5e59] [cursor=pointer]:
                  - /url: "?q=3"
                  - generic [ref=f5e60]: Q3
                  - generic [ref=f5e61]: 3/4 – 1/2 =
                  - generic [ref=f5e62]: 1/4
                  - img "Right, 1 mark" [ref=f5e64]
              - listitem [ref=f5e66]:
                - link "Q4 1 1/2 + 2 1/4 = 3 2/4 Wrong, 0 marks" [ref=f5e67] [cursor=pointer]:
                  - /url: "?q=4"
                  - generic [ref=f5e68]: Q4
                  - generic [ref=f5e69]: 1 1/2 + 2 1/4 =
                  - generic [ref=f5e70]: 3 2/4
                  - img "Wrong, 0 marks" [ref=f5e72]
              - listitem [ref=f5e74]:
                - link "Q5 Work out 2/5 of 20. 8 Right, 1 mark" [ref=f5e75] [cursor=pointer]:
                  - /url: "?q=5"
                  - generic [ref=f5e76]: Q5
                  - generic [ref=f5e77]: Work out 2/5 of 20.
                  - generic [ref=f5e78]: "8"
                  - img "Right, 1 mark" [ref=f5e80]
              - listitem [ref=f5e82]:
                - link "Q6 Which fraction is bigger? Circle it. 2/3 3/5 2/3 Right, 1 mark" [ref=f5e83] [cursor=pointer]:
                  - /url: "?q=6"
                  - generic [ref=f5e84]: Q6
                  - generic [ref=f5e85]: Which fraction is bigger? Circle it. 2/3 3/5
                  - generic [ref=f5e86]: 2/3
                  - img "Right, 1 mark" [ref=f5e88]
              - listitem [ref=f5e90]:
                - link "Q7 Write 3/5 as a decimal. 0,8 Wrong, 0 marks" [ref=f5e91] [cursor=pointer]:
                  - /url: "?q=7"
                  - generic [ref=f5e92]: Q7
                  - generic [ref=f5e93]: Write 3/5 as a decimal.
                  - generic [ref=f5e94]: 0,8
                  - img "Wrong, 0 marks" [ref=f5e96]
              - listitem [ref=f5e98]:
                - link "Q8 0,5 + 0,25 = 0,75 Right, 1 mark" [ref=f5e99] [cursor=pointer]:
                  - /url: "?q=8"
                  - generic [ref=f5e100]: Q8
                  - generic [ref=f5e101]: 0,5 + 0,25 =
                  - generic [ref=f5e102]: 0,75
                  - img "Right, 1 mark" [ref=f5e104]
              - listitem [ref=f5e106]:
                - link "Q9 Which fraction is equal to 0,25? Circle the letter. A. 2/5 B. 1/4 C. 25/10 D. 1/25 B Right, 1 mark" [ref=f5e107] [cursor=pointer]:
                  - /url: "?q=9"
                  - generic [ref=f5e108]: Q9
                  - generic [ref=f5e109]: Which fraction is equal to 0,25? Circle the letter. A. 2/5 B. 1/4 C. 25/10 D. 1/25
                  - generic [ref=f5e110]: B
                  - img "Right, 1 mark" [ref=f5e112]
              - listitem [ref=f5e114]:
                - link "Q10 Thabo has R20. He spends 3/4 of it on lunch. How much money does he have left? Show your working. R5 Right, 1 mark" [ref=f5e115] [cursor=pointer]:
                  - /url: "?q=10"
                  - generic [ref=f5e116]: Q10
                  - generic [ref=f5e117]: Thabo has R20. He spends 3/4 of it on lunch. How much money does he have left? Show your working.
                  - generic [ref=f5e118]: R5
                  - img "Right, 1 mark" [ref=f5e120]
            - generic [ref=f5e122]:
              - generic [ref=f5e123]: Total
              - generic [ref=f5e124]: 6 / 10
          - generic [ref=f5e125]:
            - button "Confirm Sipho's paper" [ref=f5e126] [cursor=pointer]
            - paragraph [ref=f5e129]: Jemma learns from your fix for the next pile.
  - alert [ref=f5e130]
```

# Test source

```ts
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
  134 |     expect(gaps.data!.length).toBeGreaterThan(0)
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
> 146 |       await page.getByRole('button', { name: '0,6', exact: true }).click()
      |                                                                    ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
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
  235 |     const note = 'Asked why we cannot just add the bottoms. Keen to try fraction strips.'
  236 |     await page.getByRole('textbox', { name: 'Note' }).fill(note)
  237 |     await page.getByRole('button', { name: 'Save note' }).click()
  238 |     await expect(page.getByRole('region', { name: 'Earlier notes' }).getByText(note)).toBeVisible()
  239 |     await page.goto(`${base}/register`)
  240 |     await page.getByRole('button', { name: 'Mark everyone here' }).click()
  241 |     await page.getByRole('group', { name: 'Thabo' }).getByRole('button', { name: 'Away' }).click()
  242 |     await page.getByRole('button', { name: 'Save register' }).click()
  243 |     await page.waitForURL(new RegExp(`${base}/learners$`))
  244 |     const today = new Date().toISOString().slice(0, 10)
  245 |     const att = await admin.from('attendance').select('status').eq('day', today).in('child_id', papers.data!.map((p) => p.child_id!))
  246 |     expect(att.data).toHaveLength(5)
```