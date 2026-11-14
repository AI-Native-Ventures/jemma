import { handleUpload, takes } from '@/lib/upload-route'
import { snapPractice } from '../session/[sessionId]/actions'

/** The files of a post: one `file` field each. */
const filesOf = (form: FormData) => form.getAll('file').filter((f): f is File => f instanceof File)

/**
 * The learner's photo post (see lib/upload-route.ts for why files do not go through a form action). Only this function can be named. The
 * proxy sends a signed-out post to sign-in and keeps a teacher or a parent (without a hand-over) out of /k, and the function checks the
 * learner and the session itself.
 */
export const POST = (request: Request) =>
  handleUpload(request, {
    snapPractice: takes(1, ([sessionId], form) => snapPractice(sessionId!, filesOf(form))),
  })
