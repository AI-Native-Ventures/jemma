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

/** sha256 of the HTML of each screen on develop b11ae36. */
const PINNED: Record<string, string> = {
  'question:choice': 'e7ac72647ef09f63cdeb9f37b62bc0e25b23e6860b42ff7b539976a936253d24',
  'question:choiceWarm': '06a83c1bb377f87dceca243fc42a55cf41caea2fc84f965283a7f3784be205ca',
  'question:decimal': '741366bfbe2009259271fd4ae938fd402bf76832de04827f3c22b98c72495df6',
  'question:fraction': '62630c4a65ac1f30a8bfa5772a4a12fb580c9740f710378a70f1da18cec0cc02',
  'question:fractionSum': '53c3d8883b0f36c0db1b90a92d8fa2564d5f8b74ab470f166f593759836accd7',
  'question:fractionWarm': '3ee9a26b6b9d7bbbad665778162745c5ba20fa371527a86340ab322984ec5367',
  'question:missing': '95fadff80f9ca61517717f010ba8434ec0132ad906805d507660e923cddfe106',
  'question:missingWarm': '886bf0dc70c1b365195fc2fad0656a7a9e659b052f0a2172d6b713472df1e639',
  'question:mixed': '980a2dc1d1af56a587a165e8792d0ba4aa9c79b3bd96c3ae3605e8deab7cb409',
  'question:money': 'c6e60aafb3d724900b8125878d97e5116ddbdebdee0b750bedda62896b798284',
  'question:plain': '046ce82db4dee81079b0f34cb5b4a9ae083f4fb67ce5a52f8db92f21418b48c7',
  'question:whole': '6351f98d857d93a36ee1fa3463b0212cf003ed0a3343974b04a62c7e70a9ff78',
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
