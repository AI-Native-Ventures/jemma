import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const actual = (board: string) => resolve(import.meta.dirname, `../../../design/actual/${board}.png`)

/** Design match gate: boards are phone-size, so screenshots are saved from the phone project only. */
async function shot(page: Page, testInfo: TestInfo, board: string) {
  if (testInfo.project.name !== 'phone') return
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
  await page.screenshot({ path: actual(board), fullPage: true })
}

async function noHorizontalScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(wide).toBe(false)
}

let sb: OpenedSandbox | null = null
// Dev server compiles each route on first visit and 11 workers share one database.
test.beforeEach(() => test.setTimeout(120_000))
test.afterEach(async () => {
  await sb?.cleanup().catch(() => undefined)
  sb = null
})

/** The sandbox teacher's id and school, read with the service role. */
async function teacherOf(sandbox: OpenedSandbox) {
  const db = admin()
  const { data: cls } = await db.from('classes').select('teacher_id, school_id').eq('id', sandbox.classId).single()
  return { db, teacherId: cls!.teacher_id, schoolId: cls!.school_id }
}

/** Adds "6A Mathematics" with five learners and no tests, as on the classes board. */
async function addSixA(sandbox: OpenedSandbox) {
  const { db, teacherId, schoolId } = await teacherOf(sandbox)
  const { data: cls } = await db
    .from('classes')
    .insert({ school_id: schoolId, teacher_id: teacherId, name: '6A Mathematics', grade: 6, year: 2026, subject: 'Mathematics', join_code: 'R4T8WN' })
    .select('id')
    .single()
  const { data: kids } = await db
    .from('children')
    .insert(['Ayesha', 'Kagiso', 'Zanele', 'Musa', 'Lindiwe'].map((first_name) => ({ school_id: schoolId, first_name, grade: 6 })))
    .select('id')
  await db.from('enrolments').insert(kids!.map((k) => ({ class_id: cls!.id, child_id: k.id })))
  return cls!.id
}

test.describe('teacher-classes', () => {
  test('lists the teacher classes with what needs them', async ({ page }, testInfo) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    const sixA = await addSixA(sb)
    await page.goto('/t')
    await expect(page.getByText(/^Good (morning|afternoon|evening), Ms Banda$/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6B needs you for one paper. 6A is waiting to be set up.')
    await expect(page.getByRole('heading', { name: 'Your classes' })).toBeVisible()
    const six = page.getByRole('link', { name: /6B Mathematics/ })
    await expect(six).toContainText('Grade 6 · Hillview Primary')
    await expect(six).toContainText('Needs you')
    await expect(six).toContainText('5 learners')
    await expect(six).toContainText('1 test')
    await expect(six).toContainText(/Class Test 1 marked today at \d\d:\d\d/)
    await expect(six).toHaveAttribute('href', `/t/${sb.classId}`)
    const a = page.getByRole('link', { name: /6A Mathematics/ })
    await expect(a).toContainText('New')
    await expect(a).toContainText('5 learners · no tests yet')
    await expect(a).toContainText('Set up this class')
    await expect(a).toHaveAttribute('href', `/t/new/${sixA}`)
    await expect(page.getByRole('link', { name: 'Create a class' })).toHaveAttribute('href', '/t/new')
    await expect(page.getByRole('link', { name: 'Your account' })).toHaveAttribute('href', '/t/account')
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'teacher-classes')
  })
})

