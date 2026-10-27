# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: demo-path.spec.ts >> the whole demo path
- Location: e2e/demo-path.spec.ts:77:1

# Error details

```
Error: expect(received).toBeNull()

Received: {"code": "PGRST116", "details": "The result contains 3 rows", "hint": null, "message": "Cannot coerce the result to a single JSON object"}
```

# Page snapshot

```yaml
- generic [active] [ref=f9e1]:
  - generic [ref=f9e3]:
    - banner [ref=f9e4]:
      - link "Switch. Now showing Amina" [ref=f9e5] [cursor=pointer]:
        - /url: /p
        - generic [aria-hidden] [ref=f9e6]: A
        - generic [ref=f9e7]:
          - generic [ref=f9e8]: Amina
          - generic [ref=f9e9]: Grade 6 · Hillview Primary
      - generic [ref=f9e12]:
        - 'link "Demo: switch who you are" [ref=f9e13] [cursor=pointer]':
          - /url: /demo
          - generic [ref=f9e14]: Demo
        - link "Notifications" [ref=f9e17] [cursor=pointer]:
          - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/notifications
        - link "Settings" [ref=f9e21] [cursor=pointer]:
          - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/settings
    - main [ref=f9e25]:
      - generic [ref=f9e26]:
        - generic [ref=f9e27]:
          - 'heading "Amina is doing well. Focus this week: adding fractions with different denominators." [level=1] [ref=f9e31]'
          - paragraph [ref=f9e32]: Updated today at 19:18, after Class Test 1
          - link "See Amina's report" [ref=f9e33] [cursor=pointer]:
            - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/report
        - region [ref=f9e37]:
          - generic [ref=f9e38]:
            - heading "Marks by topic" [level=2] [ref=f9e39]
            - generic [ref=f9e40]: Maths · change since Term 3
          - link "Mixed numbers 0% new" [ref=f9e41] [cursor=pointer]:
            - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/topics/bef5ac65-80b4-4cd1-a5c4-4d1519936c42
            - generic [ref=f9e43]:
              - generic [ref=f9e44]: Mixed numbers
              - generic [ref=f9e45]:
                - generic [ref=f9e46]: 0%
                - generic [ref=f9e47]: new
          - link "Adding decimals 0% down 50" [ref=f9e52] [cursor=pointer]:
            - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/topics/58ac0b67-93a3-4123-b05b-53527675bfa8
            - generic [ref=f9e54]:
              - generic [ref=f9e55]: Adding decimals
              - generic [ref=f9e56]:
                - generic [ref=f9e57]: 0%
                - generic [ref=f9e58]:
                  - img "down" [ref=f9e59]
                  - text: "50"
          - link "Adding and subtracting fractions with different denominators 33% new" [ref=f9e65] [cursor=pointer]:
            - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/topics/cfe07b6b-5ae1-4896-bce5-30602d7c1865
            - generic [ref=f9e67]:
              - generic [ref=f9e68]: Adding and subtracting fractions with different denominators
              - generic [ref=f9e69]:
                - generic [ref=f9e70]: 33%
                - generic [ref=f9e71]: new
          - link "Fraction of a quantity 100% same" [ref=f9e77] [cursor=pointer]:
            - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/topics/00022175-4d14-47a2-bdbe-3f6d2ae3ccf8
            - generic [ref=f9e79]:
              - generic [ref=f9e80]: Fraction of a quantity
              - generic [ref=f9e81]:
                - generic [ref=f9e82]: 100%
                - generic [ref=f9e83]: same
          - link "Comparing fractions 100% up 40" [ref=f9e89] [cursor=pointer]:
            - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/topics/51bc5675-f54a-4cd1-b19b-ddda1f03e189
            - generic [ref=f9e91]:
              - generic [ref=f9e92]: Comparing fractions
              - generic [ref=f9e93]:
                - generic [ref=f9e94]: 100%
                - generic [ref=f9e95]:
                  - img "up" [ref=f9e96]
                  - text: "40"
          - link "See all tests and topics" [ref=f9e103] [cursor=pointer]:
            - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/tests
        - region [ref=f9e104]:
          - heading "What Jemma has noticed" [level=2] [ref=f9e105]
          - list [ref=f9e106]:
            - listitem [ref=f9e107]:
              - generic [ref=f9e108]: Learners add or subtract the denominators, or forget to make the denominators the same first. when the denominators are different, like 1/2 + 1/4 = = 2/6.
              - generic [ref=f9e109]:
                - link "Class Test 1 · Q1, Q2" [ref=f9e110] [cursor=pointer]:
                  - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/papers/36dd92d2-baeb-4fdb-8ba2-b8025ff3bc2f
                - link "How to help" [ref=f9e114] [cursor=pointer]:
                  - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/topics/cfe07b6b-5ae1-4896-bce5-30602d7c1865
            - listitem [ref=f9e118]:
              - generic [ref=f9e119]: Learners add the whole number and fraction as if they were separate whole numbers, or write the fraction part bigger than one whole., like 1 1/2 + 2 1/4 = = 3 2/6.
              - link "Class Test 1 · Q4" [ref=f9e121] [cursor=pointer]:
                - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/papers/36dd92d2-baeb-4fdb-8ba2-b8025ff3bc2f
            - listitem [ref=f9e125]:
              - generic [ref=f9e126]: Learners line up the right side instead of the comma, or forget to carry when adding. when adding decimals, like 0,5 + 0,25 = = 0,30.
              - link "Class Test 1 · Q8" [ref=f9e128] [cursor=pointer]:
                - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/papers/36dd92d2-baeb-4fdb-8ba2-b8025ff3bc2f
            - listitem [ref=f9e132]:
              - generic [ref=f9e133]: Compares fractions well now. Right every time since Term 3.
              - link "Class Test 1 · Q6" [ref=f9e135] [cursor=pointer]:
                - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/papers/36dd92d2-baeb-4fdb-8ba2-b8025ff3bc2f
        - region [ref=f9e139]:
          - heading "What to focus on next, and why" [level=2] [ref=f9e143]
          - list [ref=f9e144]:
            - listitem [ref=f9e145]:
              - generic [ref=f9e146]: "1"
              - generic [ref=f9e147]:
                - generic [ref=f9e148]: Adding fractions with different denominators
                - generic [ref=f9e149]: Make the bottom numbers the same before adding or subtracting, instead of adding the bottom numbers.
                - link "Marked answers on adding and subtracting fractions" [ref=f9e151] [cursor=pointer]:
                  - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/papers/36dd92d2-baeb-4fdb-8ba2-b8025ff3bc2f
            - listitem [ref=f9e155]:
              - generic [ref=f9e156]: "2"
              - generic [ref=f9e157]:
                - generic [ref=f9e158]: Adding decimals
                - generic [ref=f9e159]: Line up the commas and carry when a column adds to more than nine.
                - link "Marked answers on adding decimals" [ref=f9e161] [cursor=pointer]:
                  - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/papers/36dd92d2-baeb-4fdb-8ba2-b8025ff3bc2f
            - listitem [ref=f9e165]:
              - generic [ref=f9e166]: "3"
              - generic [ref=f9e167]:
                - generic [ref=f9e168]: Mixed numbers
                - generic [ref=f9e169]: Keep the whole number and fraction part in their proper places, and do not write a fraction part larger than one whole.
                - link "Marked answers on mixed numbers" [ref=f9e171] [cursor=pointer]:
                  - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/papers/36dd92d2-baeb-4fdb-8ba2-b8025ff3bc2f
          - paragraph [ref=f9e175]: "Looking ahead: She explains her thinking clearly in group work. Next, she can say each step out loud while adding fractions and decimals together."
        - link "Beyond the tests Note from Ms Banda, Thu 22 Oct 9 of 10 days at school this term Netball and school choir" [ref=f9e176] [cursor=pointer]:
          - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/beyond
          - generic [ref=f9e177]:
            - generic [ref=f9e178]: Beyond the tests
            - generic [ref=f9e179]:
              - generic [ref=f9e186]:
                - text: Note from
                - strong [ref=f9e187]: Ms Banda
                - text: ", Thu 22 Oct"
              - generic [ref=f9e193]:
                - strong [ref=f9e194]: 9 of 10 days
                - text: at school this term
              - generic [ref=f9e195]: Netball and school choir
        - region [ref=f9e204]:
          - generic [ref=f9e205]:
            - heading "What Jemma did" [level=2] [ref=f9e206]
            - link "See all" [ref=f9e207] [cursor=pointer]:
              - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/notifications
          - list [ref=f9e208]:
            - listitem [ref=f9e209]:
              - generic [ref=f9e210]: 19:16
              - generic [ref=f9e211]: Looked at Amina's wrong answers and found 3 gaps
            - listitem [ref=f9e212]:
              - generic [ref=f9e213]: 19:05
              - generic [ref=f9e214]: Used your note on Amina in her guidance card
            - listitem [ref=f9e215]:
              - generic [ref=f9e216]: 19:04
              - generic [ref=f9e217]: Built tonight's 12-minute lesson on adding and subtracting fractions with different denominators, as a spoken lesson
            - listitem [ref=f9e218]:
              - generic [ref=f9e219]: 19:04
              - generic [ref=f9e220]: Built tonight's 12-minute lesson on adding and subtracting fractions with different denominators, as a spoken lesson
    - navigation "Amina" [ref=f9e221]:
      - link [ref=f9e222] [cursor=pointer]:
        - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812
      - link [ref=f9e227] [cursor=pointer]:
        - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/learn
      - link [ref=f9e232] [cursor=pointer]:
        - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/snap
      - link [ref=f9e237] [cursor=pointer]:
        - /url: /p/0ff934e7-0a25-4446-ace8-1d259e992812/tests
  - button "Open Next.js Dev Tools" [ref=f9e248] [cursor=pointer]
  - alert [ref=f9e252]
```

