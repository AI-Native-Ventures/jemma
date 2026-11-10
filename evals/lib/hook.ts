import type { JemmaDb } from '../../packages/profiling/src/db'

/**
 * Wraps the signed-in client so the end of the runner's work on the event (`finish_event`) can be waited for exactly.
 * A `finish_event` call that answers with an error (a dropped line) is written to `errors`: the runner then tries once
 * more with `failed`, so the caller must not read the event at that moment (see `settledEvent`).
 */
export function hookFinish(db: JemmaDb, onFinish: () => void, errors: string[] = []): JemmaDb {
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown
      if (prop === 'rpc') {
        return (fn: string, args?: unknown, opts?: unknown) => {
          const pending = Promise.resolve((target.rpc as (...a: unknown[]) => PromiseLike<unknown>).call(target, fn, args, opts))
          if (fn === 'finish_event') {
            void pending.then(
              (answer) => {
                const message = (answer as { error?: { message?: string } | null } | null)?.error?.message
                if (message) errors.push(`finish_event said: ${message}`)
                onFinish()
              },
              (err: unknown) => {
                errors.push(`finish_event failed: ${err instanceof Error ? err.message : String(err)}`)
                onFinish()
              },
            )
          }
          return pending
        }
      }
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
    },
  })
}

/**
 * Reads the event until it is `done` or `failed`, for at most `timeoutMs`, and returns the last row read. A first
 * `finish_event` that failed on a slow line is followed by the runner's retry, so the first read may still say `running`.
 * `sleep` and `now` are injected so a test needs no clock.
 */
export async function settledEvent<T extends { status: string }>(
  read: () => Promise<T>,
  opts: { timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 90_000
  const pollMs = opts.pollMs ?? 1_000
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = opts.now ?? (() => Date.now())
  const deadline = now() + timeoutMs
  let row = await read()
  while (row.status !== 'done' && row.status !== 'failed' && now() < deadline) {
    await sleep(pollMs)
    row = await read()
  }
  return row
}
