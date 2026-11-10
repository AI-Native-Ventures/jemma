import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { McpTarget } from './run'

/**
 * Goose (open-source agent, Apache-2.0) driving a free open-weights model on OpenRouter, with Jemma's own MCP
 * server and one borrowed MCP server: the official filesystem server, limited to the reports folder.
 *
 * Borrowed: the official MCP filesystem server, because sandboxed, allow-listed file access with path-escape
 * protection is security code we should not write and audit ourselves.
 */

export const DEFAULT_OPEN_MODEL = 'nvidia/nemotron-3.5-super-vl:free'
export const DEFAULT_OPEN_FALLBACKS =
  'nvidia/nemotron-3.5-lightning:free,nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free'
export const FILESYSTEM_SERVER = '@modelcontextprotocol/server-filesystem'
/** Pinned after checking npm on 10 Nov 2026 (latest dist-tag). The file tools it serves: write_file, read_text_file, list_directory and more. */
export const FILESYSTEM_SERVER_VERSION = '2.2.0'
export const GOOSE_MAX_TURNS = '20'
const EXTENSION_TIMEOUT_SECONDS = 300

/** Jobs whose result is also written to the school's own computer as a Markdown copy. */
const REPORT_COPY_JOBS = new Set(['class_report', 'guidance'])

type Env = Record<string, string | undefined>

const list = (text: string) => text.split(',').map((m) => m.trim()).filter(Boolean)

/** The model to try first, then the fallbacks, each once, no repeats. */
export function gooseModels(env: Env = process.env): string[] {
  const first = env.JEMMA_OPEN_MODEL?.trim() || DEFAULT_OPEN_MODEL
  const rest = list(env.JEMMA_OPEN_MODEL_FALLBACKS ?? DEFAULT_OPEN_FALLBACKS)
  return [...new Set([first, ...rest])]
}

/** `JEMMA_REPORTS_DIR`, else `<home>/Jemma/reports`. Does not create it. */
export function reportsDirPath(env: Env = process.env, home: string = homedir()): string {
  return env.JEMMA_REPORTS_DIR?.trim() || join(home, 'Jemma', 'reports')
}

/** Creates the reports folder if it is missing and returns its real path (the file server wants the real one). */
export function ensureReportsDir(env: Env = process.env, home: string = homedir()): string {
  const dir = reportsDirPath(env, home)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return realpathSync(dir)
}

/** The job name and the first id value from the header `buildPrompt` puts on every job prompt. */
export function jobFromPrompt(prompt: string): { job: string; firstId: string } | null {
  const job = prompt.match(/^Job: ([A-Za-z0-9_]+)\s*$/m)?.[1]
  const idsText = prompt.match(/^Ids: (\{.*\})\s*$/m)?.[1]
  if (!job || !idsText) return null
  try {
    const first = Object.values(JSON.parse(idsText) as Record<string, unknown>)[0]
    return typeof first === 'string' || typeof first === 'number' ? { job, firstId: String(first) } : null
  } catch {
    return null
  }
}

/** The path of the report copy for one job, inside the reports folder. */
export function reportFileFor(reportsDir: string, job: string, firstId: string): string {
  return join(reportsDir, `${job}-${firstId.replace(/[^A-Za-z0-9._-]/g, '_')}.md`)
}

/**
 * For `class_report` and `guidance` only: ask for a plain Markdown copy of what was saved, written with the borrowed
 * file server before `complete_job`. Every other job keeps its prompt as it is.
 */
export function gooseJobPrompt(prompt: string, reportsDir: string): string {
  const seen = jobFromPrompt(prompt)
  if (!seen || !REPORT_COPY_JOBS.has(seen.job)) return prompt
  const file = reportFileFor(reportsDir, seen.job, seen.firstId)
  return [
    prompt,
    '',
    'Extra step for this run, and it is allowed even though the lines above say to use only the Jemma tools.',
    `After the save tool succeeds and before complete_job, write a plain-language Markdown copy of what you saved to the file ${file} with the files write_file tool. Every claim keeps its source (question numbers, or the note it came from). Then call complete_job.`,
  ].join('\n')
}

