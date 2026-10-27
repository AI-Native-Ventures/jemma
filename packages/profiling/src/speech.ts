import type { ToolContext } from './tools/context'

/** Text to speech behind an interface so tests use a fake and the agent worker uses Workers AI. */
export interface SpeechSynth {
  synthesize(script: string): Promise<{ bytes: Uint8Array; mediaType: string }>
}

export type SpeechContext = ToolContext & { speech?: SpeechSynth }

let registered: (() => SpeechSynth | null) | null = null

/** The agent worker registers its Workers AI synth once at start up. */
export function registerSpeech(factory: (() => SpeechSynth | null) | null): void {
  registered = factory
}

/** The synth for this run: the context's own, else the registered one, else none (the player falls back to browser speech). */
export function resolveSpeech(ctx: ToolContext): SpeechSynth | null {
  return (ctx as SpeechContext).speech ?? registered?.() ?? null
}
