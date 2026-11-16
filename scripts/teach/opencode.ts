import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * One call of an OpenCode free model, with no tools and no files of ours around it.
 *
 * What was learned on 16 Nov 2026 (OpenCode 1.18.25), and why the code does what it does:
 * - A model that has used up its free quota prints NOTHING to stdout and OpenCode retries for ever. The only sign is a log line on stderr
 *   ("Free usage limit reached"), and only with `--print-logs --log-level ERROR`. So the limit is read from stderr and the child is killed.
 * - `-f` takes a list, so a message written after it is read as a second file. The message goes first and `-f` last.
 * - The global OpenCode config of this computer can hold MCP servers and plugins. A run gets its own empty config folder (XDG_CONFIG_HOME)
 *   and a project config in a fresh temp folder that denies every tool, so a model cannot reach any file, command or server.
 * - `--title` stops OpenCode from spending a model call on a session title.
 */

export type RunResult = { text: string; tokensIn?: number; tokensOut?: number; limited: boolean; error?: string }
export type RunOpts = { timeoutMs: number }
/** Anything that can answer a prompt with one model: `runOpencode` for real, a fake in the tests. */
export type Runner = (model: string, prompt: string, opts: RunOpts) => Promise<RunResult>

export const LIMIT_TEXT = /Free usage limit reached/i
const STREAM_ERROR = /level=ERROR[^\n]*stream error/i

/** Every tool and permission denied: the model gets the prompt and answers, nothing else. */
export const DENY_ALL_CONFIG = {
  $schema: 'https://opencode.ai/config.json',
  permission: {
    '*': 'deny',
    bash: 'deny',
    edit: 'deny',
    read: 'deny',
    glob: 'deny',
    grep: 'deny',
    list: 'deny',
    webfetch: 'deny',
    websearch: 'deny',
    task: 'deny',
    skill: 'deny',
    todowrite: 'deny',
    external_directory: 'deny',
    doom_loop: 'deny',
  },
  tools: { bash: false, edit: false, write: false, read: false, glob: false, grep: false, list: false, webfetch: false, websearch: false, task: false, todowrite: false, todoread: false, patch: false, skill: false },
  mcp: {},
  share: 'disabled',
  autoupdate: false,
}

/** The first top-level JSON object in a model's reply: plain, in a code fence, or in the middle of prose. Null when there is none or it is cut off. */
export function extractJson(text: string): unknown | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  if (!cleaned) return null
  const whole = tryParse(cleaned)
  if (whole.ok) return whole.value
  for (const fence of cleaned.matchAll(/```[a-zA-Z]*\s*\n?([\s\S]*?)```/g)) {
    const inner = fence[1]?.trim() ?? ''
    const parsed = tryParse(inner)
    if (parsed.ok) return parsed.value
    const found = scanObjects(inner)
    if (found.kind === 'value') return found.value
  }
  const found = scanObjects(cleaned)
  return found.kind === 'value' ? found.value : null
}

type Parsed = { ok: true; value: unknown } | { ok: false }

function tryParse(s: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(s) }
  } catch {
    return { ok: false }
  }
}

/** The index of the brace that closes the one at `start`, reading strings and escapes, or -1 when the text ends first. */
function closingBrace(s: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

function scanObjects(s: string): { kind: 'value'; value: unknown } | { kind: 'none' } | { kind: 'cut-off' } {
  for (let i = s.indexOf('{'); i !== -1; i = s.indexOf('{', i + 1)) {
    const end = closingBrace(s, i)
    if (end === -1) {
      // JSON that starts like JSON and never closes was cut off: do not hand back an object from inside it. A lone brace in prose is skipped.
      if (/^\{\s*"/.test(s.slice(i, i + 40))) return { kind: 'cut-off' }
      continue
    }
    const parsed = tryParse(s.slice(i, end + 1))
    if (parsed.ok && typeof parsed.value === 'object' && parsed.value !== null) return { kind: 'value', value: parsed.value }
  }
  return { kind: 'none' }
}

type Events = { text: string; tokensIn?: number; tokensOut?: number; toolCalls: string[]; error?: string }

/** Reads the raw JSON events of `opencode run --format json` (one object a line): the reply text, the tokens, any tool call, any error. */
export function readEvents(stdout: string): Events {
  const texts: string[] = []
  const toolCalls: string[] = []
  let tokensIn: number | undefined
  let tokensOut: number | undefined
  let error: string | undefined
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    let event: Record<string, unknown>
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      continue
    }
    const part = (event.part ?? {}) as Record<string, unknown>
    if (event.type === 'text' && typeof part.text === 'string') texts.push(part.text)
    else if (event.type === 'tool_use' || part.type === 'tool') toolCalls.push(typeof part.tool === 'string' ? part.tool : 'unknown')
    else if (event.type === 'step_finish') {
      const tokens = (part.tokens ?? {}) as Record<string, unknown>
      if (typeof tokens.input === 'number') tokensIn = (tokensIn ?? 0) + tokens.input
      const out = (typeof tokens.output === 'number' ? tokens.output : 0) + (typeof tokens.reasoning === 'number' ? tokens.reasoning : 0)
      if (typeof tokens.output === 'number' || typeof tokens.reasoning === 'number') tokensOut = (tokensOut ?? 0) + out
    } else if (event.type === 'error') error = describeError(event.error)
  }
  return { text: texts.join(''), tokensIn, tokensOut, toolCalls, error }
}

function describeError(e: unknown): string {
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    const data = (o.data ?? {}) as Record<string, unknown>
    const message = typeof data.message === 'string' ? data.message : typeof o.message === 'string' ? o.message : ''
    return [typeof o.name === 'string' ? o.name : '', message].filter(Boolean).join(': ') || JSON.stringify(e).slice(0, 300)
  }
  return 'unknown error'
}

