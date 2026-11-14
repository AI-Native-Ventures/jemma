import { Button } from '@/components/ui/Button'
import { Wordmark } from '@/components/install/Wordmark'
import { Gem, Shot } from './Shot'

/** Room on every button: at least 56 px high, 32 px at the sides, and a long label takes a second line instead of touching the edge. */
const BUTTON = '!h-auto min-h-14 !px-8 py-3 text-center text-balance sm:min-w-[200px]'

/** The first screen: the wordmark, the one line Jemma stands for, two buttons and one phone screenshot (beside the words on a laptop, under them on a phone). */
export function Hero() {
  return (
    <section aria-labelledby="hero-title">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10 px-5 pt-8 pb-10 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16 lg:px-10 lg:pt-16 lg:pb-20">
        <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
          <Wordmark width={140} height={55} />
          <div className="flex flex-col gap-4">
            <h1 id="hero-title" className="m-0 text-[36px] leading-[1.08] font-bold tracking-[-0.02em] text-balance lg:text-[56px]">
              Follows one learner across years, not one term.
            </h1>
            <p className="m-0 max-w-[34rem] text-[18px] leading-[1.5] text-body text-pretty lg:text-[20px]">
              Jemma reads class tests from a photo, finds what each learner is missing, and gives them a short lesson to practise at home.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button href="/demo" className={BUTTON}>
              Try the demo
            </Button>
            <Button href="/sign-in" variant="secondary" className={BUTTON}>
              Sign in
            </Button>
          </div>
          <p className="m-0 flex items-center gap-2 text-[14px] leading-[1.4] text-body">
            <Gem size={14} />
            Every learner in the demo is made up.
          </p>
        </div>
        <div className="min-w-0">
          <Shot
            src="/landing/learner-my-own.png"
            alt="Amina's home in Jemma on a phone: My maths for Grade 6, a card to add her own work, and a suggested topic to practise, Fractions."
            width={390}
            height={656}
            priority
            className="mx-auto max-w-[300px] lg:max-w-[340px]"
          />
        </div>
      </div>
    </section>
  )
}
