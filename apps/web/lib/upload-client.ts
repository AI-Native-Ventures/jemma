/** The functions the two upload routes (app/t/upload, app/p/upload) will call. The names are the routes' own, not the server's. */
export type UploadAction = 'uploadCurriculum' | 'uploadMemo' | 'addPaper' | 'uploadScans' | 'addPage' | 'retakePaper' | 'snapHomework'

/**
 * Sends files to the server. Every screen that sends file bytes uses this, never a form action: Cloudflare's edge refuses a
 * form action (a post with a `next-action` header) whose body holds the bytes `'$F` or `"$F`, and a PDF or a photo holds them
 * by chance. This is a plain post to `/${space}/upload` (see lib/upload-route.ts); the cookies of the page ride along.
 *
 * `args` are the strings the function takes before the files. `form` holds the files (the two `File[]` functions read the
 * field `file`, one per file). The form is copied: the caller's own is not changed. Throws when the answer is not a 200, and
 * returns what the function returned.
 *
 * A form action refreshed the screen by itself when it called `revalidatePath`. A fetch does not: the caller calls
 * `router.refresh()` where the screen relied on that.
 */
export async function postFiles<T>(space: 't' | 'p', action: UploadAction, args: string[], form: FormData): Promise<T> {
  const body = new FormData()
  for (const [key, value] of form) body.append(key, value)
  body.set('__action', action)
  body.set('__args', JSON.stringify(args))
  // "manual": a signed-out post is sent to sign-in by the proxy with a 307, and following it would send the files a second time.
  const res = await fetch(`/${space}/upload`, { method: 'POST', body, credentials: 'same-origin', redirect: 'manual' })
  if (res.status !== 200) throw new Error(`upload failed (${res.status})`)
  const answer = (await res.json()) as { result: T }
  return answer.result
}
