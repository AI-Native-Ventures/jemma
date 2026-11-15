import { LIVE_CAP, LOCAL_CAP } from './ledger'

/** A local model is slow: a whole job may take 30 minutes (a hosted model gets 10). `--timeout-minutes` changes it. */
export const LOCAL_TIMEOUT_MINUTES = 30

export type EvalProvider = 'openrouter' | 'ollama'

export type EvalArgs = {
  runs: number
  tasks: string[] | undefined
  runId: string
  /** The most live goose runs for this provider: 45 on OpenRouter, 6 on a model on this computer. */
  cap: number
  usedOffset: number
  rehearse: string | null
  reuseWorker: boolean
  force: boolean
  /** Skip the wait for a calm line to the database (a slow line is still measured and saved). */
  noLineWait: boolean
  report: boolean
  timeoutMinutes: number | undefined
  /** Where goose gets its model. `ollama` is a model on this computer, no cloud model. */
  provider: EvalProvider
  /** The Ollama tag for a local run (`--model`). Only with `--provider ollama`. */
  model: string | undefined
  /** Accept the deployed preview project as the database, on purpose. Without it that project stays refused. */
  allowPreview: boolean
}

/** A run folder for a local run always starts with `local-` (a rehearsal keeps its own `rehearsal-` start). */
export const LOCAL_FOLDER_PREFIX = 'local-'
export const localRunId = (id: string): string => (id.startsWith('rehearsal-') || id.startsWith(LOCAL_FOLDER_PREFIX) ? id : `${LOCAL_FOLDER_PREFIX}${id}`)

/**
 * The command line of `pnpm evals`. `--provider ollama` runs on a model on this computer: its own cap (6 runs), its run
 * folder starts with `local-`, and `--model` names the Ollama tag. Everything else is as it always was.
 */
export function parseArgs(argv: string[], opts: { runsPerTask: number; now?: Date }): EvalArgs {
  const value = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  /** The value after a flag that must have one: missing, or another flag, is an error. */
  const needed = (flag: string, what: string): string | undefined => {
    if (!argv.includes(flag)) return undefined
    const v = argv[argv.indexOf(flag) + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(what)
    return v
  }
  const providerText = needed('--provider', '--provider must be openrouter or ollama')
  if (providerText !== undefined && providerText !== 'openrouter' && providerText !== 'ollama') throw new Error(`--provider must be openrouter or ollama (it is "${providerText}")`)
  const provider: EvalProvider = providerText ?? 'openrouter'
  const model = needed('--model', '--model needs an Ollama tag, for example --model gemma4:26b')?.trim()
  if (model !== undefined && provider !== 'ollama') throw new Error('--model is for a local run: add --provider ollama (for OpenRouter, set JEMMA_OPEN_MODEL)')

  const stamp = (opts.now ?? new Date()).toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const rehearse = value('--rehearse') ?? null
  const asked = value('--run-id') ?? `${argv.includes('--rehearse') ? 'rehearsal-' : ''}${stamp}`
  return {
    runs: Number(value('--runs') ?? opts.runsPerTask),
    tasks: value('--task')?.split(',').map((s) => s.trim()).filter(Boolean),
    runId: provider === 'ollama' ? localRunId(asked) : asked,
    cap: Number(value('--cap') ?? (provider === 'ollama' ? LOCAL_CAP : LIVE_CAP)),
    usedOffset: Number(value('--live-used') ?? 0),
    rehearse,
    reuseWorker: argv.includes('--reuse-worker'),
    force: argv.includes('--force'),
    noLineWait: argv.includes('--no-line-wait'),
    report: !argv.includes('--no-report'),
    timeoutMinutes: value('--timeout-minutes') ? Number(value('--timeout-minutes')) : provider === 'ollama' ? LOCAL_TIMEOUT_MINUTES : undefined,
    provider,
    model: model || undefined,
    allowPreview: argv.includes('--allow-preview'),
  }
}
