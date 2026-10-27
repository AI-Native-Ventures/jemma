'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { snapHomework } from '../actions'

const SUBJECT = 'Mathematics'
const MAX_PAGES = 4
const hand = "Kalam, 'Comic Sans MS', cursive"

/** Shrinks a phone photo so a few pages fit in one request. Falls back to the original when the browser cannot decode it. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1500 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.7))
    return blob ? new File([blob], 'page.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

const cross = (
  <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginLeft: 'auto' }}>
    <path d="M3 3l12 12M15 3 3 15" fill="none" stroke="#C8372D" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
)
const ticked = (
  <svg width="22" height="18" viewBox="0 0 22 18" style={{ marginLeft: 'auto' }}>
    <path d="M2 10l6 6L20 2" fill="none" stroke="#C8372D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Corner = ({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const v = pos[0] === 't' ? 'top' : 'bottom'
  const h = pos[1] === 'l' ? 'left' : 'right'
  const name = (v === 'top' ? 'Top' : 'Bottom') + (h === 'left' ? 'Left' : 'Right')
  return (
    <span
      style={{
        position: 'absolute', [h]: 0, [v]: 0, width: 34, height: 34,
        [`border${h === 'left' ? 'Left' : 'Right'}`]: '4px solid #FF6A4D',
        [`border${v === 'top' ? 'Top' : 'Bottom'}`]: '4px solid #FF6A4D',
        [`border${name}Radius`]: 10,
      }}
    />
  )
}

/** The photo screen: a frame, a shutter that opens the phone camera, and Done once there is at least one page. */
export function PhotoScreen({ childId, kind, kindLabel, childName }: { childId: string; kind: string; kindLabel: string; childName: string }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const next = files.length + 1
  const full = files.length >= MAX_PAGES

  async function onPick(list: FileList | null) {
    if (!list?.length) return
    const small = await Promise.all([...list].map(shrink))
    setFiles((cur) => [...cur, ...small].slice(0, MAX_PAGES))
    if (input.current) input.current.value = ''
  }

  async function done() {
    setBusy(true)
    setMessage(null)
    const res = await snapHomework(childId, kind, SUBJECT, files)
    if (res.ok) router.push(`/p/${childId}/snap/${res.paperId}`)
    else {
      setMessage(res.message)
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 mx-auto flex max-w-[390px] flex-col bg-[#121022] leading-[normal] text-white"
      style={{ fontFamily: 'var(--font-outfit), system-ui, sans-serif' }}
    >
      <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#7A6F63', boxShadow: 'inset 0 0 90px rgba(0,0,0,0.55)', overflow: 'hidden' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', left: 52, top: 132, width: 286, height: 380, background: '#FCFBF6', transform: 'rotate(1.6deg)',
            boxShadow: '0 10px 24px rgba(0,0,0,0.35)', padding: '20px 22px 0', display: 'flex', flexDirection: 'column', gap: 12,
            color: '#2A2A2A', fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Homework: Adding decimals</span>
            <span style={{ fontFamily: hand, fontSize: 13, color: '#2F3A56' }}>Amina 23/10</span>
          </span>
          <span style={{ height: 1, background: '#D8D6CE' }} />
          {[
            ['1.', '0,4 + 0,3 =', '0,7', true, '#2F3A56'],
            ['2.', '0,6 + 0,25 =', '0,31', false, '#2F3A56'],
            ['3.', '1,2 + 0,4 =', '1,6', true, '#2F3A56'],
            ['4.', '0,75 + 0,5 =', '0,80', false, '#2F3A56'],
            ['5.', '2,1 + 0,8 =', '2,9', true, '#8A93A8'],
          ].map(([n, q, a, right, color]) => (
            <span key={String(n)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              {n} &#160;{q} <span style={{ fontFamily: hand, fontSize: 18, color: String(color) }}>{a}</span>
              {right ? ticked : cross}
            </span>
          ))}
          <span style={{ alignSelf: 'flex-end', fontFamily: hand, fontSize: 22, color: '#C8372D', transform: 'rotate(-6deg)', marginTop: 6 }}>3/5</span>
        </div>
        <div aria-hidden="true" style={{ position: 'absolute', left: 38, top: 118, width: 314, height: 410 }}>
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
        </div>
        <span
          style={{
            position: 'absolute', left: '50%', top: 540, transform: 'translateX(-50%)', padding: '7px 14px', borderRadius: 999,
            background: 'rgba(18,16,34,0.78)', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap',
          }}
        >
          Page found. Hold still.
        </span>

        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 12px 12px 8px' }}>
          <Link
            href={`/p/${childId}/snap`}
            aria-label="Close"
            style={{ width: 44, height: 44, borderRadius: 999, background: 'rgba(18,16,34,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </Link>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 14px', borderRadius: 14, background: 'rgba(18,16,34,0.6)', lineHeight: 1.2 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{kindLabel} · page {next}</span>
            <span style={{ fontSize: 12, color: '#D6D4E2' }}>{childName} · {SUBJECT}</span>
          </span>
          <span style={{ width: 44 }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 16px 30px', background: '#121022' }}>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 14, color: '#D6D4E2' }}>
          {message ?? 'More pages? Snap them one after another.'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              justifySelf: 'start', width: 48, height: 62, borderRadius: 6, border: '1.5px dashed rgba(255,255,255,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#D6D4E2',
            }}
          >
            {next}
          </span>
          <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPick(e.target.files)} />
          <button
            type="button"
            aria-label={`Snap page ${next}`}
            disabled={full || busy}
            onClick={() => input.current?.click()}
            style={{ width: 78, height: 78, borderRadius: 999, border: '4px solid #FFFFFF', background: 'transparent', padding: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span style={{ width: '100%', height: '100%', borderRadius: 999, background: '#FF6A4D' }} />
          </button>
          <button
            type="button"
            disabled={files.length === 0 || busy}
            onClick={() => void done()}
            style={{
              justifySelf: 'end', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 18px', borderRadius: 12,
              background: '#FFFFFF', color: '#1F1D36', fontSize: 15, fontWeight: 600, border: 'none', opacity: busy ? 0.5 : 1,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
