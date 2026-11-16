import { LIMIT_PARK_MS, modelsFromEnv } from './chain'
import { effortFromEnv, makeOpenRouterRunner, OPENROUTER_PARK_MS, openrouterModelsFromEnv, readKey } from './openrouter'
import { runOpencode, type Runner } from './opencode'

/** Where the models are called: `TEACH_BACKEND=opencode` (the default: OpenCode's free models) or `TEACH_BACKEND=openrouter` (cheap paid open-weights models). */
export type Backend = 'opencode' | 'openrouter'

export function backendFromEnv(env: Record<string, string | undefined> = process.env): Backend {
  const value = (env.TEACH_BACKEND ?? 'opencode').trim().toLowerCase()
  if (value === 'opencode' || value === 'openrouter') return value
  throw new Error(`TEACH_BACKEND must be opencode or openrouter (got "${env.TEACH_BACKEND}")`)
}

/** The ranked models of a backend: `TEACH_MODELS` or the backend's default chain, checked for that backend. */
export function modelsFor(backend: Backend, env: Record<string, string | undefined> = process.env): string[] {
  return backend === 'openrouter' ? openrouterModelsFromEnv(env) : modelsFromEnv(env)
}

/** How long a model rests after a limit: an hour for OpenCode's free quota, two minutes for a paid rate limit. */
export const limitParkMsFor = (backend: Backend): number => (backend === 'openrouter' ? OPENROUTER_PARK_MS : LIMIT_PARK_MS)

/** The function that asks one model one question. The OpenRouter key is read here, from its file, and goes nowhere else. */
export function runnerFor(backend: Backend, env: Record<string, string | undefined> = process.env): Runner {
  return backend === 'openrouter' ? makeOpenRouterRunner({ apiKey: readKey(env), effort: effortFromEnv(env) }) : runOpencode
}
