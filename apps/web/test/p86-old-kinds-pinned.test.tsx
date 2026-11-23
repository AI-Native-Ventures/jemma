import { createHash } from 'node:crypto'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { QuestionScreen } from '../app/k/session/_parts/QuestionScreen'
import { Results } from '../app/k/session/_parts/Results'
import type { MissedQuestion, QuestionForChild } from '../app/k/session/[sessionId]/logic'

// P86: the demo class (Grade 6) must not change by one character. These are the screens of the OLD answer kinds, as they were on develop b11ae36
// before any change of P86: the sha256 of the HTML of each. The new kinds change `answerShape` and the answer area only for a question of a new
// kind; every old question draws exactly what it drew. react-dom only: no browser.

const ask = (over: Partial<QuestionForChild>): QuestionForChild => ({
  position: 3,
  phase: 'try',
  index: 1,
  of: 5,
  prompt: 'Work it out',
  render: 'text',
  answerKind: 'whole',
  ...over,
})
const sha = (html: string) => createHash('sha256').update(html).digest('hex')
/**
 * P160 changed one sentence of a warm-up question and nothing else: learners never read the word gap, so "A quick one from a gap you already
 * fixed." says "topic". With that sentence put back the HTML is byte for byte what it was: the pins did not move.
 */
const withoutP160 = (markup: string) => markup.replace('A quick one from a topic you already fixed.', 'A quick one from a gap you already fixed.')
const screen = (q: QuestionForChild) => withoutP160(renderToStaticMarkup(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />))

const CASES: Record<string, QuestionForChild> = {
  fraction: ask({ prompt: 'What is 3/4 + 1/8?', answerKind: 'fraction' }),
  mixed: ask({ prompt: 'Write 7/2 as a mixed number', answerKind: 'mixed' }),
  money: ask({ prompt: 'A pen costs R4,50. What do 3 pens cost?', answerKind: 'money' }),
  decimal: ask({ prompt: 'Write 1/2 as a decimal', answerKind: 'decimal' }),
  whole: ask({ prompt: 'What is 12 + 9?', answerKind: 'whole' }),
  choice: ask({ prompt: 'Which is bigger?', answerKind: 'choice', choices: ['1/4', '1/2', 'the same', 'none'] }),
  choiceWarm: ask({ prompt: 'Which is bigger?', phase: 'warmup', of: 2, answerKind: 'choice', choices: ['1/4', '1/2', 'the same', 'none'] }),
  missing: ask({ prompt: 'Complete: 3/5 = ?/15', answerKind: 'fraction' }),
  missingWarm: ask({ prompt: 'Complete: 2/3 = 6/?', phase: 'warmup', of: 2, answerKind: 'fraction' }),
  fractionSum: ask({ prompt: '1/2 + 1/4', render: 'fraction_sum', terms: ['1/2', '1/4'], answerKind: 'fraction' }),
  fractionWarm: ask({ prompt: 'Add 1/3 and 1/3', phase: 'warmup', of: 2, answerKind: 'fraction' }),
  plain: ask({ prompt: 'Type your answer', answerKind: 'choice' }),
}

const missed = (over: Partial<MissedQuestion>): MissedQuestion => ({
  n: 2,
  prompt: 'Complete: 3/5 = ?/15',
  render: 'text',
  wrote: '5/15',
  right: '9/15',
  why: 'you changed only the top.',
  rightWay: '3/5 is the same as 9/15.',
  ...over,
})

const RESULTS: Record<string, MissedQuestion[]> = {
  none: [],
  one: [missed({})],
  sum: [missed({ prompt: '1/2 + 1/4', render: 'fraction_sum', terms: ['1/2', '1/4'], wrote: '2/6', right: '3/4' })],
  mixed: [missed({ n: 3, prompt: 'Write 7/2 as a mixed number', wrote: '3 1/4', right: '3 1/2' }), missed({ n: 4, prompt: 'What is 0,5 + 0,25?', wrote: '0,3', right: '0,75' })],
  unread: [missed({ unread: true, wrote: '' })],
}

