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

describe('start.sh only ever talks to the local database', () => {
  const script = read('start.sh')
  const codeLines = script.split('\n').filter((line) => !/^\s*#/.test(line))
  const code = codeLines.join('\n')
  // Every call goes through `sb ...`: collect what follows it.
  const calls = [...code.matchAll(/(?:^|[\s(])sb\s+([^\n;|&)"]*)/g)].map((m) => m[1]!.replace(/\s*\d*>\S*/g, '').trim())

  test('the Supabase command line is run in exactly one place, the sb helper', () => {
    expect(code.match(/exec supabase/g)).toHaveLength(1)
    const helper = code.slice(code.indexOf('sb() {'), code.indexOf('\n}\n', code.indexOf('sb() {')))
    expect(helper).toContain('exec supabase "$@"')
    expect(helper).toContain('cli_guard')
    expect(helper).toContain('-u SUPABASE_ACCESS_TOKEN')
    expect(helper).toContain('-u SUPABASE_PROJECT_ID')
    expect(helper).toContain('-u SUPABASE_DB_PASSWORD')
    expect(helper).toContain('DO_NOT_TRACK=1')
  })

  test('only start, stop, status and db reset --local are used', () => {
    expect(calls.length).toBeGreaterThanOrEqual(4)
    const allowed = [/^start$/, /^stop$/, /^status -o env$/, /^db reset --local$/]
    expect(calls.filter((call) => !allowed.some((ok) => ok.test(call)))).toEqual([])
    for (const wanted of ['start', 'stop', 'status -o env', 'db reset --local']) expect(calls, wanted).toContain(wanted)
  })

  test('never links, lists projects, reads services, pushes, or names a hosted project', () => {
    const banned = ['--linked', '--project-ref', '--db-url', 'sb link', 'sb login', 'sb projects', 'sb services', 'sb db push', 'sb migration', 'sb gen', 'sb functions', 'sb secrets']
    for (const word of banned) expect(code, word).not.toContain(word)
    expect(code).not.toMatch(/supabase\s+(link|login|projects|services|db push|migration|gen|functions|secrets|branches|orgs)\b/)
  })

  test('the .env.local it writes holds no SUPABASE_PROJECT_ID, token or password', () => {
    expect(code).not.toMatch(/echo "SUPABASE_(PROJECT_ID|ACCESS_TOKEN|DB_PASSWORD)=/)
    expect(code).toContain('echo "SUPABASE_URL=$api_url"')
  })

  test('stops before the command line when an env file could reach a hosted project', () => {
    expect(code).toContain('cli_guard()')
    for (const key of ['SUPABASE_PROJECT_ID', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD']) expect(code).toContain(key)
    expect(code).toContain('supabase/.temp/project-ref')
    // The guard runs in step 1, before the first call, and --force sets the old .env.local aside before any call.
    expect(code.indexOf('\ncli_guard\n')).toBeGreaterThan(-1)
    expect(code.indexOf('mv .env.local .env.local.bak')).toBeGreaterThan(-1)
    expect(code.indexOf('mv .env.local .env.local.bak')).toBeLessThan(code.indexOf('run_logged supabase sb start'))
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
    // Nothing from a worker's own machine belongs in a workflow that runs on GitHub.
    expect(ci).not.toContain('.claude')
    expect(ci).not.toContain('heavy-run')
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
