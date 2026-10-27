import type { ReactNode } from 'react'
import { READ_MIN, getKeyView, getTestLog } from '@/lib/data/p31'
import { WhatJemmaDid } from '@/components/blocks'
import { Poller } from '../../../Poller'
import { Diamond, Flow } from '../../../_parts'
import { DraftKey } from './DraftKey'

/** Board `teacher-key-draft`: no memo, so Jemma worked the answers out. */
export default async function KeyDraftPage({ params }: { params: Promise<{ classId: string; testId: string }> }) {
  const { classId, testId } = await params
  const key = await getKeyView(classId, testId)
  const short = key.test.title.split(':')[0]
  const shell = (body: ReactNode) => (
    <Flow href={`/t/${classId}/snap`} label="Back" title="Answer key" subtitle={`${short} · no memo`} subtitleFirst>
      {body}
    </Flow>
  )
  if (key.items.length === 0) {
    return shell(
      <div className="px-5 pt-3 pb-6 leading-[normal]">
        <section aria-live="polite" className="flex flex-col gap-3.5 rounded-[22px] border border-line bg-card px-5 py-[22px]">
          <Diamond size={20} />
          <h1 className="m-0 text-[26px] leading-[1.15] font-semibold tracking-[-0.015em]">Working out the answers</h1>
          <p className="m-0 text-[16px] leading-[1.45] text-body">You can leave this screen. The answers will be here when you come back.</p>
          <Poller active />
        </section>
      </div>,
    )
  }
  const log = await getTestLog(classId, key.createdAt ?? new Date(0).toISOString())
  const unsure = key.items.filter((i) => i.confidence < READ_MIN || i.note).map((i) => i.n)
  return shell(
    <div className="flex flex-col gap-[18px] px-5 pt-3 pb-6 leading-[normal]">
      <DraftKey classId={classId} testId={testId} items={key.items} unsure={unsure} approved={key.status === 'approved'}>
        <WhatJemmaDid entries={log} variant="parent" />
      </DraftKey>
    </div>,
  )
}
