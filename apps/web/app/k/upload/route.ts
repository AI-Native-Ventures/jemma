import { handleUpload, takes } from '@/lib/upload-route'
import { snapOwnTest, uploadOwnCurriculum } from '../own/actions'
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
    // The pages of a marked test, from the private twin only (the function checks it): no argument before the files.
    snapOwnTest: takes(0, (_args, form) => snapOwnTest(filesOf(form))),
    // A learner's own curriculum: the grade and the name come before the files (the function checks the twin, the grade, the name and each file).
    uploadOwnCurriculum: takes(2, ([grade, name], form) => uploadOwnCurriculum(Number(grade), name!, filesOf(form))),
  })
