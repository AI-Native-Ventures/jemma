import { capsMapOf, topicRowsOf, type CapsMap, type TopicRow } from '../../../packages/profiling/src/curriculum/caps-map'
import { HILLVIEW_CLASSES } from './hillview'

// The CAPS map each made-up class of the demo school starts with, already approved: the official South African Mathematics topics of the
// class's grade (`packages/profiling/src/curriculum/caps.ts`). 6B is not here: its first step in the demo path is the teacher's own upload,
// and its recorded answers depend on that. Pure: no database, no clock. The seed writes the rows. The rows themselves (and the function that
// writes an approved map) are shared with a learner's own workspace: `packages/profiling/src/curriculum/caps-map.ts`.

export { topicRowsOf, type TopicRow }

export type CapsClassMap = CapsMap & { classKey: string }

/** The classes that start with a CAPS map: every class with made-up learners (5A, 7A, 4A), in the order of the school. */
export function capsClassMaps(): CapsClassMap[] {
  return HILLVIEW_CLASSES.filter((c) => c.learners === 'made-up').map((c) => {
    const map = capsMapOf(c.grade)
    if (!map) throw new Error(`demo seed: no CAPS map for Grade ${c.grade}`)
    return { classKey: c.key, ...map }
  })
}
