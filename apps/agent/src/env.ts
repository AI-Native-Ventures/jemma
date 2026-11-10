export interface Env {
  EVENTS_QUEUE: Queue<{ eventId: string }>
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  /** Shared secret the web app sends as `x-jemma-secret` to POST /events. */
  EVENTS_SECRET?: string
  LLM_PROVIDER?: string
  LLM_MODEL?: string
  LLM_MODEL_FALLBACKS?: string
  VISION_PROVIDER?: string
  VISION_MODEL?: string
  VISION_MODEL_FALLBACKS?: string
  TTS_PROVIDER?: string
  TTS_MODEL?: string
  AI_MODE?: 'live' | 'record' | 'replay' | 'cache'
  /** `cloud` (default): the worker does the AI work. `operator`: recorded answers first, then the owner's laptop, then the worker's own model. */
  AI_ROUTE?: 'cloud' | 'operator'
  OPENROUTER_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  GOOGLE_GENERATIVE_AI_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENCODE_API_KEY?: string
  OPENCODE_BASE_URL?: string
}
