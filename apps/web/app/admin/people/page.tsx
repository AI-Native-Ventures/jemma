import Link from 'next/link'
import { getPeople, getPerson } from '@/lib/data/admin'
import { dollarText, randText } from '@/lib/plans'
import { longDate } from '@/lib/zones'
import { adminCancelPlan } from '../actions'
import { AdminShell, Lines, PageHeader, fmt } from '../_parts'

export const metadata = { title: 'People · Jemma admin' }

const ROLES = [
  { id: '', label: 'Everyone' },
  { id: 'learner', label: 'Learners' },
  { id: 'parent', label: 'Parents' },
  { id: 'teacher', label: 'Teachers' },
]
const roleName = (r: string) => r.charAt(0).toUpperCase() + r.slice(1)

/** P161: everyone, newest first, with a search by name; one person opens beside the list (their children by first name, their plan and payments). */
export default async function AdminPeople({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; id?: string; page?: string }> }) {
  const sp = await searchParams
  const q = sp.q ?? ''
  const role = sp.role ?? ''
  const page = Math.max(0, Number(sp.page) || 0)
  const [{ rows, total }, person] = await Promise.all([getPeople(q, role || null, page), sp.id ? getPerson(sp.id) : Promise.resolve(null)])
  const link = (extra: Record<string, string>) => `/admin/people?${new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}), ...extra }).toString()}`
  return (
    <AdminShell active="people">
      <PageHeader title="People" />
      <div className="flex items-start gap-5">
        <section aria-label="Everyone" className="flex min-w-0 flex-1 flex-col gap-4 rounded-20 border border-line bg-card p-5">
          <form className="flex gap-2" action="/admin/people">
            {role ? <input type="hidden" name="role" value={role} /> : null}
            <label className="flex min-h-12 flex-1 items-center gap-2.5 rounded-14 border border-line bg-ground px-3.5">
              <span className="sr-only">Search by name</span>
              <input type="search" name="q" defaultValue={q} placeholder="Search by name" className="flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-body" />
            </label>
            <button type="submit" className="min-h-12 cursor-pointer rounded-14 border-[1.5px] border-ink bg-card px-4 text-[15px] font-semibold text-ink">
              Search
            </button>
          </form>
          <nav aria-label="Role" className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <Link
                key={r.id}
                href={`/admin/people?${new URLSearchParams({ ...(q ? { q } : {}), ...(r.id ? { role: r.id } : {}) }).toString()}`}
                aria-current={r.id === role ? 'page' : undefined}
                className={`flex min-h-10 items-center rounded-pill border px-3.5 text-[14px] no-underline ${r.id === role ? 'border-ink bg-ink font-bold text-white' : 'border-line bg-card font-medium text-ink'}`}
              >
                {r.label}
              </Link>
            ))}
          </nav>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Name', 'Role', 'Country', 'Joined', 'Plan', 'Came from'].map((h, i) => (
                  <th key={h} className={`border-b border-line px-3 py-3 text-left text-[13px] font-semibold text-body ${i === 0 ? 'pl-2' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.userId} className={p.userId === sp.id ? 'bg-gold-wash' : undefined}>
                  <td className="border-b border-soft px-3 py-3 pl-2 text-[15px] font-semibold">
                    <Link href={link({ id: p.userId, ...(page ? { page: String(page) } : {}) })} className="text-ink no-underline hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="border-b border-soft px-3 py-3 text-[15px]">{roleName(p.role)}</td>
                  <td className="border-b border-soft px-3 py-3 text-[15px]">{p.country ?? <span className="text-body">Not known</span>}</td>
                  <td className="border-b border-soft px-3 py-3 text-[15px]">{longDate(new Date(p.joined))}</td>
                  <td className="border-b border-soft px-3 py-3 text-[15px]">{p.plan ?? <span className="text-body">{p.role === 'parent' ? 'Free' : 'None'}</span>}</td>
                  <td className="border-b border-soft px-3 py-3 text-[15px]">{p.source ?? <span className="text-body">No tag</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between text-[14px] text-body">
            <span>
              {fmt(Math.min(total, page * 50 + rows.length))} of {fmt(total)} · newest first
            </span>
            <span className="flex gap-4">
              {page > 0 ? <Link href={link({ page: String(page - 1) })} className="font-semibold text-ink">Newer</Link> : null}
              {(page + 1) * 50 < total ? <Link href={link({ page: String(page + 1) })} className="font-semibold text-ink">Older</Link> : null}
            </span>
          </div>
        </section>
        {person ? (
          <aside aria-label={person.profile.display_name} className="flex w-[360px] flex-none flex-col gap-4 rounded-20 border border-line bg-card p-5">
            <div className="flex flex-col gap-0.5">
              <h2 className="m-0 text-[20px] leading-[1.2] font-bold">{person.profile.display_name}</h2>
              <span className="text-[14px] text-body">
                {roleName(person.profile.role)}
                {person.signup?.country ? ` · ${person.signup.country}` : ''}
              </span>
              {person.email ? <span className="text-[14px] break-all text-body">{person.email}</span> : null}
            </div>
            <Lines
              rows={[
                ['Joined', longDate(new Date(person.profile.created_at))],
                ['Came from', [person.signup?.source, person.signup?.campaign].filter(Boolean).join(' · ') || 'No tag'],
                ['Last signed in', person.lastSeen ? longDate(new Date(person.lastSeen)) : 'Not yet'],
              ]}
            />
            {person.children.length ? (
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-[15px] font-bold">Children</h3>
                <p className="m-0 rounded-14 bg-soft-2 px-3.5 py-2.5 text-[15px]">{person.children.map((c) => c.first_name).join(', ')}</p>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-[15px] font-bold">Plan</h3>
              <p className="m-0 rounded-14 bg-soft-2 px-3.5 py-2.5 text-[15px]">
                {person.plan ? `${person.plan.name} · ${person.plan.status}${person.plan.periodEnd ? ` · to ${longDate(new Date(person.plan.periodEnd))}` : ''}` : 'Free'}
              </p>
              {person.plan?.canCancel ? (
                <form action={adminCancelPlan}>
                  <input type="hidden" name="subscription" value={person.plan.id} />
                  <button type="submit" className="flex min-h-11 w-full cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-red-text bg-card px-4 text-[15px] font-semibold text-red-text">
                    Cancel the plan on PayFast
                  </button>
                </form>
              ) : null}
            </div>
            {person.payments.length ? (
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-[15px] font-bold">Payments</h3>
                {person.payments.map((p) => (
                  <div key={p.id} className="flex justify-between gap-3 rounded-14 bg-soft-2 px-3.5 py-2.5 text-[14px]">
                    <span>{longDate(new Date(p.created_at))}</span>
                    <span className="font-semibold">
                      {p.price_usd ? dollarText(p.price_usd) : ''} {p.amount_gross_zar_cents ? `(${randText(p.amount_gross_zar_cents)})` : ''} · {p.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="m-0 text-[13px] leading-[1.45] text-body">Refunds are made on PayFast&apos;s dashboard. To delete an account, use Supabase, Authentication, Users.</p>
          </aside>
        ) : null}
      </div>
    </AdminShell>
  )
}
