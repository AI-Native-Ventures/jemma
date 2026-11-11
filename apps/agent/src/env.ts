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
  /** Routing tag of this stack (default `default`). Keeps separate stacks on one database from taking each other's hand-offs; an operator uses the same tag (OPERATOR_TAG). */
  AI_ROUTE_TAG?: string
  OPENROUTER_API_KEY?: string
  DEEPSEEK_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  GOOGLE_GENERATIVE_AI_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENCODE_API_KEY?: string
  OPENCODE_BASE_URL?: string
  /** Demo sandboxes older than this many days, with no sign-in and no activity since, are removed by the hourly cron. Default 7. `0` switches the sweep off. */
  DEMO_SANDBOX_DAYS?: string | number
}
