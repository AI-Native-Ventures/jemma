import { expect, test } from 'vitest'
import { workersAiSpeech } from '../src/speech'

const tts = { TTS_PROVIDER: 'workers-ai', TTS_MODEL: '@cf/deepgram/aura-2-en' }

// The one-command local run uses wrangler.local.jsonc, which has no `ai` binding: speech is skipped, never an error.
test('without the AI binding there is no speech and nothing throws', () => {
  expect(workersAiSpeech(tts)).toBeNull()
  expect(workersAiSpeech({})).toBeNull()
})

test('with the AI binding there is a speech synth that calls it', async () => {
  const calls: { model: string; input: Record<string, unknown> }[] = []
  const synth = workersAiSpeech({
    ...tts,
    AI: { run: async (model, input) => (calls.push({ model, input }), { audio: btoa('abc') }) },
  })
  expect(synth).not.toBeNull()
  const out = await synth!.synthesize('Hello')
  expect(out.mediaType).toBe('audio/mpeg')
  expect([...out.bytes]).toEqual([97, 98, 99])
  expect(calls).toHaveLength(1)
  expect(calls[0]!.model).toBe('@cf/deepgram/aura-2-en')
})
