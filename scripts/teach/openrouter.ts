import { readFileSync } from 'node:fs'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { APICallError, generateText, type LanguageModel } from 'ai'
import { FatalBackendError } from './chain'
import type { RunResult, Runner } from './opencode'

/**
 * The OpenRouter backend (`TEACH_BACKEND=openrouter`): cheap open-weights models through the repo's AI SDK OpenRouter provider, paid, with the cost
 * and the cached tokens of every call read from what OpenRouter reports. The key is read from the file named by `TEACH_OPENROUTER_KEY_FILE`; it is
 * never printed, never put in the ledger, and is cut out of any error text.
 */

/** The ranked chain (owner, 16 Nov): GLM writes first, DeepSeek 4.1 checks (the reviewer is the next model after the writer), DeepSeek v4 is the backup. */
export const OPENROUTER_MODELS = ['z-ai/glm-5.3-flash', 'deepseek/deepseek-v4.1-flash-1017', 'deepseek/deepseek-v4-flash']

/** A paid rate limit ends in seconds, not hours. */
export const OPENROUTER_PARK_MS = 2 * 60 * 1000

/** Dollars per million tokens, used only when OpenRouter reports no cost for a call, so that the budget stop never goes blind. Deliberately a little high. */
export const ESTIMATE_PER_M = { input: 0.5, cached: 0.05, output: 2 }

/** Closed, expensive families: never on this backend. */
const CLOSED = /^(anthropic|openai|google|x-ai|perplexity|cohere|amazon|ai21)\//i

export function openrouterModelsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env.TEACH_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  if (list.length === 0) return [...OPENROUTER_MODELS]
  for (const m of list) {
    if (!/^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9._:-]+$/.test(m)) throw new Error(`TEACH_MODELS: ${m} is not an OpenRouter model id (like deepseek/deepseek-v4-flash)`)
    if (CLOSED.test(m)) throw new Error(`TEACH_MODELS: ${m} is a closed, expensive model and is not allowed on this backend`)
  }
  return list
}

/** The key, from the file `TEACH_OPENROUTER_KEY_FILE` names. Fails with the file's name, never with its content. */
export function readKey(env: Record<string, string | undefined> = process.env): string {
  const file = env.TEACH_OPENROUTER_KEY_FILE
  if (!file) throw new Error('TEACH_BACKEND=openrouter needs TEACH_OPENROUTER_KEY_FILE: the path of a file that holds the key')
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`cannot read the key file ${file}`)
  }
  const key = text.trim()
  if (!key) throw new Error(`the key file ${file} is empty`)
  return key
}

type Usage = { promptTokens?: number; completionTokens?: number; promptTokensDetails?: { cachedTokens?: number }; cost?: number }

/** The model of a call: OpenRouter's chat model with low reasoning effort and usage accounting (cost and cached tokens) switched on. */
export const openrouterModel =
  (apiKey: string) =>
  (modelId: string): LanguageModel =>
    createOpenRouter({ apiKey }).chat(modelId, { reasoning: { effort: 'low' }, usage: { include: true } })

export type OpenRouterOptions = {
  apiKey: string
  /** Replaced in tests. */
  makeModel?: (modelId: string) => LanguageModel
  /** A whole lesson is about 6,000 to 10,000 tokens of JSON. */
  maxOutputTokens?: number
}

export function makeOpenRouterRunner(opts: OpenRouterOptions): Runner {
  const makeModel = opts.makeModel ?? openrouterModel(opts.apiKey)
  const clean = (text: string) => (opts.apiKey ? text.split(opts.apiKey).join('[key]') : text)
  return async (modelId, prompt, { timeoutMs }): Promise<RunResult> => {
    try {
      const result = await generateText({ model: makeModel(modelId), prompt, abortSignal: AbortSignal.timeout(timeoutMs), maxRetries: 0, maxOutputTokens: opts.maxOutputTokens ?? 24_000 })
      const usage = (result.providerMetadata?.openrouter as { usage?: Usage } | undefined)?.usage
      const sdk = result.usage as { inputTokens?: number; outputTokens?: number } | undefined
      const tokensIn = usage?.promptTokens ?? sdk?.inputTokens
      const tokensOut = usage?.completionTokens ?? sdk?.outputTokens
      const tokensCached = usage?.promptTokensDetails?.cachedTokens
      let costUsd = usage?.cost
      let costEstimated: boolean | undefined
      if (costUsd === undefined && (tokensIn !== undefined || tokensOut !== undefined)) {
        const fresh = Math.max(0, (tokensIn ?? 0) - (tokensCached ?? 0))
        costUsd = (fresh * ESTIMATE_PER_M.input + (tokensCached ?? 0) * ESTIMATE_PER_M.cached + (tokensOut ?? 0) * ESTIMATE_PER_M.output) / 1_000_000
        costEstimated = true
      }
      const base = { text: result.text, tokensIn, tokensCached, tokensOut, costUsd, costEstimated, limited: false }
      return result.text.trim() ? base : { ...base, error: 'the model sent no text' }
    } catch (e) {
      if (APICallError.isInstance(e)) {
        const status = e.statusCode
        if (status === 402) throw new FatalBackendError('OpenRouter says payment is required: no credit is left on the key')
        if (status === 401 || status === 403) throw new FatalBackendError(`OpenRouter refused the key (HTTP ${status})`)
        if (status === 429) return { text: '', limited: true, error: 'rate limited by OpenRouter (HTTP 429)' }
        return { text: '', limited: false, error: clean(`HTTP ${status ?? '?'}: ${e.message}`).slice(0, 400) }
      }
      const name = e instanceof Error ? e.name : ''
      if (name === 'TimeoutError' || name === 'AbortError') return { text: '', limited: false, error: `timed out after ${Math.round(timeoutMs / 1000)}s` }
      return { text: '', limited: false, error: clean(e instanceof Error ? e.message : String(e)).slice(0, 400) }
    }
  }
}
