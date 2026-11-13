import Link from 'next/link'
import { GemIcon } from '@/components/ui'
import { CameraGlyph } from '../_parts'

const WHY: Record<string, { title: string; body: string }> = {
  too_dark: { title: 'This photo is too dark to read.', body: 'A brighter photo means fewer guesses.' },
  blurry: { title: 'This photo is too blurry to read.', body: 'A steadier photo means fewer guesses.' },
  cut_off: { title: 'Part of the page is cut off.', body: 'A photo of the whole page means fewer guesses.' },
  not_a_test: { title: "This doesn't look like a school page.", body: 'A photo of the page itself means fewer guesses.' },
  // Written by code when the job behind the photo failed (packages/profiling `afterEventFailed`), not chosen by the model.
  read_failed: { title: 'Jemma could not read this photo.', body: 'Another photo usually fixes it.' },
}
const OTHER = { title: "I couldn't read this photo.", body: 'Another photo usually fixes it.' }

const tip = (icon: React.ReactNode, text: string) => (
  <li key={text} className="flex min-h-12 items-center gap-3">
    <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-12 bg-[#EEEDF5]">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
    </span>
    <span className="text-[15px] leading-[1.4]">{text}</span>
  </li>
)

/** parent-error: the photo could not be read. Retake is the way on. */
export function ErrorScreen({ problem, photoUrl, retakeHref }: { problem: string | null; photoUrl: string | null; retakeHref: string }) {
  const why = (problem && WHY[problem]) || OTHER
  return (
    <main className="flex flex-col gap-4 px-5 pb-6 pt-3 leading-[normal] lg:mx-auto lg:max-w-[560px]">
      <figure className="m-0 flex flex-col gap-2">
        <div aria-hidden="true" className="relative h-[230px] overflow-hidden rounded-20 bg-[#2A2622]">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="absolute left-[70px] top-[22px] block w-[210px] rotate-3 bg-[#FBFAF5]" style={{ filter: 'brightness(0.32) contrast(0.8)' }} />
          ) : null}
          <span className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 75%)' }} />
        </div>
        <figcaption className="text-[14px] text-body">Your photo, taken just now</figcaption>
      </figure>

      <section role="alert" className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2.5">
          <GemIcon size={14} className="mt-2.5 flex-none" />
          <h1 className="m-0 text-pretty text-[26px] font-semibold leading-[1.2] tracking-[-0.015em]">{why.title}</h1>
        </div>
        <p className="m-0 ml-6 text-[15px] leading-[1.45] text-body">{why.body}</p>
      </section>

      <section aria-labelledby="tips" className="flex flex-col gap-1.5 rounded-20 border border-line bg-card p-4">
        <h2 id="tips" className="m-0 text-[17px] font-semibold">For a clear photo</h2>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {tip(
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
            </>,
            'Turn on a light or move near a window',
          )}
          {tip(
            <>
              <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
              <path d="M10.5 18.5h3" />
            </>,
            'Hold the phone flat above the page',
          )}
          {tip(<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />, 'Fit the whole page inside the frame')}
        </ul>
      </section>

      <div className="flex flex-col gap-2">
        <Link href={retakeHref} className="flex h-[52px] items-center justify-center gap-2 rounded-14 bg-ink text-[17px] font-semibold text-white no-underline">
          <CameraGlyph color="#FFFFFF" />
          Retake photo
        </Link>
      </div>
    </main>
  )
}
