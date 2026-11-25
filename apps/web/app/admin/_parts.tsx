import Link from 'next/link'
import type { ReactNode } from 'react'
import { RANGES, type Range } from '@/lib/admin'

// The owner's admin pages (P161): the shell, the tiles, the panels and the one chart. Light, in the app's colours. Counts only.

export const fmt = (n: number) => n.toLocaleString('en-US')

/** The three roles of a sign-up, in a fixed order, in shades checked for colour-blind readers and contrast (the gold has its legend and numbers). */
export const ROLE_COLORS = { learners: '#007749', parents: '#C98A00', teachers: '#3355C4' } as const

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d={d} />
    </svg>
  )
}

const NAV = [
  { id: 'overview', href: '/admin', label: 'Overview', icon: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z' },
  { id: 'people', href: '/admin/people', label: 'People', icon: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.87M16 3.13a3.5 3.5 0 0 1 0 6.75' },
  { id: 'payments', href: '/admin/payments', label: 'Payments', icon: 'M3 7.5A2.5 2.5 0 0 1 5.5 5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5zM3 10h18M7 15h3' },
  { id: 'help', href: '/admin/help', label: 'Help messages', icon: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z' },
]

export function AdminShell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-ground font-sans leading-[normal] text-ink">
      <aside className="flex w-[248px] flex-none flex-col gap-6 border-r border-line bg-card px-4 py-6">
        <div className="flex items-center gap-2.5 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/jemma-app-icon.svg" alt="" width={36} height={36} className="block size-9" />
          <span className="flex flex-col leading-[1.1]">
            <span className="text-[19px] font-bold">Jemma</span>
            <span className="text-[13px] text-body">Admin</span>
          </span>
        </div>
        <nav aria-label="Admin" className="flex flex-col gap-1">
          {NAV.map((n) => {
            const on = n.id === active
            return (
              <a
                key={n.id}
                href={n.href}
                aria-current={on ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-14 px-3 text-[16px] no-underline ${on ? 'bg-gold-tint font-bold text-ink' : 'font-medium text-ink'}`}
              >
                <Icon d={n.icon} />
                <span className="flex-1">{n.label}</span>
              </a>
            )
          })}
        </nav>
        <div className="flex-1" />
        <p className="m-0 rounded-14 bg-soft-2 p-3 text-[13px] leading-[1.45] text-body">Only you can open this. It shows counts, never a child&apos;s work.</p>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-6 px-10 pt-8 pb-12">{children}</main>
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="m-0 text-[32px] leading-[1.1] font-bold tracking-[-0.02em]">{title}</h1>
      {children}
    </header>
  )
}

const COUNTRY_PICKS = [
  { id: 'all', label: 'All countries' },
  { id: 'US', label: 'United States' },
  { id: 'ZA', label: 'South Africa' },
]

/** The time and the country, as links: the page reads them from its address. */
export function RangeControls({ base, range, country }: { base: string; range: Range; country: string }) {
  const href = (r: string, c: string) => `${base}?range=${r}${c !== 'all' ? `&country=${c}` : ''}`
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav aria-label="Time" className="flex rounded-14 border border-line bg-card p-1">
        {RANGES.map((r) => (
          <Link key={r.id} href={href(r.id, country)} aria-current={r.id === range ? 'page' : undefined} className={`flex min-h-10 items-center rounded-12 px-3.5 text-[15px] no-underline ${r.id === range ? 'bg-ink font-bold text-white' : 'font-medium text-ink'}`}>
            {r.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Country" className="flex rounded-14 border border-line bg-card p-1">
        {COUNTRY_PICKS.map((c) => (
          <Link key={c.id} href={href(range, c.id)} aria-current={c.id === country ? 'page' : undefined} className={`flex min-h-10 items-center rounded-12 px-3.5 text-[15px] no-underline ${c.id === country ? 'bg-ink font-bold text-white' : 'font-medium text-ink'}`}>
            {c.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

export function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-20 border border-line bg-card px-4 py-4">
      <span className="text-[14px] font-semibold text-body">{label}</span>
      <span className="text-[32px] leading-[1.05] font-bold tracking-[-0.02em]">{value}</span>
      <span className="text-[13px] leading-[1.35] text-body">{note}</span>
    </div>
  )
}

export function Panel({ title, note, right, children, className = '' }: { title: string; note?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-20 border border-line bg-card p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[19px] leading-[1.2] font-bold">{title}</h2>
          {note ? <p className="m-0 text-[14px] leading-[1.4] text-body">{note}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block size-3 flex-none rounded-[3px]" style={{ background: color }} />
}


export function Legend({ items }: { items: [string, string, number][] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-[14px]">
      {items.map(([name, color, total]) => (
        <li key={name} className="flex items-center gap-2">
          <Swatch color={color} />
          <span className="font-semibold">{name}</span>
          <span className="text-body">{fmt(total)}</span>
        </li>
      ))}
    </ul>
  )
}

const dayLabel = (day: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))

/** Sign-ups a day: thin stacked bars (learners, parents, teachers from the bottom), a 2 px gap between parts, 4 px round tops, one axis. */
export function SignupChart({ byDay }: { byDay: { day: string; learners: number; parents: number; teachers: number }[] }) {
  const W = 700
  const H = 240
  const left = 34
  const top = 10
  const plotW = W - left
  const plotH = H - 26 - top
  const peak = Math.max(4, ...byDay.map((d) => d.learners + d.parents + d.teachers))
  const step = peak <= 8 ? 2 : peak <= 20 ? 5 : peak <= 40 ? 10 : peak <= 100 ? 25 : Math.ceil(peak / 4 / 50) * 50
  const max = Math.ceil(peak / step) * step
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step)
  const n = Math.max(1, byDay.length)
  const slot = plotW / n
  const bar = Math.max(3, Math.min(18, slot - Math.max(2, slot * 0.3)))
  const y = (v: number) => top + plotH - (v / max) * plotH
  const labelAt = new Set([0, Math.floor((n - 1) / 2), n - 1, Math.floor((n - 1) / 4), Math.floor((3 * (n - 1)) / 4)])
  const totals: [string, string, number][] = [
    ['Learners', ROLE_COLORS.learners, byDay.reduce((a, d) => a + d.learners, 0)],
    ['Parents', ROLE_COLORS.parents, byDay.reduce((a, d) => a + d.parents, 0)],
    ['Teachers', ROLE_COLORS.teachers, byDay.reduce((a, d) => a + d.teachers, 0)],
  ]
  return (
    <div className="flex flex-col gap-3">
      <Legend items={totals} />
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Sign-ups a day, by learners, parents and teachers.">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#C9C6BE' : '#EFECE6'} strokeWidth={1} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#5C5A55">
              {t}
            </text>
          </g>
        ))}
        {byDay.map((d, i) => {
          const x = left + i * slot + (slot - bar) / 2
          const parts = ([
            [d.learners, ROLE_COLORS.learners],
            [d.parents, ROLE_COLORS.parents],
            [d.teachers, ROLE_COLORS.teachers],
          ] as const).filter(([v]) => v > 0)
          let base = 0
          return (
            <g key={d.day}>
              <title>{`${dayLabel(d.day)}: ${d.learners} learners, ${d.parents} parents, ${d.teachers} teachers`}</title>
              {parts.map(([v, color], k) => {
                const y0 = y(base)
                const y1 = y(base + v)
                base += v
                const h = Math.max(1, y0 - y1 - (k > 0 ? 2 : 0))
                const r = Math.min(4, bar / 2, h)
                return k === parts.length - 1 ? (
                  <path key={k} d={`M${x},${y1 + h} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bar - r} Q${x + bar},${y1} ${x + bar},${y1 + r} V${y1 + h} Z`} fill={color} />
                ) : (
                  <rect key={k} x={x} y={y1} width={bar} height={h} fill={color} />
                )
              })}
              <rect x={left + i * slot} y={top} width={slot} height={plotH} fill="transparent" />
              {labelAt.has(i) ? (
                <text x={i === n - 1 ? W : left + i * slot + slot / 2} y={H - 6} textAnchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'} fontSize="11" fill="#5C5A55">
                  {dayLabel(d.day)}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Steps to paying: one hue, each bar as long as its count, and the share of the step before. */
export function Funnel({ steps }: { steps: [string, number][] }) {
  const max = Math.max(1, steps[0]?.[1] ?? 1)
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
      {steps.map(([name, v], i) => {
        const prev = i > 0 ? steps[i - 1]![1] : null
        return (
          <li key={name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-[14px]">
              <span className="font-semibold">{name}</span>
              <span className="text-body">
                <span className="font-bold text-ink">{fmt(v)}</span>
                {prev ? ` · ${Math.round((v / prev) * 100)}%` : ''}
              </span>
            </div>
            <div aria-hidden="true" className="h-2.5 rounded-pill bg-soft">
              <div className="h-full rounded-pill bg-green" style={{ width: `${v > 0 ? Math.max(1.5, (v / max) * 100) : 0}%` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function Bars({ rows }: { rows: [string, string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[2]))
  return (
    <div className="flex flex-col gap-3.5">
      {rows.map(([name, note, v]) => (
        <div key={name} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[15px]">
            <span>
              <span className="font-semibold">{name}</span> <span className="text-[13px] text-body">{note}</span>
            </span>
            <span className="font-bold">{fmt(v)}</span>
          </div>
          <div aria-hidden="true" className="h-2.5 rounded-pill bg-soft">
            <div className="h-full rounded-pill bg-green" style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Lines({ rows }: { rows: [string, string][] }) {
  return (
    <div className="flex flex-col text-[15px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-t border-soft py-2.5 first:border-t-0">
          <span className="text-body">{k}</span>
          <span className="text-right font-semibold">{v}</span>
        </div>
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 rounded-14 bg-soft-2 p-3.5 text-[14px] leading-[1.45] text-body">{children}</p>
}
