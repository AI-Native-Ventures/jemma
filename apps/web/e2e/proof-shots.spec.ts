import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServiceClient, type JemmaDb } from '@jemma/profiling/db'
import { expect, test, type Page } from '@playwright/test'
import { openSandbox, type OpenedSandbox } from './helpers/sandbox'
import { signInWithPassword } from './helpers/session'

type SandboxRole = 'teacher' | 'parent' | 'learner'
type ProofRole = 'teacher' | 'parent' | 'child'
type Stage = 'start' | 'marked' | 'session_done'
type Login = { userId: string; email: string; password: string }
type Logins = Record<SandboxRole, Login>
type RouteSpec = { board: string; role: ProofRole; route: (ctx: ProofContext) => string; laptopOnly?: boolean }
type ProofContext = OpenedSandbox & {
  logins: Logins
  schoolId: string
  testId?: string
  aminaPaperId?: string
  siphoPaperId?: string
  checkAnswerId?: string
  topicId?: string
  topicName?: string
  sessionId?: string
  pendingLinkId?: string
}
type IndexRow = {
  board: string
  route: string
  role: ProofRole
  stage: Stage
  file390: string | null
  file1440: string
  ok: boolean
  note: string
}
type ErrorRow = { url: string; time: string; status: number; visibleText: string }

const ROOT = resolve(import.meta.dirname, '../../..')
const PROOF = resolve(ROOT, 'design/proof')
const paperPhotoBoards = new Set(['teacher-review', 'laptop-teacher-review', 'teacher-paper'])
const ADMIN = (): JemmaDb =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

const startRoutes: RouteSpec[] = [
  { board: 'Main', role: 'teacher', route: () => '/demo' },
  { board: 'demo-switch', role: 'teacher', route: () => '/demo/switch' },
  { board: 'teacher-classes', role: 'teacher', route: () => '/t' },
  { board: 'teacher-curriculum-upload', role: 'teacher', route: (c) => `/t/${c.classId}/curriculum` },
  { board: 'teacher-snap-test', role: 'teacher', route: (c) => `/t/${c.classId}/snap` },
  { board: 'parent-add-child', role: 'parent', route: (c) => `/p/add?code=${c.joinCode}&child=Amina` },
  { board: 'parent-consent', role: 'parent', route: (c) => `/p/add/consent?code=${c.joinCode}&child=Amina` },
  { board: 'parent-link-pending', role: 'parent', route: () => '/p/add/pending' },
  { board: 'teacher-link-request', role: 'teacher', route: (c) => `/t/${c.classId}/link-requests/${c.pendingLinkId}` },
  { board: 'child-nothing-tonight', role: 'child', route: () => '/k' },
]

