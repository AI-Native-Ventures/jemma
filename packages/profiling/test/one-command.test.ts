import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { REPLAYS_FIXTURE, parseReplays } from '../../../scripts/load-replays'

// P51: one command run. These are the checks on the files that make `./start.sh` work, without Docker.
const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const json = (path: string) => JSON.parse(read(path)) as Record<string, unknown>
const EM_DASH = String.fromCharCode(0x2014)

describe('start.sh', () => {
  test('is executable and valid bash', () => {
    expect(() => accessSync(join(root, 'start.sh'), constants.X_OK)).not.toThrow()
    const check = spawnSync('bash', ['-n', 'start.sh'], { cwd: root, encoding: 'utf8' })
    expect(check.stderr).toBe('')
    expect(check.status).toBe(0)
  })

  test('says what it does with --help and refuses an unknown option', () => {
    const help = spawnSync('bash', ['start.sh', '--help'], { cwd: root, encoding: 'utf8' })
    expect(help.status).toBe(0)
    for (const flag of ['--stop', '--force', '--ci']) expect(help.stdout).toContain(flag)
    const unknown = spawnSync('bash', ['start.sh', '--nope'], { cwd: root, encoding: 'utf8' })
    expect(unknown.status).toBe(2)
  })

  test('writes the model ids the recorded answers were made with', () => {
    const script = read('start.sh')
    const models = new Set(parseReplays(readFileSync(REPLAYS_FIXTURE)).map((row) => row.model))
    expect(models.size).toBeGreaterThan(0)
    for (const model of models) expect(script, `start.sh must set ${model}`).toContain(model)
    expect(script).toContain('AI_MODE=replay')
  })

  test('uses the local agent config, the pinned supabase CLI and the standard ports', () => {
    const script = read('start.sh')
    expect(script).toContain('dev:local')
    expect(script).toContain('exec supabase')
    expect(script).toContain('WEB_PORT=3000')
    expect(script).toContain('AGENT_PORT=8787')
    expect(json('package.json').devDependencies).toMatchObject({ supabase: expect.stringMatching(/^\d+\.\d+\.\d+$/) })
  })
})

describe('the local stack files', () => {
  test('supabase/config.toml names the local project', () => {
    expect(read('supabase/config.toml')).toMatch(/^project_id = "jemma-local"$/m)
  })

  test('the local agent config is the main one without the AI binding', () => {
    const main = json('apps/agent/wrangler.jsonc')
    const local = json('apps/agent/wrangler.local.jsonc')
    expect(main.ai).toBeDefined()
    expect(local.ai).toBeUndefined()
    const { ai: _ai, ...rest } = main
    expect(local).toEqual(rest)
  })

  test('the agent has a dev:local script that uses it on port 8787', () => {
    const scripts = json('apps/agent/package.json').scripts as Record<string, string>
    expect(scripts['dev:local']).toBe('wrangler dev --port 8787 --config wrangler.local.jsonc')
  })

  test('.jemma is ignored by git', () => {
    expect(read('.gitignore')).toMatch(/^\.jemma\/$/m)
  })
})

describe('licence and README', () => {
  test('LICENSE is MIT for AI Native Ventures', () => {
    const text = read('LICENSE')
    expect(text.startsWith('MIT License')).toBe(true)
    expect(text).toContain('Copyright (c) 2026 AI Native Ventures')
  })

  test('every package.json says MIT', () => {
    for (const file of ['package.json', 'apps/agent/package.json', 'apps/desktop/package.json', 'apps/web/package.json', 'packages/profiling/package.json', 'packages/runner/package.json']) {
      expect(json(file).license, file).toBe('MIT')
    }
  })

  test('the README gets a stranger running with one command and has no loose ends about the licence', () => {
    const readme = read('README.md')
    expect(readme).not.toMatch(/to be announced/i)
    expect(readme).not.toContain('<live link>')
    expect(readme).toContain('Licence: MIT')
    const run = readme.slice(readme.indexOf('## Run it\n'))
    expect(run.indexOf('./start.sh')).toBeGreaterThan(-1)
    expect(run.indexOf('./start.sh')).toBeLessThan(run.indexOf('## Run against your own Supabase project'))
  })
})

describe('the GitHub workflow', () => {
  test('runs the one command, the typecheck, the tests and the phone demo path on a clean machine', () => {
    expect(existsSync(join(root, '.github/workflows/ci.yml'))).toBe(true)
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toMatch(/runs-on: ubuntu-latest/)
    expect(ci).toMatch(/timeout-minutes: 40/)
    expect(ci).toContain('./start.sh --ci')
    expect(ci).toContain('pnpm typecheck')
    expect(ci).toContain('pnpm test')
    expect(ci).toContain('demo-path --project=phone --workers=1')
    expect(ci).toContain('.jemma/logs/')
  })
})

describe('no em dash in the one-command files', () => {
  const files = [
    'start.sh',
    'LICENSE',
    'README.md',
    '.env.example',
    '.gitignore',
    '.github/workflows/ci.yml',
    'supabase/config.toml',
    'apps/agent/wrangler.local.jsonc',
    'scripts/export-replays.ts',
    'scripts/load-replays.ts',
    'scripts/proof/run-real-job.ts',
    'docs/runbook.md',
  ]
  test.each(files)('%s', (file) => {
    expect(read(file).includes(EM_DASH)).toBe(false)
  })
})
