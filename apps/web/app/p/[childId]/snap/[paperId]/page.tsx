import { notFound, redirect } from 'next/navigation'
import {
  earlierSameSlip, firstPageUrl, getReadAnswers, getSnapPaper, getUpcomingLessons, shortDate, UNSURE_BELOW,
} from '@/lib/data/p32'
import { FlowShell, joinNumbers, lower } from '../_parts'
import { KIND_LABEL } from '@/lib/data/p32'
import { CheckScreen } from './CheckScreen'
import { ErrorScreen } from './ErrorScreen'
import { ReadingScreen } from './ReadingScreen'

/** One snap: reading (parent-snap-reading), failed (parent-error), or read and waiting for the parent (parent-snap-check). */
export default async function SnapPaperPage({ params }: { params: Promise<{ childId: string; paperId: string }> }) {
  const { childId, paperId } = await params
  const paper = await getSnapPaper(childId, paperId)
  if (!paper) notFound()
  const photoUrl = await firstPageUrl(paperId)
  const retake = `/p/${childId}/snap/photo?kind=${paper.kind}`
  const shell = (title: string, step: number, node: React.ReactNode) => (
    <FlowShell href={retake} label={`${paper.childFirstName} · ${KIND_LABEL[paper.kind]} · step ${step} of 3`} title={title}>
      {node}
    </FlowShell>
  )

  if (paper.status === 'marked') redirect(`/p/${childId}/snap/${paperId}/saved`)
  if (paper.status === 'failed') return shell('Check the photo', 2, <ErrorScreen problem={paper.error} photoUrl={photoUrl} retakeHref={retake} />)

  const answers = await getReadAnswers(paperId)
  if (paper.status !== 'needs_you') {
    return shell('Reading', 2, <ReadingScreen name={paper.childFirstName} nameRead={paper.name_read} answers={answers.length} reading={paper.status === 'reading'} photoUrl={photoUrl} />)
  }

  const wrong = answers.filter((a) => !a.correct)
  const slip = wrong.find((a) => a.misconception)
  const earlier = slip?.misconception ? await earlierSameSlip(childId, paperId, slip.misconception) : null
  const lessons = slip ? await getUpcomingLessons(childId, slip.topic_name) : []
  const nums = wrong.map((a) => a.n)
  const next =
    slip?.misconception && wrong.length > 0
      ? `Question${nums.length === 1 ? '' : 's'} ${joinNumbers(nums)} ${nums.length === 1 ? 'shows' : 'show'} ${
          earlier ? `the same slip as ${earlier.title}` : 'a slip'
        }: ${lower(slip.misconception)}.${lessons[0] ? ` ${lessons[0].weekday}'s lesson covers it.` : ''}`
    : null

  return shell(
    'Check what Jemma read',
    3,
    <CheckScreen
      childId={childId}
      paperId={paperId}
      answers={answers.map((a) => ({ n: a.n, prompt: a.prompt, answer: a.answer_read, right: a.correct, unsure: a.read_confidence < UNSURE_BELOW }))}
      title={`${answers[0]?.topic_name ?? 'Homework'}, ${paper.pageCount || 1} page${paper.pageCount > 1 ? 's' : ''}`}
      written={`Written ${shortDate(paper.created_at)} · teacher marked ${answers.filter((a) => a.correct).length} of ${answers.length}`}
      photoUrl={photoUrl}
      next={next}
      retakeHref={retake}
    />,
  )
}