# Test source

```ts
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
> 176 |     expect(session.error).toBeNull()
      |                           ^ Error: expect(received).toBeNull()
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
  187 |     for (let guard = 0; guard < 80 && !(await page.getByRole('heading', { name: /^You finished/ }).isVisible()); guard++) {
  188 |       const prompt = await page.locator('h1[data-prompt]').first().getAttribute('data-prompt', { timeout: 500 }).catch(() => null)
  189 |       if (prompt) {
  190 |         const isTry = await page.getByText(/^Question \d+ of \d+$/).isVisible()
  191 |         if (isTry) tries++
  192 |         await answerQuestion(page, byPrompt.get(prompt)!, !(isTry && (tries === 2 || tries === 5)))
  193 |         const body = (await page.locator('body').innerText()).toLowerCase()
  194 |         if (isTry && tries < 5) for (const word of ['wrong', 'correct', 'score', 'well done']) expect(body).not.toContain(word)
  195 |       } else if (await page.getByRole('button', { name: "I'm ready" }).isVisible()) {
  196 |         await page.getByRole('button', { name: "I'm ready" }).click()
  197 |       } else if (await page.getByRole('button', { name: 'Next card' }).isVisible()) {
  198 |         await page.getByRole('button', { name: 'Next card' }).click()
  199 |       } else {
  200 |         await page.waitForTimeout(400)
  201 |       }
  202 |     }
  203 |     await expect(page.getByRole('heading', { name: /^You finished/ })).toBeVisible({ timeout: 30_000 })
  204 |     await page.getByRole('button', { name: 'Got it' }).click()
  205 |     await page.getByRole('button', { name: 'Done' }).click()
  206 |     await expect(page).toHaveURL(/\/k\/done$/)
  207 |     await expect(page.getByText(/Now pass the phone back to /)).toBeVisible()
  208 |     const done = await admin.from('sessions').select('status, right').eq('id', session.data!.id).single()
  209 |     expect(done.data?.status).toBe('done')
  210 |     expect(done.data?.right).toBe(tries - 2)
  211 |     await agentIdle(schoolId, 'moving the gap and planning the next lesson', seen)
  212 | 
  213 |     // 7. Ms Banda's class home and Thandi's session page show the result.
  214 |     await signInAs(page, logins, 'teacher')
  215 |     await page.goto(base)
  216 |     await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  217 |     await expect(page.getByText(/Amina/).first()).toBeVisible()
  218 |     await signInAs(page, logins, 'parent')
  219 |     await page.goto(`/p/${sb.childId}/sessions/${session.data!.id}`)
  220 |     await expect(page.getByRole('heading', { level: 1 })).toContainText('Amina')
  221 |     await expect(page.getByText(`${tries - 2} of ${tries}`)).toBeVisible()
  222 | 
  223 |     // 8. Teacher adds a note and marks the register; Thandi adds an activity; the guidance card updates.
  224 |     const card = async () => (await admin.from('guidance_cards').select('updated_at').eq('child_id', sb.childId).maybeSingle()).data?.updated_at ?? ''
  225 |     const before = await card()
  226 |     seen = await eventCount(schoolId)
  227 |     await signInAs(page, logins, 'teacher')
  228 |     await page.goto(`${base}/learners/${sb.childId}`)
  229 |     await page.getByRole('button', { name: 'Confidence' }).click()
  230 |     const note = 'Asked why we cannot just add the bottoms. Keen to try fraction strips.'
  231 |     await page.getByRole('textbox', { name: 'Note' }).fill(note)
  232 |     await page.getByRole('button', { name: 'Save note' }).click()
  233 |     await expect(page.getByRole('region', { name: 'Earlier notes' }).getByText(note)).toBeVisible()
  234 |     await page.goto(`${base}/register`)
  235 |     await page.getByRole('button', { name: 'Mark everyone here' }).click()
  236 |     await page.getByRole('group', { name: 'Thabo' }).getByRole('button', { name: 'Away' }).click()
  237 |     await page.getByRole('button', { name: 'Save register' }).click()
  238 |     await page.waitForURL(new RegExp(`${base}/learners$`))
  239 |     const today = new Date().toISOString().slice(0, 10)
  240 |     const att = await admin.from('attendance').select('status').eq('day', today).in('child_id', papers.data!.map((p) => p.child_id!))
  241 |     expect(att.data).toHaveLength(5)
  242 | 
  243 |     await signInAs(page, logins, 'parent')
  244 |     await page.goto(`/p/${sb.childId}/activities/new`)
  245 |     await page.getByRole('button', { name: 'Club' }).click()
  246 |     await page.getByLabel('What is it called?').fill('Chess club')
  247 |     await page.getByLabel(/^Where/).fill('Hillview Primary, after school')
  248 |     await page.getByRole('button', { name: 'Wed' }).click()
  249 |     await page.getByRole('button', { name: 'Save activity' }).click()
  250 |     await expect(page).toHaveURL(`/p/${sb.childId}`)
  251 |     await agentIdle(schoolId, 'updating the guidance card', seen + 1)
  252 |     expect(await card()).not.toBe(before)
  253 |     const logged = await admin.from('activity_log').select('text').eq('school_id', schoolId).eq('tool', 'subject_guidance')
  254 |     expect(logged.data!.length).toBeGreaterThan(0)
  255 |     await page.goto(`/p/${sb.childId}`)
  256 |     await expect(page.getByRole('heading', { level: 1 })).toContainText('Amina')
  257 |   } finally {
  258 |     await sb.cleanup().catch(() => undefined)
  259 |   }
  260 | })
  261 | 
```