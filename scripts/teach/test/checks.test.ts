import { describe, expect, test } from 'vitest'
import { TeachingLessonSchema, type TeachingBlock, type TeachingLesson } from '@jemma/profiling/schemas'
import { checkLesson, evalArithmetic, tidyAnswer, tidyLesson } from '../checks'
import { capsSource, explain, fractionBar, goodLesson, mistake, practice, question, siyavulaSource, tryBlock, worked } from './fixtures'

const ctx6 = { grade: 6, source: capsSource() }
const check = (lesson: TeachingLesson, ctx = ctx6) => checkLesson(lesson, ctx)
const withBlocks = (blocks: TeachingBlock[], over: Partial<TeachingLesson> = {}) => goodLesson({ blocks, ...over })
const replaceBlock = (lesson: TeachingLesson, index: number, block: TeachingBlock) => ({ ...lesson, blocks: lesson.blocks.map((b, i) => (i === index ? block : b)) })

const EM = String.fromCharCode(0x2014)

describe('checkLesson: the passing fixture', () => {
  test('the fixture lesson is a valid lesson and passes every check', () => {
    expect(TeachingLessonSchema.safeParse(goodLesson()).success).toBe(true)
    expect(check(goodLesson())).toEqual([])
  })
})

describe('checkLesson: worked examples', () => {
  test('a worked answer 12 whose last step says 13 fails', () => {
    const bad: TeachingBlock = {
      kind: 'worked',
      problem: 'What is 7 + 5?',
      steps: [
        { line: '7 + 5', reason: 'Add the two numbers.' },
        { line: '= 13', reason: 'Seven and five.' },
      ],
      answer: '12',
      answerKind: 'whole',
      speech: 'Seven plus five is twelve.',
    }
    const problems = check(replaceBlock(goodLesson(), 5, bad))
    expect(problems.join('\n')).toMatch(/block 6.*last step/i)
  })

  test.each([
    ['3', 'x = -3'],
    ['12', '= 120'],
    ['12', '12/5'],
    ['1/2', '= 11/2'],
  ])('answer %s is not shown by the last step "%s"', (answer, last) => {
    const w = worked(1, 2, 4)
    if (w.kind !== 'worked') throw new Error('fixture')
    w.steps[2] = { line: last, reason: 'The last line.' }
    w.answer = answer
    w.answerKind = answer.includes('/') ? 'fraction' : 'whole'
    expect(check(replaceBlock(goodLesson(), 3, w)).join('\n')).toMatch(/block 4.*last step/)
  })

  test.each([
    ['12', '= 12 apples'],
    ['3', 'x = 3'],
    ['3/4', '= 3/4 of the pie'],
    ['0,75', '= 3/4'],
  ])('answer %s is shown by the last step "%s"', (answer, last) => {
    const w = worked(1, 2, 4)
    if (w.kind !== 'worked') throw new Error('fixture')
    w.steps[2] = { line: last, reason: 'The last line.' }
    w.answer = answer
    w.answerKind = answer.includes('/') ? 'fraction' : answer.includes(',') ? 'decimal' : 'whole'
    expect(check(replaceBlock(goodLesson(), 3, w)).join('\n')).not.toMatch(/last step/)
  })

  test.each([
    ['13', 'whole', 'Hypotenuse = sqrt(169) = 13.'],
    ['360°', 'number', 'Period = 360 degrees'],
    ['-0,6', 'number', 'cos θ = -0,6.'],
    ['7', 'whole', 'The answer is 7.'],
  ])('a full stop or the word degrees after the answer is fine: answer %s, last step "%s"', (answer, kind, last) => {
    const w = worked(1, 2, 4)
    if (w.kind !== 'worked') throw new Error('fixture')
    w.steps[2] = { line: last, reason: 'The last line.' }
    w.answer = answer
    w.answerKind = kind as typeof w.answerKind
    expect(check(replaceBlock(goodLesson(), 3, w), { grade: 10, source: capsSource() }).join('\n')).not.toMatch(/last step/)
  })

  test('a step that is plain arithmetic and is not true fails', () => {
    const bad = worked(1, 2, 4)
    if (bad.kind !== 'worked') throw new Error('fixture')
    bad.steps[1] = { line: '1/4 + 2/4 = 3/8', reason: 'Add them.' }
    expect(check(replaceBlock(goodLesson(), 3, bad)).join('\n')).toMatch(/block 4.*is not true/)
  })

  test('a rounded step is not called untrue', () => {
    const rounded = worked(1, 2, 4)
    if (rounded.kind !== 'worked') throw new Error('fixture')
    rounded.steps[1] = { line: '10 / 3 = 3,33', reason: 'Divide and round to two decimals.' }
    expect(check(replaceBlock(goodLesson(), 3, rounded))).toEqual([])
  })

  test('a worked answer that cannot be marked as its kind fails', () => {
    const bad = worked(1, 2, 4)
    if (bad.kind !== 'worked') throw new Error('fixture')
    bad.answer = 'three quarters'
    expect(check(replaceBlock(goodLesson(), 3, bad)).join('\n')).toMatch(/block 4.*not a fraction/)
  })

  test('a worked answer given as a sentence is allowed when its kind is choice (shown, never typed)', () => {
    const sentence: TeachingBlock = {
      kind: 'worked',
      problem: 'Describe the domain of y = 1/x.',
      steps: [
        { line: 'x cannot be 0', reason: 'We cannot divide by zero.' },
        { line: 'every other number works', reason: 'Any other x gives a value.' },
      ],
      answer: 'All real numbers except 0',
      answerKind: 'choice',
      speech: 'The domain is all real numbers except zero.',
    }
    expect(check(replaceBlock(goodLesson(), 3, sentence))).toEqual([])
  })

  test('2 worked blocks fail in Grade 6 and pass in Grade 2', () => {
    const two = withBlocks([explain(), fractionBar(), worked(1, 2, 4), worked(2, 2, 5), tryBlock(), mistake(), explain(), explain()])
    expect(check(two).join('\n')).toMatch(/at least 3 worked/)
    expect(check(two, { grade: 2, source: capsSource() })).toEqual([])
  })

  test('a try block before every worked block fails: the learner has not been shown how yet', () => {
    const early = withBlocks([explain(), fractionBar(), tryBlock(), worked(1, 2, 4), worked(2, 2, 5), worked(3, 4, 8), mistake(), explain(), explain()])
    expect(check(early).join('\n')).toMatch(/try block comes before any worked/i)
  })
})

