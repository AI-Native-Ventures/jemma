import { rangeOf, rangeStart, RANGES } from '@/lib/admin'
import { getOverview } from '@/lib/data/admin'
import { randText } from '@/lib/plans'
import { AdminShell, Bars, Empty, Funnel, Lines, PageHeader, Panel, RangeControls, SignupChart, Tile, fmt } from './_parts'

export const metadata = { title: 'Overview · Jemma admin' }

const millions = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} million` : fmt(n))

/** P161: the owner's overview: people, sign-ups a day, the way to paying, where sign-ups came from, plans, money, AI and help messages. */
export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ range?: string; country?: string }> }) {
  const q = await searchParams
  const range = rangeOf(q.range)
  const country = q.country === 'US' || q.country === 'ZA' ? q.country : 'all'
  const o = await getOverview(rangeStart(range), country === 'all' ? null : country)
  const label = RANGES.find((r) => r.id === range)!.label.toLowerCase()
  const inRange = range === 'today' ? 'today' : range === 'year' ? 'this year' : `in ${label}`
  return (
    <AdminShell active="overview">
      <PageHeader title="Overview">
        <RangeControls base="/admin" range={range} country={country} />
      </PageHeader>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Tile label="People" value={fmt(o.people.total)} note={`${fmt(o.people.learners)} learners · ${fmt(o.people.parents)} parents · ${fmt(o.people.teachers)} teachers`} />
        <Tile label={`New ${inRange}`} value={fmt(o.joined.total)} note={`${fmt(o.joined.learners)} learners · ${fmt(o.joined.parents)} parents · ${fmt(o.joined.teachers)} teachers`} />
        <Tile label="Learners practising" value={fmt(o.practising7)} note="did a practice in 7 days" />
        <Tile label="Practices" value={fmt(o.practices)} note={`${inRange} · lessons are not counted`} />
        <Tile label="Paying families" value={fmt(o.paying.families)} note={`${fmt(o.paying.learners)} children on a plan`} />
        <Tile label="Money" value={`$${fmt(o.money.usd)}`} note={`${inRange}, ${o.money.payments} payments`} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Sign-ups a day" note="Each bar is one day. Hover a bar for its numbers.">
          <SignupChart byDay={o.byDay} />
        </Panel>
        <Panel title="From sign-up to paying" note={`Learners who joined ${inRange}, and the share of the step before.`}>
          <Funnel
            steps={[
              ['New learners', o.funnel.newLearners],
              ['Practised', o.funnel.practised],
              ['Used the 2 free in a day', o.funnel.usedFree],
              ['In a family with a plan', o.funnel.inPayingFamily],
            ]}
          />
          <Lines rows={[['Parents who started to pay', fmt(o.funnel.startedToPay)], ['Paid', fmt(o.funnel.paid)]]} />
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Where sign-ups came from" note="From the tags on your ad links (utm_source). No ad trackers inside the app.">
          {o.sources.length ? (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Came from', 'Sign-ups', 'Learners', 'Parents', 'Paying', 'Money'].map((h, i) => (
                    <th key={h} className={`border-b border-line px-3 py-2.5 text-[13px] font-semibold text-body ${i === 0 ? 'pl-0 text-left' : 'text-right'} ${i === 5 ? 'pr-0' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {o.sources.map((s) => (
                  <tr key={s.source}>
                    <td className="border-b border-soft px-3 py-3 pl-0 text-[15px] font-semibold">{s.source}</td>
                    <td className="border-b border-soft px-3 py-3 text-right text-[15px] tabular-nums">{fmt(s.signups)}</td>
                    <td className="border-b border-soft px-3 py-3 text-right text-[15px] tabular-nums">{fmt(s.learners)}</td>
                    <td className="border-b border-soft px-3 py-3 text-right text-[15px] tabular-nums">{fmt(s.parents)}</td>
                    <td className="border-b border-soft px-3 py-3 text-right text-[15px] tabular-nums">{fmt(s.paying)}</td>
                    <td className="border-b border-soft px-3 py-3 pr-0 text-right text-[15px] tabular-nums">${fmt(s.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No sign-ups {inRange} yet. Tag your ad links with utm_source (for example ?utm_source=google) to see them here.</Empty>
          )}
        </Panel>
        <Panel title="Plans" note="Families on each plan today.">
          <Bars
            rows={[
              ['Light', '150 a month', o.paying.byPlan.light ?? 0],
              ['Regular', '300 a month', o.paying.byPlan.regular ?? 0],
              ['Heavy', '600 a month', o.paying.byPlan.heavy ?? 0],
            ]}
          />
          <Lines rows={[[`Plans cancelled ${inRange}`, fmt(o.paying.cancelled)]]} />
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Money" note={`Paid ${inRange}.`}>
          <span className="text-[40px] leading-none font-bold tracking-[-0.02em]">${fmt(o.money.usd)}</span>
          <Lines
            rows={[
              ['PayFast took', randText(o.money.zarCents)],
              ['PayFast fees', randText(o.money.feeZarCents)],
              ['Refunds', fmt(o.money.refunded)],
            ]}
          />
          <p className="m-0 text-[13px] leading-[1.45] text-body">The dollars are what people were asked to pay. PayFast takes rand and pays you in rand.</p>
        </Panel>
        <Panel title="AI" note={`Used ${inRange}.`}>
          <span className="text-[40px] leading-none font-bold tracking-[-0.02em]">{millions(o.ai.tokens)}</span>
          <span className="text-[14px] text-body">tokens in {fmt(o.ai.calls)} AI calls</span>
          <Lines rows={[['Practices Jemma could not write today', fmt(o.failedToday)]]} />
          <p className="m-0 text-[13px] leading-[1.45] text-body">From the token counts Jemma saves for every AI call. The cost is on Cloudflare&apos;s dashboard.</p>
        </Panel>
        <Panel title="Help messages" note="The newest.">
          {o.help.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {o.help.map((h, i) => (
                <li key={`${h.at}-${i}`} className={`flex flex-col gap-1 py-3 ${i > 0 ? 'border-t border-soft' : 'pt-0'}`}>
                  <span className="flex justify-between gap-2 text-[13px]">
                    <span className="font-bold">{h.kind}</span>
                    <span className="text-body">{new Date(h.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                  <span className="text-[15px] leading-[1.4]">{h.text.length > 140 ? `${h.text.slice(0, 140)}...` : h.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No messages yet.</Empty>
          )}
          <a href="/admin/help" className="text-[15px] font-semibold text-ink underline underline-offset-[3px]">
            All messages
          </a>
        </Panel>
      </div>
    </AdminShell>
  )
}
