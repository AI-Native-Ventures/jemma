# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p23.spec.ts >> parent-activity >> saving an activity stores it and queues activity.added
- Location: e2e/p23.spec.ts:149:3

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected: "http://localhost:3241/p/3491e516-d059-45ea-afee-b905323b1e0f"
Received: "http://localhost:3241/p/3491e516-d059-45ea-afee-b905323b1e0f/activities/new"
Timeout:  5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × locator resolved to <html lang="en" class="outfit_1c44b68d-module__Sjvs0W__variable kalam_49d7b1e0-module__2yNoqq__variable">…</html>
       - unexpected value "http://localhost:3241/p/3491e516-d059-45ea-afee-b905323b1e0f/activities/new"

```

```yaml
- main:
  - link "Back to profile":
    - /url: /p/3491e516-d059-45ea-afee-b905323b1e0f
  - text: Amina Add an activity
  - heading "What does Amina do outside class?" [level=1]
  - group "Kind":
    - text: Kind
    - button "Sport"
    - button "Club" [pressed]
    - button "Music"
    - button "Art"
    - button "Something else"
  - text: What is it called?
  - textbox "What is it called?": Chess club
  - text: Where (optional)
  - textbox "Where (optional)": Hillview Primary, after school
  - group "Which days?":
    - text: Which days?
    - button "Mon"
    - button "Tue"
    - button "Wed" [pressed]
    - button "Thu"
    - button "Fri"
    - button "Sat"
    - button "Sun"
  - text: Since when?
  - combobox "Since when?":
    - option "This term" [selected]
    - option "Last term"
    - option "This year"
    - option "Longer"
  - paragraph: Ms Banda sees activities on Amina's profile. Jemma uses them in the guidance card, never to mark her.
  - button "Save activity" [disabled]
