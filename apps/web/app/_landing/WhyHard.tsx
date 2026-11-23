import { Arrow, BAND, LEAD, Title, WRAP } from './Bits'
import { Gem } from './Shot'

// One missed step, and what it does to the years after it. Only the first card is the missed one: it has the red edge and the red chip.
const YEARS = [
  { grades: 'Grade 4 to 6', topic: 'Fractions', line: 'You miss adding fractions.', missed: true },
  { grades: 'Grade 7 to 9', topic: 'Algebra', line: 'So equations with fractions go wrong.', missed: false },
  { grades: 'Grade 10 to 12', topic: 'Trigonometry and calculus', line: 'Then these get hard too.', missed: false },
] as const

/** Why maths gets hard: a step missed in one year makes the next years hard. Three cards in a row on a laptop, one under the other on a phone. */
export function WhyHard() {
  return (
    <section aria-labelledby="hard-title" className="bg-green-tint">
      <div className={`${WRAP} ${BAND}`}>
        <div className="mx-auto flex max-w-[860px] flex-col items-center text-center">
          <p className="m-0 flex min-h-[34px] items-center gap-2 rounded-pill border border-line bg-card pr-3.5 pl-3 text-[14px] leading-[normal] font-semibold text-green">
            <Gem size={11} />
            Why maths gets hard
          </p>
          <Title id="hard-title" gem={false} className="mt-5">
            Miss one step, and the next is hard.
          </Title>
          <p className={`${LEAD} mt-[18px] max-w-[26em]`}>You are not bad at maths. Jemma teaches again the step you missed.</p>
        </div>
        <ol className="m-0 mx-auto mt-7 grid max-w-[1120px] list-none grid-cols-1 gap-4 p-0 md:grid-cols-3 lg:mt-12 lg:gap-6 xl:gap-7">
          {YEARS.map((year) => (
            <li
              key={year.grades}
              className={`flex min-w-0 flex-col gap-2.5 rounded-[22px] bg-card p-[22px] text-left lg:p-7 xl:rounded-[30px] xl:p-9 ${year.missed ? 'border-2 border-red' : 'border border-line'}`}
            >
              <span className="flex min-h-7 items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  {year.missed ? null : <Arrow strokeWidth={2.4} className="text-red-text" />}
                  <span className="text-[15px] font-semibold text-body xl:text-[17px]">{year.grades}</span>
                </span>
                {year.missed ? (
                  <span className="flex min-h-7 items-center rounded-pill border-[1.5px] border-red px-3 text-[14px] leading-[normal] font-bold text-red-text">missed</span>
                ) : null}
              </span>
              <h3 className="m-0 text-[26px] leading-[1.1] font-bold tracking-[-0.02em] text-balance lg:text-[32px] xl:text-[38px]">{year.topic}</h3>
              <p className="m-0 text-[17px] leading-[1.4] text-body text-pretty lg:text-[19px] xl:text-[21px]">{year.line}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
