import { CameraIcon } from '@/components/ui/icons'
import { BAND, Title, WRAP } from './Bits'
import { Phone, type ShotProps } from './Shot'

type Step = { title: string; detail: string; tray: string; shot: Omit<ShotProps, 'priority' | 'className'> }

// The four steps of a lesson, in the order a learner meets them. Each picture is a real screen of the app with a made-up learner.
const STEPS: readonly Step[] = [
  {
    title: 'Learn',
    detail: 'A short lesson. Read it, see it in pictures, or listen.',
    tray: 'bg-gold-tint',
    shot: { src: '/landing/step-learn.png', alt: 'A lesson for Amina on adding and subtracting fractions: Amina can listen to it or read along.', width: 390, height: 844 },
  },
  {
    title: 'Try',
    detail: 'Answer the questions. Type them, or snap your paper.',
    tray: 'bg-soft-4',
    shot: { src: '/landing/step-try.png', alt: 'Question 1 of 5: what is one half plus one quarter?', width: 390, height: 844 },
  },
  {
    title: 'Jemma marks it',
    detail: 'You see what you got wrong, and why.',
    tray: 'bg-green-tint',
    shot: { src: '/landing/results.png', alt: "Amina's results: the answer Amina missed, why, and the right way.", width: 390, height: 844 },
  },
  {
    title: 'Learn it again',
    detail: 'Jemma teaches that part again. Practise until you get it right.',
    tray: 'bg-gold-tint',
    shot: { src: '/landing/step-learn-again.png', alt: 'Amina moved adding fractions from New to Practising.', width: 390, height: 844 },
  },
]

/** Four numbered steps, each with the top of a phone screen in a tray, and one line about a test from school. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="bg-card">
      <div className={`${WRAP} ${BAND}`}>
        <Title id="how-title">How it works</Title>
        <ol className="m-0 mt-7 grid list-none grid-cols-1 gap-x-7 gap-y-8 p-0 sm:grid-cols-2 lg:mt-12 lg:grid-cols-4 xl:gap-y-10">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex min-w-0 flex-col gap-[22px]">
              <div
                className={`flex h-[250px] items-start justify-center overflow-hidden rounded-[22px] pt-7 [--phone:210px] sm:h-[300px] lg:[--phone:200px] xl:h-[400px] xl:rounded-[28px] xl:pt-10 xl:[--phone:240px] ${step.tray}`}
              >
                <Phone {...step.shot} />
              </div>
              <div className="flex items-start gap-3.5">
                <span aria-hidden="true" className="flex size-[38px] flex-none items-center justify-center rounded-pill bg-ink text-[18px] leading-[normal] font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 pt-[3px]">
                  <h3 className="m-0 text-[21px] leading-[1.25] font-bold xl:text-[26px]">{step.title}</h3>
                  <p className="m-0 mt-1.5 text-[17px] leading-[1.45] text-body text-pretty xl:text-[20px]">{step.detail}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="m-0 mt-8 inline-flex min-h-11 items-center gap-3 rounded-18 bg-gold-tint px-[18px] py-2.5 text-[16px] leading-[1.35] font-semibold lg:mt-12 lg:text-[19px]">
          <CameraIcon size={24} strokeWidth={1.8} className="flex-none" />
          <span className="text-balance">Got a test back from school? Snap it. Jemma finds what to practise.</span>
        </p>
      </div>
    </section>
  )
}
