import { bannedWords } from '../../packages/profiling/src/logic/long-view'
import { check, callsTo, eventDone, list, objectOf } from '../lib/checks'
import { childIdOf } from '../lib/find'
import type { Task } from '../lib/types'

export type GuidanceState = { childId: string }
export type GuidanceFacts = {
  startedAt: string
  card: { updatedAt: string; content: unknown } | null
  /** Every `question_results` id of the learner. */
  resultIds: string[]
}

type Focus = { title: string; why: string; evidence: { label: string; resultIds: string[] }[] }

function readCard(content: unknown): { headline: string; focus: Focus[]; lookingAhead: string } | null {
  const o = objectOf(content)
  if (!o || !Array.isArray(o.focus)) return null
  return {
    headline: String(o.headline ?? ''),
    lookingAhead: String(o.lookingAhead ?? ''),
    focus: (o.focus as Record<string, unknown>[]).map((f) => ({
      title: String(f.title ?? ''),
      why: String(f.why ?? ''),
      evidence: (Array.isArray(f.evidence) ? (f.evidence as Record<string, unknown>[]) : []).map((e) => ({
        label: String(e.label ?? ''),
        resultIds: Array.isArray(e.resultIds) ? e.resultIds.map(String) : [],
      })),
    })),
  }
}

/**
 * Stage `marked`, learner Amina. The real event is `observation.added`, which plans the `guidance` job. The seed already
 * has a guidance card for Amina, so "saved" means saved again during this run.
 */
export const guidanceSourced: Task<GuidanceState, GuidanceFacts> = {
  id: 'guidance-sourced',
  proves: "Jemma writes a learner's guidance card, and every focus item is backed by that learner's own marked answers",
  job: 'guidance',
  stage: 'marked',
  async prepare(ctx) {
    const childId = await childIdOf(ctx.admin, ctx.sandbox.schoolId, 'Amina')
    return { event: { type: 'observation.added', payload: { childId } }, state: { childId } }
  },
  async collect(ctx, prepared) {
    const { childId } = prepared.state
    const [card, results] = await Promise.all([
      ctx.admin.from('guidance_cards').select('content, updated_at').eq('child_id', childId).maybeSingle(),
      ctx.admin.from('question_results').select('id').eq('child_id', childId),
    ])
    if (card.error) throw new Error(`could not read the guidance card: ${card.error.message}`)
    if (results.error) throw new Error(`could not read the results: ${results.error.message}`)
    return {
      startedAt: ctx.startedAt,
      card: card.data ? { updatedAt: card.data.updated_at, content: card.data.content } : null,
      resultIds: (results.data ?? []).map((r) => r.id),
    }
  },
  checks(facts, _prepared, outcome) {
    const out = [eventDone(outcome)]
    const fresh = !!facts.card && Date.parse(facts.card.updatedAt) >= Date.parse(facts.startedAt)
    out.push(check('a guidance card was saved by this run', fresh, !facts.card ? 'no card row' : fresh ? `updated ${facts.card.updatedAt}` : `the card is the seeded one (updated ${facts.card.updatedAt}, run started ${facts.startedAt})`))
    const card = facts.card ? readCard(facts.card.content) : null
    if (!card) {
      out.push(check('the card has focus items', false, 'the saved card could not be read'))
      return out
    }
    out.push(check('the card keeps one to three focus items', card.focus.length >= 1 && card.focus.length <= 3, `${card.focus.length} focus item(s)`))
    const unbacked = card.focus.filter((f) => f.evidence.length === 0 || f.evidence.some((e) => e.resultIds.length === 0)).map((f) => f.title)
    out.push(check('every focus item has evidence', card.focus.length > 0 && unbacked.length === 0, unbacked.length ? `no evidence ids on: ${list(unbacked)}` : `${card.focus.length} item(s), each with evidence`))
    const real = new Set(facts.resultIds)
    const strange = card.focus.flatMap((f) => f.evidence.flatMap((e) => e.resultIds)).filter((id) => !real.has(id))
    out.push(check("every evidence id is a real marked answer of this learner", strange.length === 0, strange.length ? `not this learner's: ${list(strange, 3)}` : `all ids found among ${facts.resultIds.length} of her results`))
    const text = [card.headline, card.lookingAhead, ...card.focus.flatMap((f) => [f.title, f.why, ...f.evidence.map((e) => e.label)])].join('\n')
    const banned = bannedWords(text)
    out.push(check('no banned word on the card', banned.length === 0, banned.length ? `found: ${list(banned)}` : 'none found'))
    out.push(check('subject_guidance answered ok', callsTo(outcome.calls, 'jemma', 'subject_guidance').some((c) => c.ok), `${callsTo(outcome.calls, 'jemma', 'subject_guidance').length} call(s)`))
    return out
  },
  extras(facts, _prepared, outcome) {
    // Did the save tool have to remove anything the model made up? (it drops ids that are not real and items left with none)
    const real = new Set(facts.resultIds)
    const sent = callsTo(outcome.calls, 'jemma', 'subject_guidance').flatMap((c) => {
      const g = objectOf(objectOf(c.input)?.guidance)
      return readCard(g)?.focus ?? []
    })
    const ids = sent.flatMap((f) => f.evidence.flatMap((e) => e.resultIds))
    const kept = facts.card ? (readCard(facts.card.content)?.focus.length ?? 0) : 0
    return { focusItemsFromModel: sent.length, focusItemsKept: kept, idsFromModel: ids.length, invalidIdsFromModel: ids.filter((id) => !real.has(id)).length }
  },
}
