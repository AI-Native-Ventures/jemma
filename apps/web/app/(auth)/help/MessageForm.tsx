'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import { Sheet } from '@/components/ui'
import { MESSAGE_MAX, type MessageKind } from '@/lib/feedback'
import { sendHelpMessage } from './actions'

const WORDS: Record<MessageKind, { title: string; label: string; hint: string }> = {
  problem: { title: 'Report a problem', label: 'What went wrong?', hint: 'Say what you tapped and what you saw.' },
  message: { title: 'Message the Jemma team', label: 'Your message', hint: 'A question, an idea or anything else.' },
}

const field: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #8F8D88', borderRadius: 14, background: '#FFFFFF', padding: '12px 14px', fontSize: 17, color: '#161616', fontFamily: 'inherit' }
const green: CSSProperties = { minHeight: 56, border: 'none', borderRadius: 14, background: '#007749', color: '#FFFFFF', fontSize: 17, fontWeight: 600, cursor: 'pointer' }

/** A button of the help page that opens the form to write to the Jemma team. */
export function MessageButton({ kind, style }: { kind: MessageKind; style: CSSProperties }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, start] = useTransition()
  const w = WORDS[kind]
  const close = () => {
    setOpen(false)
    if (sent) {
      setText('')
      setSent(false)
    }
  }
  const send = () =>
    start(async () => {
      setError(null)
      const res = await sendHelpMessage({ kind, text, email, website })
      if (res.ok) setSent(true)
      else setError(res.message)
    })
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={style}>
        {w.title}
      </button>
      <Sheet open={open} onClose={close} title={sent ? 'Thank you' : w.title} description={sent ? 'Your message is with the Jemma team.' : undefined}>
        {sent ? (
          <button type="button" onClick={close} style={green}>
            Close
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <label htmlFor={`help-${kind}`} style={{ fontSize: 15, fontWeight: 600 }}>
              {w.label}
            </label>
            <textarea id={`help-${kind}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={MESSAGE_MAX} rows={5} aria-describedby={`help-${kind}-hint`} style={{ ...field, resize: 'vertical' }} />
            <span id={`help-${kind}-hint`} style={{ marginTop: -6, fontSize: 14, color: '#5C5A55' }}>
              {w.hint}
            </span>
            <label htmlFor={`help-${kind}-email`} style={{ fontSize: 15, fontWeight: 600 }}>
              Your email, if you want an answer
            </label>
            <input id={`help-${kind}-email`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...field, height: 52 }} />
            {/* Hidden from people: only a program fills it, and then the message is dropped. */}
            <input aria-hidden="true" tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} style={{ position: 'absolute', left: -10000, width: 1, height: 1, opacity: 0 }} />
            {error ? (
              <p role="alert" style={{ margin: 0, fontSize: 14, color: '#B8281E' }}>
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={pending || text.trim().length < 3} style={{ ...green, opacity: pending || text.trim().length < 3 ? 0.5 : 1 }}>
              {pending ? 'Sending' : 'Send'}
            </button>
          </form>
        )}
      </Sheet>
    </>
  )
}
