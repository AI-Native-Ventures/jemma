import { handleUpload, takes } from '@/lib/upload-route'
import { uploadCurriculum } from '../[classId]/curriculum/actions'
import { addPage, addPaper, retakePaper, uploadMemo, uploadScans } from '../[classId]/snap/actions'

/** The files of a post: one `file` field each. */
const filesOf = (form: FormData) => form.getAll('file').filter((f): f is File => f instanceof File)

/**
 * The teacher's file posts (see lib/upload-route.ts for why files do not go through a form action). Only these six functions can
 * be named. The proxy sends a signed-out post to sign-in and keeps a parent out of /t, and each function checks the teacher and
 * the class itself.
 */
export const POST = (request: Request) =>
  handleUpload(request, {
    uploadCurriculum: takes(1, ([classId], form) => uploadCurriculum(classId!, filesOf(form))),
    uploadMemo: takes(2, ([classId, testId], form) => uploadMemo(classId!, testId!, form)),
    addPaper: takes(2, ([classId, testId], form) => addPaper(classId!, testId!, form)),
    uploadScans: takes(2, ([classId, testId], form) => uploadScans(classId!, testId!, form)),
    addPage: takes(2, ([classId, paperId], form) => addPage(classId!, paperId!, form)),
    retakePaper: takes(2, ([classId, paperId], form) => retakePaper(classId!, paperId!, form)),
  })
