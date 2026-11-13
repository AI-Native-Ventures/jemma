import { unstable_rethrow } from 'next/navigation'

/**
 * Why files go through a plain route and not through a form action: Cloudflare's edge refuses a request that has a
 * `next-action` header and the bytes `'$F` or `"$F` anywhere in its body, and a PDF or a phone photo holds those bytes by
 * chance. The same bytes in a plain post pass. See "Why files go through an upload route" in docs/architecture.md.
 *
 * This handler is the one door for those posts (the two routes under app/t/upload and app/p/upload only name what is allowed).
 * It reads no cookie and checks no sign-in: the proxy covers /t/* and /p/*, and every function it calls does its own sign-in
 * and ownership checks, exactly as when it was a form action. What a form action had built in and a route does not is the
 * origin check, so it is made here.
 */

/** What the browser names in `__action` and sends as `__args`: the strings that come before the files, in order. */
export type UploadRun = (args: string[], form: FormData) => Promise<unknown>

/** An allowed action. `argc`, when set, is how many arguments it takes: any other count is answered 400. */
export type UploadFn = UploadRun & { argc?: number }

/** Names the number of arguments an action takes. */
export const takes = (argc: number, run: UploadRun): UploadFn => Object.assign((args: string[], form: FormData) => run(args, form), { argc })

const reply = (status: number, error: string, headers?: Record<string, string>) => Response.json({ error }, { status, headers })

/** True when the post comes from a page of this same site: the host of `Origin` is the host the request was sent to. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  let theirs: string
  try {
    theirs = new URL(origin).host
  } catch {
    return false
  }
  // Behind a proxy the app's own host is internal and the page's host is the forwarded one, as in the framework's own check.
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const ours = forwarded || request.headers.get('host') || new URL(request.url).host
  return theirs.toLowerCase() === ours.toLowerCase()
}

/** The `__args` field: a JSON array of strings, or null. */
function argsOf(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((a) => typeof a === 'string') ? (parsed as string[]) : null
  } catch {
    return null
  }
}

export async function handleUpload(request: Request, allowed: Record<string, UploadFn>): Promise<Response> {
  if (request.method !== 'POST') return reply(405, 'method not allowed', { allow: 'POST' })
  if (!sameOrigin(request)) return reply(403, 'wrong origin')
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return reply(400, 'not a form')

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return reply(400, 'not a form')
  }

  const name = form.get('__action')
  // hasOwn: "__proto__", "constructor" and the other names every object has are not actions
  if (typeof name !== 'string' || !Object.hasOwn(allowed, name)) return reply(400, 'unknown action')
  const run = allowed[name]!
  const args = argsOf(form.get('__args'))
  if (!args || (run.argc !== undefined && args.length !== run.argc)) return reply(400, 'bad arguments')
  form.delete('__action')
  form.delete('__args')

  try {
    const result = await run(args, form)
    return Response.json({ result: result ?? null })
  } catch (error) {
    // A redirect or a not-found raised by the sign-in check goes on to Next, which answers it.
    unstable_rethrow(error)
    // Logged here, never sent: the text of a storage error can hold a path.
    console.error(`upload: ${name} failed`, error)
    return reply(500, 'failed')
  }
}