- alert
```

# Test source

```ts
  65  |     await expect(next.getByText('Then line up the comma in decimals')).toBeVisible()
  66  |     await expect(next.getByText('Looking ahead: Grade 7 builds percentages and ratio on fractions, so this is worth fixing now.')).toBeVisible()
  67  | 
  68  |     const beyond = page.getByRole('link', { name: /Beyond the tests/ })
  69  |     await expect(beyond).toContainText('9 of 10 days')
  70  |     await expect(beyond).toContainText('at school this term')
  71  |     await expect(beyond).toContainText('Netball and school choir')
  72  | 
  73  |     const did = page.getByRole('region', { name: 'What Jemma did' })
  74  |     await expect(did.getByText("Marked Class Test 1 against Ms Banda's memo: 6 out of 10")).toBeVisible()
  75  |     await expect(did.getByText('Read the homework you snapped. 1 answer was too faint to be sure')).toBeVisible()
  76  | 
  77  |     await noHorizontalScroll(page)
  78  |     await shot(page, testInfo, 'parent-profile')
  79  |   })
  80  | 
  81  |   test('tapping evidence reaches the marked paper route and the beyond card opens beyond', async ({ page }) => {
  82  |     const s = await open(page, 'marked')
  83  |     await page.goto(`/p/${s.childId}`)
  84  |     await page.getByRole('link', { name: /Beyond the tests/ }).click()
  85  |     await expect(page).toHaveURL(`/p/${s.childId}/beyond`)
  86  |   })
  87  | })
  88  | 
  89  | test.describe('parent-beyond', () => {
  90  |   test('notes, attendance, activities and the corrected copy', async ({ page }, testInfo) => {
  91  |     const s = await open(page, 'marked')
  92  |     await page.goto(`/p/${s.childId}/beyond`)
  93  |     await expect(page.getByRole('heading', { level: 1 })).toContainText('9 of 10 days')
  94  |     await expect(page.getByRole('heading', { name: 'Notes from Ms Banda' })).toBeVisible()
  95  |     await expect(page.getByText('Works well in a group and explains her thinking clearly.')).toBeVisible()
  96  |     await expect(page.getByText('Finished the decimals extension task without help.')).toBeVisible()
  97  |     await expect(page.getByText(/^Term 4 so far: 9 of 10 days\. Away on /)).toBeVisible()
  98  |     await expect(page.getByText('Netball', { exact: true })).toBeVisible()
  99  |     await expect(page.getByText('Sport · Tuesdays and Thursdays')).toBeVisible()
  100 |     await expect(page.getByText('Music · Fridays')).toBeVisible()
  101 |     await expect(page.getByText('Ms Banda\'s notes go into the guidance on Amina\'s profile.')).toBeVisible()
  102 |     await expect(page.getByText('If Amina misses a day, Jemma checks what the class covered and adds it to her lessons.')).toBeVisible()
  103 |     await expect(page.getByText('Activities help pick lesson times and shape the guidance card. None of this changes her marks.')).toBeVisible()
  104 |     await expect(page.getByText('Activities only help pick lesson times.')).toHaveCount(0)
  105 |     await expect(page.getByRole('link', { name: 'Add an activity' })).toHaveAttribute('href', `/p/${s.childId}/activities/new`)
  106 |     await noHorizontalScroll(page)
  107 |     await shot(page, testInfo, 'parent-beyond')
  108 |   })
  109 | 
  110 |   test('Message Ms Banda stays visible and opens the coming-later sheet', async ({ page }) => {
  111 |     const s = await open(page, 'marked')
  112 |     await page.goto(`/p/${s.childId}/beyond`)
  113 |     await page.getByRole('button', { name: 'Message Ms Banda' }).click()
  114 |     await expect(page.getByRole('dialog', { name: 'Coming after the challenge' })).toBeVisible()
  115 |   })
  116 | })
  117 | 
  118 | test.describe('parent-report', () => {
  119 |   test('headline, glance, week by week, gaps and what is next', async ({ page }, testInfo) => {
  120 |     const s = await open(page, 'session_done')
  121 |     await page.goto(`/p/${s.childId}/report`)
  122 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('Amina is steady at 60% and fixing her gaps one at a time.')
  123 |     await expect(page.getByText(/^Term 4 so far · \d+ to \d+ \w+$/)).toBeVisible()
  124 |     await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible()
  125 |     await expect(page.getByRole('button', { name: 'Share a copy' })).toBeVisible()
  126 |     const glance = page.getByRole('region', { name: 'At a glance' })
  127 |     await expect(glance.getByText('Class Test 1')).toBeVisible()
  128 |     await expect(glance.getByText('gaps fixed this year')).toBeVisible()
  129 |     await expect(glance.getByText('lesson this week')).toBeVisible()
  130 |     const weeks = page.getByRole('region', { name: 'Week by week' })
  131 |     await expect(weeks.getByText('Marks, lessons, notes and attendance together')).toBeVisible()
  132 |     await expect(weeks.getByText('Class Test 1: 6 out of 10')).toBeVisible()
  133 |     await expect(weeks.getByText(/^Lesson on adding fractions.*: 3 of 5/)).toBeVisible()
  134 |     const gaps = page.getByRole('region', { name: 'Gaps' })
  135 |     await expect(gaps.getByText('Working on')).toBeVisible()
  136 |     await expect(gaps.getByText('Fixed this year')).toBeVisible()
  137 |     await expect(gaps.getByText('Equivalent fractions')).toBeVisible()
  138 |     await expect(page.getByRole('region', { name: 'Outside class' }).getByText('Netball')).toBeVisible()
  139 |     const next = page.getByRole('region', { name: "What's next" })
  140 |     await expect(next.getByText('Make the bottoms match, then add.')).toBeVisible()
  141 |     await expect(next.getByText('Looking ahead: Grade 7 builds percentages and ratio on fractions.')).toBeVisible()
  142 |     await expect(page.getByText(/^Made by Jemma on .* from 1 test/)).toBeVisible()
  143 |     await noHorizontalScroll(page)
  144 |     await shot(page, testInfo, 'parent-report')
  145 |   })
  146 | })
  147 | 
  148 | test.describe('parent-activity', () => {
  149 |   test('saving an activity stores it and queues activity.added', async ({ page }, testInfo) => {
  150 |     const s = await open(page, 'marked')
  151 |     await page.goto(`/p/${s.childId}/activities/new`)
  152 |     await expect(page.getByRole('heading', { level: 1 })).toHaveText('What does Amina do outside class?')
  153 |     await expect(page.getByText("Ms Banda sees activities on Amina's profile. Jemma uses them in the guidance card, never to mark her.")).toBeVisible()
  154 | 
  155 |     await page.getByRole('button', { name: 'Club' }).click()
  156 |     await page.getByLabel('What is it called?').fill('Chess club')
  157 |     await page.getByLabel(/^Where/).fill('Hillview Primary, after school')
  158 |     await page.getByRole('button', { name: 'Wed' }).click()
  159 |     await expect(page.getByRole('button', { name: 'Club' })).toHaveAttribute('aria-pressed', 'true')
  160 |     await page.getByLabel('What is it called?').focus()
  161 |     await noHorizontalScroll(page)
  162 |     await shot(page, testInfo, 'parent-activity')
  163 | 
  164 |     await page.getByRole('button', { name: 'Save activity' }).click()
> 165 |     await expect(page).toHaveURL(`/p/${s.childId}`)
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  166 | 
  167 |     const db = admin()
  168 |     const { data: acts } = await db.from('activities').select('kind, name, place, days, since').eq('child_id', s.childId).eq('name', 'Chess club')
  169 |     expect(acts).toEqual([{ kind: 'club', name: 'Chess club', place: 'Hillview Primary, after school', days: ['Wed'], since: 'This term' }])
  170 |     const { data: events } = await db.from('events').select('type, payload').eq('type', 'activity.added').filter('payload->>childId', 'eq', s.childId)
  171 |     expect(events?.length).toBe(1)
  172 | 
  173 |     await page.goto(`/p/${s.childId}/beyond`)
  174 |     await expect(page.getByText('Chess club')).toBeVisible()
  175 |   })
  176 | 
  177 |   test('save needs a kind and a name', async ({ page }) => {
  178 |     const s = await open(page, 'marked')
  179 |     await page.goto(`/p/${s.childId}/activities/new`)
  180 |     await page.getByRole('button', { name: 'Save activity' }).click()
  181 |     await expect(page).toHaveURL(`/p/${s.childId}/activities/new`)
  182 |     await expect(page.getByRole('alert')).toBeVisible()
  183 |   })
  184 | })
  185 | 
```