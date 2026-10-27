import type { LanguageModelMiddleware, wrapLanguageModel } from 'ai'

type LanguageModelV4 = ReturnType<typeof wrapLanguageModel>
import { ReplayMissError, type ReplayStore } from './stores'

type StreamPart = Awaited<ReturnType<LanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer P> ? P : never

/** `cache`: the stored answer when the key exists, else call the model and store it (judges' runs after one warm-up run). */
export type AiMode = 'live' | 'record' | 'replay' | 'cache'

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

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
const STAMP = /\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?/g

/**
 * The key for one model call, and the ids in it. Ids made fresh for each sandbox (uuids) and dates are not part of the key,
 * so a recording made in one demo sandbox replays in another. `ids` lists the uuids in order of first appearance.
 */
async function prepare(modelId: string, params: unknown): Promise<{ key: string; ids: string[] }> {
  const { abortSignal: _a, headers: _h, ...rest } = (params ?? {}) as Record<string, unknown>
  const json = JSON.stringify(await normalize({ modelId, params: rest }))
  const ids = [...new Set(json.match(UUID) ?? [])]
  const keyed = ids.reduce((text, id, i) => text.replaceAll(id, `<id:${i}>`), json).replace(STAMP, '<when>')
  return { key: await sha256(keyed), ids }
}

export async function replayKey(modelId: string, params: unknown): Promise<string> {
  return (await prepare(modelId, params)).key
}

/** Swaps this call's uuids for `<id:n>` placeholders before a result is stored. */
const tokenize = <T>(value: T, ids: string[]): T =>
  JSON.parse(ids.reduce((text, id, i) => text.replaceAll(id, `<id:${i}>`), JSON.stringify(value))) as T

/** Puts the current call's uuids back into a stored result. */
const detokenize = <T>(value: T, ids: string[]): T =>
  JSON.parse(JSON.stringify(value).replace(/<id:(\d+)>/g, (m, n: string) => ids[Number(n)] ?? m)) as T

export function withReplay(store: ReplayStore, mode: AiMode): LanguageModelMiddleware {
  if (mode === 'live') return { specificationVersion: 'v4' }
  return {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate, params, model }) => {
      const { key, ids } = await prepare(model.modelId, params)
      if (mode === 'replay' || mode === 'cache') {
        const hit = await store.get(key)
        if (hit !== null) return detokenize(hit, ids) as Awaited<ReturnType<typeof doGenerate>>
        if (mode === 'replay') throw new ReplayMissError(key)
      }
      const result = await doGenerate()
      await store.put(key, model.modelId, tokenize(result, ids))
      return result
    },
    wrapStream: async ({ doStream, params, model }) => {
      const { key, ids } = await prepare(`${model.modelId}:stream`, params)
      const stored = mode === 'replay' || mode === 'cache' ? await store.get(key) : null
      if (stored === null && mode === 'replay') throw new ReplayMissError(key)
      if (stored !== null) {
        const hit = detokenize(stored, ids) as { chunks: StreamPart[]; rest: object }
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
          await store.put(key, model.modelId, tokenize({ chunks, rest }, ids))
        },
      })
      return { ...rest, stream: stream.pipeThrough(tee) }
    },
  }
}
