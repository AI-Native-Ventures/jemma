// Live smoke run of the cloud agent jobs on a fresh `start` sandbox (jemma-dev only), in demo-path order.
// Run: node --import tsx --import ./scripts/register-md.mjs scripts/live-smoke.ts [--steps a,b,c] [--fresh]
// Steps: draft_map approve_map read_key approve_key read_paper diagnose class_report plan write_lesson write_lesson_audio guidance
// State (sandbox, ids) is kept in scripts/.smoke-state.json so later steps can run after earlier ones.
// Env: .env.local (LLM_*, VISION_*, AI_MODE, OPENROUTER_API_KEY, Supabase). Keys are never printed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SupabaseReplayStore, type AiEnv } from '../src/ai'
import { createServiceClient, type JemmaDb } from '../src/db'
import { registerSpeech } from '../src/speech'
import { runDraftMap, runGuidance, runReadKey } from '../src/jobs/cloud'
import { makeClassReportJob } from '../src/jobs/cloud/class-report'
import { makeDiagnoseJob } from '../src/jobs/cloud/diagnose'
import { runJobReadPaper } from '../src/jobs/cloud/read-paper'
import { runJobWriteLesson } from '../src/jobs/cloud/write-lesson'
import { TopicMapDraftSchema } from '../src/schemas'
import type { ToolContext } from '../src/tools/context'
import { planNextSession } from '../src/tools/save/plan-next-session'
import { createSandbox } from '../../../supabase/seed'
import { topicMapDraft } from '../../../supabase/seed/fixtures/marked-state'
import { assertDevProject, loadEnv } from './env'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const STATE = here('./.smoke-state.json')
const prompt = (job: string) => readFileSync(here(`../src/jobs/${job}.md`), 'utf8')
const SAMPLE = 'sample-papers'
const PAPERS = ['amina', 'thabo', 'lerato', 'sipho', 'naledi']
const ALL = ['draft_map', 'approve_map', 'read_key', 'approve_key', 'read_paper', 'diagnose', 'class_report', 'plan', 'write_lesson', 'write_lesson_audio', 'guidance']

type State = { schoolId?: string; classId?: string; teacherId?: string; mapId?: string; testId?: string; papers?: Record<string, string>; children?: Record<string, string> }

const env = loadEnv()
Object.assign(process.env, env)
assertDevProject(env)
const db: JemmaDb = createServiceClient({ SUPABASE_URL: env.SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY! })
const ai: AiEnv = {
  LLM_PROVIDER: env.LLM_PROVIDER, LLM_MODEL: env.LLM_MODEL, VISION_PROVIDER: env.VISION_PROVIDER, VISION_MODEL: env.VISION_MODEL,
  TTS_PROVIDER: env.TTS_PROVIDER, TTS_MODEL: env.TTS_MODEL, AI_MODE: (env.AI_MODE as AiEnv['AI_MODE']) ?? 'record',
  OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, replayStore: new SupabaseReplayStore(db),
}
const arg = (f: string) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : undefined)
const steps = arg('--steps')?.split(',') ?? ALL
const state: State = process.argv.includes('--fresh') || !existsSync(STATE) ? {} : JSON.parse(readFileSync(STATE, 'utf8'))
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2))

// Speech: with TTS_PROXY_URL set (scripts/tts-proxy under `wrangler dev`) the audio lesson gets real Workers AI speech.
if (env.TTS_PROXY_URL) {
  registerSpeech(() => ({
    async synthesize(script) {
      const res = await fetch(env.TTS_PROXY_URL!, { method: 'POST', body: JSON.stringify({ text: script }) })
      if (!res.ok) throw new Error(`speech proxy answered ${res.status}`)
      return { bytes: new Uint8Array(await res.arrayBuffer()), mediaType: 'audio/mpeg' }
    },
  }))
}

