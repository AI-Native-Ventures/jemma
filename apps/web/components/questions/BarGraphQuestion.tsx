import { DiagramView } from '../diagrams'
import { AnswerBox } from './AnswerBox'

export type BarGraphQuestionProps = {
  prompt: string
  /** A `bar_chart` diagram spec. */
  spec: unknown
  /** Bar labels drawn in coral: the bars the question asks about. */
  highlight?: string[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** Board `q-amina-bar-graph`: the question card with a bar graph and a "more" answer box. */
export function BarGraphQuestion({ prompt, spec, highlight, value, onChange, disabled }: BarGraphQuestionProps) {
  return (
    <section
      aria-label="Question"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '24px 14px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 28 }}
    >
      <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.3, fontWeight: 700, textAlign: 'center', textWrap: 'pretty' }}>{prompt}</h1>
      <DiagramView spec={spec} variant="question" highlight={highlight ?? []} />
      <AnswerBox
        id="more"
        label="How many more learners walk"
        value={value}
        onChange={onChange}
        unit="more"
        unitStyle={{ fontSize: 20, fontWeight: 600 }}
        disabled={disabled}
      />
    </section>
  )
}
