'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { validateOneResult } from '@jemma/profiling/logic'
import { SelectBox } from '@/app/t/new/SelectBox'
import { Button, Card, ClipboardIcon, Pill } from '@/components/ui'
import type { WaitingFile } from '@/lib/data/p66'
import { addOneResult, pasteRecords, uploadRecords, startSampleRecords } from './actions'
import type { SampleName } from './samples'

type Way = 'upload' | 'paste' | 'one'
type Person = { id: string; name: string }
type Family = { family: string; label: string }

const MAX_BYTES = 1024 * 1024
const KINDS = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'project', label: 'Project' },
  { value: 'note', label: 'Note' },
]

const input = 'h-[52px] w-full rounded-14 border border-muted-2 bg-card px-3.5 text-[17px] text-ink'
const label = 'text-[15px] font-medium'

function Row({ id, text, hint, children }: { id: string; text: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {children}
      {hint ? <span className="text-[13px] text-body">{hint}</span> : null}
    </div>
  )
}

function Problem({ text }: { text: string }) {
  return (
    <p role="alert" className="m-0 rounded-14 bg-[#FFEDE8] px-3.5 py-2.5 text-[15px] leading-[1.4] text-coral-text">
      {text}
    </p>
  )
}

export function RecordsClient({
  classId,
  classTitle,
  subject,
  grade,
  year,
  learners,
  families,
  samples,
  recent,
}: {
  classId: string
  classTitle: string
  subject: string
  grade: number
  year: number
  learners: Person[]
  families: Family[] | null
  samples: { name: SampleName; button: string; about: string }[]
  recent: WaitingFile[]
}) {
  const router = useRouter()
  const [way, setWay] = useState<Way>('upload')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const open = (importId: string) => router.push(`/t/${classId}/learners/records/${importId}`)

  async function onFile(file: File | undefined) {
    if (!file) return
    setError('')
    if (file.size > MAX_BYTES) return setError('This file is bigger than 1 MB. Split it into smaller files.')
    const text = await file.text()
    start(async () => {
      const res = await uploadRecords(classId, file.name, text)
      if (res.ok) open(res.importId)
      else setError(res.reason)
    })
  }

  const tab = (key: Way, text: string) => (
    <button
      type="button"
      role="tab"
      id={`way-${key}`}
      aria-selected={way === key}
      aria-controls="way-panel"
      onClick={() => {
        setWay(key)
        setError('')
      }}
      className={`min-h-11 flex-1 cursor-pointer rounded-pill border-0 px-2 text-[14px] font-semibold whitespace-nowrap sm:text-[15px] ${way === key ? 'bg-ink text-white' : 'bg-soft-2 text-ink'}`}
    >
      {text}
    </button>
  )

  return (
    <>
      <p className="m-0 text-[15px] leading-[1.45] text-body lg:max-w-[720px]">
        Bring in old results for {classTitle} so the Long view can show a pattern over many terms. Jemma works out what each column means and reads every row. You check it. Nothing is added until you say so.
      </p>

      <div role="tablist" aria-label="Three ways to add past records" className="flex gap-2 lg:max-w-[720px]">
        {tab('upload', 'Upload a file')}
        {tab('paste', 'Paste a table')}
        {tab('one', 'One result')}
      </div>

      <div id="way-panel" role="tabpanel" aria-labelledby={`way-${way}`} className="flex flex-col gap-3 lg:max-w-[720px]">
        {error ? <Problem text={error} /> : null}
        {way === 'upload' ? (
          <Upload pending={pending} onFile={onFile} samples={samples} onSample={(name) => start(async () => {
            setError('')
            const res = await startSampleRecords(classId, name)
            if (res.ok) open(res.importId)
            else setError(res.reason)
          })} />
        ) : null}
        {way === 'paste' ? <Paste pending={pending} onSend={(text) => start(async () => {
          setError('')
          const res = await pasteRecords(classId, text)
          if (res.ok) open(res.importId)
          else setError(res.reason)
        })} setError={setError} /> : null}
        {way === 'one' ? <OneResult classId={classId} subject={subject} grade={grade} year={year} learners={learners} families={families} /> : null}
      </div>

      {recent.length > 0 ? (
        <section aria-labelledby="files" className="flex flex-col gap-2 lg:max-w-[720px]">
          <h2 id="files" className="m-0 text-[17px] font-semibold">
            Your files
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {recent.map((f) => (
              <li key={f.id}>
                <Link href={`/t/${classId}/learners/records/${f.id}`} className="flex min-h-14 items-center gap-3 rounded-14 border border-line bg-card px-3.5 py-2.5 text-ink no-underline">
                  <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-12 bg-soft-2">
                    <ClipboardIcon size={18} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                    <span className="text-[15px] font-semibold [overflow-wrap:anywhere]">{f.fileName}</span>
                    <span className="text-[13px] text-body">
                      {f.label} · {f.when}
                    </span>
                  </span>
                  <Pill tone={f.status === 'ready' ? 'coral' : f.status === 'failed' ? 'danger' : 'quiet'} className="!py-1 !text-[13px]">
                    {f.status === 'ready' ? 'Check it' : f.status === 'approved' ? 'Added' : f.status === 'failed' ? 'Try again' : 'Reading'}
                  </Pill>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

function Upload({ pending, onFile, samples, onSample }: { pending: boolean; onFile: (f: File | undefined) => void; samples: { name: SampleName; button: string; about: string }[]; onSample: (n: SampleName) => void }) {
  return (
    <>
      <Card as="section" radius={20} aria-labelledby="up" className="gap-3">
        <h2 id="up" className="m-0 text-[17px] font-semibold">
          Upload a .csv file
        </h2>
        <p className="m-0 text-[14px] leading-[1.4] text-body">Up to 1 MB and 2,000 rows. The first line is the header with the column names. Save a spreadsheet as CSV to get one.</p>
        <label
          htmlFor="records-file"
          className={`flex min-h-14 cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-dashed border-ink bg-card px-4 text-[16px] font-semibold text-ink ${pending ? 'opacity-50' : ''}`}
        >
          {pending ? 'Sending the file...' : 'Choose a .csv file'}
          <input id="records-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={pending} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </Card>
      {samples.length > 0 ? (
        <Card as="section" radius={20} aria-labelledby="sample" className="gap-3">
          <h2 id="sample" className="m-0 text-[17px] font-semibold">
            Use a sample file
          </h2>
          <p className="m-0 text-[14px] leading-[1.4] text-body">No file to hand? Try one made for this demo. Both are made up.</p>
          <div className="flex flex-col gap-2">
            {samples.map((s) => (
              <button
                key={s.name}
                type="button"
                disabled={pending}
                onClick={() => onSample(s.name)}
                className="flex min-h-14 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-14 border-[1.5px] border-ink bg-card px-4 py-2 text-left text-ink disabled:opacity-50"
              >
                <span className="text-[16px] font-semibold">{`Use the ${s.button.toLowerCase()}`}</span>
                <span className="text-[13px] font-normal text-body">{s.about}</span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  )
}

function Paste({ pending, onSend, setError }: { pending: boolean; onSend: (text: string) => void; setError: (e: string) => void }) {
  const [text, setText] = useState('')
  return (
    <Card as="section" radius={20} aria-labelledby="paste" className="gap-3">
      <h2 id="paste" className="m-0 text-[17px] font-semibold">
        Paste a table
      </h2>
      <Row id="paste-text" text="The table" hint="Copy the rows from a spreadsheet, with the header row on top. Tabs or commas both work.">
        <textarea
          id="paste-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          spellCheck={false}
          className="w-full rounded-14 border border-muted-2 bg-card px-3.5 py-3 font-mono text-[14px] leading-[1.5] text-ink"
        />
      </Row>
      <Button
        size="md"
        pending={pending}
        onClick={() => {
          if (text.trim() === '') return setError('Paste the table first.')
          onSend(text)
        }}
      >
        Read this table
      </Button>
    </Card>
  )
}

function OneResult({ classId, subject, grade, year, learners, families }: { classId: string; subject: string; grade: number; year: number; learners: Person[]; families: Family[] | null }) {
  const [learner, setLearner] = useState(learners[0]?.id ?? '')
  const [kind, setKind] = useState('quiz')
  const [title, setTitle] = useState('')
  const [strand, setStrand] = useState('')
  const [g, setG] = useState(String(Math.max(1, grade - 1)))
  const [y, setY] = useState(String(year - 1))
  const [term, setTerm] = useState('1')
  const [marks, setMarks] = useState('')
  const [outOf, setOutOf] = useState('')
  const [text, setText] = useState('')
  const [teacher, setTeacher] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<{ name: string; childId: string } | null>(null)
  const [pending, start] = useTransition()
  const isNote = kind === 'note'

  function save() {
    const form = { kind, subject, grade: g, year: y, term, title, family: strand, marks, outOf, text, teacherName: teacher }
    const checked = validateOneResult(form, { subject, year, families })
    if (!checked.ok) return setError(checked.error)
    setError('')
    start(async () => {
      const res = await addOneResult(classId, learner, form)
      if (res.ok) {
        setSaved({ name: res.name, childId: learner })
        setTitle('')
        setMarks('')
        setOutOf('')
        setText('')
      } else setError(res.reason)
    })
  }

  if (saved) {
    return (
      <Card as="section" radius={20} aria-labelledby="one-done" className="gap-3" tone="coral">
        <h2 id="one-done" className="m-0 text-[17px] font-semibold">
          Saved
        </h2>
        <p className="m-0 text-[15px] leading-[1.45]">{`${saved.name}'s Long view is updating with this result. It shows who added it.`}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button href={`/t/${classId}/learners/${saved.childId}/long-view`} size="sm">
            {`See ${saved.name}'s Long view`}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setSaved(null)}>
            Add another result
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card as="section" radius={20} aria-labelledby="one" className="gap-3.5">
      <h2 id="one" className="m-0 text-[17px] font-semibold">
        One result
      </h2>
      {error ? <Problem text={error} /> : null}
      <Row id="or-learner" text="Learner">
        <SelectBox id="or-learner" value={learner} onChange={setLearner}>
          {learners.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectBox>
      </Row>
      <Row id="or-kind" text="Kind of piece">
        <SelectBox id="or-kind" value={kind} onChange={setKind}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </SelectBox>
      </Row>
      {isNote ? (
        <Row id="or-text" text="The note" hint="What the teacher saw. It is kept as written.">
          <textarea id="or-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} className="w-full rounded-14 border border-muted-2 bg-card px-3.5 py-3 text-[17px] leading-[1.4] text-ink" />
        </Row>
      ) : (
        <>
          <Row id="or-title" text="Title" hint="For example Class Test 1">
            <input id="or-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </Row>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={label}>Subject</span>
            <p className="m-0 flex h-[52px] items-center rounded-14 bg-soft-2 px-3.5 text-[17px] text-ink" data-fixed-subject>
              {subject}
            </p>
          </div>
          <Row id="or-strand" text="Strand" hint="The part of the subject this piece was about.">
            {families ? (
              <SelectBox id="or-strand" value={strand} onChange={setStrand}>
                <option value="">Pick a strand</option>
                {families.map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.label}
                  </option>
                ))}
              </SelectBox>
            ) : (
              <input id="or-strand" type="text" value={strand} onChange={(e) => setStrand(e.target.value)} className={input} />
            )}
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row id="or-marks" text="Marks">
              <input id="or-marks" type="text" inputMode="decimal" value={marks} onChange={(e) => setMarks(e.target.value)} className={input} />
            </Row>
            <Row id="or-outof" text="Out of">
              <input id="or-outof" type="text" inputMode="decimal" value={outOf} onChange={(e) => setOutOf(e.target.value)} className={input} />
            </Row>
          </div>
        </>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Row id="or-grade" text="Grade">
          <SelectBox id="or-grade" value={g} onChange={setG}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectBox>
        </Row>
        <Row id="or-year" text="Year">
          <input id="or-year" type="text" inputMode="numeric" value={y} onChange={(e) => setY(e.target.value)} className={input} />
        </Row>
        <Row id="or-term" text="Term">
          <SelectBox id="or-term" value={term} onChange={setTerm}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectBox>
        </Row>
      </div>
      <Row id="or-teacher" text="Teacher's name at the time" hint="The teacher who set or marked it then.">
        <input id="or-teacher" type="text" value={teacher} onChange={(e) => setTeacher(e.target.value)} className={input} />
      </Row>
      <Button pending={pending} onClick={save}>
        Save this result
      </Button>
    </Card>
  )
}
