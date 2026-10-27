# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p22.spec.ts >> parent start, add child, consent, waiting >> nothing about the child is visible before the teacher approves
- Location: e2e/p22.spec.ts:143:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/p\/add\/pending/
Received string:  "http://localhost:3222/p/add/consent?code=Y8UFDK&child=Amina"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × locator resolved to <html lang="en" class="outfit_1c44b68d-module__Sjvs0W__variable kalam_49d7b1e0-module__2yNoqq__variable">…</html>
       - unexpected value "http://localhost:3222/p/add/consent?code=Y8UFDK&child=Amina"

```

```yaml
- banner:
  - link "Back":
    - /url: /p/add?code=Y8UFDK&child=Amina
  - text: Amina · 6B Mathematics Before you link
- main:
  - heading "Jemma keeps Amina's schoolwork so it can teach her. Is that okay with you?" [level=1]
  - region "What Jemma keeps":
    - heading "What Jemma keeps" [level=2]
    - list:
      - listitem: Photos of her tests and homework
      - listitem: Her marks, gaps and lessons
      - listitem: Ms Banda's notes and the class register
    - paragraph: Only you, Ms Banda and Amina see it.
  - group "Your OK":
    - text: Your OK
    - checkbox "I'm Amina's parent or legal guardian Needed" [checked]
    - text: I'm Amina's parent or legal guardian Needed
    - checkbox "Jemma can use Amina's schoolwork to teach her Needed" [checked]
    - text: Jemma can use Amina's schoolwork to teach her Needed
    - checkbox "Use her work, name removed, to make Jemma better Optional"
    - text: Use her work, name removed, to make Jemma better Optional
  - paragraph: South Africa's POPIA law treats under-18s as children, so we need your OK. Change this any time in Amina's settings.
  - link "Privacy in plain words":
    - /url: /privacy
  - button "Agree and ask Ms Banda"
- alert
```

# Test source

```ts
  48  |       await expect(page.getByText(line)).toBeVisible()
  49  |     }
  50  |     await shot(page, info, 'parent-start')
  51  | 
  52  |     // The class code goes on to the add-child screen.
  53  |     await page.getByLabel('Class code').fill(sb.joinCode.toLowerCase())
  54  |     await page.getByRole('button', { name: 'Find the class' }).click()
  55  |     await expect(page).toHaveURL(new RegExp(`/p/add\\?code=${sb.joinCode}`))
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
> 148 |     await expect(page).toHaveURL(/\/p\/add\/pending/)
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  149 | 
  150 |     // The child's space is closed: profile, report and paper routes all answer not found.
  151 |     for (const path of ['', '/report', '/tests']) {
  152 |       const res = await page.goto(`/p/${sb.childId}${path}`)
  153 |       expect(res?.status(), path).toBe(404)
  154 |     }
  155 |     // The home sends a waiting parent back to the waiting page, which shows no marks or test names.
  156 |     await page.goto('/p')
  157 |     await expect(page).toHaveURL(/\/p\/add\/pending/)
  158 |     const body = await page.locator('body').innerText()
  159 |     for (const leak of ['Class Test 1', 'Needs you tonight', 'Doing well', '7/10']) expect(body).not.toContain(leak)
  160 |     // And through the database with the parent's own session, the child row is hidden.
  161 |     const res = await page.request.get(`${process.env.SUPABASE_URL}/rest/v1/children?id=eq.${sb.childId}`, {
  162 |       headers: { apikey: process.env.SUPABASE_ANON_KEY! },
  163 |     })
  164 |     expect(await res.json()).toEqual([])
  165 | 
  166 |     // After the teacher says yes, the home opens Amina's profile.
  167 |     const { error } = await admin().from('parent_links').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('child_id', sb.childId)
  168 |     expect(error).toBeNull()
  169 |     await page.goto('/p')
  170 |     await expect(page).toHaveURL(new RegExp(`/p/${sb.childId}$`))
  171 |   })
  172 | 
  173 |   test('with one child the home opens that child; the list shows with ?all=1', async ({ page }, info) => {
  174 |     sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  175 |     await page.goto('/p')
  176 |     await expect(page).toHaveURL(new RegExp(`/p/${sb.childId}$`))
  177 | 
  178 |     await page.goto('/p?all=1')
  179 |     await expect(page.getByText(/^Good (morning|afternoon|evening), Thandi$/)).toBeVisible()
  180 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('Amina is doing well. One thing needs you tonight.')
  181 |     await expect(page.getByRole('heading', { name: 'Your children' })).toBeVisible()
  182 |     const card = page.getByRole('link', { name: /Amina/ }).filter({ hasText: 'Grade 6 · Hillview Primary' })
  183 |     await expect(card).toBeVisible()
  184 |     await expect(card).toContainText('Needs you')
  185 |     await expect(card).toContainText(/Doing well\. Tonight: 12 minutes on adding fractions/)
  186 |     await expect(card).toHaveAttribute('href', `/p/${sb.childId}`)
  187 |     const add = page.getByRole('link', { name: /Add a child/ })
  188 |     await expect(add).toContainText('Got a class code from a teacher? Use it here.')
  189 |     await expect(add).toHaveAttribute('href', '/p/add')
  190 |     await expect(page.getByRole('link', { name: /Notifications/ })).toBeVisible()
  191 |     await expect(page.getByRole('link', { name: 'Your account' })).toContainText('TM')
  192 |     await shot(page, info, 'parent-children')
  193 | 
  194 |     await add.click()
  195 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText("Link your child with the teacher's class code")
  196 |   })
  197 | 
  198 |   test('a page does not scroll sideways', async ({ page }) => {
  199 |     sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
  200 |     await unlink(sb)
  201 |     for (const path of ['/p', `/p/add?code=${sb.joinCode}&child=Amina`, `/p/add/consent?code=${sb.joinCode}&child=Amina`]) {
  202 |       await page.goto(path)
  203 |       const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  204 |       expect(wide, path).toBe(false)
  205 |     }
  206 |   })
  207 | })
  208 | 
```