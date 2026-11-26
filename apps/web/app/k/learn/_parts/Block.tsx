'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { DiagramView } from '@/components/diagrams'
import type { BlockForChild, LessonAnswerResult } from '@/lib/teaching'
import type { TypesetMode } from '../../session/_parts/typeset'
import { blockView, firstSentence, type BlockView, type Delivery } from './delivery'
import { LessonText } from './LessonText'
import { TryBlock } from './TryBlock'
import { useNotation } from '@/lib/notation'

/**
 * What a block needs to speak: whether this browser can, whether this block is being read now, and the tap that starts or stops it. `words` comes from
 * the "Words" switch of the player: with it on, the words of an explanation show from the moment the voice starts to read it (and stay).
 */
export type Voice = { ok: boolean; playing: boolean; onToggle: () => void; words?: boolean }

export type LessonBlockProps = {
  /** The place of the block in the lesson. The server finds the question of a try block by it. */
  index: number
  block: BlockForChild
  delivery: Delivery
  typeset: TypesetMode
  voice: Voice
  topicLessonId: string
  topic: string
  /** The try block whose answer box is open (one at a time), and what opens another. */
  activeTry: number | null
  onOpenTry: (index: number) => void
  /** The saved tour only: marks the answer of the try block at `index` in the browser. Absent in the app, where the server marks. */
  markTry?: (index: number, value: string) => LessonAnswerResult | Promise<LessonAnswerResult>
}

/** What each kind of part is called on its card, and on the small bar of the player. */
export const BLOCK_LABEL: Record<BlockForChild['kind'], string> = {
  explain: 'Idea',
  diagram: 'Look',
  worked: 'Worked example',
  try: 'Your turn',
  mistake: 'A common mistake',
}

const smallButton = 'flex min-h-11 flex-none cursor-pointer items-center gap-2 rounded-14 border-[1.5px] border-ink bg-card px-4 text-[15px] font-semibold text-ink'
const textButton = 'flex min-h-11 cursor-pointer items-center self-start border-0 bg-transparent px-1 text-[15px] font-semibold text-ink underline underline-offset-[3px]'
const stepButton =
  'flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-14 border-0 bg-green px-4 py-2 text-center text-[17px] font-semibold text-balance text-white'

function PlayButton({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={playing} aria-label={playing ? 'Stop reading this part' : 'Read this part aloud'} onClick={onToggle} className={smallButton}>
      {playing ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#161616" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#161616" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
      )}
      {playing ? 'Stop' : 'Listen'}
    </button>
  )
}

/** The picture of a block. Pictures draws it as wide as the screen allows, the others at the size the practice screens use. */
function Picture({ spec, large }: { spec: unknown; large: boolean }) {
  const notation = useNotation()
  return (
    <div data-picture="true" data-size={large ? 'large' : 'normal'} className={`flex w-full justify-center ${large ? '[&_svg]:!max-w-full [&_svg]:max-h-[440px]' : '[&_svg]:max-h-[300px]'}`}>
      <DiagramView spec={spec} variant="learn" notation={notation} />
    </div>
  )
}

