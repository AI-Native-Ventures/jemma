import { GemIcon } from '@/components/ui'
import { SnapKindPicker } from './SnapKindPicker'

/** parent-snap-type: what is being snapped. */
export default async function SnapTypePage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  return (
    <div className="flex min-h-[calc(100dvh-132px)] flex-col gap-5 px-5 pb-5 pt-3.5 leading-[normal] lg:mx-auto lg:max-w-[560px]">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[14px] font-semibold text-body">Snap · step 1 of 3</p>
        <div className="flex items-start gap-2.5">
          <GemIcon size={14} className="mt-2.5 flex-none" />
          <h1 className="m-0 text-[27px] font-semibold leading-[1.18] tracking-[-0.015em]">What are you snapping?</h1>
        </div>
      </div>
      <SnapKindPicker childId={childId} />
    </div>
  )
}
