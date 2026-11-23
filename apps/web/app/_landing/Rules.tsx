import { Gem } from './Shot'

// The four rules of the README ("The rules it keeps"), in plain words. Each detail is true of the product as the README says it.
const RULES = [
  {
    title: 'A profile, never a label.',
    detail: 'Jemma shows a pattern, like fractions staying low for three terms. It never gives a child a track, a path or a career.',
  },
  {
    title: 'Every claim has a source.',
    detail: 'Each pattern lists the tests and notes it comes from, and a teacher can open each one.',
  },
  {
    title: 'The teacher goes first.',
    detail: 'Results and Long view patterns reach a family only after the teacher says yes.',
  },
  {
    title: 'Never ranked against classmates.',
    detail: 'A learner is never compared with a classmate, and never sees a rank.',
  },
] as const

/** The rules Jemma keeps, as four short lines. */
export function Rules() {
  return (
    <section aria-labelledby="rules-title">
      <div className="mx-auto w-full max-w-[1120px] px-5 py-10 lg:px-10 lg:py-14">
        <div className="rounded-[26px] border border-[#FFDC93] bg-gold-wash p-6 lg:p-10">
          <h2 id="rules-title" className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.01em] lg:text-[36px]">
            The rules it keeps
          </h2>
          <ul className="m-0 mt-6 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:gap-x-10 lg:gap-y-7">
            {RULES.map((rule) => (
              <li key={rule.title} className="flex min-w-0 items-start gap-3">
                <Gem size={14} className="mt-[7px]" />
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="m-0 text-[18px] leading-[1.3] font-semibold text-pretty">{rule.title}</h3>
                  <p className="m-0 text-[15px] leading-[1.45] text-body text-pretty">{rule.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