test.describe('teacher-onboarding', () => {
  test('about you: school, subject and grades', async ({ page }, testInfo) => {
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    await page.goto('/t/onboarding')
    await expect(page.getByText('Step 1 of 2')).toBeVisible()
    await expect(page.getByText('About you', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome, Ms Banda. Where and what do you teach?')
    await expect(page.getByRole('heading', { name: 'Your school' })).toBeVisible()
    await expect(page.getByLabel('Find your school')).toHaveValue('Hillview')
    await expect(page.getByRole('button', { name: /Hillview Primary/ })).toContainText('Gauteng · Grade R to 7')
    await expect(page.getByRole('button', { name: "My school isn't listed" })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What you teach' })).toBeVisible()
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('Mathematics')
    await expect(page.getByLabel('Subject', { exact: true }).locator('option')).toHaveText(['Mathematics', 'English', 'Natural Sciences', 'Social Sciences', 'Technology', 'Life Skills', 'Other'])
    await expect(page.getByLabel('Grade of your first class').locator('option')).toHaveCount(13)
    await page.getByLabel('Grade of your first class').selectOption('6')
    await expect(page.getByLabel('Grade of your first class')).toHaveValue('6')
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'teacher-onboarding')
    await page.getByRole('button', { name: "My school isn't listed" }).click()
    await expect(page.getByRole('dialog')).toContainText('Add your school')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Next: set up your class' }).click()
    await expect(page).toHaveURL(/\/t\/new\?grade=6&subject=Mathematics$/)
  })
})

test.describe('teacher-class-setup and state-empty-class', () => {
  test('creates a class with learners and lands on the empty class', async ({ page }, testInfo) => {
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    await page.goto('/t/new?grade=6')
    await expect(page.getByText('Your classes', { exact: true })).toBeVisible()
    await expect(page.getByText('New class', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up a class. Only the name is needed now.')
    await expect(page.getByText('Add learners now or later. Jemma starts marking once you snap a test.')).toBeVisible()
    await expect(page.getByLabel('Grade', { exact: true })).toHaveValue('6')
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue('Mathematics')
    await expect(page.getByText('What you and parents see')).toBeVisible()
    await expect(page.getByText('Snap the register instead')).toBeVisible()
    await expect(page.getByText('Parents type it to link their child. You can share it later too.')).toBeVisible()
    await page.getByLabel('Class name').fill('6A Mathematics')
    for (const name of ['Ayesha', 'Kagiso', 'Zanele', 'Musa', 'Lindiwe']) {
      await page.getByLabel('Add a learner').fill(name)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
    }
    await expect(page.getByText('5 added')).toBeVisible()
    await page.getByRole('button', { name: 'Remove Lindiwe' }).click()
    await expect(page.getByText('4 added')).toBeVisible()
    await page.getByLabel('Add a learner').fill('Lindiwe')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'teacher-class-setup')
    await page.getByRole('button', { name: 'Snap the register instead' }).click()
    await expect(page.getByRole('dialog')).toContainText('Coming after the challenge')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Create class' }).click()

    await expect(page).toHaveURL(/\/t\/new\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6A is set up. Three more steps and I can start marking for you.')
    await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible()
    await expect(page.getByText("Nothing yet. Things I'm unsure about land here.")).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up 6A' })).toBeVisible()
    await expect(page.getByText('1 of 4 done')).toBeVisible()
    await expect(page.getByText('Upload your curriculum')).toBeVisible()
    await expect(page.getByText('I draft the topic map, you approve it')).toBeVisible()
    await expect(page.getByText('Done · 5 learners. Tap to edit')).toBeVisible()
    await expect(page.getByText('Parents link with')).toBeVisible()
    await expect(page.getByText('Snap your first test')).toBeVisible()
    await expect(page.getByText("Then I show you what the class doesn't get yet")).toBeVisible()
    await expect(page.getByText("Any order works. Class gaps show up here after the first test.")).toBeVisible()
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'state-empty-class')

    const db = admin()
    const { data: made } = await db.from('classes').select('id, grade, subject, join_code').eq('name', '6A Mathematics').order('created_at', { ascending: false })
    const mine = made!.find((c) => c.id === page.url().split('/').pop())!
    expect(mine.grade).toBe(6)
    expect(mine.subject).toBe('Mathematics')
    expect(mine.join_code).toMatch(/^[A-Z0-9]{6}$/)
    const { count } = await db.from('enrolments').select('child_id', { count: 'exact', head: true }).eq('class_id', mine.id)
    expect(count).toBe(5)
    await db.from('enrolments').delete().eq('class_id', mine.id)
    await db.from('classes').delete().eq('id', mine.id)
  })

  test('needs a class name', async ({ page }) => {
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    await page.goto('/t/new')
    await page.getByRole('button', { name: 'Create class' }).click()
    await expect(page.getByText('Give the class a name')).toBeVisible()
    await expect(page).toHaveURL(/\/t\/new$/)
  })
})

test.describe('teacher-class-settings', () => {
  test('shows the class, code, parents and learners', async ({ page }, testInfo) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    await page.goto(`/t/${sb.classId}/settings`)
    await expect(page.getByText('Class settings', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('6B has 5 learners and 1 linked parent.')
    await expect(page.getByRole('heading', { name: 'Class', exact: true })).toBeVisible()
    await expect(page.locator('main').getByText('6B Mathematics').first()).toBeVisible()
    await expect(page.getByText('Grade 6', { exact: true })).toBeVisible()
    await expect(page.getByText(sb.joinCode)).toBeVisible()
    await expect(page.getByText('The old code stops working. Parents already linked stay linked.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Parents', exact: true })).toBeVisible()
    await expect(page.getByText('New parents need your OK')).toBeVisible()
    await expect(page.getByText('You approve each parent before they see anything')).toBeVisible()
    await expect(page.getByText('Thandi M', { exact: true })).toBeVisible()
    await expect(page.getByText("Amina's mother")).toBeVisible()
    await expect(page.getByText(/^Linked \w{3} \d{1,2} \w{3}$/)).toBeVisible()
    await expect(page.getByText('Amina, Lerato, Naledi, Sipho, Thabo')).toBeVisible()
    await expect(page.getByText('Move 6B up or archive it')).toBeVisible()
    await expect(page.getByText('After the last day of Term 4')).toBeVisible()
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'teacher-class-settings')
  })

  test('makes a new code and renames the class', async ({ page }) => {
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    await page.goto(`/t/${sb.classId}/settings`)
    await page.getByRole('button', { name: 'Make a new code' }).click()
    await expect(page.getByText(sb.joinCode)).toHaveCount(0)
    const { data } = await admin().from('classes').select('join_code').eq('id', sb.classId).single()
    expect(data!.join_code).not.toBe(sb.joinCode)
    await expect(page.getByText(data!.join_code)).toBeVisible()

    await page.getByRole('button', { name: 'Edit class name' }).click()
    await page.getByRole('textbox', { name: 'Class name' }).fill('6C Mathematics')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('main').getByText('6C Mathematics').first()).toBeVisible()
    const after = await admin().from('classes').select('name').eq('id', sb.classId).single()
    expect(after.data!.name).toBe('6C Mathematics')
  })

  test('has a marked slot for where the AI runs', async ({ page }) => {
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    await page.goto(`/t/${sb.classId}/settings`)
    await expect(page.locator('[data-slot="ai-runner"]')).toHaveCount(1)
  })
})

test.describe('teacher-account', () => {
  test('shows the teacher and signs out', async ({ page }, testInfo) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    await page.goto('/t/account')
    await expect(page.getByText('Your account', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ms Banda')
    await expect(page.getByText(/^ms\.banda\..+@demo\.jemma\.invalid$/)).toBeVisible()
    await expect(page.getByText('Hillview Primary', { exact: true })).toBeVisible()
    await expect(page.getByText('Mathematics, Grade 6')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit your details' })).toBeVisible()
    await expect(page.getByText('In the app only · Needs you and finished lessons')).toBeVisible()
    await expect(page.getByText('Free · 7 of 10 people')).toBeVisible()
    await expect(page.getByText('Messages from parents')).toBeVisible()
    await expect(page.getByRole('link', { name: /Privacy and your data/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Help$/ })).toBeVisible()
    await expect(page.getByText("Your classes move to another teacher at your school first.")).toBeVisible()
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'teacher-account')
    await page.getByRole('button', { name: 'Messages from parents' }).click()
    await expect(page.getByRole('dialog')).toContainText('Coming after the challenge')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('edits the display name', async ({ page }) => {
    sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    await page.goto('/t/account')
    await page.getByRole('button', { name: 'Edit your details' }).click()
    await page.getByLabel('Your name').fill('Mrs Banda')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mrs Banda')
  })
})

/** Puts Thandi's link back to pending with the Needs you item the parent screens create. */
async function pendingLink(sandbox: OpenedSandbox) {
  const { db, teacherId, schoolId } = await teacherOf(sandbox)
  const { data: link } = await db.from('parent_links').select('id').eq('class_id', sandbox.classId).single()
  await db.from('parent_links').update({ status: 'pending', decided_at: null }).eq('id', link!.id)
  await db.from('needs_you_items').insert({
    owner_id: teacherId,
    school_id: schoolId,
    child_id: sandbox.childId,
    kind: 'approve_link',
    ref_id: link!.id,
    title: 'New parent: Thandi M',
    detail: 'Wants to see Amina',
  })
  return { db, linkId: link!.id }
}

test.describe('teacher-link-request', () => {
  test('shows who is asking and keeps "Message her first" as a sheet', async ({ page }, testInfo) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    const { linkId } = await pendingLink(sb)
    await page.goto(`/t/${sb.classId}/link-requests/${linkId}`)
    await expect(page.getByText('6B Mathematics · Needs you')).toBeVisible()
    await expect(page.getByText('New parent', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Thandi M wants to see Amina's work. Is she Amina's parent?")
    await expect(page.getByText(/^thandi\..+@demo\.jemma\.invalid$/)).toBeVisible()
    await expect(page.getByText(new RegExp(`^Entered code ${sb.joinCode} and the name Amina at \\d\\d:\\d\\d$`))).toBeVisible()
    await expect(page.getByText('No other parent is linked to Amina.')).toBeVisible()
    await expect(page.getByRole('heading', { name: "She'll see" })).toBeVisible()
    await expect(page.getByText("Amina's marks and papers")).toBeVisible()
    await expect(page.getByText('Her gaps and lessons')).toBeVisible()
    await expect(page.getByText('Your notes and attendance')).toBeVisible()
    await expect(page.getByText('She sees nothing until you say yes.')).toBeVisible()
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'teacher-link-request')
    await page.getByRole('button', { name: 'Not sure? Message her first' }).click()
    await expect(page.getByRole('dialog')).toContainText('Coming after the challenge')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Yes, approve' })).toBeVisible()
  })

  test('approving removes it from Needs you', async ({ page }) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    const { db, linkId } = await pendingLink(sb)
    await page.goto(`/t/${sb.classId}/link-requests/${linkId}`)
    await page.getByRole('button', { name: 'Yes, approve' }).click()
    await expect(page).toHaveURL(new RegExp(`/t/${sb.classId}$`), { timeout: 60_000 })
    const link = await db.from('parent_links').select('status, decided_at').eq('id', linkId).single()
    expect(link.data!.status).toBe('approved')
    expect(link.data!.decided_at).not.toBeNull()
    const item = await db.from('needs_you_items').select('status').eq('ref_id', linkId).single()
    expect(item.data!.status).toBe('done')
  })

  test('declining records the no', async ({ page }) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    const { db, linkId } = await pendingLink(sb)
    await page.goto(`/t/${sb.classId}/link-requests/${linkId}`)
    await page.getByRole('button', { name: 'No, decline' }).click()
    await expect(page).toHaveURL(new RegExp(`/t/${sb.classId}$`), { timeout: 60_000 })
    const link = await db.from('parent_links').select('status').eq('id', linkId).single()
    expect(link.data!.status).toBe('declined')
  })
})

test.describe('teacher-year-end', () => {
  test('offers move up or archive and downloads the marks', async ({ page }, testInfo) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
    await page.goto(`/t/${sb.classId}/year-end`)
    await expect(page.getByText('End of the year', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The year ends after Term 4. What should happen to 6B?')
    await expect(page.getByRole('button', { name: /Move up to Grade 7/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Learners keep their gaps, fixed topics and what helps. Their Grade 7 teacher sees them. Parents stay linked.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Archive 6B Read only/ })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('Read only. Nothing is deleted.')).toBeVisible()
    await expect(page.getByText("Your notes stay in 6B's archive.")).toBeVisible()
    await noHorizontalScroll(page)
    await shot(page, testInfo, 'teacher-year-end')
    await page.getByRole('button', { name: /^Archive 6B Read only/ }).click()
    await expect(page.getByRole('button', { name: /^Archive 6B Read only/ })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /Move up to Grade 7/ }).click()
    await page.getByRole('button', { name: 'Move 6B up after the last day of term' }).click()
    await expect(page.getByRole('dialog')).toContainText('Coming after the challenge')
    await page.keyboard.press('Escape')

    const res = await page.request.get(`/t/${sb.classId}/year-end/marks.csv`)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/csv')
    const csv = await res.text()
    expect(csv.split('\n')[0]).toBe('Learner,Test,Marks,Out of')
    expect(csv).toContain('Amina,Class Test 1')
    expect(csv).not.toContain('\u2014')
  })
})
