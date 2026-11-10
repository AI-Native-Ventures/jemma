import type { JemmaDb } from '../../packages/profiling/src/db'

/** Wraps the signed-in client so the end of the runner's work on the event (`finish_event`) can be waited for exactly. */
export function hookFinish(db: JemmaDb, onFinish: () => void): JemmaDb {
  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown
      if (prop === 'rpc') {
        return (fn: string, args?: unknown, opts?: unknown) => {
          const pending = Promise.resolve((target.rpc as (...a: unknown[]) => PromiseLike<unknown>).call(target, fn, args, opts))
          if (fn === 'finish_event') void pending.then(onFinish, onFinish)
          return pending
        }
      }
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
    },
  })
}