describe('checkLesson: speech and text', () => {
  test('speech with \\frac fails', () => {
    const bad: TeachingBlock = { ...explain(), speech: 'The answer is \\frac{3}{4} of the pie.' }
    expect(check(replaceBlock(goodLesson(), 0, bad)).join('\n')).toMatch(/block 1.*speech/i)
  })

  test.each(['x^2', 'x_{1}', 'cost $5', 'back\\slash'])('speech holding %s fails', (word) => {
    const bad: TeachingBlock = { ...explain(), speech: `Say ${word} out loud.` }
    expect(check(replaceBlock(goodLesson(), 0, bad)).join('\n')).toMatch(/speech/i)
  })

  test('LaTeX in the text fails: the screens show plain notation', () => {
    const bad: TeachingBlock = { ...explain(), text: 'Add \\(\\frac{1}{4} + \\frac{2}{4}\\) first.' }
    expect(check(replaceBlock(goodLesson(), 0, bad)).join('\n')).toMatch(/block 1.*LaTeX/i)
  })

  test('an em dash anywhere fails', () => {
    const bad: TeachingBlock = { ...explain(), text: `Fractions ${EM} equal parts.` }
    expect(check(replaceBlock(goodLesson(), 0, bad)).join('\n')).toMatch(/em dash/i)
  })

  test('plain notation is fine in the text: x^2, sqrt(8), 3/4, 30 degrees', () => {
    const fine: TeachingBlock = { ...explain(), text: 'Use x^2, sqrt(8), 3/4 and sin(30°) like this.' }
    expect(check(replaceBlock(goodLesson(), 0, fine))).toEqual([])
  })
})

