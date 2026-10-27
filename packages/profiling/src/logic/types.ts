export type Format = 'reading' | 'diagram' | 'audio'
export type Stage = 'new' | 'practising' | 'fixed'

export type DiagnosedResult = {
  childId: string
  n: number
  prompt: string
  answerRead: string
  correct: boolean
  topicName: string
  gapTopicName: string | null
  misconception: string | null
}
