'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Notation } from '@jemma/profiling/logic'

// P187: the notation of the space on the screen (logic/notation.ts): a space in the US writes 2.5 and (2, 3), every other space 2,5 and (2; 3). The space's
// layout sets it from the same country that decides its words (us-words-on.ts); a screen with no layout to set it writes the South African way.

const NotationContext = createContext<Notation>('za')

export function NotationProvider({ notation, children }: { notation: Notation; children: ReactNode }) {
  return <NotationContext.Provider value={notation}>{children}</NotationContext.Provider>
}

/** The notation of the space on the screen. */
export const useNotation = (): Notation => useContext(NotationContext)
