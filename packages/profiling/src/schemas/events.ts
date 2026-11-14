import { z } from 'zod'

export const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('curriculum.uploaded'), mapId: z.string() }),
  z.object({ type: z.literal('key.snapped'), testId: z.string() }),
  z.object({ type: z.literal('paper.snapped'), paperId: z.string() }),
  z.object({ type: z.literal('paper.checked'), paperId: z.string() }),
  z.object({ type: z.literal('session.finished'), sessionId: z.string() }),
  z.object({ type: z.literal('observation.added'), childId: z.string() }),
  z.object({ type: z.literal('activity.added'), childId: z.string() }),
  z.object({ type: z.literal('homework.snapped'), paperId: z.string() }),
  z.object({ type: z.literal('long_view.requested'), childId: z.string() }),
  /** The teacher shared a test with parents: Jemma now plans each learner's next session, lesson and guidance for it. */
  z.object({ type: z.literal('test.shared'), testId: z.string() }),
  /** A teacher brought in a file of past records (or pasted a table): Jemma works out what its columns mean. */
  z.object({ type: z.literal('records.uploaded'), importId: z.string() }),
  /**
   * The learner asked to practise now: Jemma plans a short practice for today and writes its lesson. With `topicId` or `topicName` the learner
   * chose what to practise (checked again when it is planned); without them code picks the topic.
   */
  z.object({ type: z.literal('practice.requested'), childId: z.string(), topicId: z.string().optional(), topicName: z.string().optional() }),
])
export type JemmaEvent = z.infer<typeof EventSchema>
export type EventType = JemmaEvent['type']

/** The `events.payload` for a type: the event without its `type` (the row has its own `type` column). */
export type EventPayload<T extends EventType> = Omit<Extract<JemmaEvent, { type: T }>, 'type'>