/**
 * sha256 of the HTML of each screen on develop b11ae36. The question screens were re-pinned once by P90 (14 Nov 2026), which gave the Next button
 * and the answer tiles of a choice question room at their sides (`min-h-` instead of `h-`, `px-5 py-3 text-center text-balance`): the HTML of
 * each screen with those classes put back is byte for byte the old one, and the Results screens were not touched.
 * All of them were re-pinned by P110 (16 Nov 2026, South African colours). With the colour table of the change applied to the old HTML
 * (coral to gold, coral-text to red-text, ink #1F1D36 to #161616 and so on) and the progress dots and the three gems over the results
 * put aside (they became beads: BeadRow and GemRow in components/sa), the new HTML of every screen differs from the old one only where a
 * colour now has a different role: Next and Got it are green (bg-ink to bg-green), the answer boxes have a green edge (border-coral to
 * border-green) and the right answer box is green (border-green bg-green-tint).
 */
const PINNED: Record<string, string> = {
  'question:choice': 'e8c0f093aafee471e5171cc5d32c8f58a39087de56ccbda80e8062909f0b198d',
  'question:choiceWarm': '15f998bed318f253c617777c545623d23f4d372013200da85ea7d60d7e0d826d',
  'question:decimal': '24ee09248e0e753ac61570c7f670cdd43e081ece098d9388ae4149c2d63d8e2f',
  'question:fraction': 'd344a89314553f9f738c7f0e6f499c6422c53d7d3bee03bb6af8a24df2f6712d',
  'question:fractionSum': '72438c42d5a3895d15a63e68d5dc790384490931eecac0319b5809dd60e01332',
  'question:fractionWarm': '941d182d0451da56ea4b7605ca7353cbd3b5eb94d1563b93b27ef602c7303ec7',
  'question:missing': '911723bdc8909eb7b548356c2e1b3a6bf35ac58761b8116569c821179e299862',
  'question:missingWarm': '9c7f9449bca1b94c92e7e0a487a40b8e9e82c897a0186d72fa3660d13507bae4',
  'question:mixed': 'e92277525a9d00f65e2d0206333ef72bd6aee46b79e3ae75e45dd40922b16430',
  'question:money': 'f664a30b61c520f8d095709f3da407dbbbe535bf97b31b99c00c1d9dffc20ef8',
  'question:plain': '2a7778e359b5dfcd79678bd45aaeace5e9071781603ebf5f499cca1fa08b41b2',
  'question:whole': 'b0635d52cc4d5cc0059b33768dc00c11c9208d5756e7ec5f3806ca1669647fdf',
  'results:mixed': '3c9b7c1d6fe18b87e4742c5cf717b8ecb4632237cb4c51daa7e562e04469490c',
  'results:none': '343820df98b62af4b9b0a56ca396ca969e948c6a9ee2812f18f85092fc4620b6',
  'results:one': 'cfd71b1b43c486a2ab18cf0510f6e0d9e81aedead98ece409e3d85e29ca4625d',
  'results:sum': 'a9356c7ca1ba70ffc0849e8dd00dfb82a72767ef38daea49fe4c7f6d7cdc9ed9',
  'results:unread': 'a04f7e1fb74d0b0293cccca2bb5268f55c6af5bea0ee1e89b7714a5c85cdeb92',
}

/**
 * P126 added two things to the results screen and nothing else: the "Not yet." marker on each missed card (with `data-verdict="missed"` on the card)
 * and the new lead line ("Let's look at ... together." in place of the old "Most of your answers were right. Let's look at ... together."; the lists
 * below hold one or two misses, which is what that old line said). With those taken out the HTML is byte for byte what it was on b11ae36: the
 * pins did not move, so an old kind of answer is still drawn exactly as before.
 */
const withoutP126 = (markup: string) =>
  markup
    .replace(/ data-verdict="missed"/g, '')
    .replace(/<p data-verdict-line="true" class="m-0"><span[^>]*>Not yet\.<\/span><\/p>/g, '')
    .replace(/Let&#x27;s look at (this 1|these \d+) together\./, 'Most of your answers were right. Let&#x27;s look at $1 together.')

describe('the screens of the old answer kinds are what they were', () => {
  it.each(Object.keys(CASES))('question screen: %s', (name) => {
    expect(sha(screen(CASES[name]!))).toBe(PINNED[`question:${name}`])
  })

  it.each(Object.keys(RESULTS))('results screen: %s', (name) => {
    expect(sha(withoutP126(renderToStaticMarkup(<Results firstName="Amina" missed={RESULTS[name]!} />)))).toBe(PINNED[`results:${name}`])
  })
})
