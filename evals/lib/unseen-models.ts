/** The free models the curriculum reader is run on, as the runbook names them. Any id that does not end in `:free` is refused. */
export const DEFAULT_MODELS = {
  LLM_MODEL: 'nvidia/nemotron-3.5-super-vl:free',
  LLM_MODEL_FALLBACKS: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  VISION_MODEL: 'nvidia/nemotron-3.5-super-vl:free',
  VISION_MODEL_FALLBACKS: 'google/gemma-4-31b-it:free',
} as const

export type ModelSettings = Record<keyof typeof DEFAULT_MODELS, string>

/** The model settings from the environment, or the defaults. Throws when any model is not a free one. */
export function freeModels(env: Record<string, string | undefined>): ModelSettings {
  const out = Object.fromEntries(Object.entries(DEFAULT_MODELS).map(([key, fallback]) => [key, env[key]?.trim() || fallback])) as ModelSettings
  for (const [key, list] of Object.entries(out)) {
    for (const id of list.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!id.endsWith(':free')) throw new Error(`${key} has ${id}: only free models (ids ending in :free) may be used here`)
    }
  }
  return out
}
