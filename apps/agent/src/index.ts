export interface Env {
  EVENTS_QUEUE: Queue
}

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/health') return Response.json({ ok: true })
    return new Response('Not found', { status: 404 })
  },
  async queue(_batch: MessageBatch): Promise<void> {
    // Consumer is implemented in Task 7 and Task 13.
  },
} satisfies ExportedHandler<Env>
