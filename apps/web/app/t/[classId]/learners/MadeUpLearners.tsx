'use client'

import { useState, useTransition } from 'react'
import { addMadeUpLearnersAction } from './made-up-actions'

/** Demo schools only: six made-up learners with a few years of history, for a class that has none (or a few). */
export function MadeUpLearners({ classId }: { classId: string }) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function add() {
    setError('')
    setNote('')
    start(async () => {
      const res = await addMadeUpLearnersAction(classId)
      if (res.ok) setNote(`Added ${res.added} made-up learners. Jemma is reading their history.`)
      else setError(res.reason)
    })
  }

  return (
    <section aria-labelledby="made-up" className="flex flex-col gap-2 rounded-18 border-[1.5px] border-dashed border-muted-2 bg-card p-4">
      <h2 id="made-up" className="m-0 text-[16px] font-semibold">Demo school</h2>
      <p className="m-0 text-[14px] leading-[1.45] text-body text-pretty">
        Fill this class with six made-up learners and up to three years of messy history in its subject. Every person here is made up.
      </p>
      <button
        type="button"
        onClick={add}
        disabled={pending}
        aria-busy={pending}
        className="flex h-12 cursor-pointer items-center justify-center rounded-14 border-[1.5px] border-ink bg-card px-4 font-[inherit] text-[16px] font-semibold text-ink disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? 'Adding made-up learners' : 'Add made-up learners'}
      </button>
      {note ? <p role="status" className="m-0 text-[14px] text-ink">{note}</p> : null}
      {error ? <p role="alert" className="m-0 text-[14px] text-coral-text">{error}</p> : null}
    </section>
  )
}