const markedRoutes: RouteSpec[] = [
  { board: 'teacher-class-home', role: 'teacher', route: (c) => `/t/${c.classId}` },
  { board: 'teacher-gap', role: 'teacher', route: (c) => `/t/${c.classId}/gaps/${slug(c.topicName!)}` },
  { board: 'teacher-learners', role: 'teacher', route: (c) => `/t/${c.classId}/learners` },
  { board: 'teacher-learner', role: 'teacher', route: (c) => `/t/${c.classId}/learners/${c.childId}` },
  { board: 'teacher-child-profile', role: 'teacher', route: (c) => `/t/${c.classId}/learners/${c.childId}/profile` },
  { board: 'teacher-tests', role: 'teacher', route: (c) => `/t/${c.classId}/tests` },
  { board: 'teacher-test', role: 'teacher', route: (c) => `/t/${c.classId}/tests/${c.testId}` },
  { board: 'teacher-question', role: 'teacher', route: (c) => `/t/${c.classId}/tests/${c.testId}/q/1` },
  { board: 'teacher-curriculum-approved', role: 'teacher', route: (c) => `/t/${c.classId}/curriculum` },
  { board: 'teacher-curriculum-map', role: 'teacher', route: (c) => `/t/${c.classId}/curriculum/map` },
  { board: 'teacher-snap-key', role: 'teacher', route: (c) => `/t/${c.classId}/snap/${c.testId}/key` },
  { board: 'teacher-snap-queue', role: 'teacher', route: (c) => `/t/${c.classId}/snap/${c.testId}/papers` },
  { board: 'teacher-reading', role: 'teacher', route: (c) => `/t/${c.classId}/snap/${c.testId}/progress` },
  { board: 'teacher-review', role: 'teacher', route: (c) => `/t/${c.classId}/needs-you/${c.checkAnswerId}` },
  { board: 'teacher-paper', role: 'teacher', route: (c) => `/t/${c.classId}/papers/${c.siphoPaperId}` },
  { board: 'parent-profile', role: 'parent', route: (c) => `/p/${c.childId}` },
  { board: 'parent-report', role: 'parent', route: (c) => `/p/${c.childId}/report` },
  { board: 'parent-beyond', role: 'parent', route: (c) => `/p/${c.childId}/beyond` },
  { board: 'parent-topic', role: 'parent', route: (c) => `/p/${c.childId}/topics/${c.topicId}` },
  { board: 'parent-paper', role: 'parent', route: (c) => `/p/${c.childId}/papers/${c.aminaPaperId}` },
  { board: 'parent-tests', role: 'parent', route: (c) => `/p/${c.childId}/tests` },
  { board: 'parent-learn', role: 'parent', route: (c) => `/p/${c.childId}/learn` },
  { board: 'parent-handover', role: 'parent', route: (c) => `/p/${c.childId}/learn/handover` },
  { board: 'parent-snap-type', role: 'parent', route: (c) => `/p/${c.childId}/snap` },
  { board: 'parent-activity', role: 'parent', route: (c) => `/p/${c.childId}/activities/new` },
  { board: 'child-today', role: 'child', route: () => '/k' },
  { board: 'child-gaps', role: 'child', route: () => '/k/gaps' },
  { board: 'laptop-teacher-class', role: 'teacher', laptopOnly: true, route: (c) => `/t/${c.classId}` },
  { board: 'laptop-teacher-learners', role: 'teacher', laptopOnly: true, route: (c) => `/t/${c.classId}/learners` },
  { board: 'laptop-teacher-snap', role: 'teacher', laptopOnly: true, route: (c) => `/t/${c.classId}/snap/${c.testId}/papers` },
  { board: 'laptop-teacher-review', role: 'teacher', laptopOnly: true, route: (c) => `/t/${c.classId}/needs-you/${c.checkAnswerId}` },
  { board: 'laptop-teacher-tests', role: 'teacher', laptopOnly: true, route: (c) => `/t/${c.classId}/tests` },
  { board: 'laptop-teacher-curriculum', role: 'teacher', laptopOnly: true, route: (c) => `/t/${c.classId}/curriculum` },
  { board: 'laptop-teacher-report', role: 'teacher', laptopOnly: true, route: (c) => `/t/${c.classId}/report` },
  { board: 'laptop-parent-profile', role: 'parent', laptopOnly: true, route: (c) => `/p/${c.childId}` },
  { board: 'laptop-parent-learn', role: 'parent', laptopOnly: true, route: (c) => `/p/${c.childId}/learn` },
  { board: 'laptop-parent-tests', role: 'parent', laptopOnly: true, route: (c) => `/p/${c.childId}/tests` },
]

