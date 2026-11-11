import { createMcpHandler } from 'agents/mcp'
import { createJemmaMcpServer } from '@jemma/profiling/tools'
import { authenticate } from './auth'
import { failEvent, MAX_QUEUE_RETRIES, processEvent, toolContext } from './consumer'
import type { Env } from './env'
import { runScheduled } from './scheduled'

export type { Env } from './env'

const json = (body: unknown, status: number) => Response.json(body, { status })

async function mcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const auth = await authenticate(request, env)
  if (!auth) return new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': 'Bearer' } })
  const toolCtx = toolContext(env, auth.scope.schoolId, null, auth.scope.schoolIds, 'mcp')
  return createMcpHandler(createJemmaMcpServer(toolCtx), { route: '/mcp' })(request, env, ctx)
}

async function events(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  const secret = request.headers.get('x-jemma-secret')
  if (!env.EVENTS_SECRET || secret !== env.EVENTS_SECRET) return json({ error: 'unauthorized' }, 401)
  const body = (await request.json().catch(() => null)) as { eventId?: unknown } | null
  if (!body || typeof body.eventId !== 'string') return json({ error: 'eventId required' }, 400)
  await env.EVENTS_QUEUE.send({ eventId: body.eventId })
  return json({ queued: true }, 202)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/health') return Response.json({ ok: true })
    if (pathname === '/mcp') return mcp(request, env, ctx)
    if (pathname === '/events') return events(request, env)
    return new Response('Not found', { status: 404 })
  },
  async queue(batch: MessageBatch<{ eventId: string }>, env: Env): Promise<void> {
    // Papers are read three at a time (max_batch_size in wrangler.jsonc), well under the free tier's 20 requests a minute.
    await Promise.all(
      batch.messages.map(async (message) => {
        try {
          await processEvent(env, message.body.eventId, undefined, message.attempts > MAX_QUEUE_RETRIES)
          message.ack()
        } catch (err) {
          if (message.attempts > MAX_QUEUE_RETRIES) {
            await failEvent(env, message.body.eventId, err instanceof Error ? err.message : String(err)).catch(() => {})
            message.ack()
          } else message.retry()
        }
      }),
    )
  },
  /** Two crons (wrangler.jsonc): every minute the desktop and operator checks, at minute 17 of every hour the sweep of old demo sandboxes. */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await runScheduled(controller.cron, env, ctx)
  },
} satisfies ExportedHandler<Env, { eventId: string }>
