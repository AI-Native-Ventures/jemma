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
  /** The worker's own Workers AI binding (wrangler.jsonc `ai`). With LLM_PROVIDER or VISION_PROVIDER `workers-ai` the models run through it: no API token and no account id are needed. */
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> }
  /** Cloudflare account id and an API token (a secret): only for the REST way to call Workers AI (outside a Worker). With a token set the binding is not used. */
  CF_ACCOUNT_ID?: string
  CF_AI_TOKEN?: string
  /** Comma list of ids that recorded answers were saved under and that are only looked up in `cache` and `replay`, never called. */
  AI_RECORDED_IDS?: string
  /** `artificial-analysis`: the worker picks its free OpenRouter models itself each hour, ranked by Artificial Analysis. Unset: only the model lists above. */
  AI_MODEL_RANKING?: string
  /** Key of the Artificial Analysis API (a secret). Without it the dynamic list ranks the newest free models first. */
  AA_API_KEY?: string
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
