'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_YOU, readTourResult } from '../outcome'
import { LearnerRow } from './LearnerRow'

/**
 * The tour learner's row of the class list. It shows how they did a moment ago in this browser tab (1 of 5 for the way the tour is usually gone
 * through), or the same default when the lesson has not been done in this tab. The server draws the default, the browser then reads the tab.
 */
export function YouRow({ name }: { name: string }) {
  const [results, setResults] = useState<boolean[]>(DEFAULT_YOU)
  useEffect(() => {
    setResults(readTourResult(sessionStorage))
  }, [])
  return <LearnerRow name={name} results={results} you />
}
