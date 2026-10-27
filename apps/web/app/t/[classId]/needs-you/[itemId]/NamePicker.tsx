'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { PageTitle, Diamond } from '../../snap/_parts'
import { resolveName } from '../../snap/actions'

type Kid = { id: string; name: string; hasPaper: boolean }

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? ''))

/** Board `teacher-review-name`: pick whose paper it is. */
export function NamePicker({
  classId,
  itemId,
  testId,
  position,
  photo,
  roster,
  leftNames,
  unnamedPositions,
}: {
  classId: string
  itemId: string
  testId: string
  position: number
  photo: string | null
  roster: Kid[]
  leftNames: string[]
  unnamedPositions: number[]
}) {
  const router = useRouter()
  const left = roster.filter((r) => !r.hasPaper)
  const [all, setAll] = useState(false)
  const shown = all ? roster : left
  const [picked, setPicked] = useState<string | null>(shown[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const pick = roster.find((r) => r.id === picked)
  const elimination = unnamedPositions.length === 2 && left.length === 2
  const other = elimination && pick ? left.find((l) => l.id !== pick.id) : null
  const otherPos = unnamedPositions.find((p) => p !== position)

  const submit = () => {
    if (!picked) return
    start(async () => {
      const res = await resolveName(classId, itemId, picked)
      if (!res.ok) return setError(res.message)
      router.push(`/t/${classId}/snap/${testId}/progress`)
    })
  }

  return (
    <div className="flex flex-col gap-[18px] px-5 pt-3 pb-6 leading-[normal]">
      <div className="flex flex-col gap-2">
        <PageTitle size={26}>{elimination ? `Whose paper is this? Only ${list(leftNames)} are left.` : 'Whose paper is this?'}</PageTitle>
        <p className="m-0 ml-6 text-[15px] leading-[1.45] text-body text-pretty">
          {elimination
            ? `I couldn't read the names on papers ${unnamedPositions.join(' and ')}. Pick one for paper ${position} and paper ${otherPos} goes to the other.`
            : `I couldn't read the name on paper ${position}. Pick who wrote it.`}
        </p>
      </div>

      <figure className="m-0 flex flex-col gap-2">
        <div className="relative h-[150px] overflow-hidden rounded-18 bg-[#6E665D] shadow-[inset_0_0_50px_rgba(0,0,0,0.45)]">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={`Paper ${position}, name line`} className="absolute top-0 left-0 w-full" />
          ) : null}
        </div>
        <figcaption className="text-[14px] text-body">Paper {position}, name line.</figcaption>
      </figure>

      <fieldset className="m-0 flex flex-col gap-2 border-none p-0">
        <legend className="mb-2 p-0 text-[16px] font-semibold">Paper {position} belongs to</legend>
        {shown.map((k) => {
          const on = picked === k.id
          return (
            <button
              key={k.id}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked(k.id)}
              className={`flex min-h-[68px] cursor-pointer items-center gap-3 rounded-16 bg-card py-2.5 pr-3.5 pl-3 text-left text-ink ${on ? 'border-2 border-ink' : 'border border-edge'}`}
            >
              <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-pill bg-soft-3 text-[15px] font-bold">{k.name[0]}</span>
              <span className="flex flex-1 flex-col leading-[1.3]">
                <span className="text-[17px] font-semibold">{k.name}</span>
                <span className="text-[14px] text-body">{k.hasPaper ? 'Has a paper' : 'No paper yet'}</span>
              </span>
              {on ? (
                <span className="flex size-[26px] items-center justify-center rounded-pill bg-ink">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                </span>
              ) : (
                <span className="size-[26px] rounded-pill border-[1.5px] border-muted-2" />
              )}
            </button>
          )
        })}
        {!all ? (
          <button type="button" onClick={() => setAll(true)} className="min-h-11 cursor-pointer self-start border-none bg-transparent px-1 text-[15px] font-semibold text-ink underline underline-offset-[3px]">
            Someone else? Show all {roster.length} learners
          </button>
        ) : null}
      </fieldset>

      {other ? (
        <p className="m-0 flex gap-2.5 rounded-14 bg-soft-2 px-3.5 py-3 text-[15px] leading-[1.45]">
          <Diamond size={12} className="mt-[5px]" />
          Paper {otherPos} goes to {other.name}. You can swap them later on the test page.
        </p>
      ) : null}
      {error ? <p role="alert" className="m-0 text-[14px] text-coral-text">{error}</p> : null}
      <button type="button" disabled={!pick || pending} onClick={submit} className="flex h-[52px] cursor-pointer items-center justify-center gap-2 rounded-14 border-none bg-ink text-[17px] font-semibold text-white disabled:opacity-50">
        Paper {position} is {pick?.name ?? '...'}&apos;s
      </button>
    </div>
  )
}
