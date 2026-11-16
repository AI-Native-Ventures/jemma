import { FractionText } from './Frac'
import { promptLayout } from './prompt-layout'
import type { TypesetMode } from './typeset'

// P130: the question as the learner reads it. A short prompt is one big heading, exactly as it always was. A long one is its context in normal text
// (17 to 18 px, left aligned, regular weight) and then the maths line, large and typeset, stepping down in size as it gets longer. The classes are written
// out in full so the stylesheet has every one of them. Nothing here has a fixed height, so a long question makes the card taller and the page scrolls.

export type Tone = 'try' | 'warm'

/** The size of the large line by step (0 short, 1 medium, 2 long): the text class, and the size the maths in it is typeset at. */
const LARGE: Record<Tone, { text: readonly [string, string, string]; math: readonly [number, number, number] }> = {
  try: { text: ['text-[30px]', 'text-[26px]', 'text-[22px]'], math: [34, 30, 26] },
  warm: { text: ['text-[28px]', 'text-[24px]', 'text-[21px]'], math: [34, 29, 25] },
}
/** The same on a results card, which has less room. */
const CARD: { text: readonly [string, string, string]; math: readonly [number, number, number] } = { text: ['text-[24px]', 'text-[22px]', 'text-[20px]'], math: [26, 24, 22] }

/** A long word wraps where it must instead of pushing the screen sideways (a 360 px phone), and a flex child may shrink below its content. */
const WRAP = 'min-w-0 [overflow-wrap:anywhere]'

/** The context, or what follows the maths line: normal body text, left aligned. The maths in it is typeset at the size of the words. */
export function QuestionContext({ text, typeset, card = false }: { text: string; typeset: TypesetMode; card?: boolean }) {
  return (
    <span aria-hidden="true" data-context="true" className={`block ${WRAP} text-left ${card ? 'text-[16px]' : 'text-[18px]'} leading-[1.5] font-normal text-body`}>
      <FractionText text={text} size={card ? 18 : 20} rule={2} gap={3} side={4} className="mx-0.5 align-middle" typeset={typeset} />
    </span>
  )
}

/**
 * The prompt of a question screen (a try question, or a warm-up) as its one heading, `data-prompt` holding the whole prompt. A prompt that is not cut
 * is drawn exactly as it always was, a little smaller when it is long. A cut one holds its context, its maths line and any words after it, all in the
 * heading, so the picture and the answer box come below the whole question; the words are read once, from the plain copy kept for a screen reader.
 */
export function QuestionHeading({ prompt, typeset, tone }: { prompt: string; typeset: TypesetMode; tone: Tone }) {
  const warm = tone === 'warm'
  const l = promptLayout(prompt, typeset)
  const text = LARGE[tone].text[l.step]
  const math = LARGE[tone].math[l.step]
  const props = { size: math, rule: 3, gap: 4, side: 5, className: warm ? 'mx-1.5 align-middle' : undefined, typeset }
  if (!l.split) {
    const base = `m-0 ${warm ? '' : 'text-center '}${text} leading-[1.2] ${warm ? 'font-semibold' : 'font-bold'}`
    return (
      <h1 data-prompt={prompt} className={l.step === 0 ? base : `${base} ${WRAP}`}>
        <FractionText text={prompt} {...props} />
      </h1>
    )
  }
  return (
    <h1 data-prompt={prompt} className={`m-0 flex w-full ${WRAP} flex-col gap-3.5 leading-[1.2]`}>
      <span className="sr-only">{prompt}</span>
      {l.before ? <QuestionContext text={l.before} typeset={typeset} /> : null}
      <span aria-hidden="true" data-maths-line="true" data-step={l.step} className={`block ${WRAP} ${warm ? 'text-left font-semibold' : 'text-center font-bold'} ${text} leading-[1.25]`}>
        <FractionText text={l.line} {...props} />
      </span>
      {l.after ? <QuestionContext text={l.after} typeset={typeset} /> : null}
    </h1>
  )
}

/**
 * The question of a results card, full width under "Question N": its context in normal text and then its maths line, large and typeset, or one block
 * (a little smaller when it is long) when the prompt is not cut. The words are read once, from the plain copy kept for a screen reader.
 */
export function CardQuestion({ prompt }: { prompt: string }) {
  const l = promptLayout(prompt, 'algebra')
  const text = CARD.text[l.step]
  const props = { size: CARD.math[l.step], rule: 2.5, gap: 3, side: 3 }
  return (
    <div data-question="true" className={`flex w-full ${WRAP} flex-col gap-2.5 text-left`}>
      {l.split ? (
        <>
          <span className="sr-only">{prompt}</span>
          {l.before ? <QuestionContext text={l.before} typeset="algebra" card /> : null}
          <span aria-hidden="true" data-maths-line="true" data-step={l.step} className={`block ${WRAP} ${text} leading-[1.25] font-bold`}>
            <FractionText text={l.line} {...props} />
          </span>
          {l.after ? <QuestionContext text={l.after} typeset="algebra" card /> : null}
        </>
      ) : (
        <span className={`block ${WRAP} ${text} leading-[1.25] font-bold`}>
          <FractionText text={prompt} {...props} />
        </span>
      )}
    </div>
  )
}
