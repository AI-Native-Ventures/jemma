import QRCode from 'qrcode'
import Link from 'next/link'
import type { SnapView } from '@/lib/data/p34'
import { Diamond } from '../../_parts'
import { LaptopPoll, UploadZone } from './UploadZone'

const TICK = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
)

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** The QR for the phone snap link, drawn as one path in the board's 168 px box. */
function Qr({ url }: { url: string }) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'L' })
  const n = modules.size
  const cell = 168 / n
  let d = ''
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (modules.get(x, y)) d += `M${(x * cell).toFixed(2)} ${(y * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`
  return (
    <svg width="168" height="168" viewBox="0 0 168 168" role="img" aria-label="QR code to open the camera on your phone" className="block">
      <path d={d} fill="#1F1D36" />
    </svg>
  )
}

/** Board `laptop-teacher-snap`: step 3 of 3 on a laptop. Upload scans or PDFs, or scan the QR code and snap with the phone. */
export function LaptopSnap({ classId, testId, view, learners, phoneUrl }: { classId: string; testId: string; view: SnapView; learners: number; phoneUrl: string }) {
  const steps = [
    { title: 'Test', sub: view.testTitle.replace(/:\s*/, ' · ') },
    { title: 'Answer key', sub: view.keyApproved ? `Approved ${view.keyApproved}` : 'Waiting for you' },
  ]
  const ext = (name: string) => (name.split('.').pop() ?? '').slice(0, 4).toUpperCase()

  return (
    <div className="hidden px-9 pt-8 pb-10 leading-[normal] lg:block">
      <LaptopPoll />
      <div className="mx-auto flex max-w-[1120px] flex-col gap-[22px]">
        <div className="flex max-w-[780px] flex-col gap-2.5">
          <p className="m-0 text-[15px] text-body">Snap · {view.shortTitle}</p>
          <div className="flex items-start gap-3">
            <Diamond size={16} className="mt-3.5" />
            <h1 className="m-0 text-[36px] leading-[1.15] font-semibold tracking-[-0.02em] text-pretty">
              Add the {learners || view.papers} papers. Upload scans, or snap them with your phone.
            </h1>
          </div>
        </div>

        <ol aria-label="Steps" className="m-0 flex list-none flex-wrap gap-2.5 p-0">
          {steps.map((s) => (
            <li key={s.title} className="flex flex-[1_1_200px] items-center gap-2.5 rounded-16 border border-line bg-soft-2 px-3.5 py-3">
              <span className="flex size-7 flex-none items-center justify-center rounded-pill bg-ink">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              </span>
              <span className="flex flex-col leading-[1.3]">
                <span className="text-[15px] font-semibold">{s.title}</span>
                <span className="text-[13px] text-body">{s.sub}</span>
              </span>
            </li>
          ))}
          <li aria-current="step" className="flex flex-[1_1_200px] items-center gap-2.5 rounded-16 border-2 border-ink bg-card px-3.5 py-3">
            <span className="flex size-7 flex-none items-center justify-center rounded-pill border-2 border-ink bg-coral-tint text-[13px] font-bold">3</span>
            <span className="flex flex-col leading-[1.3]">
              <span className="text-[15px] font-semibold">Papers</span>
              <span className="text-[13px] text-body">Upload or snap them now</span>
            </span>
          </li>
        </ol>

        <div className="flex flex-wrap items-stretch gap-5">
          <section aria-labelledby="upload" className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-20 border border-line bg-card p-[22px]">
            <h2 id="upload" className="m-0 text-[19px] font-semibold">Upload scans or PDFs</h2>
            <UploadZone classId={classId} testId={testId} />
            {view.uploads.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {view.uploads.map((f) => (
                  <li key={f.id} className="flex min-h-[60px] items-center gap-3 rounded-14 bg-soft-2 px-3 py-2">
                    <span aria-hidden="true" className="flex h-12 w-10 flex-none items-end justify-center rounded-lg border border-line bg-card pb-1.5 text-[10px] font-bold text-coral-text">{ext(f.name)}</span>
                    <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                      <span className="truncate text-[15px] font-semibold">{f.name}</span>
                      <span className="text-[13px] text-body">1 page · 1 paper found</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold">{TICK(18)}Ready</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section aria-labelledby="phone" className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5 rounded-20 border border-line bg-card p-[22px]">
            <h2 id="phone" className="m-0 text-[19px] font-semibold">Or snap with your phone</h2>
            <div className="flex flex-wrap items-center gap-5">
              <Link href={phoneUrl} aria-label="Open the phone snap page on this device" className="block rounded-16 border border-line bg-card p-3"><Qr url={phoneUrl} /></Link>
              <div className="flex flex-[1_1_200px] flex-col gap-2">
                <p className="m-0 text-[16px] leading-[1.45]">Scan it with your phone camera. Pages land here as you snap.</p>
                <p className="m-0 text-[14px] leading-[1.45] text-body">Good for a page the scanner missed, or a paper that came in late.</p>
              </div>
            </div>
            <h3 className="mt-1 mb-0 text-[15px] font-semibold">From your phone</h3>
            <ul aria-live="polite" className="m-0 flex list-none flex-col gap-2 p-0">
              {view.fromPhone.map((p, i) => (
                <li key={p.id} className={`flex min-h-14 items-center gap-3 rounded-14 px-3 py-2 ${i === 0 ? 'border border-[#FFC9BB] bg-coral-wash' : 'border border-line bg-ground'}`}>
                  <span aria-hidden="true" className="relative h-11 w-10 flex-none overflow-hidden rounded-md bg-[#6E665D]">
                    <span className="absolute top-1.5 left-2 h-8 w-6 rounded-[2px] bg-[#FBFAF5]" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                    <span className="text-[15px] font-semibold">Paper {p.position}{p.childName ? ` · ${p.childName}` : ''} · page {p.pageNo}</span>
                    <span className="text-[13px] text-body">{p.when} · added to {p.childName ? `${p.childName}'s` : 'the'} paper</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold">{TICK(18)}Added</span>
                </li>
              ))}
              <li className="flex min-h-12 items-center gap-3 rounded-14 border-[1.5px] border-dashed border-edge px-3 py-1.5">
                <span aria-hidden="true" className="mx-[15px] size-2.5 rounded-pill bg-coral shadow-[0_0_0_5px_#FFE3DA]" />
                <span className="text-[14px] text-body">Waiting for the next page from your phone</span>
              </li>
            </ul>
          </section>
        </div>

        <section aria-label="Ready to mark" className="flex flex-wrap items-center gap-4 rounded-20 border border-line bg-card px-[18px] py-4">
          <span aria-hidden="true" className="flex size-11 flex-none items-center justify-center rounded-14 bg-soft-4">{TICK(22)}</span>
          <span className="flex flex-[1_1_320px] flex-col gap-0.5">
            <span className="text-[17px] font-semibold">{plural(view.papers, 'paper')} ready · {plural(view.pages, 'page')}</span>
            <span className="text-[14px] text-body">Jemma reads them in the background. Anything it is unsure about goes to Needs you.</span>
          </span>
          <Link href={`/t/${classId}/snap/${testId}/progress`} className="flex h-[52px] flex-none items-center justify-center gap-2 rounded-14 bg-ink px-[18px] text-[15px] font-semibold text-white no-underline">
            Mark them
          </Link>
        </section>
      </div>
    </div>
  )
}