describe('checkLesson: questions', () => {
  test('a practice answer "x > 2" with kind number fails', () => {
    const lesson = goodLesson({ practice: [...practice(4), question({ prompt: 'Solve 2x > 4.', steps: ['2x > 4', 'x > 2'], answer: 'x > 2', answerKind: 'number' })] })
    expect(check(lesson, { grade: 9, source: capsSource() }).join('\n')).toMatch(/practice 5.*x > 2/)
  })

  test('a try question whose answer cannot be marked fails', () => {
    const bad: TeachingBlock = { kind: 'try', question: question({ answer: 'three fifths' }), hint: 'Add.', speech: 'Now you try.' }
    expect(check(replaceBlock(goodLesson(), 6, bad)).join('\n')).toMatch(/block 7.*not a fraction/)
  })

  test('a choice question needs its options and a letter that points at one', () => {
    const noChoices = goodLesson({ practice: [...practice(4), question({ prompt: 'Which is bigger?', steps: ['a', 'B'], answer: 'B', answerKind: 'choice' })] })
    expect(check(noChoices).join('\n')).toMatch(/practice 5.*options/)
    const outOfRange = goodLesson({ practice: [...practice(4), question({ prompt: 'Which?', steps: ['a', 'b'], answer: 'D', answerKind: 'choice', choices: ['1/2', '1/3', '1/4'] })] })
    expect(check(outOfRange).join('\n')).toMatch(/practice 5.*letter/)
    const good = goodLesson({ practice: [...practice(4), question({ prompt: 'Which is bigger?', steps: ['1/2 is more than 1/3', 'so the answer is B'], answer: 'B', answerKind: 'choice', choices: ['1/3', '1/2', '1/4'], difficulty: 3 })] })
    expect(check(good)).toEqual([])
  })

  test('questions need 2 to 6 working lines and the last line shows the answer', () => {
    const noSteps = goodLesson({ practice: [...practice(4), question({ steps: undefined })] })
    expect(check(noSteps).join('\n')).toMatch(/practice 5.*working lines/)
    const wrongEnd = goodLesson({ practice: [...practice(4), question({ steps: ['1/5 + 2/5', '(1 + 2)/5', '4/5'] })] })
    expect(check(wrongEnd).join('\n')).toMatch(/practice 5.*last/i)
  })

  test('practice goes from easy to hard', () => {
    const bad = goodLesson({ practice: [question({ difficulty: 3 }), ...practice(4)] })
    expect(check(bad).join('\n')).toMatch(/practice.*easiest first/i)
  })

  test('Grades 1 to 6 keep to the six primary answer kinds', () => {
    const lesson = goodLesson({ practice: [...practice(4), question({ prompt: 'What is 3 + 4?', steps: ['3 + 4', '7'], answer: '7', answerKind: 'number', difficulty: 3 })] })
    expect(check(lesson).join('\n')).toMatch(/practice 5.*Grades 1 to 6/)
    expect(check(lesson, { grade: 8, source: capsSource() })).toEqual([])
  })
})

describe('checkLesson: pictures', () => {
  const diagramAt = (spec: TeachingBlock) => check(replaceBlock(goodLesson(), 1, spec), ctx6).join('\n')
  const picture = (spec: unknown): TeachingBlock => ({ kind: 'diagram', spec: spec as never, caption: 'A picture.', speech: 'A picture.' })

  test('a fraction bar with more shaded than parts fails', () => {
    expect(diagramAt(picture({ kind: 'fraction_bar', rows: [{ parts: 4, shaded: 5 }] }))).toMatch(/block 2.*shaded/)
  })

  test('an area model, a grid and a number line that make no sense fail', () => {
    expect(diagramAt(picture({ kind: 'area_model', rows: 2, cols: 3, shaded: 9 }))).toMatch(/shaded/)
    expect(diagramAt(picture({ kind: 'grid_area', cols: 3, rows: 3, cells: [[3, 0]] }))).toMatch(/cell/)
    expect(diagramAt(picture({ kind: 'number_line', min: 5, max: 1, step: 1, marks: [] }))).toMatch(/number line/)
    expect(diagramAt(picture({ kind: 'number_line', min: 0, max: 10, step: 1, marks: [{ value: 12, label: '12' }] }))).toMatch(/mark/)
  })

  test('a bar chart value above yMax and a place value chart of unequal lists fail', () => {
    expect(diagramAt(picture({ kind: 'bar_chart', bars: [{ label: 'a', value: 12 }], yMax: 10 }))).toMatch(/bar/)
    expect(diagramAt(picture({ kind: 'place_value', columns: ['H', 'T', 'U'], digits: ['1', '2'] }))).toMatch(/place value/)
  })

  test('a triangle whose angles do not add up to 180 fails, in a senior grade', () => {
    const triangle = picture({ kind: 'triangle', vertices: ['A', 'B', 'C'], angles: [30, 60, 80] })
    const problems = check(replaceBlock(goodLesson(), 1, triangle), { grade: 9, source: capsSource() }).join('\n')
    expect(problems).toMatch(/block 2.*180/)
  })

  test('a graph with a number that is not finite fails', () => {
    const plane = picture({ kind: 'coordinate_plane', xMin: -4, xMax: 4, yMin: -2, yMax: 8, graphs: [{ type: 'line', m: 1e999, c: 0 }] })
    expect(check(replaceBlock(goodLesson(), 1, plane), { grade: 10, source: capsSource() }).join('\n')).toMatch(/finite/)
  })

  test('Grades 1 to 6 do not draw graphs or triangles', () => {
    const plane = picture({ kind: 'coordinate_plane', xMin: -4, xMax: 4, yMin: -2, yMax: 8 })
    expect(check(replaceBlock(goodLesson(), 1, plane), { grade: 5, source: capsSource() }).join('\n')).toMatch(/Grades 1 to 6/)
  })

  test('a good picture passes, also inside a worked block', () => {
    const w = worked(1, 2, 4)
    if (w.kind !== 'worked') throw new Error('fixture')
    w.diagram = { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 3 }] }
    expect(check(replaceBlock(goodLesson(), 3, w))).toEqual([])
    w.diagram = { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 9 }] }
    expect(check(replaceBlock(goodLesson(), 3, w)).join('\n')).toMatch(/block 4.*shaded/)
  })
})

