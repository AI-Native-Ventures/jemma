import { WaysIn, WRAP } from './Bits'
import { Gem, Phone } from './Shot'

/** The three states of a topic in the app, as the small card pinned to the hero phone shows them: an empty gem, a half gem, a pale gem. */
const STATES = [
  { label: 'New', now: false, edge: '#161616' },
  { label: 'Practising', now: true, edge: '#161616' },
  { label: 'Fixed', now: false, edge: '#B9B5AC' },
] as const

/**
 * The first screen: what Jemma is for in one line, one sentence, the two buttons and one phone screenshot. The screenshot is whole at every
 * width: under the words on a phone, beside them on a laptop, with a small card pinned to it.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title">
      <div className={`${WRAP} flex flex-col gap-12 pt-5 pb-16 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:pt-10 lg:pb-[120px] xl:pt-14`}>
        <div className="flex min-w-0 flex-col items-start lg:max-w-[780px] lg:flex-1">
          <p className="m-0 flex min-h-[34px] items-center gap-2 rounded-pill border border-line bg-card pr-3.5 pl-3 text-[14px] leading-[normal] font-semibold">
            <Gem size={11} />
            Maths · Grade 1 to 12
          </p>
          <h1 id="hero-title" className="m-0 mt-6 text-[38px] leading-[1.06] font-bold tracking-[-0.025em] sm:text-[60px] xl:mt-8 xl:text-[76px] min-[90rem]:text-[84px]">
            <span className="block">Learn maths</span> <span className="block">until you</span>{' '}
            <span className="block">
              <span className="relative whitespace-nowrap">
                understand it.
                <svg aria-hidden="true" viewBox="0 0 300 24" preserveAspectRatio="none" className="absolute bottom-[-0.05em] left-0 h-[0.2em] w-[94%] overflow-visible">
                  <path d="M3 15C70 6 160 2 296 8c3 0 4 5 1 6C170 12 82 15 7 22c-5 1-7-6-4-7z" fill="#FFB81C" />
                </svg>
              </span>
            </span>
          </h1>
          <p className="m-0 mt-6 max-w-[30em] text-[18px] leading-[1.5] text-body sm:text-[20px] lg:text-[22px] xl:mt-7 xl:text-[24px]">
            Jemma teaches you a short lesson, marks your answers, and teaches again what you got wrong. Every lesson is free.
          </p>
          <div className="mt-8 w-full xl:mt-10">
            <WaysIn />
          </div>
          <p className="m-0 mt-[22px] flex items-center gap-2.5 text-[15px] leading-[1.4] text-body lg:text-[16px]">
            <Gem size={10} fill="#161616" />
            No sign-up needed.
          </p>
        </div>
        <div className="flex min-w-0 justify-center lg:flex-none">
          <div className="relative h-[calc(var(--phone)*2.3)] w-[calc(var(--phone)*1.24)] flex-none [--phone:248px] sm:[--phone:300px] xl:[--phone:340px]">
            <span aria-hidden="true" className="absolute top-[calc(var(--phone)*0.3)] left-0 size-[calc(var(--phone)*1.08)] rounded-full bg-gold-soft" />
            <Gem className="absolute top-[calc(var(--phone)*0.1)] left-[calc(var(--phone)*0.08)] size-[calc(var(--phone)*0.1)]" />
            <svg aria-hidden="true" viewBox="0 0 16 16" className="absolute top-[calc(var(--phone)*0.27)] left-0 size-[calc(var(--phone)*0.065)]">
              <polygon points="8,1.5 14.5,8 8,14.5 1.5,8" fill="none" stroke="#161616" strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
            <Gem fill="#161616" className="absolute top-[calc(var(--phone)*0.03)] left-[calc(var(--phone)*0.21)] size-[calc(var(--phone)*0.04)]" />
            <div className="absolute top-[calc(var(--phone)*0.05)] right-0">
              <Phone
                src="/landing/results.png"
                alt="Amina's results on Jemma: Amina finished, and the one answer Amina missed is explained step by step."
                width={390}
                height={844}
                priority
              />
            </div>
            {/* The card pinned to the phone is decoration: a screen reader skips it. */}
            <div
              aria-hidden="true"
              className="absolute top-[calc(var(--phone)*1.7)] -left-2 w-[calc(var(--phone)*0.62)] rotate-[-4deg] rounded-14 bg-card px-3.5 pt-4 pb-3 shadow-[0_22px_40px_-22px_rgba(22,22,22,0.45),0_2px_6px_rgba(22,22,22,0.06)]"
            >
              <span className="absolute -top-[9px] left-1/2 -ml-7 h-[18px] w-14 rotate-[4deg] bg-green/30" />
              <span className="block text-[11px] leading-[1.3] font-semibold text-body">Amina is working on</span>
              <span className="mt-px mb-2.5 block text-[13px] leading-[1.3] font-bold">Adding fractions</span>
              <span className="flex justify-between gap-1">
                {STATES.map((state) => (
                  <span key={state.label} className={`flex flex-col items-center gap-1 text-[10px] leading-[1.2] ${state.now ? 'font-bold text-ink' : 'font-semibold text-body'}`}>
                    <svg width="18" height="18" viewBox="0 0 18 18" className="flex-none">
                      <polygon points="9,1.5 16.5,9 9,16.5 1.5,9" fill="#FFFFFF" />
                      {state.now ? <polygon points="1.5,9 16.5,9 9,16.5" fill="#FFB81C" /> : null}
                      <polygon points="9,1.5 16.5,9 9,16.5 1.5,9" fill="none" stroke={state.edge} strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                    {state.label}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
