// Probe a free OpenRouter model: plain text, then structured object output.
// Run: node --import tsx scripts/probe.ts [model-id]
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getModel, MemoryStore } from '../src/ai'
import { loadEnv } from './env'

const env = loadEnv()
const model = process.argv[2] ?? env.LLM_MODEL!
const m = getModel('text', { ...env, LLM_PROVIDER: 'openrouter', LLM_MODEL: model, AI_MODE: 'live', replayStore: new MemoryStore() } as never)
const t0 = Date.now()
for (const mode of ['plain', 'object']) {
  try {
    const r =
      mode === 'plain'
        ? await generateText({ model: m, prompt: 'Say hi in 3 words.' })
        : await generateText({ model: m, output: Output.object({ schema: z.object({ n: z.number(), words: z.array(z.string()) }) }), prompt: 'Give n=3 and three colour words.' })
    console.log(model, mode, 'OK', JSON.stringify(mode === 'plain' ? r.text : r.output).slice(0, 200), ((Date.now() - t0) / 1000).toFixed(1))
  } catch (e) {
    console.log(model, mode, 'ERR', String((e as Error).message).slice(0, 300), (e as { statusCode?: number }).statusCode)
  }
}
