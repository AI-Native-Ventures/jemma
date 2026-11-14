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
const screen = (q: QuestionForChild) => renderToStaticMarkup(<QuestionScreen q={q} busy={false} onAnswer={() => {}} />)

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
 */
const PINNED: Record<string, string> = {
  'question:choice': '0b8419be3300d71f3b74f31f0293b40531a73d6baee314e5c17e69ca4404fc2e',
  'question:choiceWarm': 'ab48a81d1b514385f5f5cc710ea45c2ef7c868758d5a24bfbdbd9f68b92af45d',
  'question:decimal': '551bb7bbce0722e11bea70df82b966501ea446f690aece80d4fd9f35cfc8dada',
  'question:fraction': '9177c77e918aab33560bb016985be2070834b96fae089cad564a0cba7e8edb30',
  'question:fractionSum': 'c77fcd1ffb3627a42cfa3f3aeb69d833b5ec4c6eb4518700f1f2b0f1c180fe9d',
  'question:fractionWarm': '7055e95315ffdf80e79b59426756e88dbbd67a519c50e4276ca20fd8d23f9bae',
  'question:missing': 'f017a246079b01df404c357e633ad3e6126ba7cb5fd4c50eb4977fb3ac8227bb',
  'question:missingWarm': '71cacff057106ea94752412ed93eaa8511ab64ac5732268476a29f1081117290',
  'question:mixed': '8394270180af5ed55ca5ca385f371bff376a0b26cf79afe2c4a78f23ceb003b6',
  'question:money': '98b336f86d4ef9a2e8275f5d0a099cfe5660d74097fca8161c02ef81dcb190a5',
  'question:plain': '14e6521822ffc49b7315c80c11e242c62585f8398dc322ece9cddddedb1096cb',
  'question:whole': '35e0ca559a828a16705d0c5a83a1a0cb30c4e549423114a8778bbef668e84edb',
  'results:mixed': 'ba5b2182437cef66e05f5d45d7ac7041b22a331cb01eb682189af19939948c86',
  'results:none': '2735fcbe081ee46a5be28c93e39012b4551e47937171a4e51966ce805246f63f',
  'results:one': '2110d5061169fdce48cbeabfc8dfb7cf9c4b2f61c26c167d082d0b7110b79a42',
  'results:sum': '9ea18211b5d5e163f4c8b42c82f9eb313c8728891844a2efcd4d825246c627a5',
  'results:unread': 'd89488b11dcd290b47b12dded858a71f5c677363cd0b34dd19ae42161b6ce433',
}

describe('the screens of the old answer kinds are what they were', () => {
  it.each(Object.keys(CASES))('question screen: %s', (name) => {
    expect(sha(screen(CASES[name]!))).toBe(PINNED[`question:${name}`])
  })

  it.each(Object.keys(RESULTS))('results screen: %s', (name) => {
    expect(sha(renderToStaticMarkup(<Results firstName="Amina" missed={RESULTS[name]!} />))).toBe(PINNED[`results:${name}`])
  })
})
