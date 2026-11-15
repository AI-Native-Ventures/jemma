import { cloudSecretNames, type OllamaAddress } from '../../packages/runner/src/index'
import { KEEP_OUT, LOCAL_KEEP_OUT } from './env'
import type { ResultFile } from './result'

/**
 * The parts of a run on a model on this computer (Ollama): what the result file records about it, and the check that
 * Ollama is there before the first run starts. No model is called here.
 */

/**
 * What goes into the process environment while goose runs, and what is taken out of it. A local run (a model and an address)
 * puts the provider, the model and Ollama's address in and takes every cloud model key out; any other run puts the
 * OpenRouter key in and takes the secrets it must not see out.
 */
export function scrubPlan(local: { model: string; host: OllamaAddress } | null, openRouterKey: string | null): { values: Record<string, string>; keepOut: readonly string[] } {
  if (local) return { values: { JEMMA_GOOSE_PROVIDER: 'ollama', JEMMA_OPEN_MODEL: local.model, OLLAMA_HOST: local.host.url }, keepOut: LOCAL_KEEP_OUT }
  return { values: { OPENROUTER_API_KEY: openRouterKey ?? '' }, keepOut: KEEP_OUT }
}

export type LocalAttemptText = { model: string; stdout: string; stderr: string }

/** Addresses of cloud model services. Goose's transcript has no business naming one in a run that stays on this computer. */
const CLOUD_SERVICE = /openrouter|api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.deepseek\.com|ollama\.com/i

export type LocalFactsInput = {
  /** The Ollama tag the run asked for. */
  model: string
  host: OllamaAddress
  attempts: LocalAttemptText[]
  /** The environment goose was started with (only its names are read). */
  childEnv: Record<string, string | undefined>
}

/**
 * What points at a cloud model, one plain line each: an attempt on another model, a transcript that names a cloud
 * service, a cloud key in goose's environment, a host that is not this computer. An empty list means nothing did.
 * A secret's value is never written, only its name.
 */
export function cloudCallEvidence({ model, host, attempts, childEnv }: LocalFactsInput): string[] {
  const lines: string[] = []
  if (!host.local) lines.push(`the host ${host.hostname} is not this computer`)
  attempts.forEach((attempt, i) => {
    if (attempt.model !== model) lines.push(`attempt ${i + 1} ran on ${attempt.model}, not on ${model}`)
    const named = CLOUD_SERVICE.exec(`${attempt.stdout}\n${attempt.stderr}`)?.[0]
    if (named) lines.push(`attempt ${i + 1}: the transcript names ${named.toLowerCase()}`)
  })
  const keys = cloudSecretNames(childEnv)
  if (keys.length > 0) lines.push(`the goose environment held ${keys.join(', ')}`)
  return lines
}

/** The fields a local run adds to its result file. */
export function localFacts(input: LocalFactsInput): Required<Pick<ResultFile, 'provider' | 'model' | 'host' | 'port' | 'noCloudModelCalled' | 'cloudEvidence'>> {
  const cloudEvidence = cloudCallEvidence(input)
  return {
    provider: 'ollama',
    model: input.model,
    host: input.host.hostname,
    port: input.host.port,
    noCloudModelCalled: cloudEvidence.length > 0 ? false : input.attempts.length === 0 ? null : true,
    cloudEvidence,
  }
}

/**
 * Asks Ollama which models it has (`GET /api/tags`: a list of names, no model runs) and says what is wrong, or returns null
 * when the server answers and has the tag. Meant to run once before the first run, so a missing server or a missing model
 * is a plain message and not a run of failures.
 */
export async function checkOllamaReady({ host, model, fetchFn = fetch, timeoutMs = 5_000 }: { host: OllamaAddress; model: string; fetchFn?: typeof fetch; timeoutMs?: number }): Promise<string | null> {
  let res: Response
  try {
    res = await fetchFn(`${host.url}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    return `Ollama does not answer at ${host.url}. Start it with "ollama serve", then run again.`
  }
  if (!res.ok) return `Ollama at ${host.url} answered ${res.status} when asked for its models.`
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = null
  }
  const models = (body as { models?: unknown } | null)?.models
  if (!Array.isArray(models)) return `Ollama at ${host.url} did not answer with a list of models.`
  const wanted = model.includes(':') ? [model] : [model, `${model}:latest`]
  const have = models.flatMap((m) => [(m as { name?: unknown }).name, (m as { model?: unknown }).model]).filter((n): n is string => typeof n === 'string')
  if (!wanted.some((w) => have.includes(w))) return `Ollama has no model called ${model}. Pull it first: ollama pull ${model}`
  return null
}
