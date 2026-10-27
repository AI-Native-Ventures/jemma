import { env } from 'cloudflare:workers'
import type { SpeechSynth } from '@jemma/profiling/tools'

type AiBinding = { run(model: string, input: Record<string, unknown>): Promise<unknown> }
type SpeechEnv = { AI?: AiBinding; TTS_PROVIDER?: string; TTS_MODEL?: string }

async function toBytes(out: unknown): Promise<Uint8Array> {
  if (out instanceof Response) return new Uint8Array(await out.arrayBuffer())
  if (out instanceof ReadableStream) return new Uint8Array(await new Response(out).arrayBuffer())
  if (out instanceof ArrayBuffer) return new Uint8Array(out)
  const audio = (out as { audio?: unknown } | null)?.audio
  if (typeof audio === 'string') return Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))
  throw new Error('speech model returned no audio')
}

/**
 * Text to speech on Cloudflare Workers AI (free daily allowance). The model id comes from TTS_MODEL
 * (wrangler.jsonc: an English Deepgram Aura voice). Without the AI binding the player uses browser speech.
 */
export function workersAiSpeech(e: SpeechEnv): SpeechSynth | null {
  if (!e.AI || e.TTS_PROVIDER !== 'workers-ai' || !e.TTS_MODEL) return null
  const ai = e.AI
  const model = e.TTS_MODEL
  return {
    async synthesize(script) {
      const out = await ai.run(model, { text: script, speaker: 'luna', encoding: 'mp3' })
      return { bytes: await toBytes(out), mediaType: 'audio/mpeg' }
    },
  }
}

/** Registered with the profiling package at start up; reads the worker's own bindings. */
export const defaultSpeech = () => workersAiSpeech(env as SpeechEnv)
