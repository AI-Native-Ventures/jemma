import { PendingButton } from '@/components/ui/Button'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { FORMAT_LABEL, loadHandover } from '@/lib/data/p25'
import { Overlay } from '../_overlay'
import { startSession } from './actions'

export default async function ParentHandoverPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params
  const { profile } = await requireRole('parent')
  const data = await loadHandover(childId, profile.display_name)
  if (!data) redirect(`/p/${childId}/learn`)
  const { childFirstName: name, parentInitials, tonight } = data
  const start = startSession.bind(null, tonight.id)

  return (
    <Overlay>
      <header className="flex items-center pt-2.5 pr-3 pb-1.5 pl-2">
        <Link
          href={`/p/${childId}/learn`}
          className="flex min-h-11 items-center gap-1 rounded-12 pr-3 pl-1.5 text-[16px] font-semibold text-ink no-underline"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
          Not now
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-[18px] px-6 pt-2.5 pb-7">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <svg width="200" height="190" viewBox="0 0 200 190" aria-hidden="true">
            <rect x="58" y="10" width="84" height="160" rx="16" fill="#FFFFFF" stroke="#1F1D36" strokeWidth="3" />
            <rect x="86" y="20" width="28" height="5" rx="2.5" fill="#E9E7F3" />
            <polygon points="100,62 128,90 100,118 72,90" fill="#FF6A4D" />
            <rect x="76" y="136" width="48" height="16" rx="8" fill="#1F1D36" />
            <path d="M22 96c10-26 22-36 34-38" fill="none" stroke="#8C89A3" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 7" />
            <path d="M178 96c-10 26-22 36-34 38" fill="none" stroke="#8C89A3" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 7" />
            <path d="M150 128l-7 6 9 3" fill="none" stroke="#8C89A3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="22" cy="104" r="11" fill="#FFE3DA" />
            <text x="22" y="109" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="12" fontWeight="700" fill="#1F1D36">{parentInitials}</text>
            <circle cx="178" cy="86" r="11" fill="#FFD3C7" />
            <text x="178" y="91" textAnchor="middle" fontFamily="Outfit, sans-serif" fontSize="12" fontWeight="700" fill="#1F1D36">{name.slice(0, 1).toUpperCase()}</text>
          </svg>
          <h1 className="m-0 text-[32px] leading-[1.15] font-semibold tracking-[-0.02em]">Pass the phone to {name}.</h1>
          <p className="m-0 text-pretty text-[17px] leading-[1.5] text-body">
            Her lesson takes about {tonight.minutes} minutes. She sees how she did at the end, never a score.
          </p>
        </div>

        <section aria-label="Tonight" className="flex items-center gap-3 rounded-18 border border-line bg-card px-4 py-3.5">
          <span aria-hidden="true" className="flex size-11 flex-none items-center justify-center rounded-12 bg-coral-tint">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="5" rx="1" /><rect x="3.5" y="14" width="17" height="5" rx="1" /><path d="M12 5v5M8 14v5M12 14v5M16 14v5" /></svg>
          </span>
          <span className="flex flex-col gap-0.5 leading-[1.3]">
            <span className="text-[13px] font-bold text-coral-text">Tonight</span>
            <span className="text-[16px] font-semibold">
              {tonight.shortName} with {tonight.withPhrase}
            </span>
            <span className="text-[14px] text-body">
              {FORMAT_LABEL[tonight.format]} · {tonight.minutes} minutes{tonight.questions ? ` · ${tonight.questions} questions` : ''}
            </span>
          </span>
        </section>
        <p className="m-0 flex gap-2.5 text-[14px] leading-[1.45] text-body">
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-1 flex-none"><polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" /></svg>
          <span>When she&apos;s done she passes it back, and you see how it went.</span>
        </p>
        <form action={start} className="contents">
          <PendingButton
            type="submit"
            className="flex min-h-14 items-center justify-center gap-2 rounded-14 border-0 bg-ink px-5 py-3 text-center text-[17px] font-semibold text-balance text-white"
          >
            {name} has the phone
          </PendingButton>
        </form>
        <div className="flex-1" />
      </main>
    </Overlay>
  )
}
