import { DiagramView } from '../diagrams'
import { AnswerBox } from './AnswerBox'

export type GridAreaQuestionProps = {
  prompt: string
  /** A `grid_area` diagram spec. Model output is data: an invalid one draws "Picture missing". */
  spec: unknown
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** Board `q-amina-area`: the question card with squared paper and an area box in cm². */
export function GridAreaQuestion({ prompt, spec, value, onChange, disabled }: GridAreaQuestionProps) {
  return (
    <section
      aria-label="Question"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, padding: '26px 18px', background: '#FFFFFF', border: '1px solid #E7E6EF', borderRadius: 28 }}
    >
      <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.3, fontWeight: 700, textAlign: 'center', textWrap: 'pretty' }}>{prompt}</h1>
      <DiagramView spec={spec} variant="question" />
      <AnswerBox
        id="area"
        label="Area in square centimetres"
        value={value}
        onChange={onChange}
        unit="cm²"
        unitStyle={{ fontSize: 30, fontWeight: 700 }}
        disabled={disabled}
      />
    </section>
  )
}