/**
 * Goose reads `{{ name }}` and `{% tag %}` in a recipe as a template. A job prompt is plain text that may hold them,
 * so each opener becomes a template expression that prints it: `{{` is written `{{ '{{' }}`, and so on. (A `raw`
 * block does not work for `{{`: goose's template engine rejects `{{{% endraw %}`.)
 */
function literal(text: string): string {
  return text.replace(/\{[{%#]/g, (opener) => `{{ '${opener}' }}`)
}

/** Characters that YAML may read as a line break inside a quoted string. */
const LINE_BREAKS = new RegExp('[' + String.fromCharCode(0x2028, 0x2029, 0x85) + ']', 'g')

/** A YAML double-quoted string (JSON strings are valid YAML), with the template openers kept literal. */
function quoted(text: string): string {
  return JSON.stringify(literal(text)).replace(LINE_BREAKS, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

export type GooseRecipeInput = { prompt: string; mcp: McpTarget; reportsDir: string; model: string }

/**
 * The recipe file text. The file server gets `--confine-roots`: goose tells it its own working folder as a "root", and
 * without the flag that root replaces the reports folder, so the server would be limited to the job's temp folder (where
 * this recipe, with the bearer token, lives) instead. With the flag a root outside the reports folder is ignored.
 * The Jemma server comes in with its bearer token in `headers`, so the file must be written
 * with mode 0600 and the token never appears in argv. The prompt is the recipe's `prompt`, so stdin is not used.
 */
export function gooseRecipe({ prompt, mcp, reportsDir, model }: GooseRecipeInput): string {
  return [
    'version: 1.0.0',
    'title: Jemma job',
    'description: Runs one Jemma job through the Jemma MCP server and the borrowed filesystem server',
    `prompt: ${quoted(prompt)}`,
    'extensions:',
    '  - type: streamable_http',
    '    name: jemma',
    `    uri: ${quoted(mcp.url)}`,
    '    headers:',
    `      Authorization: ${quoted(`Bearer ${mcp.token}`)}`,
    `    timeout: ${EXTENSION_TIMEOUT_SECONDS}`,
    '  - type: stdio',
    '    name: files',
    '    cmd: npx',
    `    args: [${['-y', `${FILESYSTEM_SERVER}@${FILESYSTEM_SERVER_VERSION}`, '--confine-roots', reportsDir].map(quoted).join(', ')}]`,
    `    timeout: ${EXTENSION_TIMEOUT_SECONDS}`,
    'settings:',
    '  goose_provider: openrouter',
    `  goose_model: ${quoted(model)}`,
    '',
  ].join('\n')
}

/** Writes the recipe into the job's temp folder, readable by this user only. Returns its path. */
export function writeGooseRecipe(dir: string, input: GooseRecipeInput): string {
  const file = join(dir, 'recipe.yaml')
  writeFileSync(file, gooseRecipe(input), { mode: 0o600 })
  return file
}

/**
 * No session file, at most 20 turns, one JSON event per line. Not `--no-profile`: in goose 1.45.0 that flag also drops
 * the recipe's own extensions (the model is then offered no tools at all, checked on 10 Nov 2026). Goose's default
 * extensions are kept out another way: `gooseEnv` points goose at an empty config folder of its own.
 */
export function gooseArgs(recipeFile: string): string[] {
  return ['run', '--recipe', recipeFile, '--no-session', '--max-turns', GOOSE_MAX_TURNS, '--output-format', 'stream-json']
}

/** Where goose keeps its config, sessions and logs for one job: inside the job's temp folder, gone when the job ends. */
export function gooseHome(dir: string): string {
  return join(dir, 'goose-home')
}

/**
 * Goose's child environment: the OpenRouter key goes through, the keychain is off, the token is the user's, and goose
 * uses an empty config folder (`GOOSE_PATH_ROOT`), so no extension from the user's own goose setup can load and its
 * request logs do not outlive the job.
 */
export function gooseEnv(base: Env, token: string, home: string): Record<string, string | undefined> {
  return { ...base, OPENROUTER_API_KEY: base.OPENROUTER_API_KEY, GOOSE_DISABLE_KEYRING: '1', GOOSE_PATH_ROOT: home, JEMMA_MCP_TOKEN: token }
}
