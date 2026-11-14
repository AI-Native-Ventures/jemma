import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test as base, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

// The screens of "My own", a learner's private workspace (P95), on a phone and on a laptop. As Amina in a fresh demo copy: the switch on the home,
// My maths with a chip for Grade 6 and for Grade 7 and "+ Another grade", Grade 9 added from the grade page (it loads that grade's CAPS map and
// opens My maths at it, with the line "This is Grade 9 work. Take your time."), and Practise on a Grade 9 topic lands on "Jemma is writing your
// practice." As Ms Banda: the learner's page has the link "Amina's own practice", and the page it opens is read only. No model is called here: the
// practice is only asked for, and the page that says it is being written is the proof.
//
// RUNS IN CI on every push (job "Feature specs in a browser", .github/workflows/ci.yml, the step with the real agent), on CI's own local database,
// phone and laptop. Never run it against the hosted preview database. Screenshots are written only when P95_PROOF is set, to design/proof/p95,
// named by width (390 or 1440), by a person who runs it by hand against a build.

const check = expect.configure({ timeout: 45_000 })
const admin = () => createServiceClient({ SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY! })

const proofDir = resolve(import.meta.dirname, '../../../design/proof/p95')
async function proof(page: Page, name: string) {
  if (!process.env.P95_PROOF) return
  mkdirSync(proofDir, { recursive: true })
  const width = page.viewportSize()!.width >= 1024 ? 1440 : page.viewportSize()!.width
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: 'nextjs-portal{display:none} *{transition:none !important;animation:none !important}' })
  await page.screenshot({ path: resolve(proofDir, `${name}-${width}.png`), fullPage: true })
}

/** The page does not scroll sideways at this width. */
async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(wide, 'the page scrolls sideways').toBeLessThanOrEqual(0)
}

/**
 * The switch shows the tapped workspace at once and asks the server afterwards (P95b), so "pressed" no longer says the cookie is set or the page is
 * drawn for it. Wait for the cookie, and for a thing only that workspace's page has, before reading the page or going to another one.
 */
const workspaceCookie = (page: Page) => async () => (await page.context().cookies()).find((c) => c.name === 'jemma_ws')?.value

const opened: OpenedSandbox[] = []
// A copy is removed as soon as its test is over, so the copies do not pile up on CI's database.
base.afterEach(async () => {
  await Promise.all(opened.splice(0).map((s) => s.cleanup().catch(() => undefined)))
})

const test = base
test.use({ screenshot: 'only-on-failure', actionTimeout: 45_000 })
test.setTimeout(300_000)

const screenText = (page: Page) => page.locator('main').first().innerText()

