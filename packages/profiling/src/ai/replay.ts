import type { LanguageModelMiddleware, wrapLanguageModel } from 'ai'

type LanguageModelV4 = ReturnType<typeof wrapLanguageModel>
import { ReplayMissError, type ReplayStore } from './stores'

type StreamPart = Awaited<ReturnType<LanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer P> ? P : never

export type AiMode = 'live' | 'record' | 'replay'

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function sha256(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return hex(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
}

async function normalize(v: unknown): Promise<unknown> {
  if (v instanceof Uint8Array) return `sha256:${await sha256(v)}`
  if (v instanceof ArrayBuffer) return `sha256:${await sha256(new Uint8Array(v))}`
  if (v instanceof URL) return v.href
  if (Array.isArray(v)) return Promise.all(v.map(normalize))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) {
      const val = (v as Record<string, unknown>)[k]
      if (val !== undefined && typeof val !== 'function') out[k] = await normalize(val)
    }
    return out
  }
  return v
}

export async function replayKey(modelId: string, params: unknown): Promise<string> {
  const { abortSignal: _a, headers: _h, ...rest } = (params ?? {}) as Record<string, unknown>
  return sha256(JSON.stringify(await normalize({ modelId, params: rest })))
}

export function withReplay(store: ReplayStore, mode: AiMode): LanguageModelMiddleware {
  if (mode === 'live') return { specificationVersion: 'v4' }
  return {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate, params, model }) => {
      const key = await replayKey(model.modelId, params)
      if (mode === 'replay') {
        const hit = await store.get(key)
        if (hit === null) throw new ReplayMissError(key)
        return hit as Awaited<ReturnType<typeof doGenerate>>
      }
      const result = await doGenerate()
      await store.put(key, model.modelId, result)
      return result
    },
    wrapStream: async ({ doStream, params, model }) => {
      const key = await replayKey(`${model.modelId}:stream`, params)
      if (mode === 'replay') {
        const hit = (await store.get(key)) as { chunks: unknown[]; rest: object } | null
        if (hit === null) throw new ReplayMissError(key)
        return {
          ...hit.rest,
          stream: new ReadableStream({
            start(c) {
              for (const chunk of hit.chunks) c.enqueue(chunk)
              c.close()
            },
          }),
        } as Awaited<ReturnType<typeof doStream>>
      }
      const { stream, ...rest } = await doStream()
      const chunks: unknown[] = []
      const tee = new TransformStream<StreamPart, StreamPart>({
        transform(chunk, c) {
          chunks.push(chunk)
          c.enqueue(chunk)
        },
        async flush() {
          await store.put(key, model.modelId, { chunks, rest })
        },
      })
      return { ...rest, stream: stream.pipeThrough(tee) }
    },
  }
}
