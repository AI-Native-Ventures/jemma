// Local only: lets live-smoke.ts reach Workers AI text to speech through `wrangler dev` (remote AI binding,
// needs `wrangler login`). POST { text } returns audio/mpeg. Run: pnpm --filter agent exec wrangler dev -c ../../packages/profiling/scripts/tts-proxy/wrangler.jsonc --port 8799
export default {
  async fetch(request, env) {
    const { text } = await request.json()
    const out = await env.AI.run(env.TTS_MODEL, { text, speaker: 'luna', encoding: 'mp3' })
    const body = out instanceof Response ? out.body : out
    return new Response(body, { headers: { 'content-type': 'audio/mpeg' } })
  },
}
