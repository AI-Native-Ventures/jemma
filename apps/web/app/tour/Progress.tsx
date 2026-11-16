'use client'

import { useEffect, useState } from 'react'
import { levelOfScore, progressLabel, rowScore, summaryLine, summaryOf, type Level } from '../k/maths/format'
import { ProgressDots, TopicDot } from '../k/maths/ProgressDots'
import { hasLesson, type TourPart, type TourTopic } from './data/topics'
import { savedTourResult } from './outcome'

// The learner's own score in the lists, after the lesson. The tour keeps the result of the lesson in the browser tab (outcome.ts); these read it, and
// show nothing but "not tried" until it is there. The server draws the first paint with no result, the browser then reads the tab, as the teacher's
// "You" row does.

/** The five results of the lesson finished in this tab, or null before it has been finished. */
function useSavedResult(): boolean[] | null {
  const [saved, setSaved] = useState<boolean[] | null>(null)
  useEffect(() => {
    setSaved(savedTourResult(sessionStorage))
  }, [])
  return saved
}

type Score = { right: number; asked: number }
const NONE: Score = { right: 0, asked: 0 }
const scoreOf = (saved: boolean[] | null): Score => (saved ? { right: saved.filter(Boolean).length, asked: saved.length } : NONE)

/** What a topic of a part has for the learner: the lesson's score on the topic that has the lesson, nothing on the others. */
const topicScore = (part: string, topic: string, saved: boolean[] | null): Score => (hasLesson(part, topic) ? scoreOf(saved) : NONE)

/** The circles of a part on the first page, one for each topic, and the one line under them. */
export function PartProgress({ part }: { part: TourPart }) {
  const saved = useSavedResult()
  const levels: Level[] = part.topics.map((t) => levelOfScore(topicScore(part.slug, t.slug, saved)))
  const summary = summaryOf(levels)
  return (
    <>
      <ProgressDots levels={levels} label={progressLabel(part.label, summary)} />
      <span className="text-[14px] text-body">{summaryLine(summary)}</span>
    </>
  )
}

/** The line under the heading of a part's page: the learner's score on the part ("No score yet", or "1 of 5 right"). */
export function PartScore({ part }: { part: TourPart }) {
  const saved = useSavedResult()
  const total = part.topics.map((t) => topicScore(part.slug, t.slug, saved)).reduce((n, s) => ({ right: n.right + s.right, asked: n.asked + s.asked }), NONE)
  return <p className="m-0 text-[17px] text-body">{rowScore(total)}</p>
}

/** The inside of a topic's row on a part's page: its circle, its name and its score. */
export function TopicBody({ part, topic }: { part: string; topic: TourTopic }) {
  const saved = useSavedResult()
  const score = topicScore(part, topic.slug, saved)
  return (
    <>
      <TopicDot level={levelOfScore(score)} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[17px] leading-[1.3] font-semibold">{topic.name}</span>
        <span className="text-[14px] text-body">{rowScore(score)}</span>
      </span>
    </>
  )
}
