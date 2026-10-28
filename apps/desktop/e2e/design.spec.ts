// Design match gate: saves design/actual/<board>.png for each desktop board, to be compared with design/reference/<board>.png.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { hook, launch, quit, stubWeb } from './helpers'

const out = join(import.meta.dirname, '../../../design/actual')
mkdirSync(out, { recursive: true })

const ACCOUNT = { name: 'Ms Banda', initials: 'MB' }
const STOPPED = { eventId: 'e1', what: "reading Sipho's paper", waits: "Sipho's paper", cloudFor: 'this paper only', reason: 'Claude Code hit its usage limit', why: 'usage limit reached', retryAt: new Date('2026-10-28T17:00:00').getTime() }

test('desktop boards', async () => {
  const web = await stubWeb()
  const { app } = await launch({ web: web.url })
  try {
    const page = await app.firstWindow()
    const size = { x: 0, y: 0, width: 1200, height: 800 }
    // The board's data: Codex is not installed on this Mac (the real PATH may have one, so the detection is overridden).
    const agents = { claude: { installed: true, version: '2.1.0', signedIn: true }, codex: { installed: false, version: null, signedIn: false } }
    await hook(app, (h, a) => h.override!(a), { account: ACCOUNT, agents })

    await expect(page.getByRole('heading', { name: 'Sign in to Jemma Desktop' })).toBeVisible()
    // Board state: four characters typed, the fifth box is the focused one.
    for (const [i, c] of ['H', '4', 'P', '9'].entries()) await page.getByLabel(`Character ${i + 1} of 6`).fill(c)
    await page.getByLabel('Character 5 of 6').focus()
    await page.screenshot({ path: join(out, 'desktop-pair.png'), clip: size })

    await hook(app, (h) => h.setAgent!('claude'))
    await hook(app, (h) => h.setView!('choose'))
    await expect(page.getByRole('heading', { name: "Which AI should do Jemma's work?" })).toBeVisible()
    await expect(page.getByText('Not installed')).toBeVisible()
    await page.screenshot({ path: join(out, 'desktop-choose-ai.png'), clip: size })

    await hook(app, (h) => h.setView!('main'))
    const strip = { x: 0, y: 0, width: 1200, height: 79 }
    const states: [string, unknown][] = [
      ['ready', { kind: 'ready' }],
      ['working', { kind: 'running', label: 'Reading 3 of 5 papers', done: 2, total: 5, timeLeft: 'About a minute left' }],
      ['paused', { kind: 'paused' }],
      ['cant-run', { kind: 'cant_run', reason: 'Claude Code hit its usage limit' }],
    ]
    for (const [name, status] of states) {
      await hook(app, (h, s) => h.setStatus!(s), status)
      await expect(page.locator('[role=status]')).toBeVisible()
      await page.screenshot({ path: join(out, `desktop-strip-states-${name}.png`), clip: strip })
      if (name === 'ready') await page.screenshot({ path: join(out, 'desktop-main.png'), clip: strip })
    }

    await hook(app, (h, s) => h.override!({ stopped: s }), STOPPED)
    await hook(app, (h) => h.showDialog!())
    await expect.poll(() => app.windows().some((w) => w.url().endsWith('stopped.html'))).toBe(true)
    const dialog = app.windows().find((w) => w.url().endsWith('stopped.html'))!
    await expect(dialog.getByRole('heading')).toBeVisible()
    await dialog.screenshot({ path: join(out, 'desktop-job-stopped.png') })
  } finally {
    await quit(app)
    web.server.close()
  }
})
