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

/** Design match gate: boards are phone-size, so screenshots come from the phone project only. */
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

let sb: OpenedSandbox | undefined
test.afterEach(async () => {
  await sb?.cleanup().catch(() => undefined)
  sb = undefined
})

test('learners: headline, register card, rows, class code', async ({ page }, testInfo) => {
  sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  await page.goto(`/t/${sb.classId}/learners`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Everyone is marked\. \d learners? share(s)? one gap: [a-z ]+\.$/)
  await expect(page.getByText('Register for today')).toBeVisible()
  await expect(page.getByText(/not taken yet/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Take it' })).toBeVisible()
  await expect(page.getByText('Top gap')).toBeVisible()
  await expect(page.getByText('Average · days here')).toBeVisible()
  for (const name of ['Amina', 'Lerato', 'Naledi', 'Sipho', 'Thabo']) {
    await expect(page.getByRole('link', { name: new RegExp(`^${name[0]}\\s*${name}`) })).toBeVisible()
  }
  await expect(page.getByText('Parents link with this code')).toBeVisible()
  await expect(page.getByText(sb.joinCode)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'teacher-learners')
})

test('learner: summary, note saved shows under Earlier notes and queues observation.added', async ({ page }, testInfo) => {
  sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  await page.goto(`/t/${sb.classId}/learners/${sb.childId}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Amina' })).toBeVisible()
  await expect(page.getByText('Average', { exact: true })).toBeVisible()
  await expect(page.getByText('Days this term')).toBeVisible()
  await expect(page.getByText('Open gaps')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add a quick note' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Participation' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Works well in a group and explains her thinking clearly.')).toBeVisible()
  await expect(page.getByText('Finished the decimals extension task without help.')).toBeVisible()

  await page.getByRole('button', { name: 'Confidence' }).click()
  await expect(page.getByRole('button', { name: 'Confidence' })).toHaveAttribute('aria-pressed', 'true')
  const text = 'Asked why we can\'t just add the bottoms. Keen to try the fraction strips tomorrow.'
  await page.getByLabel('Note').fill(text)
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'teacher-learner')
  await page.getByRole('button', { name: 'Save note' }).click()
  const earlier = page.getByRole('region', { name: 'Earlier notes' })
  await expect(earlier.getByText(text)).toBeVisible()
  await expect(earlier.getByText(/Today · Confidence/)).toBeVisible()

  const { data } = await admin().from('observations').select('kind, text').eq('child_id', sb.childId).eq('text', text)
  expect(data).toEqual([{ kind: 'confidence', text }])
  const events = await admin().from('events').select('type, payload').eq('type', 'observation.added')
  expect(events.data?.some((e) => (e.payload as { childId?: string }).childId === sb!.childId)).toBe(true)
})

test('register: mark everyone here, save stores 5 rows', async ({ page }, testInfo) => {
  sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  await page.goto(`/t/${sb.classId}/register`)
  await expect(page.getByRole('heading', { level: 1, name: "Who's here today?" })).toBeVisible()
  await expect(page.getByText("Everyone starts as here. Change anyone who's late or away.")).toBeVisible()
  await expect(page.getByText("Parents see attendance on their child's profile. Days count this term.")).toBeVisible()
  const sipho = page.getByRole('group', { name: 'Sipho' })
  await sipho.getByRole('button', { name: 'Late' }).click()
  await expect(sipho.getByRole('button', { name: 'Late' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Mark everyone here' }).click()
  await expect(sipho.getByRole('button', { name: 'Here' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('group', { name: 'Thabo' }).getByRole('button', { name: 'Away' }).click()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'teacher-register')

  const today = new Date().toISOString().slice(0, 10)
  await page.getByRole('button', { name: 'Save register' }).click()
  await page.waitForURL(new RegExp(`/t/${sb.classId}/learners$`))
  const { data } = await admin().from('attendance').select('child_id, status').eq('day', today)
  const rows = (data ?? []).filter((r) => true)
  const kids = await admin().from('enrolments').select('child_id').eq('class_id', sb.classId)
  const ids = new Set((kids.data ?? []).map((k) => k.child_id))
  const mine = rows.filter((r) => ids.has(r.child_id))
  expect(mine).toHaveLength(5)
  expect(mine.filter((r) => r.status === 'away')).toHaveLength(1)
  await expect(page.getByText(/taken/)).toBeVisible()
})

test('child profile: summary, marks by topic, notes, attendance', async ({ page }, testInfo) => {
  sb = await openSandbox(page, { stage: 'marked', role: 'teacher' })
  await page.goto(`/t/${sb.classId}/learners/${sb.childId}/profile`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Amina is at 60%.')
  await expect(page.getByText('Same profile Thandi')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible()
  await expect(page.getByText('Nothing for Amina right now.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Marks by topic' })).toBeVisible()
  await expect(page.getByText('Maths · change since Term 3')).toBeVisible()
  await expect(page.getByText('Adding fractions').first()).toBeVisible()
  await expect(page.getByText('Papers', { exact: true })).toBeVisible()
  await expect(page.getByText('See her paper or fix a mark')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What Jemma has noticed' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your notes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add a note' })).toBeVisible()
  await expect(page.getByText('Attendance', { exact: true })).toBeVisible()
  await expect(page.getByText('Tonight at home')).toBeVisible()
  await expect(page.getByText(/Adding fractions with different denominators · diagram · 12 minutes/)).toBeVisible()
  await noHorizontalScroll(page)
  await shot(page, testInfo, 'teacher-child-profile')
})
