import { handleUpload, takes } from '@/lib/upload-route'
import { snapHomework } from '../[childId]/snap/actions'

/** The files of a post: one `file` field each. */
const filesOf = (form: FormData) => form.getAll('file').filter((f): f is File => f instanceof File)

/**
 * The parent's photo post (see lib/upload-route.ts for why files do not go through a form action). Only this function can be
 * named. The proxy sends a signed-out post to sign-in and keeps a teacher out of /p, and the function checks the parent and the
 * child itself.
 */
export const POST = (request: Request) =>
  handleUpload(request, {
    snapHomework: takes(3, ([childId, kind, subject], form) => snapHomework(childId!, kind!, subject!, filesOf(form))),
  })
