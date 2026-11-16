/**
 * Where "Press and hold" on the hand-back screen (`/k/done`) goes, worked out from facts and nothing else (no database, so it is tested without one).
 *
 * - A grown-up handed the phone over ("Practise at home") and is signed in: the hold opens that grown-up's page for this practice.
 * - A learner signed in as a made-up learner of a demo copy, with a made-up grown-up: the hold switches to that grown-up and opens the same page.
 * - Everyone else (a learner with a code login, or one who signed up alone, with nobody to hand the phone to): no hold, a way back to their own home.
 * The demo's "Switch who you are" list is never a target: it is a list of made-up people, and a real learner must never land on it.
 */

export type HandbackFacts = {
  /** The phone is in a grown-up's hands: the grown-up is signed in and the hand-over cookie is valid. */
  parentHere: boolean
  /** The key of the made-up grown-up of this learner when the learner is in a demo copy, else null. */
  demoParent: string | null
  /** The learner whose practice it was (the record the screens work on). */
  childId: string
  /** The practice that was just finished, or null when there is none to name. */
  sessionId: string | null
}

export type HandbackTarget =
  /** Hold, then go to `href` (the grown-up is already signed in). */
  | { kind: 'open'; href: string }
  /** Hold, then switch to the made-up grown-up and land on `href`. */
  | { kind: 'demo-parent'; href: string }
  /** No hold: a button back to the learner's own home. */
  | { kind: 'home'; href: '/k' }

/** The grown-up's page for one practice, or for the child when there is no practice to name. */
export const parentResultsHref = (childId: string, sessionId: string | null): string =>
  sessionId ? `/p/${childId}/sessions/${sessionId}` : `/p/${childId}`

export function handbackTarget(f: HandbackFacts): HandbackTarget {
  if (f.parentHere) return { kind: 'open', href: parentResultsHref(f.childId, f.sessionId) }
  if (f.demoParent) return { kind: 'demo-parent', href: parentResultsHref(f.childId, f.sessionId) }
  return { kind: 'home', href: '/k' }
}

/** The page of one practice the learner can read again (the same screen after the practice and from My maths). */
export const practiceResultsHref = (sessionId: string, from?: 'done'): string => `/k/session/${sessionId}/results${from ? `?from=${from}` : ''}`

/**
 * The key of the made-up grown-up of a made-up learner, by the learner's first name: the grown-up of the demo school who has a child of that name and
 * not one "on their own". Null when the demo has none (most made-up learners have no grown-up).
 */
export function demoParentKey(firstName: string, parents: { key: string; children: { name: string; alone?: boolean }[] }[]): string | null {
  const name = firstName.trim().toLowerCase()
  return parents.find((p) => p.children.some((c) => !c.alone && c.name.trim().toLowerCase() === name))?.key ?? null
}
