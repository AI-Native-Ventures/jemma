import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServiceClient } from '@jemma/profiling/db'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const ACTUAL = resolve(import.meta.dirname, '../../../design/actual')

/** Saves the full page at 390 wide, once (the phone project), for the design match gate. */
async function shot(page: Page, info: TestInfo, board: string) {
  if (info.project.name !== 'phone') return
  mkdirSync(ACTUAL, { recursive: true })
  await page.screenshot({ path: resolve(ACTUAL, `${board}.png`), fullPage: true })
}

/** Thandi's link is seeded as approved; removing it gives the state before she asks. */
async function unlink(sb: OpenedSandbox) {
  const { error } = await admin().from('parent_links').delete().eq('child_id', sb.childId)
  if (error) throw new Error(error.message)
}

let sb: OpenedSandbox | null = null
test.afterEach(async () => {
  await sb?.cleanup()
  sb = null
})

test.describe('parent start, add child, consent, waiting', () => {
  test('a parent with no child sees the start screen', async ({ page }, info) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
    await unlink(sb)
    await page.goto('/p')
    await expect(page.getByText('Welcome, Thandi')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Let's add your child. It takes about a minute.")
    await expect(page.getByRole('heading', { name: 'Got a class code from a teacher?' })).toBeVisible()
    await expect(page.getByLabel('Class code')).toBeVisible()
    await expect(page.getByText("Ms Banda's class code is")).toContainText(sb.joinCode)
    await expect(page.getByRole('button', { name: /Add your child without a code/ })).toBeVisible()
    await expect(page.getByText('You can link their teacher later')).toBeVisible()
    await expect(page.getByRole('heading', { name: "What you'll see" })).toBeVisible()
    for (const line of ['Marks and gaps from every test', 'The paper behind each gap', 'A short lesson to do together at home']) {
      await expect(page.getByText(line)).toBeVisible()
    }
    await shot(page, info, 'parent-start')

    // The class code goes on to the add-child screen.
    await page.getByLabel('Class code').fill(sb.joinCode.toLowerCase())
    await page.getByRole('button', { name: 'Find the class' }).click()
    await expect(page).toHaveURL(new RegExp(`/p/add\\?code=${sb.joinCode}`, 'i'))
  })

  test('add child finds the class from its code', async ({ page }, info) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
    await unlink(sb)
    await page.goto(`/p/add?code=${sb.joinCode}&child=Amina`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Link your child with the teacher's class code")
    await expect(page.getByLabel('Class code')).toHaveValue(sb.joinCode)
    await expect(page.getByText('6B Mathematics, Ms Banda')).toBeVisible()
    await expect(page.getByText('Grade 6 · Hillview Primary')).toBeVisible()
    await expect(page.getByLabel("Your child's name, as the school has it")).toHaveValue('Amina')
    await expect(page.getByRole('heading', { name: "Once linked, you'll see" })).toBeVisible()
    await expect(page.getByText("Amina's marks, gaps and the papers behind them")).toBeVisible()
    await expect(page.getByText("Ms Banda's notes and attendance")).toBeVisible()
    await expect(page.getByText("Tonight's lesson, ready to hand to Amina")).toBeVisible()
    await expect(page.getByText('Ms Banda says yes before you see anything.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Link Amina' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'No code? Add your child yourself' })).toBeVisible()
    await shot(page, info, 'parent-add-child')

    // A code that matches no class says so and shows no class.
    await page.goto('/p/add?code=ZZZZZZ&child=Amina')
    await expect(page.getByText('No class has that code. Check it with the teacher.')).toBeVisible()
    await expect(page.getByText('6B Mathematics, Ms Banda')).toHaveCount(0)
  })

  test('a name that is not in the class does not go on', async ({ page }) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
    await unlink(sb)
    await page.goto(`/p/add?code=${sb.joinCode}&child=Nobody`)
    await page.getByRole('button', { name: /^Link / }).click()
    await expect(page).toHaveURL(/\/p\/add\?/)
    await expect(page.getByText("Ms Banda's class has no one called Nobody. Check the spelling.")).toBeVisible()
  })

  test('consent needs the two required boxes, then asks the teacher and waits', async ({ page }, info) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
    await unlink(sb)
    await page.goto(`/p/add/consent?code=${sb.joinCode}&child=Amina`)
    await expect(page.getByText('Amina · 6B Mathematics')).toBeVisible()
    await expect(page.getByText('Before you link')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      "Jemma keeps Amina's schoolwork so it can teach her. Is that okay with you?",
    )
    await expect(page.getByRole('heading', { name: 'What Jemma keeps' })).toBeVisible()
    await expect(page.getByText('Photos of her tests and homework')).toBeVisible()
    await expect(page.getByText('Only you, Ms Banda and Amina see it.')).toBeVisible()
    const guardian = page.getByLabel("I'm Amina's parent or legal guardian")
    const teach = page.getByLabel("Jemma can use Amina's schoolwork to teach her")
    const improve = page.getByLabel('Use her work, name removed, to make Jemma better')
    await expect(guardian).toBeChecked()
    await expect(teach).toBeChecked()
    await expect(improve).not.toBeChecked()
    await expect(page.getByText("South Africa's POPIA law treats under-18s as children, so we need your OK. Change this any time in Amina's settings.")).toBeVisible()
    await expect(page.getByRole('link', { name: 'Privacy in plain words' })).toBeVisible()
    await shot(page, info, 'parent-consent')

    // Unticking a required box blocks the request.
    await teach.uncheck()
    await page.getByRole('button', { name: 'Agree and ask Ms Banda' }).click()
    await expect(page).toHaveURL(/\/p\/add\/consent/)
    expect(await admin().from('parent_links').select('id').eq('child_id', sb.childId)).toMatchObject({ data: [] })

    await teach.check()
    await page.getByRole('button', { name: 'Agree and ask Ms Banda' }).click()
    await expect(page).toHaveURL(/\/p\/add\/pending/, { timeout: 30_000 })

    await expect(page.getByText('Linking Amina')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Waiting for Ms Banda to say yes.')
    await expect(page.getByText('6B Mathematics · Hillview Primary')).toBeVisible()
    await expect(page.getByText(/^Asked at \d\d:\d\d · Ms Banda$/)).toBeVisible()
    await expect(page.getByText("Ms Banda checks that you're Amina's parent. Most teachers answer within a school day.")).toBeVisible()
    await expect(page.getByText("Her answer shows up in Needs you on Amina's profile.")).toBeVisible()
    await expect(page.getByRole('link', { name: "Snap Amina's homework meanwhile" })).toBeVisible()
    await expect(page.getByText('In the demo you are Ms Banda too.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Switch to Ms Banda to approve' })).toBeVisible()
    await expect(page.getByRole('link', { name: "Approved already? Open Amina's profile" })).toBeVisible()
    await shot(page, info, 'parent-link-pending')

    // The request is recorded as pending, with the ticks, and the teacher has an item to answer.
    const db = admin()
    const { data: links } = await db.from('parent_links').select('status, consent').eq('child_id', sb.childId)
    expect(links).toEqual([{ status: 'pending', consent: { guardian: true, teach: true, improve: false } }])
    const { data: needs } = await db.from('needs_you_items').select('kind, status, title').eq('child_id', sb.childId).eq('kind', 'approve_link')
    expect(needs).toEqual([{ kind: 'approve_link', status: 'open', title: "Thandi M wants to see Amina's work" }])
  })

  test('nothing about the child is visible before the teacher approves', async ({ page }) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
    await unlink(sb)
    await page.goto(`/p/add/consent?code=${sb.joinCode}&child=Amina`)
    await page.getByRole('button', { name: 'Agree and ask Ms Banda' }).click()
    await expect(page).toHaveURL(/\/p\/add\/pending/, { timeout: 30_000 })

    // The child's space is closed: profile, report and paper routes all answer not found.
    for (const path of ['', '/report', '/tests']) {
      const res = await page.goto(`/p/${sb.childId}${path}`)
      expect(res?.status(), path).toBe(404)
    }
    // The home sends a waiting parent back to the waiting page, which shows no marks or test names.
    await page.goto('/p')
    await expect(page).toHaveURL(/\/p\/add\/pending/, { timeout: 30_000 })
    const body = await page.locator('body').innerText()
    for (const leak of ['Class Test 1', 'Needs you tonight', 'Doing well', '7/10']) expect(body).not.toContain(leak)
    // And through the database with the parent's own session, the child row is hidden.
    const res = await page.request.get(`${process.env.SUPABASE_URL}/rest/v1/children?id=eq.${sb.childId}`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY! },
    })
    expect(await res.json()).toEqual([])

    // After the teacher says yes, the home opens Amina's profile.
    const { error } = await admin().from('parent_links').update({ status: 'approved', decided_at: new Date().toISOString() }).eq('child_id', sb.childId)
    expect(error).toBeNull()
    await page.goto('/p')
    await expect(page).toHaveURL(new RegExp(`/p/${sb.childId}$`))
  })

  test('with one child the home opens that child; the list shows with ?all=1', async ({ page }, info) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
    await page.goto('/p')
    await expect(page).toHaveURL(new RegExp(`/p/${sb.childId}$`))

    await page.goto('/p?all=1')
    await expect(page.getByText(/^Good (morning|afternoon|evening), Thandi$/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Amina is doing well. One thing needs you tonight.')
    await expect(page.getByRole('heading', { name: 'Your children' })).toBeVisible()
    const card = page.getByRole('link', { name: /Amina/ }).filter({ hasText: 'Grade 6 · Hillview Primary' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Needs you')
    await expect(card).toContainText(/Doing well\. Tonight: 12 minutes on adding fractions/)
    await expect(card).toHaveAttribute('href', `/p/${sb.childId}`)
    const add = page.getByRole('link', { name: /Add a child/ })
    await expect(add).toContainText('Got a class code from a teacher? Use it here.')
    await expect(add).toHaveAttribute('href', '/p/add')
    await expect(page.getByRole('link', { name: /Notifications/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Your account' })).toContainText('TM')
    await shot(page, info, 'parent-children')

    await add.click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Link your child with the teacher's class code")
  })

  test('a page does not scroll sideways', async ({ page }) => {
    sb = await openSandbox(page, { stage: 'marked', role: 'parent' })
    await unlink(sb)
    for (const path of ['/p', `/p/add?code=${sb.joinCode}&child=Amina`, `/p/add/consent?code=${sb.joinCode}&child=Amina`]) {
      await page.goto(path)
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(wide, path).toBe(false)
    }
  })
})
