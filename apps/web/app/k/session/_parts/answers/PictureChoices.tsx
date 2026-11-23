'use client'

import { CHOICE_LETTERS, choiceDiagram, choiceText } from '@jemma/profiling/logic'
import type { Choice } from '@jemma/profiling/schemas'
import { DiagramView } from '@/components/diagrams'
import { FractionText } from '../Frac'

/**
 * A choice question whose options are pictures (P149): "Which graph is y = x² - 4?" with three, four or five small graphs.
 *
 * Phone: two cards across, the letters A to E on them, the picked card outlined. Laptop: all of them in one row (four across, five for five). The key is the
 * letter, so the pictures are only what the learner looks at. An option may carry words under its picture. On the paper sheet the same cards are drawn
 * with no tap (`onPick` missing): the learner writes the letter.
 */

/**
 * The room the cards have on a phone, in px, from the page and the question card around them (the numbers are the classes of `QuestionScreen`): the page has
 * 20 px at each side, the question card of a Try question 18 px and a 1 px border; the grid takes 8 px of that back at each side (it is 1rem wider than its box, `inCard`) and has an 8 px gap.
 * A warm-up question has no card. Two cards across.
 */
export const PICTURE_GRID = { page: 20, card: 18, border: 1, bleed: 8, gap: 8 } as const

/** The width of one card of the phone's two-across grid, for a screen `viewport` px wide. At 390 px a Try card is 160 px wide and a warm-up card 171 px. */
export function pictureCardWidth(viewport: number, inCard: boolean): number {
  const { page, card, border, bleed, gap } = PICTURE_GRID
  const room = viewport - 2 * page - (inCard ? 2 * (card + border) - 2 * bleed : 0)
  return (room - gap) / 2
}

const cardClass = 'relative flex min-h-[150px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[18px] bg-card px-2 pt-8 pb-2.5 text-center'
const gridClass = 'grid max-w-[920px] grid-cols-2 gap-2 md:gap-3'

/** The number of cards across on a laptop: four, or five when there are five. */
const wide = (count: number) => (count >= 5 ? 'md:grid-cols-5' : 'md:grid-cols-4')

function Face({ choice, index, on }: { choice: Choice; index: number; on: boolean }) {
  const letter = CHOICE_LETTERS[index] ?? String(index + 1)
  const diagram = choiceDiagram(choice)
  const text = choiceText(choice)
  return (
    <>
      <span className="sr-only">Choice {letter}.</span>
      <span aria-hidden="true" className={`absolute top-2 left-2 flex size-7 items-center justify-center rounded-pill text-[15px] font-bold ${on ? 'bg-green text-white' : 'bg-soft-2 text-ink'}`}>
        {letter}
      </span>
      {diagram ? (
        <div data-picture-choice="true" className="w-full [&_svg]:mx-auto [&_svg]:max-h-[180px]">
          <DiagramView spec={diagram} variant="question" />
        </div>
      ) : null}
      {text ? (
        <span className="text-[16px] leading-[1.25] font-semibold text-ink">
          <FractionText text={text} size={20} rule={2} gap={3} side={4} className="" />
        </span>
      ) : null}
    </>
  )
}

export type PictureChoicesProps = {
  choices: Choice[]
  /** The letter picked, or null. */
  picked?: string | null
  /** Called with the letter of the card tapped. Missing: the cards are only drawn (the paper sheet). */
  onPick?: (letter: string) => void
  /** The grid is inside the card of a Try question: on a phone it takes 8 px back at each side (a warm-up question and the paper sheet have no card). */
  inCard?: boolean
}

export function PictureChoices({ choices, picked = null, onPick, inCard = false }: PictureChoicesProps) {
  const grid = `${gridClass} ${wide(choices.length)} ${inCard ? 'w-[calc(100%+1rem)] md:w-full' : 'w-full'}`
  if (!onPick) {
    return (
      <ol aria-label="Choices" className={`m-0 list-none p-0 ${grid}`}>
        {choices.map((choice, i) => (
          <li key={i} className={`${cardClass} border-2 border-edge`}>
            <Face choice={choice} index={i} on={false} />
          </li>
        ))}
      </ol>
    )
  }
  return (
    <div className="flex w-full flex-col items-center gap-3.5">
      <div role="group" aria-label="Choices" className={grid}>
        {choices.map((choice, i) => {
          const letter = CHOICE_LETTERS[i] ?? String(i + 1)
          const on = picked === letter
          return (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(letter)}
              className={`${cardClass} cursor-pointer ${on ? 'border-[3px] border-ink bg-soft-2' : 'border-2 border-edge'}`}
            >
              <Face choice={choice} index={i} on={on} />
            </button>
          )
        })}
      </div>
      <p className="m-0 text-center text-[16px] leading-[1.4] text-body">Tap the picture that matches.</p>
    </div>
  )
}