function Frame({ index, kind, view, voice, children }: { index: number; kind: BlockForChild['kind']; view: BlockView; voice: Voice; children: ReactNode }) {
  return (
    <section
      id={`block-${index}`}
      data-block={kind}
      data-reading={voice.playing ? 'true' : undefined}
      aria-label={BLOCK_LABEL[kind]}
      className={`flex scroll-mt-48 flex-col gap-3.5 rounded-[22px] border bg-card p-4 lg:p-5 ${voice.playing ? 'border-gold shadow-[0_0_0_1.5px_#FFB81C]' : 'border-line'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 flex min-w-0 flex-wrap items-center gap-2 text-[15px] font-semibold text-body">
          {BLOCK_LABEL[kind]}
          {voice.playing ? <span className="rounded-pill bg-gold-tint px-2.5 py-0.5 text-[13px] font-bold text-ink">Reading now</span> : null}
        </p>
        {view.speak && voice.ok ? <PlayButton playing={voice.playing} onToggle={voice.onToggle} /> : null}
      </div>
      {children}
    </section>
  )
}

/** An explanation: all the words (Read), the first sentence with "More" (Pictures), or the voice with the words under "Show words" (Listen). */
function ExplainBlock({ text, view, voiceOk, reading, typeset }: { text: string; view: BlockView; voiceOk: boolean; reading: boolean; typeset: TypesetMode }) {
  // `reading`: the player's "Words" is on and the voice has come to this part.
  const [open, setOpen] = useState(false)
  // A browser that cannot speak has no voice to leave the words to: they are all shown.
  const words = view.showText === 'collapsed' && !voiceOk ? 'full' : view.showText
  if (words === 'full') return <LessonText text={text} typeset={typeset} />
  if (words === 'first-sentence') {
    const { first, rest } = firstSentence(text)
    return (
      <>
        <LessonText text={open || !rest ? text : first} typeset={typeset} />
        {rest ? (
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={textButton}>
            {open ? 'Less' : 'More'}
          </button>
        ) : null}
      </>
    )
  }
  // Read along: once the voice has come to this part, its words are on the screen (the "Words" switch of the player turns that off).
  return (
    <>
      {open || reading ? <LessonText text={text} typeset={typeset} /> : null}
      {reading && !open ? null : (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={textButton}>
          {open ? 'Hide words' : 'Show words'}
        </button>
      )}
    </>
  )
}

/** A worked example: the problem, then its steps (all of them in Read, one tap at a time in Pictures and Listen), then the answer. */
function WorkedBlock({ block, view, voice, typeset }: { block: Extract<BlockForChild, { kind: 'worked' }>; view: BlockView; voice: Voice; typeset: TypesetMode }) {
  const total = block.steps.length
  const [shown, setShown] = useState(view.revealSteps ? 0 : total)
  // A different delivery starts the example again: Read shows every step, the others one at a time.
  useEffect(() => setShown(view.revealSteps ? 0 : total), [view.revealSteps, total])
  // While the voice reads the example, every step is on the screen.
  useEffect(() => {
    if (voice.playing) setShown(total)
  }, [voice.playing, total])
  const picture = block.diagram ? <Picture spec={block.diagram} large={view.diagramLarge} /> : null
  return (
    <>
      {view.diagramFirst ? picture : null}
      <LessonText text={block.problem} typeset={typeset} className="font-semibold" />
      {view.diagramFirst ? null : picture}
      <ol aria-label="Steps" aria-live="polite" className="m-0 flex list-none flex-col gap-3 p-0">
        {block.steps.slice(0, shown).map((s, i) => (
          <li key={i} className="flex flex-col gap-1 border-l-[3px] border-gold pl-3">
            <LessonText text={s.line} typeset="all" size={24} className="font-semibold" />
            <LessonText text={s.reason} typeset={typeset} size={19} className="text-[16px] text-body" />
          </li>
        ))}
      </ol>
      {shown < total ? (
        <button type="button" onClick={() => setShown(shown + 1)} className={stepButton}>
          {shown === 0 ? 'Show the first step' : `Show step ${shown + 1} of ${total}`}
        </button>
      ) : (
        <div data-answer="true" className="flex flex-col gap-1 rounded-14 bg-soft-2 p-3">
          <p className="m-0 text-[15px] font-semibold text-body">Answer</p>
          <LessonText text={block.answer} typeset="all" size={24} className="font-semibold" />
        </div>
      )}
    </>
  )
}

/** The usual mistake next to the right way, and why. */
function MistakeBlock({ block, view, typeset }: { block: Extract<BlockForChild, { kind: 'mistake' }>; view: BlockView; typeset: TypesetMode }) {
  const picture = block.diagram ? <Picture spec={block.diagram} large={view.diagramLarge} /> : null
  return (
    <>
      {view.diagramFirst ? picture : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-18 border border-red bg-card p-3.5">
          <p className="m-0 text-[15px] font-semibold text-red-text">Not this way</p>
          <LessonText text={block.wrong} typeset="all" size={22} className="font-semibold" />
        </div>
        <div className="flex flex-col gap-1 rounded-18 border border-green bg-green-tint p-3.5">
          <p className="m-0 text-[15px] font-semibold text-body">This way</p>
          <LessonText text={block.right} typeset="all" size={22} className="font-semibold" />
        </div>
      </div>
      {view.diagramFirst ? null : picture}
      <LessonText text={block.why} typeset={typeset} />
    </>
  )
}

/** One block of a lesson, shown the way the delivery says (`blockView`). The same block, in the same place, in every delivery. */
export function LessonBlock({ index, block, delivery, typeset, voice, topicLessonId, topic, activeTry, onOpenTry, markTry }: LessonBlockProps) {
  const view = blockView(block, delivery)
  return (
    <Frame index={index} kind={block.kind} view={view} voice={voice}>
      {block.kind === 'explain' ? <ExplainBlock text={block.text} view={view} voiceOk={voice.ok} reading={voice.words === true} typeset={typeset} /> : null}
      {block.kind === 'diagram' ? (
        <figure className="m-0 flex flex-col gap-3">
          <Picture spec={block.spec} large={view.diagramLarge} />
          <figcaption className="text-[16px] text-body">
            <LessonText text={block.caption} typeset={typeset} size={20} />
          </figcaption>
        </figure>
      ) : null}
      {block.kind === 'worked' ? <WorkedBlock block={block} view={view} voice={voice} typeset={typeset} /> : null}
      {block.kind === 'try' ? (
        <TryBlock
          index={index}
          question={block.question}
          hint={block.hint}
          topicLessonId={topicLessonId}
          topic={topic}
          typeset={typeset}
          pictureFirst={view.diagramFirst}
          open={activeTry === index}
          onOpen={() => onOpenTry(index)}
          {...(markTry ? { mark: (value: string) => markTry(index, value) } : {})}
        />
      ) : null}
      {block.kind === 'mistake' ? <MistakeBlock block={block} view={view} typeset={typeset} /> : null}
    </Frame>
  )
}
