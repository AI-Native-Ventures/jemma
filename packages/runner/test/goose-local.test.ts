import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import {
  DEFAULT_LOCAL_MODEL,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OPEN_FALLBACKS,
  DEFAULT_OPEN_MODEL,
  detectGoose,
  gooseEnv,
  gooseModels,
  gooseProvider,
  gooseRecipe,
  localSetupProblem,
  ollamaHost,
  runJob,
} from '../src'
import { newLog, readLog, useFakes } from './helpers'

// The goose path can run on a model on this computer (Ollama). Nothing here calls a model, a database or a server: the
// goose in these tests is the fake one, and the Jemma server address points at nothing.

const mcp = { url: 'https://agent.example.test/mcp', token: 'tok-secret-123' }

describe('the OpenRouter path is exactly what it was before the local option existed', () => {
  test('the recipe, byte for byte', () => {
    const text = gooseRecipe({ prompt: 'Read the paper.\nThen "finish" it.', mcp, reportsDir: '/data/reports', model: 'vendor/model:free' })
    expect(text).toBe(
      [
        'version: 1.0.0',
        'title: Jemma job',
        'description: Runs one Jemma job through the Jemma MCP server and the borrowed filesystem server',
        'prompt: "Read the paper.\\nThen \\"finish\\" it."',
        'extensions:',
        '  - type: streamable_http',
        '    name: jemma',
        '    uri: "https://agent.example.test/mcp"',
        '    headers:',
        '      Authorization: "Bearer tok-secret-123"',
        '    timeout: 300',
        '  - type: stdio',
        '    name: files',
        '    cmd: npx',
        '    args: ["-y", "@modelcontextprotocol/server-filesystem@2.2.0", "--confine-roots", "/data/reports"]',
        '    timeout: 300',
        'settings:',
        '  goose_provider: openrouter',
        '  goose_model: "vendor/model:free"',
        '',
      ].join('\n'),
    )
  })

  test('naming the provider openrouter changes nothing', () => {
    const input = { prompt: 'p', mcp, reportsDir: '/r', model: 'm' }
    expect(gooseRecipe({ ...input, provider: 'openrouter' })).toBe(gooseRecipe(input))
  })

  test('the child environment, exactly', () => {
    const base = { OPENROUTER_API_KEY: 'or-key', PATH: '/bin', HOME: '/home/x', OLLAMA_HOST: 'somewhere:1' }
    expect(gooseEnv(base, 'tok', '/tmp/job/goose-home')).toStrictEqual({
      OPENROUTER_API_KEY: 'or-key',
      PATH: '/bin',
      HOME: '/home/x',
      OLLAMA_HOST: 'somewhere:1',
      GOOSE_DISABLE_KEYRING: '1',
      GOOSE_PATH_ROOT: '/tmp/job/goose-home',
      JEMMA_MCP_TOKEN: 'tok',
    })
    // no key in the parent: the name is still there, with no value, as before
    expect(Object.keys(gooseEnv({ PATH: '/bin' }, 'tok', '/h')).sort()).toEqual(['GOOSE_DISABLE_KEYRING', 'GOOSE_PATH_ROOT', 'JEMMA_MCP_TOKEN', 'OPENROUTER_API_KEY', 'PATH'])
  })

  test('the model list: the open model, then the fallbacks, once each', () => {
    expect(gooseModels({})).toEqual([DEFAULT_OPEN_MODEL, ...DEFAULT_OPEN_FALLBACKS.split(',')])
    expect(gooseModels({ JEMMA_GOOSE_PROVIDER: 'openrouter', JEMMA_OPEN_MODEL: 'a/b:free', JEMMA_OPEN_MODEL_FALLBACKS: 'c/d' })).toEqual(['a/b:free', 'c/d'])
  })
})