describe('checkLesson: credit', () => {
  test('a Siyavula source carries the credit line, the licence and a Siyavula address', () => {
    expect(check(goodLesson(), { grade: 11, source: siyavulaSource() })).toEqual([])
    const noCredit = { ...siyavulaSource(), credit: 'Based on a book' }
    expect(check(goodLesson(), { grade: 11, source: noCredit }).join('\n')).toMatch(/credit/i)
    const noAddress = { ...siyavulaSource(), address: undefined }
    expect(check(goodLesson(), { grade: 11, source: noAddress }).join('\n')).toMatch(/address/i)
  })

  test('a CAPS source carries the CAPS credit line', () => {
    expect(check(goodLesson(), { grade: 3, source: { ...capsSource(), credit: '' } }).join('\n')).toMatch(/credit/i)
  })
})

describe('evalArithmetic', () => {
  test('reads plain arithmetic and nothing else', () => {
    expect(evalArithmetic('1/4 + 2/4')).toBeCloseTo(0.75)
    expect(evalArithmetic('2 × (3 + 4) - 5')).toBe(9)
    expect(evalArithmetic('2^3')).toBe(8)
    expect(evalArithmetic('0,5 + 0,25')).toBeCloseTo(0.75)
    expect(evalArithmetic('-3 + 5')).toBe(2)
    expect(evalArithmetic('x + 1')).toBeNull()
    expect(evalArithmetic('1/0')).toBeNull()
    expect(evalArithmetic('2 1/2')).toBeNull()
    expect(evalArithmetic('')).toBeNull()
  })
})

describe('tidyAnswer and tidyLesson', () => {
  test('cut a unit from a value when the value alone can be marked', () => {
    expect(tidyAnswer('12 cm', 'whole', 9)).toBe('12')
    expect(tidyAnswer('4,90 m', 'decimal', 6)).toBe('4,90')
    expect(tidyAnswer('1 1/2 km', 'mixed', 6)).toBe('1 1/2')
    expect(tidyAnswer('30 degrees', 'number', 10)).toBe('30')
    expect(tidyAnswer('25 cm^2', 'whole', 9)).toBe('25 cm^2')
  })

  test('leave alone what is already fine, what is not a plain value, and what no cutting can mend', () => {
    expect(tidyAnswer('12', 'whole', 9)).toBe('12')
    expect(tidyAnswer('R5', 'money', 6)).toBe('R5')
    expect(tidyAnswer('B', 'choice', 6)).toBe('B')
    expect(tidyAnswer('2x + 3', 'expression', 9)).toBe('2x + 3')
    expect(tidyAnswer('3/8 of an hour, which is 22 1/2 minutes', 'mixed', 6)).toBe('3/8 of an hour, which is 22 1/2 minutes')
    expect(tidyAnswer('twelve cm', 'whole', 6)).toBe('twelve cm')
  })

  test('the answers of worked, try and practice questions are tidied, and nothing else is touched', () => {
    const w = worked(1, 2, 4)
    if (w.kind !== 'worked') throw new Error('fixture')
    const lesson = goodLesson({
      blocks: goodLesson().blocks.map((b, i) => (i === 3 ? { ...w, steps: [w.steps[0]!, { line: '3', reason: 'Add.' }], answer: '3 cm', answerKind: 'whole' as const } : b)),
      practice: [question({ prompt: 'Add 1 + 2 cm.', steps: ['1 + 2', '3'], answer: '3 cm', answerKind: 'whole' }), ...practice(4).slice(1)],
    })
    const tidy = tidyLesson(lesson, 6)
    expect(tidy.blocks[3]).toMatchObject({ answer: '3' })
    expect(tidy.practice[0]).toMatchObject({ answer: '3', prompt: 'Add 1 + 2 cm.' })
    expect(tidy.title).toBe(lesson.title)
    expect(check(tidy)).toEqual([])
  })
})
