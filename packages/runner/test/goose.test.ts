import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import {
  DEFAULT_OPEN_FALLBACKS,
  DEFAULT_OPEN_MODEL,
  FILESYSTEM_SERVER_VERSION,
  detectAgents,
  detectGoose,
  ensureReportsDir,
  gooseArgs,
  gooseJobPrompt,
  gooseModels,
  gooseRecipe,
  jobFromPrompt,
  reportFileFor,
  reportsDirPath,
  writeGooseRecipe,
} from '../src'
import { findBin } from '../src/exec'
import { useFakes } from './helpers'

const mcp = { url: 'https://agent.example.test/mcp', token: 'tok-secret-123' }
const header = (job: string, ids: Record<string, string>) =>
  [`You are running one Jemma job for event evt-1.`, `Job: ${job}`, `Ids: ${JSON.stringify(ids)}`, '', 'Use only the Jemma MCP tools.'].join('\n')

let restore: () => void
beforeAll(() => {
  restore = useFakes()
})
afterAll(() => restore())

test('the recipe carries the two servers, the model and the prompt, and the token only in the file', () => {
  const text = gooseRecipe({ prompt: 'Read the paper.\nThen "finish" it.', mcp, reportsDir: '/data/reports', model: 'vendor/model:free' })
  expect(text).toContain('type: streamable_http')
  expect(text).toContain('name: jemma')
  expect(text).toContain('uri: "https://agent.example.test/mcp"')
  expect(text).toContain('Authorization: "Bearer tok-secret-123"')
  expect(text).toContain('type: stdio')
  expect(text).toContain('name: files')
  expect(text).toContain('cmd: npx')
  expect(text).toContain(`args: ["-y", "@modelcontextprotocol/server-filesystem@${FILESYSTEM_SERVER_VERSION}", "/data/reports"]`)
  expect(text.match(/timeout: 300/g)).toHaveLength(2)
  expect(text).toContain('goose_provider: openrouter')
  expect(text).toContain('goose_model: "vendor/model:free"')
  expect(text).toContain('prompt: "Read the paper.\\nThen \\"finish\\" it."')
  expect(FILESYSTEM_SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
})

test('template openers in a prompt stay literal', () => {
  const text = gooseRecipe({ prompt: 'a {{ b }} c {% d %} e {# f #} g { h }', mcp, reportsDir: '/r', model: 'm' })
  expect(text).toContain("a {{ '{{' }} b }} c {{ '{%' }} d %} e {{ '{#' }} f #} g { h }")
})

test('the recipe file is written with mode 0600 and the arguments never hold the token', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jemma-recipe-'))
  const file = writeGooseRecipe(dir, { prompt: 'p', mcp, reportsDir: '/r', model: 'm' })
  expect(statSync(file).mode & 0o777).toBe(0o600)
  expect(readFileSync(file, 'utf8')).toContain(mcp.token)
  const args = gooseArgs(file)
  expect(args.join(' ')).not.toContain(mcp.token)
  expect(args.join(' ')).not.toContain('Bearer')
})

test('goose runs from the recipe with no session, no profile, 20 turns and stream-json', () => {
  expect(gooseArgs('/tmp/job/recipe.yaml')).toEqual([
    'run', '--recipe', '/tmp/job/recipe.yaml', '--no-session', '--no-profile', '--max-turns', '20', '--output-format', 'stream-json',
  ])
})

test('models: the open model first, then the fallbacks, once each', () => {
  expect(gooseModels({})).toEqual([DEFAULT_OPEN_MODEL, ...DEFAULT_OPEN_FALLBACKS.split(',')])
  expect(DEFAULT_OPEN_MODEL).toBe('nvidia/nemotron-3.5-super-vl:free')
  expect(DEFAULT_OPEN_FALLBACKS).toBe('nvidia/nemotron-3.5-lightning:free,nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free')
  expect(gooseModels({ JEMMA_OPEN_MODEL: ' a/b:free ', JEMMA_OPEN_MODEL_FALLBACKS: 'c/d, a/b:free ,,e/f' })).toEqual(['a/b:free', 'c/d', 'e/f'])
  expect(gooseModels({ JEMMA_OPEN_MODEL: 'a/b', JEMMA_OPEN_MODEL_FALLBACKS: '' })).toEqual(['a/b'])
})

