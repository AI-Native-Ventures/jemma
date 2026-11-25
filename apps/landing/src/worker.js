import { usVersion } from './us.js'

// P162: the landing page's Worker. Every file is served as it is, except the page itself for a visitor in the US (Cloudflare's country of the
// request), which gets US prices and US words. Nothing is kept and nothing is sent anywhere.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    const page = pathname === '/' || pathname === '/index.html'
    if (!page || request.cf?.country !== 'US') return env.ASSETS.fetch(request)
    // Ask for the whole page, so a copy the browser kept from an earlier visit is never shown instead of the US one.
    const ask = new Request(request)
    ask.headers.delete('if-none-match')
    ask.headers.delete('if-modified-since')
    const res = await env.ASSETS.fetch(ask)
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return res
    const headers = new Headers(res.headers)
    headers.delete('content-length')
    headers.delete('etag')
    headers.set('cache-control', 'private, max-age=0, must-revalidate')
    return new Response(usVersion(await res.text()), { status: res.status, headers })
  },
}