test.describe('My own, the screens', () => {
  test('Amina taps My own, sees Grade 6 and Grade 7, adds Grade 9, which loads with its topics, and practises on one of them', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'start', role: 'learner' })
    opened.push(sb)
    const db = admin()

    // The home: the switch at the top, My school on. Tap My own: it is on, with the one short line, and the home says nothing about a teacher.
    await page.goto('/k')
    await check(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: 'My school' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Your own practice. Nothing here goes to your school.')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Add your own work/ })).toHaveCount(0)
    await proof(page, 'home-school')
    await page.getByRole('button', { name: 'My own' }).click()
    // At once (before the server has answered): the tapped button is the pressed one and the line is there.
    await check(page.getByRole('button', { name: 'My own' })).toHaveAttribute('aria-pressed', 'true')
    await check(page.getByText('Your own practice. Nothing here goes to your school.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'My school' })).toHaveAttribute('aria-pressed', 'false')
    // Then the page the server draws: the card of My own is on it, and the cookie is set.
    await check(page.getByRole('link', { name: /Add your own work/ })).toHaveAttribute('href', '/k/own')
    await expect(page.getByRole('link', { name: /Add your own work/ })).toContainText('A marked test or your own curriculum.')
    await expect.poll(workspaceCookie(page), { timeout: 45_000 }).toBe('own')
    await expect(page.getByRole('button', { name: 'My own' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screenText(page)).not.toMatch(/your teacher|marks a test/i)
    await noSidewaysScroll(page)
    await proof(page, 'home-own')

    // My maths, the switch still there and My own still on: one chip for each grade (Grade 6 is hers, so it is the chosen one), and the last chip.
    await page.getByRole('link', { name: 'My maths' }).first().click()
    await expect(page).toHaveURL(/\/k\/maths$/, { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1, name: 'My maths' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'My own' })).toHaveAttribute('aria-pressed', 'true')
    const grades = page.getByRole('navigation', { name: 'Grades' })
    await expect(grades.getByRole('link', { name: 'Grade 6' })).toHaveAttribute('aria-current', 'page')
    await expect(grades.getByRole('link', { name: 'Grade 7' })).toBeVisible()
    await expect(grades.getByRole('link', { name: '+ Another grade' })).toBeVisible()
    await expect(grades.getByRole('link')).toHaveCount(3)
    await expect(page.getByRole('link', { name: /Add your own work/ })).toHaveAttribute('href', '/k/own')
    await expect(page.getByText(/Take your time/)).toHaveCount(0)
    expect(await screenText(page)).toMatch(/3 of 5 right/)
    expect(await screenText(page)).not.toMatch(/your teacher/i)
    await noSidewaysScroll(page)
    await proof(page, 'my-maths-grade-6')

    // Grade 7 is above her own grade: one plain line.
    await grades.getByRole('link', { name: 'Grade 7' }).click()
    await expect(page).toHaveURL(/\/k\/maths\?grade=7$/, { timeout: 45_000 })
    await check(page.getByText('This is Grade 7 work. Take your time.')).toBeVisible()
    await expect(grades.getByRole('link', { name: 'Grade 7' })).toHaveAttribute('aria-current', 'page')
    await noSidewaysScroll(page)
    await proof(page, 'my-maths-grade-7')

    // + Another grade: the grade page with the 12 grades, hers marked "your grade", the added ones marked "added".
    await grades.getByRole('link', { name: '+ Another grade' }).click()
    await expect(page).toHaveURL(/\/k\/maths\/grades$/, { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1, name: 'Add a grade' })).toBeVisible()
    const sheet = page.getByRole('group', { name: 'Grades' })
    await expect(sheet.getByRole('button')).toHaveCount(12)
    await expect(sheet.getByRole('button', { name: 'Grade 6' })).toContainText('your grade')
    await expect(sheet.getByRole('button', { name: 'Grade 6' })).toContainText('added')
    await expect(sheet.getByRole('button', { name: 'Grade 7' })).toContainText('added')
    await expect(sheet.getByRole('button', { name: 'Grade 9' })).not.toContainText('added')
    await noSidewaysScroll(page)
    await proof(page, 'add-a-grade')

    // Grade 9: it loads its CAPS map and opens My maths at it, with its topics and the line.
    await sheet.getByRole('button', { name: 'Grade 9' }).click()
    await expect(page).toHaveURL(/\/k\/maths\?grade=9$/, { timeout: 90_000 })
    await check(page.getByText('This is Grade 9 work. Take your time.')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Grades' }).getByRole('link', { name: 'Grade 9' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('navigation', { name: 'Grades' }).getByRole('link')).toHaveCount(4)
    const all = page.getByRole('region', { name: 'All of Mathematics' })
    await check(all.getByRole('link').first()).toBeVisible()
    expect(await screenText(page)).not.toMatch(/No topics yet/)
    await noSidewaysScroll(page)
    await proof(page, 'my-maths-grade-9')

    // The data: a Grade 9 private class with an approved map and topics, in the personal school, owned by nobody's school class lists.
    const twin = (await db.from('children').select('id, school_id').eq('private_of', sb.childId).single()).data!
    const nine = (await db.from('classes').select('id, name').eq('school_id', twin.school_id).eq('grade', 9)).data!
    expect(nine).toHaveLength(1)
    const maps = (await db.from('curriculum_maps').select('id, status').eq('class_id', nine[0]!.id)).data!
    expect(maps.map((m) => m.status)).toEqual(['approved'])
    expect(((await db.from('topics').select('id').eq('map_id', maps[0]!.id)).data ?? []).length).toBeGreaterThan(0)

    // Into a part of Grade 9 and Practise on a topic: the home says Jemma is writing it. The event is for the private workspace, never the school child.
    await all.getByRole('link').first().click()
    await expect(page).toHaveURL(/\/k\/maths\/[^/?]+\?grade=9$/, { timeout: 45_000 })
    const practise = page.locator('main').getByRole('button', { name: /^Practise / }).first()
    await check(practise).toBeVisible()
    await noSidewaysScroll(page)
    await proof(page, 'my-maths-grade-9-part')
    await practise.click()
    await expect(page).toHaveURL(/\/k$/, { timeout: 45_000 })
    await check(page.getByText('Jemma is writing your practice.')).toBeVisible()
    await proof(page, 'home-writing')
    const events = async (childId: string) => (await db.from('events').select('id').eq('type', 'practice.requested').eq('payload->>childId', childId)).data ?? []
    expect((await events(twin.id)).length).toBeGreaterThan(0)
    expect(await events(sb.childId)).toHaveLength(0)
  })

  test('the screens have no sideways scroll at 360, 390 and 1440', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'start', role: 'learner' })
    opened.push(sb)
    const widths = (page.viewportSize()?.width ?? 0) >= 1024 ? [1440] : [360, 390]
    await page.goto('/k')
    await check(page.getByRole('button', { name: 'My own' })).toBeVisible()
    await page.getByRole('button', { name: 'My own' }).click()
    await check(page.getByRole('button', { name: 'My own' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(workspaceCookie(page), { timeout: 45_000 }).toBe('own')
    await check(page.getByRole('link', { name: /Add your own work/ })).toBeVisible()
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 })
      for (const path of ['/k', '/k/maths', '/k/maths?grade=7', '/k/maths/grades']) {
        await page.goto(path)
        await check(page.getByRole('button', { name: 'My own' }).or(page.getByRole('heading', { level: 1, name: 'Add a grade' }))).toBeVisible()
        await noSidewaysScroll(page)
      }
    }
  })

  test('Ms Banda opens Amina\'s own practice from her learner page, and it is read only', async ({ page }) => {
    const sb = await openSandbox(page, { stage: 'start', role: 'teacher' })
    opened.push(sb)
    // The way to it from the learners list. On the phone the list opens a learner's profile, and the link is on it. On the laptop the list has the
    // chosen learner's pane beside it (it never opens /profile), and the link is in the pane.
    const onLaptop = (page.viewportSize()?.width ?? 0) >= 1024
    if (onLaptop) {
      await page.goto(`/t/${sb.classId}/learners?child=${sb.childId}`)
    } else {
      await page.goto(`/t/${sb.classId}/learners`)
      await check(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.locator(`main a[href="/t/${sb.classId}/learners/${sb.childId}/profile"]`).first().click()
      await expect(page).toHaveURL(new RegExp(`/t/${sb.classId}/learners/${sb.childId}/profile$`), { timeout: 45_000 })
    }
    const link = page.getByRole('link', { name: /Amina's own practice/ })
    await check(link).toBeVisible()
    if (!onLaptop) await expect(link).toContainText('Read only')
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/t/${sb.classId}/learners/${sb.childId}/own$`), { timeout: 45_000 })
    await check(page.getByRole('heading', { level: 1, name: "Amina's own practice" })).toBeVisible()
    await expect(page.getByText('What Amina practised on their own. You can look; nothing here changes their school record.')).toBeVisible()

    // The grades with her own counts, the gaps and the last sessions. Nothing here writes: no form, no button.
    await expect(page.getByRole('region', { name: 'Grade 6' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Grade 7' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Grade 6' })).toContainText(/\d of \d right/)
    await expect(page.getByRole('region', { name: 'Open gaps' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Fixed gaps' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Last sessions' }).getByRole('listitem')).toHaveCount(2)
    await expect(page.locator('main').locator('form, button, input, select, textarea')).toHaveCount(0)
    expect(await screenText(page)).not.toMatch(/%/)
    await noSidewaysScroll(page)
    await proof(page, 'teacher-own')

    // The learner's page (the notes page, which the list does not open) has the same link.
    await page.goto(`/t/${sb.classId}/learners/${sb.childId}`)
    await check(page.getByRole('link', { name: /Amina's own practice/ })).toHaveAttribute('href', `/t/${sb.classId}/learners/${sb.childId}/own`)
  })
})
