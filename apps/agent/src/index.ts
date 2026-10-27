import { createMcpHandler } from 'agents/mcp'
import { createJemmaMcpServer } from '@jemma/profiling/tools'
import { authenticate } from './auth'
import { processEvent, toolContext } from './consumer'
import type { Env } from './env'

export type { Env } from './env'

const json = (body: unknown, status: number) => Response.json(body, { status })

async function mcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const auth = await authenticate(request, env)
  if (!auth) return new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': 'Bearer' } })
  const toolCtx = toolContext(env, auth.scope.schoolId, null, auth.scope.schoolIds)
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
    for (const message of batch.messages) {
      try {
        await processEvent(env, message.body.eventId)
        message.ack()
      } catch {
        message.retry()
      }
    }
  },
} satisfies ExportedHandler<Env, { eventId: string }>
