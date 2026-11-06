import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '../../..')
const pages = resolve(root, 'apps/desktop/src/pages')
const actual = resolve(root, 'design/actual')
mkdirSync(actual, { recursive: true })

const states = {
  ready: { kind: 'ready' },
  working: { kind: 'running', label: 'Reading 3 of 5 papers', done: 2, total: 5, timeLeft: 'About a minute left' },
  paused: { kind: 'paused' },
  'cant-run': { kind: 'cant_run', reason: 'Claude Code hit its usage limit' },
}

async function openPage(browser, name, viewport, data) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  await page.addInitScript((snapshot) => {
    Object.defineProperty(window, 'jemma', {
      value: {
        getState: async () => snapshot.state,
        getShell: async () => snapshot.shell,
        getStopped: async () => snapshot.stopped,
        onState: () => {},
        pairWithCode: async () => ({ ok: true }),
        signInWithEmail: () => {},
        openExternal: () => {},
        runOn: () => {},
        keepCloud: () => {},
        setPaused: () => {},
        showStopped: () => {},
        runStoppedInCloud: () => {},
        retryStoppedLater: () => {},
      },
    })
  }, data)
  await page.goto(pathToFileURL(resolve(pages, name)).href)
  await page.evaluate(() => document.fonts.ready)
  return page
}

async function addWindowLights(page) {
  await page.evaluate(() => {
    const bar = document.querySelector('.drag')
    if (!bar) return
    const lights = document.createElement('span')
    lights.setAttribute('aria-hidden', 'true')
    lights.style.cssText = 'position:absolute;left:14px;top:13px;display:flex;gap:8px;z-index:1'
    for (const color of ['#FF5F57', '#FEBC2E', '#28C840']) {
      const light = document.createElement('span')
      light.style.cssText = `width:12px;height:12px;border-radius:999px;background:${color}`
      lights.append(light)
    }
    bar.prepend(lights)
  })
}

const browser = await chromium.launch({ headless: true })
try {
  const pair = await openPage(browser, 'pair.html', { width: 1200, height: 800 }, {})
  await pair.waitForSelector('h1')
  for (const [i, char] of [...'H4P9'].entries()) await pair.locator(`[aria-label="Character ${i + 1} of 6"]`).fill(char)
  await pair.locator('[aria-label="Character 5 of 6"]').focus()
  await addWindowLights(pair)
  await pair.screenshot({ path: resolve(actual, 'desktop-pair.png') })
  await pair.close()

  const choose = await openPage(browser, 'choose.html', { width: 1200, height: 800 }, {
    state: {
      agent: 'claude',
      account: { name: 'Ms Banda', initials: 'MB' },
      agents: {
        claude: { installed: true, version: '2.1.0', signedIn: true },
        codex: { installed: false, version: null, signedIn: false },
      },
    },
  })
  await choose.waitForSelector('h1')
  await addWindowLights(choose)
  await choose.screenshot({ path: resolve(actual, 'desktop-choose-ai.png') })
  await choose.close()

  for (const [name, status] of Object.entries(states)) {
    const shell = await openPage(browser, 'shell.html', { width: 1200, height: 800 }, {
      shell: { agent: 'claude', status, showStrip: true },
    })
    await shell.waitForSelector('[role="status"]')
    await addWindowLights(shell)
    await shell.screenshot({ path: resolve(actual, `desktop-strip-states-${name}.png`), clip: { x: 0, y: 0, width: 1200, height: 79 } })
    await shell.close()
  }

  const stopped = await openPage(browser, 'stopped.html', { width: 520, height: 430 }, {
    stopped: {
      what: "reading Sipho's paper",
      agent: 'claude',
      why: 'usage limit reached',
      waits: "Sipho's paper",
      cloudFor: 'this paper only',
      retryAt: '17:00',
    },
  })
  await stopped.waitForSelector('h1')
  await stopped.screenshot({ path: resolve(actual, 'desktop-job-stopped.png') })
  await stopped.close()
} finally {
  await browser.close()
}

console.log('Captured desktop-pair, desktop-choose-ai, four desktop strip states, and desktop-job-stopped with headless Chromium.')