const KILL_GRACE_MS = 3000

/**
 * Asks one model one question. The prompt goes to a file in a fresh empty folder and is attached with `-f`. A timeout, a limit or a tool call
 * ends the run; only the child process this function started is ever killed, by its own PID.
 */
export async function runOpencode(model: string, prompt: string, opts: RunOpts & { bin?: string }): Promise<RunResult> {
  const bin = opts.bin ?? process.env.TEACH_OPENCODE_BIN ?? 'opencode'
  const root = mkdtempSync(join(tmpdir(), 'teach-oc-'))
  const work = join(root, 'work')
  const config = join(root, 'config')
  mkdirSync(work)
  mkdirSync(config)
  writeFileSync(join(work, 'opencode.json'), JSON.stringify(DENY_ALL_CONFIG, null, 2))
  writeFileSync(join(work, 'prompt.md'), prompt)
  const args = ['run', '--pure', '--print-logs', '--log-level', 'ERROR', '--format', 'json', '--title', 'teach', '-m', model, 'Follow the attached file. Reply with one JSON object only.', '-f', 'prompt.md']
  const env = { ...process.env, XDG_CONFIG_HOME: config, OPENCODE_DISABLE_CLAUDE_CODE: '1' }

  try {
    return await new Promise<RunResult>((resolve) => {
      const child = spawn(bin, args, { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      let settled = false
      let killedFor: 'limit' | 'timeout' | 'stream-error' | null = null
      let streamError = ''
      let hardKill: NodeJS.Timeout | undefined

      const stop = (why: 'limit' | 'timeout' | 'stream-error') => {
        if (killedFor) return
        killedFor = why
        child.kill('SIGTERM')
        hardKill = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS)
      }
      const timer = setTimeout(() => stop('timeout'), opts.timeoutMs)

      const look = (chunk: string, fromStderr: boolean) => {
        if (LIMIT_TEXT.test(chunk)) return stop('limit')
        if (fromStderr && STREAM_ERROR.test(chunk)) {
          streamError = chunk.split('\n').find((l) => STREAM_ERROR.test(l))?.slice(0, 400) ?? chunk.slice(0, 400)
          stop('stream-error')
        }
      }
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (d: string) => {
        stdout += d
        look(d, false)
      })
      child.stderr.on('data', (d: string) => {
        stderr += d
        look(d, true)
      })

      const finish = (result: RunResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (hardKill) clearTimeout(hardKill)
        resolve(result)
      }
      child.on('error', (e) => finish({ text: '', limited: false, error: `could not start ${bin}: ${e.message}` }))
      child.on('close', (code) => {
        const events = readEvents(stdout)
        const base = { text: events.text, tokensIn: events.tokensIn, tokensOut: events.tokensOut }
        if (killedFor === 'limit') return finish({ ...base, limited: true, error: 'Free usage limit reached' })
        if (killedFor === 'timeout') return finish({ ...base, limited: false, error: `timed out after ${Math.round(opts.timeoutMs / 1000)}s` })
        if (killedFor === 'stream-error') return finish({ ...base, limited: false, error: streamError })
        if (LIMIT_TEXT.test(stderr) || LIMIT_TEXT.test(stdout)) return finish({ ...base, limited: true, error: 'Free usage limit reached' })
        if (events.toolCalls.length > 0) return finish({ ...base, limited: false, error: `the model made a tool call (${events.toolCalls.join(', ')})` })
        if (events.error) return finish({ ...base, limited: false, error: events.error })
        if (code !== 0 && !events.text) return finish({ ...base, limited: false, error: (stderr.trim().split('\n').slice(-3).join(' ') || `exit code ${code}`).slice(0, 400) })
        if (!events.text.trim()) return finish({ ...base, limited: false, error: 'the model sent no text' })
        finish({ ...base, limited: false })
      })
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
