import { FractionText } from '../../k/session/_parts/Frac'
import { countText, sumOf, totalOf, type TokenRow, type TourClass } from '../data/class'

const card = 'flex flex-col gap-4 rounded-[22px] border border-line bg-card p-5'

/** A sentence of the analysis: its maths (an equation, a fraction, a power) is drawn as a textbook draws it. */
const Words = ({ text }: { text: string }) => <FractionText text={text} size={18} rule={2} gap={3} side={4} typeset="algebra" />

/** What Jemma wrote about the class: how it went, the usual mistakes, who needs help, and what to teach again. */
export function AnalysisCard({ analysis }: { analysis: TourClass['analysis'] }) {
  return (
    <section aria-labelledby="analysis" className={card}>
      <div className="flex flex-col gap-1.5">
        <h2 id="analysis" className="m-0 text-[20px] leading-[1.2] font-bold">What Jemma sees in the class</h2>
        <p className="m-0 text-[16px] leading-[1.5]"><Words text={analysis.summary} /></p>
      </div>

      <div className="flex flex-col gap-2.5">
        <h3 className="m-0 text-[16px] font-bold">Common mistakes</h3>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {analysis.mistakes.map((m) => (
            <li key={m.title} className="flex flex-col gap-1 rounded-14 bg-soft-2 px-3.5 py-3">
              <span className="text-[16px] font-bold">{m.title}</span>
              <span className="text-[15px] leading-[1.5] text-body"><Words text={m.detail} /></span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2.5">
        <h3 className="m-0 text-[16px] font-bold">Who needs help</h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {analysis.needHelp.map((n) => (
            <li key={n.name} className="flex flex-col gap-0.5 rounded-14 border border-[#FFC9BB] bg-coral-wash px-3.5 py-3">
              <span className="text-[16px] font-bold">{n.name}</span>
              <span className="text-[15px] leading-[1.5]"><Words text={n.why} /></span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2.5">
        <h3 className="m-0 text-[16px] font-bold">What to teach again</h3>
        <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-[1.5]">
          {analysis.reteach.map((r) => (
            <li key={r}><Words text={r} /></li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const cell = 'py-2 text-right whitespace-nowrap tabular-nums'

function Rows({ head, rows, total }: { head: string; rows: ({ label: string } & TokenRow)[]; total: TokenRow }) {
  return (
    <table className="w-full border-collapse text-[14px]">
      <thead>
        <tr className="text-[12px] font-semibold text-body">
          <th scope="col" className="py-1 text-left font-semibold">{head}</th>
          <th scope="col" className="py-1 text-right font-semibold">Read</th>
          <th scope="col" className="py-1 pl-3 text-right font-semibold">Written</th>
          <th scope="col" className="py-1 pl-3 text-right font-semibold">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-soft">
            <th scope="row" className="min-w-0 py-2 text-left font-semibold">{r.label}</th>
            <td className={cell}>{countText(r.input)}</td>
            <td className={`${cell} pl-3`}>{countText(r.output)}</td>
            <td className={`${cell} pl-3 font-semibold`}>{countText(totalOf(r))}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-ink font-bold">
          <th scope="row" className="py-2 text-left">All</th>
          <td className={cell}>{countText(total.input)}</td>
          <td className={`${cell} pl-3`}>{countText(total.output)}</td>
          <td className={`${cell} pl-3`}>{countText(totalOf(total))}</td>
        </tr>
      </tbody>
    </table>
  )
}

/**
 * The tokens the model read and wrote for this topic, in all, by job and by learner. It draws whatever rows `tokens` of the class file holds and adds
 * them up itself, so a real run's counts need no change here.
 */
export function TokensCard({ tokens }: { tokens: TourClass['tokens'] }) {
  const jobs = tokens.jobs
  const learners = tokens.perLearner.map((l) => ({ ...l, label: l.name }))
  const jobTotal = sumOf(jobs)
  const learnerTotal = sumOf(learners)
  return (
    <section aria-labelledby="tokens" className={card}>
      <div className="flex flex-col gap-1">
        <h2 id="tokens" className="m-0 text-[20px] leading-[1.2] font-bold">Tokens spent</h2>
        <p className="m-0 flex items-baseline gap-2">
          <span data-tokens-total="true" className="text-[34px] leading-[1.1] font-bold tabular-nums">{countText(totalOf(jobTotal))}</span>
          <span className="text-[15px] text-body">tokens for this topic</span>
        </p>
        <p className="m-0 text-[14px] text-body">{countText(jobTotal.input)} read and {countText(jobTotal.output)} written by the model.</p>
      </div>
      <Rows head="Job" rows={jobs} total={jobTotal} />
      {learners.length > 0 ? <Rows head="Learner" rows={learners} total={learnerTotal} /> : null}
    </section>
  )
}
