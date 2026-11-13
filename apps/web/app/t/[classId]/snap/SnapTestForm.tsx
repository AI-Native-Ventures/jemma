'use client'

import { Spinner } from '@/components/ui/Button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CameraIcon } from '@/components/ui/icons'
import type { ClassTopic, TestRow } from '@/lib/data/p31'
import { shrinkPhoto } from '@/lib/shrink-photo'
import { postFiles } from '@/lib/upload-client'
import { createTest, draftKey, type ActionResult } from './actions'
import { PageTitle } from './_parts'

const STOP = new Set(['test', 'class', 'and', 'the', 'term', 'exam', 'quiz'])

/** Topics whose name shares a word stem with the test name. */
function pick(title: string, topics: ClassTopic[]): Set<string> {
  const stems = title
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map((w) => w.slice(0, 6))
  return new Set(topics.filter((t) => stems.some((s) => t.name.toLowerCase().includes(s))).map((t) => t.id))
}

const fieldCls = 'h-[52px] rounded-14 border border-muted-2 bg-card px-3.5 text-[16px] text-ink outline-none focus-visible:border-2 focus-visible:border-ink'

export function SnapTestForm({
  classId,
  topics: allTopics,
  tests,
  defaultTitle,
  defaultDate,
}: {
  classId: string
  topics: ClassTopic[]
  tests: TestRow[]
  defaultTitle: string
  defaultDate: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'new' | 'old'>('new')
  const [title, setTitle] = useState(defaultTitle)
  const [date, setDate] = useState(defaultDate)
  const [outOf, setOutOf] = useState('10')
  const [chosen, setChosen] = useState(() => pick(defaultTitle, allTopics))
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Chips: the families of the topics the name points at, so a fractions test does not list the whole map.
  const families = new Set(allTopics.filter((t) => pick(title, allTopics).has(t.id)).map((t) => t.family))
  const topics = families.size ? allTopics.filter((t) => families.has(t.family)) : allTopics

  const onTitle = (v: string) => {
    setTitle(v)
    if (!touched) setChosen(pick(v, allTopics))
  }
  const toggle = (id: string) => {
    setTouched(true)
    setChosen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const make = async () => {
    const made = await createTest(classId, { title, writtenOn: date, outOf: Number(outOf), topicIds: [...chosen] })
    if (!made.ok) {
      setError(made.message)
      return null
    }
    return made.testId
  }
  const snapMemo = (file: File | undefined) => {
    if (!file) return
    setError(null)
    start(async () => {
      const testId = await make()
      if (!testId) return
      const form = new FormData()
      form.set('file', await shrinkPhoto(file))
      try {
        const up = await postFiles<ActionResult>('t', 'uploadMemo', [classId, testId], form)
        if (!up.ok) return setError(up.message)
      } catch {
        return setError('That did not upload. Check your connection and try again.')
      }
      router.push(`/t/${classId}/snap/${testId}/key`)
    })
  }
  const noMemo = () => {
    setError(null)
    start(async () => {
      const testId = await make()
      if (!testId) return
      const res = await draftKey(classId, testId)
      if (!res.ok) return setError(res.message)
      router.push(`/t/${classId}/snap/${testId}/key/draft`)
    })
  }

  const seg = (id: 'new' | 'old', label: string) => (
    <button
      type="button"
      aria-pressed={mode === id}
      onClick={() => setMode(id)}
      className={`h-11 cursor-pointer rounded-[10px] border-none text-[15px] text-ink ${mode === id ? 'bg-card font-semibold shadow-[0_1px_3px_rgba(31,29,54,0.10)]' : 'bg-transparent font-medium'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-[18px] px-5 pt-3 pb-4 leading-[normal]">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-[14px] font-semibold text-body">Snap</p>
        <PageTitle size={26} leading={1.2} tracking="-0.01em">Which test are we marking?</PageTitle>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-14 bg-soft-4 p-1">
        {seg('new', 'New test')}
        {seg('old', 'A test I made before')}
      </div>

      {mode === 'old' ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {tests.length === 0 ? <li className="text-[15px] text-body">No tests yet. Start a new one.</li> : null}
          {tests.map((t) => (
            <li key={t.id}>
              <Link
                href={`/t/${classId}/snap/${t.id}/${t.keyStatus === 'approved' ? 'papers' : 'key'}`}
                className="flex min-h-14 flex-col justify-center rounded-14 border border-line bg-card px-3.5 py-2 text-ink no-underline"
              >
                <span className="text-[16px] font-semibold">{t.title}</span>
                <span className="text-[14px] text-body">{t.keyStatus === 'approved' ? 'Key approved. Snap papers.' : 'Key waiting for you'}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tname" className="text-[15px] font-medium">Test name</label>
              <input id="tname" type="text" value={title} onChange={(e) => onTitle(e.target.value)} className={fieldCls} autoComplete="off" />
            </div>
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2.5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tdate" className="text-[15px] font-medium">Written on</label>
                <input id="tdate" type="text" value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tmarks" className="text-[15px] font-medium">Out of</label>
                <input id="tmarks" type="text" inputMode="numeric" value={outOf} onChange={(e) => setOutOf(e.target.value)} className={fieldCls} autoComplete="off" />
              </div>
            </div>
            <fieldset className="m-0 flex flex-col gap-2 border-none p-0">
              <legend className="p-0 text-[15px] font-medium">Topics from your map</legend>
              <p className="m-0 mb-0.5 text-[13px] leading-[1.4] text-body">Jemma picked these from the name. It tags each question when it reads the memo.</p>
              <div className="flex flex-wrap gap-2">
                {topics.map((t) => {
                  const on = chosen.has(t.id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(t.id)}
                      className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-pill px-3.5 text-[14px] font-medium ${on ? 'border-none bg-ink text-white' : 'border border-muted-2 bg-card text-ink'}`}
                    >
                      {on ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                      )}
                      {t.name}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          </form>

          <section aria-labelledby="next" className="flex flex-col gap-2.5 rounded-18 border border-line bg-card p-4">
            <h2 id="next" className="m-0 text-[15px] font-semibold">What happens next</h2>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {['Snap the memo', 'Approve the answer key Jemma reads from it', 'Snap the papers, one after another'].map((s, i) => (
                <li key={s} className="flex items-center gap-2.5 text-[15px]">
                  <span className="flex size-6 flex-none items-center justify-center rounded-pill bg-soft-4 text-[12px] font-semibold">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </section>

          <div className="flex-1" />
          {error ? <p role="alert" className="m-0 text-[14px] text-coral-text">{error}</p> : null}
          <div className="flex flex-col gap-1">
            <label className={`relative flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-14 bg-ink text-[17px] font-semibold text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink ${pending ? 'opacity-60' : ''}`}>
              <CameraIcon size={20} />
              Snap the memo
              {pending ? <Spinner /> : null}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={pending}
                onChange={(e) => {
                  snapMemo(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            <button type="button" onClick={noMemo} disabled={pending} className="flex min-h-11 cursor-pointer items-center justify-center border-none bg-transparent text-[15px] font-semibold text-ink underline underline-offset-[3px]">
              No memo? Let Jemma draft the key
            </button>
          </div>
        </>
      )}
    </div>
  )
}
