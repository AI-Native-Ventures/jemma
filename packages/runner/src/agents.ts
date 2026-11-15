import { defaultExtraDirs, exec, findBin } from './exec'
import { gooseProvider, type GooseProvider } from './goose'

export type AgentName = 'claude' | 'codex' | 'goose'
export type AgentStatus = { installed: boolean; version: string | null; signedIn: boolean | 'unknown' }
export type DetectOptions = { extraDirs?: string[] }

const NOT_INSTALLED: AgentStatus = { installed: false, version: null, signedIn: false }

function parseVersion(text: string): string | null {
  return text.match(/\d+\.\d+\.\d+(?:[-+][\w.]+)?/)?.[0] ?? null
}

/** `claude auth status` reports login state from local credentials. No prompt is sent. */
async function claudeStatus(bin: string): Promise<AgentStatus> {
  const v = await exec(bin, ['--version'])
  const version = parseVersion(v.stdout)
  const auth = await exec(bin, ['auth', 'status', '--json'])
  let signedIn: AgentStatus['signedIn'] = 'unknown'
  try {
    const parsed = JSON.parse(auth.stdout) as { loggedIn?: unknown }
    if (typeof parsed.loggedIn === 'boolean') signedIn = parsed.loggedIn
  } catch {
    // leave unknown
  }
  return { installed: true, version, signedIn }
}

/** `codex login status` exits 0 when logged in and non-zero when not. No prompt is sent. */
async function codexStatus(bin: string): Promise<AgentStatus> {
  const v = await exec(bin, ['--version'])
  const version = parseVersion(v.stdout)
  const login = await exec(bin, ['login', 'status'])
  const text = `${login.stdout}${login.stderr}`
  let signedIn: AgentStatus['signedIn'] = 'unknown'
  if (login.code === 0 && /logged in/i.test(text)) signedIn = true
  else if (/not logged in/i.test(text) || (login.code !== 0 && text.trim() !== '')) signedIn = false
  return { installed: true, version, signedIn }
}

/**
 * Goose has no login of its own: it talks to OpenRouter with a key from the environment. So "signed in" means
 * `OPENROUTER_API_KEY` is set. On a model on this computer (`JEMMA_GOOSE_PROVIDER=ollama`) there is nothing to sign in
 * to, so it counts as signed in. A provider value that is not one of the two is not signed in. No prompt is sent.
 */
export async function detectGoose(opts: DetectOptions = {}): Promise<AgentStatus> {
  const bin = findBin('goose', opts.extraDirs ?? defaultExtraDirs())
  if (!bin) return NOT_INSTALLED
  const v = await exec(bin, ['--version'])
  let provider: GooseProvider | null = 'openrouter'
  try {
    provider = gooseProvider(process.env)
  } catch {
    provider = null
  }
  const signedIn = provider === 'ollama' ? true : provider === 'openrouter' ? Boolean(process.env.OPENROUTER_API_KEY?.trim()) : false
  return { installed: true, version: parseVersion(v.stdout), signedIn }
}

export async function detectAgent(name: AgentName, opts: DetectOptions = {}): Promise<AgentStatus> {
  if (name === 'goose') return detectGoose(opts)
  const bin = findBin(name, opts.extraDirs ?? defaultExtraDirs())
  if (!bin) return NOT_INSTALLED
  return name === 'claude' ? claudeStatus(bin) : codexStatus(bin)
}

export async function detectAgents(opts: DetectOptions = {}): Promise<{ claude: AgentStatus; codex: AgentStatus }> {
  const [claude, codex] = await Promise.all([detectAgent('claude', opts), detectAgent('codex', opts)])
  return { claude, codex }
}
