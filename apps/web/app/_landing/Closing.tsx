import { BeadHem, WaysIn, WRAP } from './Bits'
import { Gem } from './Shot'

/** The green band at the end of the page: one more invitation to try a lesson, with the same two buttons as the first screen. */
export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="relative overflow-hidden bg-green text-white">
      <BeadHem id="hem-closing" className="absolute top-0 left-0" />
      <div className={`${WRAP} relative flex flex-wrap items-center justify-between gap-x-14 gap-y-7 pt-[52px] pb-11 lg:pt-20 lg:pb-[72px] xl:pt-[104px] xl:pb-24`}>
        {/* three gems in the corner, only a picture */}
        <Gem className="absolute top-11 right-9 size-7" />
        <svg aria-hidden="true" viewBox="0 0 16 16" className="absolute top-[74px] right-[82px] size-4">
          <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
        <Gem fill="#161616" className="absolute top-[86px] right-[30px] size-2.5" />
        <div className="max-w-[calc(100%-64px)] min-w-0 flex-[1_1_420px]">
          <h2 id="closing-title" className="m-0 text-[32px] leading-[1.06] font-bold tracking-[-0.02em] text-balance sm:text-[40px] lg:text-[48px] xl:text-[56px]">
            Try a lesson now.
          </h2>
          <p className="m-0 mt-3 text-[17px] leading-[1.5] text-green-tint xl:text-[20px]">No sign-up needed.</p>
        </div>
        <div className="flex max-w-[520px] flex-[1_1_300px]">
          <WaysIn onGreen />
        </div>
      </div>
    </section>
  )
}
