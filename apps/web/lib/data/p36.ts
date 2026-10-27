import { dayLabel, getBeyond, joinList, type ActivityRow } from './p23'
import { getPaperDetail, getTestsList, sharedTopicWord, type PaperDetail } from './p24'
import { loadLearn, shortTopic } from './p25'

/** Laptop-only data for the parent profile, learn and tests boards. Composes the phone loaders, adds no new queries of its own. */

export type ProfileExtras = {
  today: string
  tonight: string | null
  teacher: string
  notes: { id: string; label: string; text: string }[]
  attendance: { present: number; total: number; days: ('here' | 'late' | 'away')[]; line: string } | null
  activities: ActivityRow[]
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export async function getProfileExtras(childId: string): Promise<ProfileExtras> {
  const [beyond, learn] = await Promise.all([getBeyond(childId), loadLearn(childId)])
  const tonight = learn.tonight
    ? `Tonight: ${learn.tonight.minutes} min on ${lowerFirst(shortTopic(learn.tonight.topicName))}`
    : null
  const days = (beyond?.weeks ?? []).flatMap((w) => w.days.map((d) => d.status))
  return {
    today: dayLabel(new Date().toISOString()),
    tonight,
    teacher: beyond?.teacher ?? 'Ms Banda',
    notes: (beyond?.notes ?? []).slice(0, 2).map((n) => ({ id: n.id, label: n.label, text: n.text })),
    attendance: beyond && beyond.total
      ? {
          present: beyond.present,
          total: beyond.total,
          days,
          line: `Term ${beyond.term} so far.${beyond.away.length ? ` Away on ${joinList(beyond.away)}.` : ''}`,
        }
      : null,
    activities: beyond?.activities ?? [],
  }
}

export type LaptopTestRow = { key: string; tile: string; title: string; line: string; href: string | null; selected: boolean }

export type TestsLaptop = {
  childName: string
  headline: string
  needsYou: { title: string; detail: string; href: string } | null
  terms: { term: number; rows: LaptopTestRow[] }[]
  paper: PaperDetail | null
}

/** "Class Test 1: Fractions and decimals" is "Class Test 1" on the laptop board; "Term 3 report: Mathematics" is "Term 3 report". */
const baseTitle = (kind: 'test' | 'homework' | 'report', title: string) => (kind === 'homework' ? title : title.split(':')[0]!.trim())
const stripDate = (line: string) => line.replace(/ on [A-Z][a-z]{2} \d+ [A-Z][a-z]{2,3}$/, '')

export function paperHeadline(paper: PaperDetail): string {
  const word = sharedTopicWord(paper.missed)
  return `${paper.total} out of ${paper.outOf} on ${paper.shortTitle}.${
    word ? ` Every mark she lost was on ${word}.` : paper.missed.length ? ` She lost marks on ${paper.missed.length} questions.` : ' She got every mark.'
  }`
}

/** The tests list with the marked paper beside it. `paperId` is the selected paper; the latest marked test when omitted. */
export async function getTestsLaptop(childId: string, userId: string, paperId?: string, preloaded?: PaperDetail): Promise<TestsLaptop | null> {
  const list = await getTestsList(childId, userId)
  if (!list) return null
  const latestTest = list.terms.flatMap((t) => t.rows).find((r) => r.href?.includes('/papers/'))
  const selectedId = paperId ?? latestTest?.key ?? null
  const paper = preloaded ?? (selectedId ? await getPaperDetail(childId, selectedId) : null)

  const terms = list.terms.map(({ term, rows }) => ({
    term,
    rows: rows.map((r): LaptopTestRow => {
      const kind = r.href?.includes('/papers/') ? 'test' : r.href?.includes('/snap/') ? 'homework' : 'report'
      return {
        key: r.key,
        tile: r.tile,
        title: baseTitle(kind, r.title),
        line: stripDate(r.lines[0] ?? ''),
        href: r.href,
        selected: r.key === selectedId,
      }
    }),
  }))

  const waiting = list.terms.flatMap((t) => t.rows).find((r) => r.lines.includes('Waiting for your check'))
  const unsure = /(\d+) I'm unsure about/.exec(list.needsYou?.detail ?? '')
  const needsYou = list.needsYou
    ? {
        title: waiting?.title ?? list.needsYou.title,
        detail: `Waiting for your check${unsure ? ` · ${unsure[1]} ${unsure[1] === '1' ? 'answer' : 'answers'} I'm unsure about` : ''}`,
        href: list.needsYou.href,
      }
    : null

  return { childName: list.child.firstName, headline: paper ? paperHeadline(paper) : list.headline, needsYou, terms, paper }
}
