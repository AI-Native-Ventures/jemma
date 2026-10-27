import { READ_MIN, getKeyView, hhmm } from '@/lib/data/p31'
import { Poller } from '../../Poller'
import { Diamond } from '../../_parts'
import { KeyList } from './KeyList'

/** Board `teacher-snap-key`: check the answers Jemma read from the memo, then approve. */
export default async function SnapKeyPage({ params }: { params: Promise<{ classId: string; testId: string }> }) {
  const { classId, testId } = await params
  const key = await getKeyView(classId, testId)
  const unsure = key.items.filter((i) => i.confidence < READ_MIN || i.note).length

  return (
    <>
      <div aria-hidden="true" className="grid grid-cols-3 gap-1.5 px-5 pt-1">
        <span className="h-1 rounded-pill bg-ink" />
        <span className="h-1 rounded-pill bg-coral" />
        <span className="h-1 rounded-pill bg-[#E3E1EE]" />
      </div>
      <div className="flex flex-col gap-[18px] px-5 pt-[18px] pb-4 leading-[normal]">
        {key.items.length === 0 ? (
          <section aria-live="polite" className="flex flex-col gap-3.5 rounded-[22px] border border-line bg-card px-5 py-[22px]">
            <Diamond size={20} />
            <h1 className="m-0 text-[26px] leading-[1.15] font-semibold tracking-[-0.015em]">Reading the memo</h1>
            <p className="m-0 text-[16px] leading-[1.45] text-body">This takes a moment. You can leave this screen. The answers will be here when you come back.</p>
            <Poller active />
          </section>
        ) : (
          <KeyList
            classId={classId}
            testId={testId}
            items={key.items}
            approved={key.status === 'approved'}
            unsure={unsure}
            memo={{
              url: key.memoUrl,
              at: key.memoAt ? hhmm(key.memoAt) : null,
              marks: key.items[0]?.marks ?? 1,
            }}
          />
        )}
      </div>
    </>
  )
}