const ctx = (): ToolContext => ({ db, schoolId: state.schoolId!, eventId: null, env: ai, now: () => new Date() })
const call = async <T,>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> => {
  const { data, error } = await q
  if (error || data === null) throw new Error(error?.message ?? 'no row')
  return data
}
const eid = null as unknown as string

const rows: { step: string; secs: string; result: string }[] = []
async function step(name: string, fn: () => Promise<string>) {
  if (!steps.includes(name)) return
  const t0 = Date.now()
  let result: string
  try {
    result = `OK  ${await fn()}`
  } catch (e) {
    result = `ERR ${(e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 300)}`
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  rows.push({ step: name, secs, result })
  console.log(`${name.padEnd(20)} ${secs.padStart(6)}s  ${result}`)
}

async function approveMap(mapId: string) {
  const map = await call(db.from('curriculum_maps').select('draft').eq('id', mapId).single())
  const draft = TopicMapDraftSchema.parse(map.draft)
  const wanted = draft.terms.flatMap((t) => t.topics.map((x, i) => ({ term: t.term, position: i + 1, ...x })))
  await call(db.from('topics').delete().eq('map_id', mapId).select('id'))
  for (const w of wanted) {
    const r = await db.from('topics').insert({ map_id: mapId, name: w.name, term: w.term, position: w.position, family: w.family, misconceptions: w.misconceptions })
    if (r.error) throw new Error(r.error.message)
  }
  const saved = await call(db.from('topics').select('id, name').eq('map_id', mapId))
  const idOf = new Map(saved.map((t) => [t.name, t.id]))
  for (const w of wanted) {
    const ids = w.prerequisites.map((p) => idOf.get(p)).filter((x): x is string => !!x)
    await call(db.from('topics').update({ prerequisite_ids: ids }).eq('id', idOf.get(w.name)!).select('id'))
  }
  await call(db.from('curriculum_maps').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', mapId).select('id'))
  await call(db.from('needs_you_items').update({ status: 'done' }).eq('kind', 'approve_map').eq('ref_id', mapId).select('id'))
  const rpc = await db.rpc('retag_results', { map: mapId })
  if (rpc.error) throw new Error(rpc.error.message)
  return wanted.length
}

async function main() {
  console.log(`models: text=${ai.LLM_PROVIDER}/${ai.LLM_MODEL} vision=${ai.VISION_PROVIDER}/${ai.VISION_MODEL} mode=${ai.AI_MODE}`)
  if (!state.schoolId) {
    const sb = await createSandbox(db, { stage: 'start' })
    const cls = await call(db.from('classes').select('id, teacher_id').eq('id', sb.classId).single())
    const kids = await call(db.from('children').select('id, first_name').eq('school_id', sb.schoolId))
    Object.assign(state, { schoolId: sb.schoolId, classId: sb.classId, teacherId: cls.teacher_id, children: Object.fromEntries(kids.map((k) => [k.first_name.toLowerCase(), k.id])) })
    save()
    console.log(`sandbox ${sb.schoolId} (start stage)`)
  }

  await step('draft_map', async () => {
    const map = await call(db.from('curriculum_maps').insert({ class_id: state.classId!, status: 'draft' }).select('id').single())
    // Same two documents the web app's "Use the sample curriculum" adds.
    for (const [i, title] of ['CAPS Intermediate Phase Mathematics', 'Grade 6 Annual Teaching Plan'].entries()) {
      const path = `${state.schoolId}/${state.classId}/sample-${i + 1}.pdf`
      const copy = await db.storage.from(SAMPLE).copy('curriculum/grade-6-teaching-plan.pdf', path, { destinationBucket: 'curriculum' })
      if (copy.error && !/exists|Duplicate/i.test(copy.error.message)) throw new Error(copy.error.message)
      await call(db.from('curriculum_docs').insert({ class_id: state.classId!, storage_path: path, title, pages: 1 }).select('id'))
    }
    state.mapId = map.id
    save()
    await runDraftMap(ctx(), null, { mapId: map.id })
    const draft = TopicMapDraftSchema.parse((await call(db.from('curriculum_maps').select('draft').eq('id', map.id).single())).draft)
    const n = draft.terms.reduce((s, t) => s + t.topics.length, 0)
    const unsure = draft.terms.reduce((s, t) => s + t.topics.filter((x) => x.check).length, 0)
    return `${n} topics drafted in ${draft.terms.length} terms, ${unsure} unsure, ${draft.leftOut.length} left out`
  })

  // Fallback when the free model cannot draft the map: the fixture map stands in so later steps can run.
  await step('seed_map', async () => {
    const map = await call(db.from('curriculum_maps').insert({ class_id: state.classId!, status: 'draft', draft: JSON.parse(JSON.stringify(topicMapDraft())) }).select('id').single())
    state.mapId = map.id
    save()
    return `fixture map ${map.id.slice(0, 8)} stored as the draft`
  })

  await step('approve_map', async () => `${await approveMap(state.mapId!)} topics saved, map approved, results retagged`)

  await step('read_key', async () => {
    const topics = await call(db.from('topics').select('id').eq('map_id', state.mapId!))
    const test = await call(
      db.from('tests').insert({ class_id: state.classId!, title: 'Class Test 1: Fractions and decimals', written_on: new Date().toISOString().slice(0, 10), out_of: 10, topic_ids: topics.map((t) => t.id) }).select('id').single(),
    )
    state.testId = test.id
    const path = `${state.schoolId}/${test.id}/memo.png`
    const copy = await db.storage.from(SAMPLE).copy('class-test-1/memo.png', path, { destinationBucket: 'papers' })
    if (copy.error) throw new Error(copy.error.message)
    await call(db.from('answer_keys').upsert({ test_id: test.id, status: 'draft', memo_path: path, approved_at: null }).select('test_id'))
    save()
    await runReadKey(ctx(), null, { testId: test.id })
    const key = await call(db.from('answer_keys').select('items').eq('test_id', test.id).single())
    const items = key.items as { n: number; answer: string; topicName: string; confidence: number }[]
    const low = items.filter((i) => i.confidence < 0.8).map((i) => i.n)
    return `${items.length} answers read (${items.slice(0, 4).map((i) => `${i.n}:${i.answer}`).join(' ')} ...), low confidence ${JSON.stringify(low)}`
  })

  await step('approve_key', async () => {
    await call(db.from('answer_keys').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('test_id', state.testId!).select('test_id'))
    await call(db.from('needs_you_items').update({ status: 'done' }).eq('kind', 'approve_key').eq('ref_id', state.testId!).select('id'))
    return 'key approved'
  })

  await step('read_paper', async () => {
    state.papers ??= {}
    for (const name of PAPERS) {
      if (state.papers[name]) continue
      const p = await call(db.from('papers').insert({ test_id: state.testId!, owner: 'teacher', kind: 'test', status: 'queued' }).select('id').single())
      const path = `${state.schoolId}/${p.id}/1.png`
      const copy = await db.storage.from(SAMPLE).copy(`class-test-1/${name}.png`, path, { destinationBucket: 'papers' })
      if (copy.error) throw new Error(copy.error.message)
      await call(db.from('paper_pages').insert({ paper_id: p.id, page_no: 1, storage_path: path }).select('id'))
      state.papers[name] = p.id
    }
    save()
    // Three at a time, like the cloud consumer (max_batch_size 3).
    const readOne = async (name: string) => {
      const id = state.papers![name]!
      const t0 = Date.now()
      try {
        await runJobReadPaper(ctx(), eid, { paperId: id }, { prompt: prompt('read_paper') })
        const p = await call(db.from('papers').select('status, total, name_read').eq('id', id).single())
        const n = (await call(db.from('question_results').select('n').eq('paper_id', id))).length
        return `${name}: ${p.status} read ${n} answers total ${p.total} name "${p.name_read}" (${((Date.now() - t0) / 1000).toFixed(0)}s)`
      } catch (e) {
        return `${name}: ERR ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`
      }
    }
    const out: string[] = []
    const queue = [...PAPERS]
    await Promise.all(Array.from({ length: 3 }, async () => { for (let name = queue.shift(); name; name = queue.shift()) out.push(await readOne(name)) }))
    if (out.some((o) => o.includes('ERR'))) throw new Error(out.join(' | '))
    return out.sort().join(' | ')
  })

  await step('diagnose', async () => {
    const run = makeDiagnoseJob(prompt('diagnose'))
    const out: string[] = []
    const queue = Object.entries(state.children!).filter(([n]) => PAPERS.includes(n))
    // Three at a time, under the free tier's 20 requests a minute.
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const [name, childId] = next
          await run(ctx(), eid, { childId, testId: state.testId! })
          const gaps = await call(db.from('gaps').select('topic_name').eq('child_id', childId).eq('stage', 'new'))
          out.push(`${name}: ${gaps.length} new gaps`)
        }
      }),
    )
    return out.sort().join(', ')
  })

  await step('class_report', async () => {
    await makeClassReportJob(prompt('class_report'))(ctx(), eid, { classId: state.classId!, testId: state.testId! })
    const r = await call(db.from('reteach_plans').select('topic_name, content').eq('test_id', state.testId!).limit(1))
    const logs = await call(db.from('activity_log').select('text').eq('class_id', state.classId!).eq('tool', 'class_gap_report'))
    return `reteach "${r[0]?.topic_name}" minutes ${(r[0]?.content as { minutes?: number } | undefined)?.minutes}; log: ${logs.map((l) => l.text).join(' / ')}`
  })

  await step('plan', async () => {
    const out: string[] = []
    for (const [name, childId] of Object.entries(state.children!)) {
      const p = await planNextSession.run(ctx(), { childId })
      if (p.planned) out.push(`${name}: ${p.topicName} (${p.format})`)
    }
    return out.join(', ') || 'no sessions planned'
  })

  const writeFor = async (childName: string, force?: 'audio') => {
    const childId = state.children![childName]!
    if (force) {
      const s = await call(db.from('sessions').select('id, lesson_id').eq('child_id', childId).eq('status', 'planned').limit(1))
      if (s[0]?.lesson_id) await call(db.from('lessons').update({ format: force }).eq('id', s[0].lesson_id).select('id'))
      if (s[0]) await call(db.from('sessions').update({ format: force } as never).eq('id', s[0].id).select('id')).catch(() => undefined)
    }
    await runJobWriteLesson(ctx(), eid, { childId }, { prompt: prompt('write_lesson') })
    const s = await call(db.from('sessions').select('lesson_id').eq('child_id', childId).eq('status', 'planned').limit(1))
    const l = await call(db.from('lessons').select('format, content, audio_path').eq('id', s[0]!.lesson_id!).single())
    const c = l.content as { questions?: unknown[]; warmup?: unknown[] }
    return `${childName}: ${l.format} lesson, ${c.questions?.length ?? 0} questions + ${c.warmup?.length ?? 0} warm-up, audio_path ${l.audio_path ?? 'none'}`
  }
  await step('write_lesson', () => writeFor('amina'))
  await step('write_lesson_audio', () => writeFor('thabo', 'audio'))

  await step('guidance', async () => {
    await runGuidance(ctx(), eid, { childId: state.children!.amina! })
    const g = await call(db.from('guidance_cards').select('content').eq('child_id', state.children!.amina!).single())
    const c = g.content as { headline: string; focus: unknown[] }
    return `"${c.headline}" with ${c.focus.length} focus items`
  })

  console.log('\nstep'.padEnd(22) + 'secs  result')
  for (const r of rows) console.log(`${r.step.padEnd(20)} ${r.secs.padStart(6)}  ${r.result}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