test('the reports folder defaults to <home>/Jemma/reports and is created when missing', () => {
  const home = mkdtempSync(join(tmpdir(), 'jemma-home-'))
  expect(reportsDirPath({}, home)).toBe(join(home, 'Jemma', 'reports'))
  const made = ensureReportsDir({}, home)
  expect(existsSync(join(home, 'Jemma', 'reports'))).toBe(true)
  expect(made.endsWith(join('Jemma', 'reports'))).toBe(true)
  const custom = join(home, 'elsewhere', 'out')
  expect(reportsDirPath({ JEMMA_REPORTS_DIR: custom }, home)).toBe(custom)
  expect(ensureReportsDir({ JEMMA_REPORTS_DIR: custom }, home).endsWith(join('elsewhere', 'out'))).toBe(true)
})

test('the job and its first id come from the prompt header', () => {
  expect(jobFromPrompt(header('class_report', { classId: 'c-1', testId: 't-1' }))).toEqual({ job: 'class_report', firstId: 'c-1' })
  expect(jobFromPrompt(header('guidance', { childId: 'kid-9' }))).toEqual({ job: 'guidance', firstId: 'kid-9' })
  expect(jobFromPrompt('no header here')).toBeNull()
})

test('only class_report and guidance are asked for a Markdown copy of what they saved', () => {
  const reports = '/data/reports'
  const sentence = (file: string) =>
    `After the save tool succeeds and before complete_job, write a plain-language Markdown copy of what you saved to the file ${file} with the files write_file tool. Every claim keeps its source (question numbers, or the note it came from). Then call complete_job.`

  const report = header('class_report', { classId: 'c-1', testId: 't-1' })
  const withCopy = gooseJobPrompt(report, reports)
  expect(withCopy.startsWith(report)).toBe(true)
  expect(withCopy).toContain(sentence('/data/reports/class_report-c-1.md'))

  const guidance = header('guidance', { childId: 'kid-9' })
  expect(gooseJobPrompt(guidance, reports)).toContain(sentence('/data/reports/guidance-kid-9.md'))

  for (const job of ['read_paper', 'write_lesson', 'diagnose', 'draft_map']) {
    const prompt = header(job, { paperId: 'p-1' })
    expect(gooseJobPrompt(prompt, reports)).toBe(prompt)
  }
  expect(gooseJobPrompt('a prompt with no header', reports)).toBe('a prompt with no header')
  expect(reportFileFor(reports, 'class_report', '../x/y')).toBe('/data/reports/class_report-.._x_y.md')
})

test('detectGoose: installed, its version, and signed in means the OpenRouter key is set', async () => {
  const saved = process.env.OPENROUTER_API_KEY
  try {
    process.env.OPENROUTER_API_KEY = 'or-key'
    expect(await detectGoose()).toEqual({ installed: true, version: '1.45.0', signedIn: true })
    process.env.OPENROUTER_API_KEY = '  '
    expect((await detectGoose()).signedIn).toBe(false)
    delete process.env.OPENROUTER_API_KEY
    expect(await detectGoose()).toEqual({ installed: true, version: '1.45.0', signedIn: false })
  } finally {
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = saved
  }
})

test('detectGoose: a missing goose is reported as not installed, and detectAgents keeps its shape', async () => {
  const savedPath = process.env.PATH
  process.env.PATH = '/nonexistent-dir'
  try {
    expect(await detectGoose({ extraDirs: [] })).toEqual({ installed: false, version: null, signedIn: false })
  } finally {
    process.env.PATH = savedPath
  }
  const found = await detectAgents()
  expect(Object.keys(found).sort()).toEqual(['claude', 'codex'])
})

// The real goose, offline: no model, no network. Skipped on a machine without goose.
const realGoose = findBin('goose') // looked up at load time, before the fakes go on PATH
test.skipIf(!realGoose)('the real goose accepts the recipe and keeps template openers literal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jemma-recipe-'))
  const file = writeGooseRecipe(dir, { prompt: 'Keep {{ name }} and {% x %} and {# y #} and {{{ z }}} as they are.', mcp, reportsDir: '/tmp', model: 'vendor/model:free' })
  const env = { ...process.env, GOOSE_DISABLE_KEYRING: '1' }
  execFileSync(realGoose!, ['recipe', 'validate', file], { env, stdio: 'pipe' })
  const rendered = execFileSync(realGoose!, ['run', '--recipe', file, '--render-recipe'], { env, encoding: 'utf8' })
  expect(rendered).toContain('Keep {{ name }} and {% x %} and {# y #} and {{{ z }}} as they are.')
  expect(rendered).toContain(`server-filesystem@${FILESYSTEM_SERVER_VERSION}`)
})
