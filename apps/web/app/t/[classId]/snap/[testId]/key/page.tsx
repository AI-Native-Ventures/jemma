import { READ_MIN, getKeyView, hhmm } from '@/lib/data/p31'
import { createSupabaseServer } from '@/lib/supabase/server'
import { Poller } from '../../Poller'
import { Diamond, Flow } from '../../_parts'
import { KeyList } from './KeyList'
import { MemoReadFailed } from './MemoReadFailed'

/**
 * True when the newest `key.snapped` event of this test ended failed (the teacher's own session reads it, as the curriculum screen reads
 * its `curriculum.uploaded` event). Asked only while the key has no answers: a key with answers is shown whatever the event says.
 */
async function memoReadFailed(testId: string): Promise<boolean> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.from('events').select('status').eq('type', 'key.snapped').eq('payload->>testId', testId).order('created_at', { ascending: false }).limit(1)
  return data?.[0]?.status === 'failed'
}

/** Board `teacher-snap-key`: check the answers Jemma read from the memo, then approve. */
export default async function SnapKeyPage({ params }: { params: Promise<{ classId: string; testId: string }> }) {
  const { classId, testId } = await params
  const key = await getKeyView(classId, testId)
  const unsure = key.items.filter((i) => i.confidence < READ_MIN || i.note).length
  const failed = key.items.length === 0 && (await memoReadFailed(testId))

  return (
    <Flow href={`/t/${classId}/snap`} label="Back" title="Answer key" subtitle={key.test.title} right="Step 2 of 3">
      <div aria-hidden="true" className="grid grid-cols-3 gap-1.5 px-5 pt-1">
        <span className="h-1 rounded-pill bg-ink" />
        <span className="h-1 rounded-pill bg-coral" />
        <span className="h-1 rounded-pill bg-[#E3E1EE]" />
      </div>
      <div className="flex flex-col gap-[18px] px-5 pt-[18px] pb-4 leading-[normal]">
        {failed ? (
          <MemoReadFailed classId={classId} testId={testId} />
        ) : key.items.length === 0 ? (
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
    </Flow>
  )
}