const finishedRoutes: RouteSpec[] = [
  { board: 'teacher-class-next', role: 'teacher', route: (c) => `/t/${c.classId}` },
  { board: 'teacher-register', role: 'teacher', route: (c) => `/t/${c.classId}/register` },
  { board: 'parent-session', role: 'parent', route: (c) => `/p/${c.childId}/sessions/${c.sessionId}` },
  { board: 'child-handback', role: 'child', route: () => '/k/done' },
]

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function readProofContext(admin: JemmaDb, sb: OpenedSandbox, stage: Stage): Promise<ProofContext> {
  const { data: box, error: boxError } = await admin
    .from('demo_sandboxes')
    .select('school_id, logins')
    .eq('id', sb.sandboxId)
    .single()
  if (boxError || !box) throw new Error(`proof sandbox ${stage}: ${boxError?.message ?? 'missing'}`)

  const context: ProofContext = {
    ...sb,
    schoolId: box.school_id,
    logins: box.logins as Logins,
  }

  if (stage === 'start') {
    const { data: parent } = await admin
      .from('profiles')
      .select('display_name')
      .eq('user_id', context.logins.parent.userId)
      .single()
    const { data: pending, error: linkError } = await admin
      .from('parent_links')
      .insert({
        parent_id: context.logins.parent.userId,
        child_id: context.childId,
        class_id: context.classId,
        status: 'pending',
        consent: { guardian: true, teach: true, improve: false },
      })
      .select('id')
      .single()
    if (linkError || !pending) throw new Error(`proof pending link: ${linkError?.message ?? 'missing'}`)
    context.pendingLinkId = pending.id
    const { error: needError } = await admin.from('needs_you_items').insert({
      owner_id: context.logins.teacher.userId,
      school_id: context.schoolId,
      child_id: context.childId,
      kind: 'approve_link',
      ref_id: pending.id,
      title: `${parent?.display_name ?? 'Thandi M'} wants to see Amina's work`,
      detail: `New parent · code ${context.joinCode}`,
    })
    if (needError) throw new Error(`proof pending link item: ${needError.message}`)
  } else {
    const [{ data: tests }, { data: children }, { data: gaps }, { data: sessions }] = await Promise.all([
      admin.from('tests').select('id').eq('class_id', context.classId).order('created_at'),
      admin.from('children').select('id, first_name').eq('school_id', context.schoolId),
      admin.from('gaps').select('id, topic_name, stage').eq('child_id', context.childId).order('created_at'),
      admin.from('sessions').select('id, status').eq('child_id', context.childId).order('planned_for'),
    ])
    const testId = tests?.[0]?.id
    const childrenByName = new Map((children ?? []).map((kid) => [kid.first_name, kid.id]))
    const topic = (gaps ?? []).find((gap) => gap.stage === 'new') ?? gaps?.[0]
    const session = (sessions ?? []).find((item) => item.status === (stage === 'session_done' ? 'done' : 'planned'))
    if (!testId || !topic || !session) throw new Error(`proof sandbox ${stage} is missing its test, gap, or session`)

    const [{ data: papers }, { data: checkItems }] = await Promise.all([
      admin.from('papers').select('id, child_id').eq('test_id', testId),
      admin.from('needs_you_items').select('id, ref_id').eq('school_id', context.schoolId).eq('kind', 'check_answer').eq('status', 'open'),
    ])
    const siphoId = childrenByName.get('Sipho')
    context.testId = testId
    context.topicId = topic.id
    context.topicName = topic.topic_name
    context.sessionId = session.id
    context.aminaPaperId = papers?.find((paper) => paper.child_id === context.childId)?.id
    context.siphoPaperId = papers?.find((paper) => paper.child_id === siphoId)?.id
    context.checkAnswerId = checkItems?.find((item) => item.ref_id === context.siphoPaperId)?.id
    if (!context.aminaPaperId || !context.siphoPaperId) throw new Error(`proof sandbox ${stage} is missing Amina or Sipho's test paper`)
  }
  return context
}

async function signInRole(page: Page, context: ProofContext, role: ProofRole) {
  const key: SandboxRole = role === 'child' ? 'learner' : role
  await signInWithPassword(page, context.logins[key].email, context.logins[key].password)
}

async function settleViewport(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.evaluate(
    () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  )
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => undefined)
}

function visibleFailureText(body: string): string | null {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const matched = lines.filter((line) =>
    /this page couldn't load|cloudflare.{0,24}(?:error|failed)|error\s*code\s*:?\s*\d{4}|\b1102\b/i.test(line),
  )
  return matched.length ? matched.join('\n').slice(0, 1200) : null
}

