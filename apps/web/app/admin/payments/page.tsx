import { rangeOf, rangeStart, RANGES } from '@/lib/admin'
import { getPayments } from '@/lib/data/admin'
import { dollarText, randText } from '@/lib/plans'
import { longDate } from '@/lib/zones'
import { AdminShell, Empty, PageHeader, RangeControls, Tile, fmt } from '../_parts'

export const metadata = { title: 'Payments · Jemma admin' }

const STATUS: Record<string, { label: string; cls: string; icon: string }> = {
  paid: { label: 'Paid', cls: 'bg-green-tint text-green-deep', icon: 'm5 12.5 4.5 4.5L19 7.5' },
  failed: { label: 'Failed', cls: 'bg-[#FBE3E0] text-red-text', icon: 'M12 7v6M12 17h.01' },
  refunded: { label: 'Refunded', cls: 'bg-soft text-ink', icon: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11' },
}

/** P161: the payments PayFast told Jemma about, and the plans cancelled lately. */
export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = rangeOf((await searchParams).range)
  const d = await getPayments(rangeStart(range))
  const inRange = range === 'today' ? 'today' : range === 'year' ? 'this year' : `in ${RANGES.find((r) => r.id === range)!.label.toLowerCase()}`
  return (
    <AdminShell active="payments">
      <PageHeader title="Payments">
        <RangeControls base="/admin/payments" range={range} country="all" />
      </PageHeader>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Tile label="Paid" value={`$${fmt(d.paidUsd)}`} note={`${d.paidCount} payments ${inRange}`} />
        <Tile label="Plans running" value={fmt(d.running)} note="each renews a year after it started" />
        <Tile label="Failed" value={fmt(d.failed)} note={`${inRange}: the parent is asked to change the card`} />
        <Tile label="Cancelled" value={fmt(d.cancelledCount)} note={`${inRange}: they run to the end of their year`} />
      </div>
      <div className="flex flex-col items-start gap-5 xl:flex-row">
        <section aria-labelledby="latest" className="flex w-full min-w-0 flex-1 flex-col gap-4 rounded-20 border border-line bg-card p-5">
          <h2 id="latest" className="m-0 text-[19px] font-bold">
            Latest payments
          </h2>
          {d.rows.length ? (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Date', 'Paid by', 'Plan', 'Dollars', 'PayFast took', 'Fee', 'Status'].map((h, i) => (
                    <th key={h} className={`border-b border-line px-3 py-3 text-[13px] font-semibold text-body ${i >= 3 && i <= 5 ? 'text-right' : 'text-left'} ${i === 0 ? 'pl-0' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((p) => {
                  const s = STATUS[p.status] ?? STATUS.failed!
                  return (
                    <tr key={p.id}>
                      <td className="border-b border-soft px-3 py-3 pl-0 text-[15px]">{longDate(new Date(p.at))}</td>
                      <td className="border-b border-soft px-3 py-3 text-[15px] font-semibold">{p.who}</td>
                      <td className="border-b border-soft px-3 py-3 text-[15px]">
                        {p.plan}
                        {p.kind === 'upgrade' ? ', difference' : p.kind === 'renewal' ? ', renewal' : ''}
                      </td>
                      <td className="border-b border-soft px-3 py-3 text-right text-[15px] tabular-nums">{p.usd ? dollarText(p.usd) : ''}</td>
                      <td className="border-b border-soft px-3 py-3 text-right text-[15px] tabular-nums">{p.zarCents ? randText(p.zarCents) : ''}</td>
                      <td className="border-b border-soft px-3 py-3 text-right text-[15px] text-body tabular-nums">{p.feeZarCents ? randText(p.feeZarCents) : ''}</td>
                      <td className="border-b border-soft px-3 py-3 text-[15px]">
                        <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[13px] font-bold ${s.cls}`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d={s.icon} />
                          </svg>
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <Empty>No payments yet.</Empty>
          )}
        </section>
        <aside aria-labelledby="ending" className="flex w-full flex-none flex-col gap-4 rounded-20 border border-line bg-card p-5 xl:w-[360px]">
          <h2 id="ending" className="m-0 text-[19px] font-bold">
            Cancelled plans
          </h2>
          {d.cancelled.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {d.cancelled.map((c, i) => (
                <li key={c.id} className={`flex flex-col gap-0.5 py-3 ${i > 0 ? 'border-t border-soft' : 'pt-0'}`}>
                  <span className="text-[15px] font-semibold">{c.who}</span>
                  <span className="text-[14px] text-body">
                    {c.plan}
                    {c.until ? ` · runs to ${longDate(new Date(c.until))}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No plan was cancelled.</Empty>
          )}
          <div className="flex flex-col gap-2 rounded-14 bg-soft-2 p-3.5 text-[14px] leading-[1.5]">
            <span className="font-bold">How cancelling works</span>
            <span>A parent cancels in Jemma. Jemma stops the plan on PayFast at once, so nothing more is charged.</span>
            <span>The family keeps the plan to the end of the year that was paid for.</span>
          </div>
        </aside>
      </div>
    </AdminShell>
  )
}
