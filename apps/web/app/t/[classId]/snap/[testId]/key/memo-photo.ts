import { shrinkPhoto } from '@/lib/shrink-photo'
import { postFiles } from '@/lib/upload-client'
import type { ActionResult } from '../../actions'

/**
 * Sends a new memo photo and asks Jemma to read the key from it. The one way a screen retakes the memo: the photo is made smaller and
 * goes through `postFiles` (never a form action). Used by the Retake button of the key list and by "Take the photo again" on the card
 * that says the read failed. Answers what to tell the teacher when it did not go, or null when it did (the caller refreshes the screen).
 */
export async function sendMemoPhoto(classId: string, testId: string, file: File): Promise<string | null> {
  const form = new FormData()
  form.set('file', await shrinkPhoto(file))
  try {
    const res = await postFiles<ActionResult>('t', 'uploadMemo', [classId, testId], form)
    return res.ok ? null : res.message
  } catch {
    return 'That did not upload. Check your connection and try again.'
  }
}
