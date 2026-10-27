import { headers } from 'next/headers'
import { getClassTests, getPile, getRoster } from '@/lib/data/p31'
import { getSnapView } from '@/lib/data/p34'
import { notFound } from 'next/navigation'
import { Flow, PageTitle } from '../../_parts'
import { Poller } from '../../Poller'
import { LaptopSnap } from './LaptopSnap'
import { Queue, RetakeButton, Thumb } from './Queue'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Board `teacher-snap-queue`: snap papers one after another with the phone's own camera. */
export default async function SnapQueuePage({ params }: { params: Promise<{ classId: string; testId: string }> }) {
  const { classId, testId } = await params
  const tests = await getClassTests(classId)
  if (!tests.some((t) => t.id === testId)) notFound()
  const pile = await getPile(testId)
  const last = pile.at(-1)
  const busy = pile.some((p) => p.status === 'queued' || p.status === 'reading')

  const short = tests.find((t) => t.id === testId)!.title.split(':')[0]
  const [view, roster, h] = await Promise.all([getSnapView(testId), getRoster(classId, testId), headers()])
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return (
    <>
    {view ? <LaptopSnap classId={classId} testId={testId} view={view} learners={roster.length} phoneUrl={`${proto}://${host}/t/${classId}/snap/${testId}/papers`} /> : null}
    <div className="lg:hidden">
    <Flow href={`/t/${classId}/snap/${testId}/key`} label="Back to the answer key" title="Snap the papers" subtitle={`${short} · key approved`} subtitleFirst>
    <div className="flex flex-col gap-4 px-5 pt-3 pb-6 leading-[normal]">
      <Poller active={busy} />
      <div className="flex flex-col gap-2">
        <PageTitle size={26}>{pile.length === 0 ? 'Snap the first paper.' : `${plural(pile.length, 'paper')} in. Snap the next one, or add a page.`}</PageTitle>
        <p className="m-0 ml-6 text-[15px] leading-[1.45] text-body text-pretty">Each photo opens your phone&apos;s own camera. Jemma reads while you snap.</p>
      </div>
      <Queue classId={classId} testId={testId} next={pile.length + 1} lastPaper={last ? { id: last.id, position: last.position } : null} count={pile.length}>
        {pile.length > 0 ? (
          <section aria-labelledby="pile" className="flex flex-col gap-1 rounded-20 border border-line bg-card p-4">
            <div className="flex flex-col gap-0.5">
              <h2 id="pile" className="m-0 text-[17px] font-semibold">In the pile</h2>
              <p className="m-0 text-[14px] text-body">Tap retake if a photo is blurry or cut off</p>
            </div>
            <ul className="m-0 list-none p-0">
              {pile.map((p) => {
                const named = p.childName ?? null
                const state =
                  p.status === 'queued' ? 'waiting' : p.status === 'reading' ? 'reading now' : p.status === 'failed' ? 'could not read' : named ? 'name found' : 'needs you'
                const read = p.status === 'queued' || p.status === 'reading' || !named
                return (
                  <li key={p.id} className="flex min-h-[72px] items-center gap-3 border-t border-soft">
                    <Thumb two={p.pages > 1} />
                    <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                      <span className="text-[16px] font-semibold">{read ? `Paper ${p.position} · name not read yet` : `Paper ${p.position} · ${named}`}</span>
                      <span className="text-[14px] text-body">{plural(p.pages, 'page')} · {state}</span>
                    </span>
                    <RetakeButton classId={classId} paperId={p.id} position={p.position} />
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
      </Queue>
    </div>
    </Flow>
    </div>
    </>
  )
}