async function captureBoard(
  page: Page,
  admin: JemmaDb,
  context: ProofContext,
  stage: Stage,
  spec: RouteSpec,
  rows: IndexRow[],
  errors: ErrorRow[],
): Promise<void> {
  await signInRole(page, context, spec.role)
  const route = spec.route(context)
  let observedResponses: { url: string; status: number }[] = []
  const onResponse = (response: import('@playwright/test').Response) => {
    if (response.status() >= 500) observedResponses.push({ url: response.url(), status: response.status() })
  }
  page.on('response', onResponse)

  let responseStatus = 0
  let finalFailure: string | null = null
  let recovered = false
  for (let attempt = 0; attempt < 2; attempt += 1) {
    observedResponses = []
    let mainResponse: import('@playwright/test').Response | null = null
    try {
      mainResponse = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    } catch {
      // A failed main request can still render a Cloudflare error page. Inspect it before retrying.
    }
    responseStatus = mainResponse?.status() ?? observedResponses[0]?.status ?? 0
    const body = await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '')
    const visibleError = visibleFailureText(body)
    const badResponses = [...observedResponses]
    if (mainResponse && mainResponse.status() >= 500 && !badResponses.some((r) => r.url === mainResponse!.url())) {
      badResponses.push({ url: mainResponse.url(), status: mainResponse.status() })
    }
    if (visibleError && badResponses.length === 0) {
      badResponses.push({ url: page.url() || route, status: responseStatus })
    }

    const failed = badResponses.length > 0 || visibleError !== null
    if (!failed) {
      finalFailure = responseStatus >= 400 ? `HTTP ${responseStatus}` : null
      recovered = attempt > 0
      break
    }

    finalFailure = visibleError ?? `HTTP ${responseStatus || badResponses[0]?.status || 'unknown'}`
    for (const issue of badResponses) {
      errors.push({
        url: issue.url,
        time: new Date().toISOString(),
        status: issue.status,
        visibleText: visibleError ?? body.trim().slice(0, 1200),
      })
    }
    if (attempt === 0) continue
  }

  let missingPaperPhoto = false
  if (paperPhotoBoards.has(spec.board)) {
    await page.waitForFunction(
      () => Array.from(document.images).every((image) => image.complete),
      undefined,
      { timeout: 5_000 },
    ).catch(() => undefined)
    const images = await page.locator('img').evaluateAll((elements) =>
      elements.map((element) => {
        const image = element as HTMLImageElement
        return { complete: image.complete, naturalWidth: image.naturalWidth }
      }),
    )
    missingPaperPhoto = images.length === 0 || images.some((image) => !image.complete || image.naturalWidth === 0)
  }

  const phoneFile = spec.laptopOnly ? null : `design/proof/390/${spec.board}.png`
  const laptopFile = `design/proof/1440/${spec.board}.png`
  const finalUrl = new URL(page.url() || route, process.env.PLAYWRIGHT_BASE_URL)
  const expectedPath = new URL(route, process.env.PLAYWRIGHT_BASE_URL).pathname
  const redirected = finalUrl.pathname !== expectedPath ? `Redirected to ${finalUrl.pathname}` : null
  const ok = !finalFailure && !redirected && !missingPaperPhoto && responseStatus >= 200 && responseStatus < 400

  if (phoneFile) {
    await settleViewport(page, 390, 844)
    await page.screenshot({ path: resolve(ROOT, phoneFile), fullPage: true, animations: 'disabled' })
  }
  await settleViewport(page, 1440, 900)
  await page.screenshot({ path: resolve(ROOT, laptopFile), fullPage: true, animations: 'disabled' })
  page.off('response', onResponse)

  rows.push({
    board: spec.board,
    route,
    role: spec.role,
    stage,
    file390: phoneFile,
    file1440: laptopFile,
    ok,
    note: [
      recovered ? 'Recovered after one retry' : '',
      finalFailure ? `Page error: ${finalFailure}` : '',
      redirected ?? '',
      missingPaperPhoto ? 'Paper photo is missing or failed to load' : '',
    ].filter(Boolean).join('; '),
  })
}

test('capture judge routes from read-only stage sandboxes', async ({ page }) => {
  test.setTimeout(25 * 60_000)
  page.setDefaultNavigationTimeout(15_000)
  page.setDefaultTimeout(5_000)

  const admin = ADMIN()
  const rows: IndexRow[] = []
  const errors: ErrorRow[] = []
  await Promise.all([
    mkdir(resolve(PROOF, '390'), { recursive: true }),
    mkdir(resolve(PROOF, '1440'), { recursive: true }),
  ])

  try {
    const stages: { stage: Stage; routes: RouteSpec[] }[] = [
      { stage: 'start', routes: startRoutes },
      { stage: 'marked', routes: markedRoutes },
      { stage: 'session_done', routes: finishedRoutes },
    ]
    for (const { stage, routes } of stages) {
      const sandbox = await openSandbox(page, { stage, role: 'teacher' })
      try {
        const context = await readProofContext(admin, sandbox, stage)
        for (const spec of routes) await captureBoard(page, admin, context, stage, spec, rows, errors)
      } finally {
        await sandbox.cleanup()
      }
    }
  } finally {
    await writeFile(resolve(PROOF, 'index.json'), `${JSON.stringify(rows, null, 2)}\n`)
    await writeFile(resolve(PROOF, 'errors.json'), `${JSON.stringify(errors, null, 2)}\n`)
  }

  expect(rows.length).toBeGreaterThan(0)
  for (const row of rows) {
    expect(row.file1440, `${row.board} must have a laptop screenshot`).toBeTruthy()
    if (!row.file390) expect(row.board).toMatch(/^laptop-/)
  }
})
