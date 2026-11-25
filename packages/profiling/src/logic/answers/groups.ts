import type { GroupsSpec } from '../../schemas/lesson'
import { splitValues } from './lists'

/**
 * P170: things sorted into groups, from the "Drag into groups" board: number cards dragged (or tapped) into groups like Odd and Even. The key is an ordered list
 * of the group of each item, as a number from 1, in the order of the items (`2; 1; 1; 2`), so the list marking marks each item right or wrong. Pure.
 */

export const GROUPS_MIN = 2
export const GROUPS_MAX = 4
export const GROUP_ITEMS_MIN = 3
export const GROUP_ITEMS_MAX = 8
/** The longest name of a group, and of an item. */
export const GROUP_NAME_MAX = 16
export const GROUP_ITEM_MAX = 12

/** Why groups cannot be shown, or null. */
export function groupsProblem(g: GroupsSpec): string | null {
  if (g.names.length < GROUPS_MIN || g.names.length > GROUPS_MAX) return `there are ${GROUPS_MIN} to ${GROUPS_MAX} groups`
  if (g.names.some((n) => !n.trim() || n.trim().length > GROUP_NAME_MAX)) return `each group has a name of 1 to ${GROUP_NAME_MAX} characters`
  if (new Set(g.names.map((n) => n.trim().toLowerCase())).size !== g.names.length) return 'each group has its own name'
  if (g.items.length < GROUP_ITEMS_MIN || g.items.length > GROUP_ITEMS_MAX) return `there are ${GROUP_ITEMS_MIN} to ${GROUP_ITEMS_MAX} things to sort`
  if (g.items.some((n) => !n.trim() || n.trim().length > GROUP_ITEM_MAX)) return `each thing to sort is 1 to ${GROUP_ITEM_MAX} characters`
  if (new Set(g.items.map((n) => n.trim().toLowerCase())).size !== g.items.length) return 'each thing to sort is there once'
  return null
}

/** The group of each item in a key or an answer (1 is the first group), or null when one is not a group number. */
export function groupsOf(answer: string, g: GroupsSpec): number[] | null {
  const values = splitValues(answer).map((t) => (/^\d+$/.test(t) ? Number(t) : NaN))
  return values.every((v) => Number.isInteger(v) && v >= 1 && v <= g.names.length) ? values : null
}

/** Why the key of a question with groups is not the group of each item, or null. Every group is used. */
export function groupsKeyProblem(q: { answer: string; answerKind: string; groups: GroupsSpec }): string | null {
  if (q.answerKind !== 'list') return 'things sorted into groups have a list answer: the group of each, as a number from 1'
  const values = groupsOf(q.answer, q.groups)
  if (!values) return `each value of the answer is the number of a group, from 1 to ${q.groups.names.length}`
  if (values.length !== q.groups.items.length) return `the answer has ${values.length} groups for ${q.groups.items.length} things to sort`
  if (q.groups.names.some((_, i) => !values.includes(i + 1))) return 'every group has at least one thing in it'
  return null
}

/** A question with groups as it is saved: its list is ordered, with the name of each item over its box (for the results). */
export function tidyGroups<Q extends { answerKind: string; groups?: GroupsSpec; ordered?: boolean; labels?: string[] }>(q: Q): Q {
  if (!q.groups || q.answerKind !== 'list') return q
  return { ...q, ordered: true, labels: q.groups.items.map((i) => i.trim()) }
}

/** The answer the groups hold, as one text (the group of each item, in order), or '' while a thing is not in a group. `placed` is the group of each item, or null. */
export const groupsAnswer = (placed: (number | null)[]): string =>
  placed.length > 0 && placed.every((p) => p !== null) ? placed.map((p) => String(p! + 1)).join('; ') : ''

/** The groups as words, for the results: "Odd: 7, 15 and 9. Even: 12, 20 and 4." A thing with no group (null) is left out. */
export function groupsText(g: GroupsSpec, values: (number | null)[]): string {
  return g.names
    .map((name, k) => {
      const inIt = g.items.filter((_, i) => values[i] === k + 1).map((t) => t.trim())
      const list = inIt.length <= 1 ? (inIt[0] ?? 'none') : `${inIt.slice(0, -1).join(', ')} and ${inIt[inIt.length - 1]}`
      return `${name.trim()}: ${list}.`
    })
    .join(' ')
}
