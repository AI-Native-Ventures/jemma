import Link from 'next/link'
import { GemIcon } from '@/components/ui'
import { hand } from '../_parts'
import { Poller } from '../Poller'

const done = (
  <span aria-hidden="true" className="flex size-7 flex-none items-center justify-center rounded-full bg-ink">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  </span>
)
const spinner = (
  <span aria-hidden="true" className="flex size-7 flex-none items-center justify-center">
    <svg width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="11" fill="none" stroke="#EEEDF5" strokeWidth="3.5" />
      <path d="M14 3a11 11 0 0 1 11 11" fill="none" stroke="#FF6A4D" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  </span>
)

const wrongMark = (
  <svg width="16" height="16" viewBox="0 0 18 18" style={{ marginLeft: 'auto' }}>
    <path d="M3 3l12 12M15 3 3 15" fill="none" stroke="#C8372D" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)
const rightMark = (
  <svg width="20" height="16" viewBox="0 0 22 18" style={{ marginLeft: 'auto' }}>
    <path d="M2 10l6 6L20 2" fill="none" stroke="#C8372D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Stand-in for the photo when the file is not there: the board's paper. */
function PaperMock() {
  const rows: [string, string, string, boolean, string, boolean][] = [
    ['1.', '0,4 + 0,3 =', '0,7', true, '#2F3A56', false],
    ['2.', '0,6 + 0,25 =', '0,31', false, '#2F3A56', false],
    ['3.', '1,2 + 0,4 =', '1,6', true, '#2F3A56', false],
    ['4.', '0,75 + 0,5 =', '0,80', false, '#2F3A56', true],
    ['5.', '2,1 + 0,8 =', '2,9', true, '#8A93A8', false],
  ]
  return (
    <div
      style={{
        background: '#FCFBF6', borderRadius: 6, boxShadow: '0 4px 14px rgba(31,29,54,0.12)', padding: '16px 18px 12px', display: 'flex',
        flexDirection: 'column', gap: 8, color: '#2A2A2A', fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Homework: Adding decimals</span>
        <span style={{ fontFamily: hand, fontSize: 15, color: '#2F3A56' }}>Amina 23/10</span>
      </span>
      <span style={{ height: 1, background: '#D8D6CE' }} />
      {rows.map(([n, q, a, right, color, hot]) => (
        <span
          key={n}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 30, fontSize: 13,
            ...(hot ? { outline: '2px solid #FF6A4D', outlineOffset: 3, background: 'rgba(255,106,77,0.12)', borderRadius: 3 } : {}),
          }}
        >
          {n} &#160;{q} <span style={{ fontFamily: hand, fontSize: 19, color }}>{a}</span>
          {right ? rightMark : wrongMark}
        </span>
      ))}
    </div>
  )
}

/** parent-snap-reading: the photo, what Jemma has done, and where to find the result. */
export function ReadingScreen({
  name, nameRead, answers, reading, photoUrl,
}: { name: string; nameRead: string | null; answers: number; reading: boolean; photoUrl: string | null }) {
  const steps = [
    { doing: 'Finding the page', did: 'Found the page', ok: reading },
    { doing: 'Reading the name', did: `Read the name "${nameRead}"`, ok: Boolean(nameRead) },
    { doing: 'Reading the answers', did: `Read ${answers} answer${answers === 1 ? '' : 's'}`, ok: answers > 0 },
  ]
  const current = steps.findIndex((s) => !s.ok)
  const shown = current === -1 ? steps : steps.slice(0, current + 1)
  return (
    <main className="flex flex-col gap-4 px-5 pb-6 pt-3 leading-[normal] lg:mx-auto lg:max-w-[560px]">
      <Poller active />
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <GemIcon size={14} className="mt-2.5 flex-none" />
          <h1 className="m-0 text-pretty text-[25px] font-semibold leading-[1.18] tracking-[-0.015em]">
            Reading {name}&apos;s homework.{answers > 0 ? ` ${answers} answer${answers === 1 ? '' : 's'} so far.` : ''}
          </h1>
        </div>
      </div>
      <figure className="m-0 flex flex-col gap-2">
        <div aria-hidden={photoUrl ? undefined : true} className="rounded-20 bg-[#E9E7F3] p-3.5">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="The page you snapped" className="block w-full rounded-md shadow-[0_4px_14px_rgba(31,29,54,0.12)]" />
          ) : (
            <PaperMock />
          )}
        </div>
        <figcaption className="text-[14px] text-body">The photo you just took. The coral box is the line Jemma is reading.</figcaption>
      </figure>
      <section role="status" aria-label="Progress" className="rounded-20 border border-line bg-card px-4 py-2.5">
        <ol className="m-0 flex list-none flex-col p-0">
          {shown.map((s, i) => {
            const isDone = s.ok
            return (
              <li key={s.doing} className="flex min-h-11 items-center gap-3">
                {isDone ? done : spinner}
                <span className="flex flex-col leading-[1.3]">
                  <span className={`text-[15px] ${isDone ? 'font-medium' : 'font-semibold'}`}>
                    <span className="sr-only">{isDone ? 'Done: ' : 'In progress: '}</span>
                    {isDone ? s.did : s.doing}
                  </span>
                  {isDone && i === 2 ? <span className="text-[13px] text-body">And the teacher&apos;s ticks</span> : null}
                </span>
              </li>
            )
          })}
        </ol>
      </section>
      <p className="m-0 flex gap-2.5 text-[14px] leading-[1.45] text-body">
        <GemIcon size={12} className="mt-1 flex-none" />
        <span>You can leave this screen. It lands in Needs you when it&apos;s ready.</span>
      </p>
      <Link
        href="?"
        className="flex h-[52px] items-center justify-center gap-2 rounded-14 border-[1.5px] border-ink bg-card text-[17px] font-semibold text-ink no-underline"
      >
        See what I read
      </Link>
    </main>
  )
}