describe('the provider choice', () => {
  test('openrouter is the default, ollama is the other value, anything else is refused', () => {
    expect(gooseProvider({})).toBe('openrouter')
    expect(gooseProvider({ JEMMA_GOOSE_PROVIDER: '' })).toBe('openrouter')
    expect(gooseProvider({ JEMMA_GOOSE_PROVIDER: '  ' })).toBe('openrouter')
    expect(gooseProvider({ JEMMA_GOOSE_PROVIDER: 'openrouter' })).toBe('openrouter')
    expect(gooseProvider({ JEMMA_GOOSE_PROVIDER: 'ollama' })).toBe('ollama')
    expect(gooseProvider({ JEMMA_GOOSE_PROVIDER: ' Ollama ' })).toBe('ollama')
    // a typo must never fall back to the cloud
    expect(() => gooseProvider({ JEMMA_GOOSE_PROVIDER: 'olama' })).toThrow(/openrouter or ollama/)
  })

  test('the local model: one model, never a fallback list', () => {
    expect(gooseModels({ JEMMA_GOOSE_PROVIDER: 'ollama' })).toEqual([DEFAULT_LOCAL_MODEL])
    expect(DEFAULT_LOCAL_MODEL).toBe('gemma4:26b')
    expect(gooseModels({ JEMMA_GOOSE_PROVIDER: 'ollama', JEMMA_OPEN_MODEL: ' gemma4:12b ' })).toEqual(['gemma4:12b'])
    // the cloud fallbacks are ignored, whatever is set
    expect(gooseModels({ JEMMA_GOOSE_PROVIDER: 'ollama', JEMMA_OPEN_MODEL: 'gemma4:12b', JEMMA_OPEN_MODEL_FALLBACKS: 'google/gemma-4-31b-it:free,nvidia/x:free' })).toEqual(['gemma4:12b'])
  })

  test('the Ollama address: 127.0.0.1:11434 unless OLLAMA_HOST says otherwise, and a missing scheme or port is filled in', () => {
    expect(DEFAULT_OLLAMA_HOST).toBe('http://127.0.0.1:11434')
    expect(ollamaHost({})).toEqual({ url: 'http://127.0.0.1:11434', hostname: '127.0.0.1', port: 11434, local: true })
    expect(ollamaHost({ OLLAMA_HOST: '' }).url).toBe('http://127.0.0.1:11434')
    expect(ollamaHost({ OLLAMA_HOST: 'localhost:11434' })).toEqual({ url: 'http://localhost:11434', hostname: 'localhost', port: 11434, local: true })
    expect(ollamaHost({ OLLAMA_HOST: '127.0.0.1' }).url).toBe('http://127.0.0.1:11434')
    expect(ollamaHost({ OLLAMA_HOST: 'http://127.0.0.1:5555/' })).toMatchObject({ url: 'http://127.0.0.1:5555', port: 5555, local: true })
    expect(ollamaHost({ OLLAMA_HOST: 'http://[::1]:11434' })).toMatchObject({ url: 'http://[::1]:11434', local: true })
    // not this computer
    for (const host of ['192.168.1.5:11434', 'https://ollama.com', 'http://example.org:11434', '0.0.0.0:11434']) expect(ollamaHost({ OLLAMA_HOST: host }).local, host).toBe(false)
    expect(ollamaHost({ OLLAMA_HOST: 'https://ollama.com' }).hostname).toBe('ollama.com')
    expect(() => ollamaHost({ OLLAMA_HOST: 'not a host!!' })).toThrow(/OLLAMA_HOST/)
  })

  test('a local run is refused for a cloud tag, an OpenRouter id or an address that is not this computer', () => {
    const ok = ollamaHost({})
    expect(localSetupProblem(ok, ['gemma4:26b'])).toBeNull()
    expect(localSetupProblem(ok, ['gemma4:12b-it-q4_K_M'])).toBeNull()
    expect(localSetupProblem(ok, ['hf.co/someone/some-model:Q4_K_M'])).toBeNull()
    for (const tag of ['gemma4:cloud', 'gemma4:31b-cloud', 'Gemma4:CLOUD']) expect(localSetupProblem(ok, [tag]), tag).toMatch(/cloud/i)
    for (const id of ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-super-vl:free']) expect(localSetupProblem(ok, [id]), id).toMatch(/OpenRouter/)
    expect(localSetupProblem(ok, ['gemma4:26b', 'gemma4:cloud'])).toMatch(/gemma4:cloud/)
    expect(localSetupProblem(ok, [])).toMatch(/no model/i)
    expect(localSetupProblem(ollamaHost({ OLLAMA_HOST: 'https://ollama.com' }), ['gemma4:26b'])).toMatch(/ollama\.com/)
    expect(localSetupProblem(ollamaHost({ OLLAMA_HOST: '192.168.1.5' }), ['gemma4:26b'])).toMatch(/not this computer/)
  })
})

describe('the Ollama recipe and environment', () => {
  const input = { prompt: 'Read the paper.', mcp, reportsDir: '/data/reports', model: 'gemma4:26b' }

  test('the recipe differs from the OpenRouter one only in the provider line', () => {
    const local = gooseRecipe({ ...input, provider: 'ollama' })
    expect(local).toContain('  goose_provider: ollama\n')
    expect(local).toContain('  goose_model: "gemma4:26b"\n')
    expect(local.toLowerCase()).not.toContain('openrouter')
    expect(local).toBe(gooseRecipe({ ...input, provider: 'openrouter' }).replace('goose_provider: openrouter', 'goose_provider: ollama'))
  })

  test('the child gets the Ollama address and no cloud model key of any kind', () => {
    const base = {
      PATH: '/bin',
      HOME: '/home/x',
      OPENROUTER_API_KEY: 'or-secret-1',
      OPENAI_API_KEY: 'oa-secret-2',
      ANTHROPIC_API_KEY: 'an-secret-3',
      GOOGLE_API_KEY: 'go-secret-4',
      OLLAMA_API_KEY: 'ol-secret-5',
      OLLAMA_CLOUD_API_KEY: 'ol-secret-6',
      ANTHROPIC_AUTH_TOKEN: 'an-secret-7',
      AWS_SECRET_ACCESS_KEY: 'aws-secret-8',
      GOOSE_PROVIDER: 'openrouter',
      GOOSE_MODEL: 'nvidia/x:free',
      GOOSE_LEAD_PROVIDER: 'openrouter',
      GOOSE_LEAD_MODEL: 'big/model',
      GOOSE_PLANNER_PROVIDER: 'openai',
    }
    const env = gooseEnv(base, 'tok', '/tmp/job/goose-home', 'ollama')
    expect(JSON.stringify(env)).not.toMatch(/secret/)
    for (const name of ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'OLLAMA_API_KEY', 'OLLAMA_CLOUD_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'GOOSE_LEAD_PROVIDER', 'GOOSE_LEAD_MODEL', 'GOOSE_PLANNER_PROVIDER', 'GOOSE_MODEL']) {
      expect(name in env, name).toBe(false)
    }
    expect(env).toStrictEqual({
      PATH: '/bin',
      HOME: '/home/x',
      GOOSE_PROVIDER: 'ollama',
      OLLAMA_HOST: 'http://127.0.0.1:11434',
      GOOSE_TELEMETRY_OFF: '1',
      GOOSE_DISABLE_KEYRING: '1',
      GOOSE_PATH_ROOT: '/tmp/job/goose-home',
      JEMMA_MCP_TOKEN: 'tok',
    })
  })

  test('OLLAMA_HOST from the parent is written out in full', () => {
    expect(gooseEnv({ OLLAMA_HOST: 'localhost:11434' }, 't', '/h', 'ollama').OLLAMA_HOST).toBe('http://localhost:11434')
  })
})

describe('detectGoose with the local option', () => {
  let restore: () => void
  const saved = { key: process.env.OPENROUTER_API_KEY, provider: process.env.JEMMA_GOOSE_PROVIDER }
  beforeAll(() => {
    restore = useFakes()
  })
  afterAll(() => {
    restore()
    for (const [name, value] of [['OPENROUTER_API_KEY', saved.key], ['JEMMA_GOOSE_PROVIDER', saved.provider]] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  test('a local model needs no key, so goose counts as signed in; a missing key still means not signed in for OpenRouter', async () => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.JEMMA_GOOSE_PROVIDER
    expect(await detectGoose()).toEqual({ installed: true, version: '1.45.0', signedIn: false })
    process.env.JEMMA_GOOSE_PROVIDER = 'ollama'
    expect(await detectGoose()).toEqual({ installed: true, version: '1.45.0', signedIn: true })
    process.env.JEMMA_GOOSE_PROVIDER = 'nonsense'
    expect((await detectGoose()).signedIn).toBe(false)
  })
})

describe('runJob on the local model, with the fake goose', () => {
  const prompt = ['You are running one Jemma job for event evt-1.', 'Job: class_report', 'Ids: {"classId":"class-1","testId":"test-1"}', '', 'Use only the Jemma MCP tools.'].join('\n')
  const job = { eventId: 'evt-1', prompt }
  // nothing listens here: goose is fake, and the cost report after the run fails quietly
  const target = { url: 'http://127.0.0.1:9/mcp', token: 'tok-secret' }
  const NAMES = ['JEMMA_GOOSE_PROVIDER', 'JEMMA_OPEN_MODEL', 'JEMMA_OPEN_MODEL_FALLBACKS', 'OLLAMA_HOST', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'FAKE_MODE']
  const saved = new Map<string, string | undefined>()
  let restore: () => void
  let log: string
  let reports: string

  beforeAll(() => {
    restore = useFakes()
  })
  afterAll(() => restore())
  beforeEach(() => {
    for (const name of NAMES) saved.set(name, process.env[name])
    log = newLog()
    delete process.env.FAKE_GOOSE_MODES
    process.env.FAKE_MODE = 'done'
    process.env.JEMMA_GOOSE_PROVIDER = 'ollama'
    process.env.JEMMA_OPEN_MODEL = 'gemma4:26b'
    // a cloud setup that is still lying around in the shell
    process.env.JEMMA_OPEN_MODEL_FALLBACKS = 'google/gemma-4-31b-it:free,nvidia/nemotron-3.5-lightning:free'
    process.env.OPENROUTER_API_KEY = 'or-key-xyz'
    process.env.OPENAI_API_KEY = 'oa-key-xyz'
    delete process.env.OLLAMA_HOST
    reports = mkdtempSync(join(tmpdir(), 'jemma-reports-'))
  })
  afterEach(() => {
    rmSync(reports, { recursive: true, force: true })
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  const options = (extra: Record<string, unknown> = {}) => ({ timeoutMs: 20_000, reportsDir: reports, ...extra })
  const runs = () => readLog(log).filter((l) => l.bin === 'goose')

  test('goose is given the Ollama provider and the local model, and sees no cloud key', async () => {
    const res = await runJob(job, 'goose', target, options())
    expect(res).toEqual({ status: 'done', note: 'All finished.' })
    const [call, ...more] = runs()
    expect(more).toHaveLength(0)
    expect(call!.recipe).toContain('goose_provider: ollama')
    expect(call!.recipe).toContain('goose_model: "gemma4:26b"')
    expect(call!.recipe.toLowerCase()).not.toContain('openrouter')
    expect(call!.model).toBe('gemma4:26b')
    expect(call!.key).toBeNull()
    expect(call!.ollamaHost).toBe('http://127.0.0.1:11434')
    expect(call!.gooseProvider).toBe('ollama')
    expect(call!.keyring).toBe('1')
    expect(call!.token).toBe('tok-secret')
    const names: string[] = call!.envNames
    expect(names).not.toContain('OPENROUTER_API_KEY')
    expect(names).not.toContain('OPENAI_API_KEY')
    expect(names.filter((n) => /API_KEY|AUTH_TOKEN|BEARER_TOKEN/.test(n))).toEqual([])
  })

  test('a failed attempt is a failed attempt: no second model, and no cloud model, is ever tried', async () => {
    process.env.FAKE_MODE = 'provider_error'
    const attempts: string[] = []
    const res = await runJob(job, 'goose', target, options({ onAttempt: (a: { model: string }) => attempts.push(a.model) }))
    expect(res.status).toBe('failed')
    expect(runs()).toHaveLength(1)
    expect(attempts).toEqual(['gemma4:26b'])
  })

  test('a cloud tag stops the run before goose starts', async () => {
    process.env.JEMMA_OPEN_MODEL = 'gemma4:cloud'
    const res = await runJob(job, 'goose', target, options())
    expect(res.status).toBe('failed')
    expect(res.note).toMatch(/cloud/i)
    expect(res.note).not.toContain(String.fromCharCode(0x2014))
    expect(runs()).toHaveLength(0)
  })

  test('an address that is not this computer stops the run before goose starts', async () => {
    process.env.OLLAMA_HOST = 'https://ollama.com'
    const res = await runJob(job, 'goose', target, options())
    expect(res.status).toBe('failed')
    expect(res.note).toMatch(/not this computer/)
    expect(runs()).toHaveLength(0)
  })

  test('a model list from the caller is checked too', async () => {
    const res = await runJob(job, 'goose', target, options({ models: ['gemma4:26b', 'google/gemma-4-31b-it:free'] }))
    expect(res.status).toBe('failed')
    expect(res.note).toMatch(/OpenRouter/)
    expect(runs()).toHaveLength(0)
  })

  test('a mistyped provider stops the run instead of falling back to the cloud', async () => {
    process.env.JEMMA_GOOSE_PROVIDER = 'olama'
    const res = await runJob(job, 'goose', target, options())
    expect(res.status).toBe('failed')
    expect(res.note).toMatch(/openrouter or ollama/)
    expect(runs()).toHaveLength(0)
  })

  test('with no provider set the job still goes through OpenRouter with the key, as before', async () => {
    delete process.env.JEMMA_GOOSE_PROVIDER
    const res = await runJob(job, 'goose', target, options({ models: ['model-a:free'] }))
    expect(res.status).toBe('done')
    const [call] = runs()
    expect(call!.recipe).toContain('goose_provider: openrouter')
    expect(call!.key).toBe('or-key-xyz')
    expect(call!.ollamaHost).toBeNull()
  })
})
