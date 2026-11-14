import { PendingButton } from '@/components/ui/Button'
import { startOwnPractice } from './handover/own-actions'

/**
 * "Practise at home with {name}": the parent's way into the learner's own private workspace. The button starts the same hand-over as "Start, then
 * hand {name} the phone", with no session to start: the child lands on the home of their own practice and chooses a topic. Nothing in it changes
 * the school record. The parent never sees the private workspace as a second child: this is one button on the one learner's screen. The words
 * name the learner and use no he or she.
 */
export function OwnPracticeCard({ childId, name }: { childId: string; name: string }) {
  const start = startOwnPractice.bind(null, childId)
  return (
    <section aria-labelledby="own-practice" className="flex flex-col gap-3 rounded-20 border border-line bg-card p-4 leading-[normal]">
      <div className="flex flex-col gap-1">
        <h2 id="own-practice" className="m-0 text-[17px] font-semibold">Practise at home</h2>
        <p className="m-0 text-[14px] leading-[1.45] text-body">{name} picks a topic from any grade. Nothing here changes the school record.</p>
      </div>
      <form action={start} className="contents">
        <PendingButton
          type="submit"
          className="flex min-h-14 w-full cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-5 py-3 text-center text-[17px] font-semibold text-balance text-ink disabled:opacity-60"
        >
          Practise at home with {name}
        </PendingButton>
      </form>
    </section>
  )
}
