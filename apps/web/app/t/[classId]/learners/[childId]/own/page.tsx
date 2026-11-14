import { scoreText } from '@jemma/profiling/logic'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { stageWords } from '@/app/k/maths/format'
import { shortDay } from '@/lib/own-grades'
import { getOwnWorkspaceForTeacher, type OwnGap } from '@/lib/own-workspace'
import { BackHeader, Page, card, font } from '../../_parts'

export const metadata: Metadata = { title: 'Own practice' }
export const dynamic = 'force-dynamic'

const sectionTitle = { margin: 0, fontSize: 16, fontWeight: 600 } as const
const quiet = { margin: 0, fontSize: 15, lineHeight: 1.45, color: '#5D5A73' } as const
const list = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 0 } as const
const row = (first: boolean) => ({ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '10px 0', ...(first ? {} : { borderTop: '1px solid #EFEEF4' }) }) as const

/** A private gap: the topic, and its stage and grade in a line under it. */
function GapRows({ gaps }: { gaps: OwnGap[] }) {
  return (
    <ul style={list}>
      {gaps.map((g, i) => (
        <li key={`${g.topicName}|${i}`} style={row(i === 0)}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, fontSize: 15, lineHeight: 1.35 }}>
            <span style={{ fontWeight: 600 }}>{g.topicName}</span>
            <span style={{ fontSize: 13, color: '#5D5A73' }}>{[stageWords(g.stage), g.grade === null ? null : `Grade ${g.grade}`].filter(Boolean).join(' · ')}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * What a learner practised on their own (their private workspace, "My own"), for the teacher of the class the learner is in. Read only: the
 * grades, in each the topics practised with the learner's own counts, the open and the fixed private gaps and the last finished sessions. There
 * is no form and no button, and nothing here is in the school record, the Long view or a class report. A learner with no private workspace, or
 * a teacher who does not teach the class, gets a page that is not found.
 */
export default async function OwnPracticePage({ params }: { params: Promise<{ classId: string; childId: string }> }) {
  const { classId, childId } = await params
  const own = await getOwnWorkspaceForTeacher(classId, childId)
  if (!own) notFound()
  const name = own.firstName
  return (
    <Page>
      <BackHeader href={`/t/${classId}/learners/${childId}`} kicker="Read only" title={`${name}'s own practice`} />
      <div style={{ fontFamily: font, display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 20px 24px' }}>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.2, fontWeight: 700 }}>{name}&apos;s own practice</h1>
        <p style={{ ...quiet, fontSize: 16 }}>What {name} practised on their own. You can look; nothing here changes their school record.</p>

        {own.grades.length === 0 ? <p style={quiet}>{name} has not added a grade yet.</p> : null}
        {own.grades.map((g) => (
          <section key={g.classId} aria-labelledby={`class-${g.classId}`} style={{ ...card(20), gap: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              {/* The CAPS class of a grade is "Grade 6"; a curriculum of the learner's own is "Grade 6 \u00b7 {their name for it}". */}
              <h2 id={`class-${g.classId}`} style={sectionTitle}>{g.caps ? `Grade ${g.grade}` : `Grade ${g.grade} \u00b7 ${g.name}`}</h2>
              <span style={{ fontSize: 14, color: '#5D5A73' }}>{scoreText(g.score)}</span>
            </div>
            {g.practised.length === 0 ? (
              <p style={quiet}>Nothing practised yet.</p>
            ) : (
              <ul style={list}>
                {g.practised.map((t, i) => (
                  <li key={t.topicId} style={row(i === 0)}>
                    <span style={{ minWidth: 0, fontSize: 15, lineHeight: 1.35, fontWeight: 600 }}>{t.name}</span>
                    <span style={{ flex: 'none', fontSize: 14, color: '#5D5A73' }}>{scoreText(t.score)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section aria-labelledby="gaps-open" style={{ ...card(20), gap: 10, padding: 16 }}>
          <h2 id="gaps-open" style={sectionTitle}>Open gaps</h2>
          {own.gaps.open.length === 0 ? <p style={quiet}>No open gaps.</p> : <GapRows gaps={own.gaps.open} />}
        </section>

        <section aria-labelledby="gaps-fixed" style={{ ...card(20), gap: 10, padding: 16 }}>
          <h2 id="gaps-fixed" style={sectionTitle}>Fixed gaps</h2>
          {own.gaps.fixed.length === 0 ? <p style={quiet}>No fixed gaps yet.</p> : <GapRows gaps={own.gaps.fixed} />}
        </section>

        <section aria-labelledby="sessions" style={{ ...card(20), gap: 10, padding: 16 }}>
          <h2 id="sessions" style={sectionTitle}>Last sessions</h2>
          {own.sessions.length === 0 ? (
            <p style={quiet}>No finished sessions yet.</p>
          ) : (
            <ul style={list}>
              {own.sessions.map((s, i) => (
                <li key={`${s.date}|${i}`} style={row(i === 0)}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, fontSize: 15, lineHeight: 1.35 }}>
                    <span style={{ fontWeight: 600 }}>{s.topic}</span>
                    <span style={{ fontSize: 13, color: '#5D5A73' }}>{shortDay(s.date)}</span>
                  </span>
                  <span style={{ flex: 'none', fontSize: 14, color: '#5D5A73' }}>{scoreText({ right: s.right, asked: s.asked })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  )
}
