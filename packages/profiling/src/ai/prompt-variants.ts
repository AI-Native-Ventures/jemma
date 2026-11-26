import { GEOMETRY_REASONS } from '../logic/answers/geometry-reasons'
import { isBaselineClass, isSeniorMaths, subjectProfile, type ClassContext } from './subject-profile'
import { seniorLists } from './senior-lists-prompt'

/**
 * A job's system prompt for the class it works for.
 *
 * The prompt files (`jobs/<job>.md`) were written for a South African Grade 6 Mathematics class, and a recorded demo answer is
 * found by a hash of the whole model call. So the baseline class (Mathematics, Grade 6, South Africa) gets the file's text
 * unchanged, byte for byte. Any other class gets exact find and replace rules: each `find` is a phrase of its file, and a rule
 * fires only when the phrase is not true of the class (a grade sentence when the grade differs, a South Africa sentence when
 * the country is not South Africa, a maths example or a number format when the subject is not Mathematics). A class that is
 * not the baseline also gains one line at the top: `Subject: <name>. Grade: <n>. Country: <country name>.`
 *
 * A senior class (Mathematics, Grades 7 to 12: `isSeniorMaths`) also gets the rules of its own: the lesson writer is told the four answer kinds that code marks
 * by meaning (number, expression, equation, point) and the form of an expression, when a question carries a picture (a graph on a grid, a triangle) and how
 * to give one, the child is a "learner", every question states its maths as an expression or an equation and not in words and has worked steps, every question is worded plainly (what is given, then what to find) and every card, step and audio script says what its idea means (P131), and the reader of a practice answered on paper is told to keep algebra as written. Such a rule is placed before the other rules on the same phrase, so that it wins. The baseline class never meets one (it is Grade 6).
 *
 * The long view is not here: its prompt belongs to another packet. A rule never reads a file at run time; the tests check that
 * every `find` still occurs in its file, and the sha256 of each file, so an edit of a file cannot go unnoticed.
 */

export const PROMPT_JOBS = ['draft_map', 'read_key', 'read_paper', 'diagnose', 'class_report', 'write_lesson', 'guidance'] as const
export type PromptJob = (typeof PROMPT_JOBS)[number]

/** Where a prompt is used when the job alone does not say: `practice` is `read_paper` reading a practice a learner answered on paper (not a class test or a homework photo). */
export type PromptPlace = 'practice'

export type PromptRule = {
  /** An exact phrase of the .md file. */
  find: string
  when: (c: ClassContext, place?: PromptPlace) => boolean
  replace: (c: ClassContext) => string
}

const isMaths = (c: ClassContext) => c.subjectKey === 'mathematics'
const notMaths = (c: ClassContext) => !isMaths(c)
const notSouthAfrica = (c: ClassContext) => c.country !== 'ZA'
/** P161: the US is a country of its own (added next to South Africa, which is unchanged): a decimal point, dollars, and the units US schools use. */
const isUSMaths = (c: ClassContext) => c.country === 'US' && isMaths(c)
const US_UNITS = 'Use the units US schools use (inches, feet, yards, miles, ounces, pounds, cups, quarts, gallons, °F), and metric units when the topic is about them.'
/** A number format (the decimal comma, rand) is South African, and a subject other than Mathematics has no use for it. */
const numberFormat = (c: ClassContext) => notSouthAfrica(c) || notMaths(c)
/** The sentences about primary school and Grades 1 to 7 are true of these grades. */
const outsidePrimary = (c: ClassContext) => c.grade < 1 || c.grade > 7

/**
 * What a senior class's lesson writer is told about quantities (P148): the kinds `time` and `ratio`, the optional `unit` and `round` of a question, and money to
 * the cent, one example each. Finance questions (interest, tax, a loan, a deposit) are money answers rounded to 2 places. Decimals use a comma and money is in
 * rand in South Africa only.
 */
const seniorQuantities = (c: ClassContext) => {
  const za = !notSouthAfrica(c)
  const pi = za ? '`3,14`' : '`3.14`'
  const finance = za
    ? ' A price, and every finance answer (interest, VAT, a loan, a deposit), is a `money` answer with `round` set to `2`, written with no spaces: `answer` `R15386,42`.'
    : ' A price, and every finance answer (interest, tax, a loan, a deposit), is a `number` with `round` set to `2`: `answer` `15386.42`.'
  return (
    ' Two more kinds: `time` (`14:30`, `2:30 pm`, or a length of time such as `2 h 15 min`) and `ratio` (`3 : 4`, or `2 : 3 : 5` with three parts). ' +
    'When the answer has a unit (`cm²`, `ml`, `km/h`, `°C`, `kg`), set `unit` to it and write only the number in `answer`: `answer` `24` with `unit` `cm²`. ' +
    `When a question says "correct to 2 decimal places", set \`round\` to that number of places (here \`2\`) and write \`answer\` rounded the same way: ${pi} with \`round\` \`2\`.` +
    finance
  )
}

/**
 * The forms an `equation` answer takes, each as the writer is shown it (P147). Every one is read by the save gate and marked right when typed back; a test checks
 * both, and that each is in the prompt. A learner may type an inequality as an interval and the other way round, and an equation in any equivalent form.
 */
export const SENIOR_EQUATION_EXAMPLES = [
  'x = 4',
  'x = 2 or x = 3',
  'x = 1 \u00b1 \u221a3',
  'x = (5 \u00b1 \u221a17)/4',
  'x < -1 or x > 4',
  '-2 \u2264 x < 3',
  'y \u2265 -4',
  'x \u2260 2',
  '(-\u221e; 3]',
  '[2; \u221e)',
  '(1; 4)',
  '(-\u221e; -1) \u222a (4; \u221e)',
  'x \u2208 \u211d',
  'x = 2 and y = 3',
  'y = 2x + 3',
  '(x - 1)^2 + (y + 2)^2 = 9',
  'x^2 + y^2 = 25',
] as const

/** When to use each form of an `equation` answer: the sentence that follows the kind lines for a senior class. */
const SENIOR_EQUATION_FORMS =
  'An `equation` answer is one of these, so use the one the question asks for: ' +
  `one value (\`${SENIOR_EQUATION_EXAMPLES[0]}\`); ` +
  `several values joined with \`or\` (\`${SENIOR_EQUATION_EXAMPLES[1]}\`), and \`${SENIOR_EQUATION_EXAMPLES[2]}\` or \`${SENIOR_EQUATION_EXAMPLES[3]}\` for the two values of a root; ` +
  `an inequality when the question asks which values work (\`${SENIOR_EQUATION_EXAMPLES[4]}\`, \`${SENIOR_EQUATION_EXAMPLES[5]}\`, \`${SENIOR_EQUATION_EXAMPLES[6]}\`, \`${SENIOR_EQUATION_EXAMPLES[7]}\`); ` +
  `an interval, the same answer as its inequality, when the question asks for interval notation (\`${SENIOR_EQUATION_EXAMPLES[8]}\`, \`${SENIOR_EQUATION_EXAMPLES[9]}\`, \`${SENIOR_EQUATION_EXAMPLES[10]}\`, \`${SENIOR_EQUATION_EXAMPLES[11]}\`; write \`\u221e\` for infinity and \`\u222a\` for a union), ` +
  `and \`${SENIOR_EQUATION_EXAMPLES[12]}\` for a domain or a range over all numbers; ` +
  `a pair, one letter and its value each, when the question has two unknowns (\`${SENIOR_EQUATION_EXAMPLES[13]}\`); ` +
  `the equation of a line or a circle when the question asks for the equation itself (\`${SENIOR_EQUATION_EXAMPLES[14]}\`, \`${SENIOR_EQUATION_EXAMPLES[15]}\`, \`${SENIOR_EQUATION_EXAMPLES[16]}\`). ` +
  'Use `point` for coordinates and `number` for one value. '

/**
 * What a senior class's lesson writer is told about answers: the six old kinds and the four that code marks by meaning, one example each, and the `form`
 * of an expression. Decimals use a comma and money is in rand in South Africa only; elsewhere a decimal is written the way the class writes it.
 */
const seniorAnswers = (c: ClassContext) => {
  const za = !notSouthAfrica(c)
  const old = [
    '`fraction` (`3/4`)',
    '`mixed` (`1 1/2`)',
    za ? '`decimal` (`0,75`)' : c.country === 'US' ? '`decimal` (`0.75`, and a dollar amount as its number: `5.25`)' : '`decimal` (a decimal written the way the class writes it)',
    '`whole` (`12`)',
    ...(za ? ['`money` (`R5`)'] : []),
    '`choice` (a letter A to E)',
  ].join(', ')
  return (
    '`answer` must be one value that a computer can mark, and `answerKind` must match it. ' +
    `The kinds: ${old}. For algebra and signed numbers there are four more: ` +
    '`number` (`-3`, `15%` or `30°`: a number that may be negative, with a % or a ° at the end), ' +
    '`expression` (`2x^2 + 7x`: write powers with `^` and roots with `sqrt()`), ' +
    '`equation` (`x = 3 or x = -1`: one letter and its value or values, or one of the forms below) and ' +
    '`point` (`(2; -3)`). ' +
    SENIOR_EQUATION_FORMS +
    'When a question asks for the answer factorised or expanded, set `form` to `factorised` or `expanded`.' +
    seniorQuantities(c) +
    (za ? ' Money is in rand, decimals use a comma.' : '')
  )
}

/**
 * What a senior class's lesson writer is told about pictures. The sentence of the file stays; the rule adds when a question carries a picture, which of
 * the new pictures to use for what (P165: a box plot, a probability tree and a time line too), how to give a graph (by its constants: code draws it) and a
 * triangle, the limits the save gate holds to, and that a label never holds the answer.
 */
const SENIOR_PICTURES =
  'Use only the diagram kinds in the schema. ' +
  'A question may carry a `diagram` when the picture is needed to answer it: reading a graph, a gradient, an intercept, a turning point, an angle or a side of a triangle. ' +
  'Say in the `prompt` where to look ("this line", "the triangle"). ' +
  'Use `coordinate_plane` for functions, graphs and analytical geometry, and `triangle` for trigonometry and geometry. ' +
  'Give a graph by its constants (a `line` by `m` and `c`, a `parabola` by `a`, `p`, `q`): code draws it, so never list the points of a curve. ' +
  'A `trig` graph takes x in degrees. A grid has `xMin` below `xMax` and `yMin` below `yMax`, at most 200 wide (720 across for a `trig` graph), at most 3 graphs and 12 points. ' +
  'A `triangle` has exactly three `vertices` names; give `angles` (they add up to 180) only to draw its shape, and write the angle or side that is asked for as `x` in `angleLabels` or `sides`. ' +
  'Use `box_plot` for a five-number summary on a scale (put the five numbers on whole ticks so they can be read), `tree` for probability (a probability ' +
  'is a decimal or a fraction; write `?` for each one the learner fills in, and make the question a `list` with one `labels` entry for each blank, in the ' +
  'order of the tree, then the asked value), and `timeline` for financial maths (the periods, the same payment `every` period, and `marks` such as `F = ?`). ' +
  'Never put the answer in a label. A lesson card or a diagram step may use these pictures too. ' +
  // P171: the learner places points on a grid by tapping it.
  'To have the learner place points on a grid by tapping it (where a shape lands after a reflection or a translation, or points from a table), give `plot` instead of a `diagram`: ' +
  '`xMin`, `xMax`, `yMin`, `yMax` (whole numbers, at most 20 squares across and up), `given` (the points already on the grid, each an `x`, a `y` and a `label` like `A`; ' +
  '`shape: true` joins them as a shape) and `place` (the names of the 1 to 4 points to place, in order, like `["A\'", "B\'", "C\'"]`). ' +
  'The `answerKind` is `list` and the `answer` is the x and the y of each point to place, in order, with a semicolon between them (`4; 1; 1; 1; 1; 4`). Every point is on a corner of the grid. ' +
  // P176: a sketch of a parabola through its key points.
  'To have the learner sketch a parabola, write its equation in the question (`Sketch y = x² − 4. Tap where it cuts the x-axis, and its turning point.`) and give a `plot` with `curve: "parabola"` and `place` naming its 3 key points ' +
  '(`["x-intercept", "x-intercept", "turning point"]`), each on a corner of the grid, with the turning point inside the grid: Jemma joins the points the learner taps into the curve. The `answer` is the x and the y of the 3 key points (`-2; 0; 2; 0; 0; -4`). ' +
  // P181: a hyperbola and a cubic graph are sketched the same way.
  'A hyperbola is sketched the same way with `curve: "hyperbola"` and 3 points of it, with both asymptotes inside the grid (`Sketch y = 2/x + 1.`, `place` `["x-intercept", "point", "point"]`, `answer` `-2; 0; 1; 3; 2; 2`). ' +
  'A cubic graph has `curve: "cubic"` and 4 key points, with its turning points inside the grid (`Sketch y = (x + 1)(x − 1)(x − 3).`, `place` `["x-intercept", "x-intercept", "x-intercept", "y-intercept"]`, `answer` `-1; 0; 1; 0; 3; 0; 0; 3`). ' +
  // P182: a sin or cos graph on a grid in degrees.
  'A sin or cos graph has `curve: "trig"` and `xStep`, the degrees of one square (15, 30, 45 or 90), with `xMin` and `xMax` in degrees and a whole number for each y; say the equation and the interval in the question ' +
  '(`Sketch y = 2 sin x + 1 for 0° ≤ x ≤ 360°. Tap its 5 key points.`). Its 3 to 5 key points are evenly spaced from `xMin` to `xMax`, every high and low point among them (`place` `["0°", "90°", "180°", "270°", "360°"]`), ' +
  'and the `answer` is the x and the y of each, in order across (`0; 1; 90; 3; 180; 1; 270; -1; 360; 1`). ' +
  // P174: the learner draws a straight line on a grid by tapping two points on it.
  'To have the learner draw a straight line (the graph of y = 2x \u2212 1, a line of symmetry), give `line` with `xMin`, `xMax`, `yMin`, `yMax` (whole numbers, at most 20 squares across and up) and no `diagram`. ' +
  'The `answerKind` is `list` and the `answer` is two different points on the line that are corners of the grid, x and y each (`0; -1; 2; 3`): the learner may tap any two points on the line. ' +
  // P179: the learner proves an identity line by line.
  'To have the learner prove an identity line by line (Grades 10 to 12), say it in the `prompt` (`Prove that sin²x/(1 − cos x) = 1 + cos x.`) and give `proof` with `left` and `right`, its two sides as plain maths ' +
  '(`sin^2 x/(1 - cos x)` and `1 + cos x`), and no `diagram`. The `answerKind` is `list` and the `answer` is your proof: 3 to 6 lines from the left side to the right side, each one maths only (no LHS, no equals sign), ' +
  'with a semicolon between them (`sin^2 x/(1 - cos x); (1 - cos^2 x)/(1 - cos x); ((1 - cos x)(1 + cos x))/(1 - cos x); 1 + cos x`). Each line must equal the one before it. ' +
  // P180: the learner types every solution of a trig equation.
  'To have the learner give the general solution of a trig equation (Grades 11 and 12), say the equation in the `prompt` (`Find the general solution of sin θ = 0,5.`) and give `general` with `letter` (`θ`), and no `diagram`. ' +
  'The `answerKind` is `list` and the `answer` is the angle and the period of each family of solutions, in degrees, with a semicolon between them (`30; 360; 150; 360` for θ = 30° + k · 360° or θ = 150° + k · 360°). Give every family.'

/**
 * What a senior class's lesson writer is told about the maths of a question (P127): state it as an expression or an equation in plain notation, never in
 * words. The bullet of the file stays, and this one follows it in "What to write". Spoken audio is the one place where the maths is said in words.
 */
const SENIOR_QUESTIONS_BULLET = '- `questions`: exactly 15, five each at difficulty 1, 2 and 3, easiest first.'
const SENIOR_NOTATION =
  'Write the maths of every question as an expression or an equation in plain maths notation, never in words. ' +
  'The `prompt` of a question has a short command word first (Solve, Expand, Factorise, Simplify, Find, Calculate), then the maths: ' +
  '`Solve: x/2 + 6 = 10`, `Expand: (x + 2)(x + 3)`, `Simplify: √48`, `Find sin θ when θ = 30°`. ' +
  'Never describe the maths in words: `x over 2 plus 6 equals 10` is wrong. ' +
  'Write a fraction as `a/b`, with brackets when the top or the bottom has more than one term (`(x + 1)/2`), a power with `^` (`x^2`), a root as `√( )` (`√(x + 4)`), and use the symbols − × ÷ π θ °. ' +
  'A word problem (money, data, a real situation) may keep one or two short sentences of context, then the maths on its own line. ' +
  'The same holds for the warm-up questions and their `choices` (an expression or a number, not a sentence), for `why` and `rightWay` (show each step as maths, such as `x/2 = 4` and then `x = 8`), and for a card or a diagram step. ' +
  'The `answer` itself stays as the answer kinds say. Only the `audio` script is spoken, so there the maths is said in words.'

/**
 * The last bullet a senior class's lesson writer gets after the questions bullet, about answering by tapping (P149): picture options ("Which graph is y = x^2 - 4?"), `truefalse`, and a `reason` from the fixed list of
 * Euclidean geometry reasons (`GEOMETRY_REASONS`: the prompt, the question screen and the marking all read the one list), each with when to use it. A `choice` is under 25% of the
 * questions and a `reason` is Euclidean geometry only.
 */
const SENIOR_PICKS =
  'Three ways for a learner to answer by tapping. Use them now and then: most questions stay typed. ' +
  'A `choice` question has 2 to 5 options, lettered A to E, and its `answer` is the letter. Keep `choice` questions to fewer than 1 in 4 of the 15 questions (at most 3); the warm-up questions are `choice` anyway. ' +
  'Give the options as pictures when the learner has to tell graphs or shapes apart ("Which graph is y = x^2 − 4?", "Which graph shows the reflection?", which transformation moved a shape): ' +
  'each entry of `choices` is then `{ "diagram": { ... } }`, or `{ "text": "a short caption", "diagram": { ... } }`, a `coordinate_plane` or a `triangle` of the same size for every option, 3 or 4 options, one of them right. ' +
  'Make the wrong options the usual mistakes (a sign slip, a graph moved the wrong way), and never put the answer in a label. A text option is a plain string, as before. ' +
  'A `truefalse` question is a statement that is true or false ("The graph of y = 2x + 1 crosses the y-axis at 1."): `answerKind` is `truefalse`, `answer` is `true` or `false`, and it has no `choices`. ' +
  'Use it for a common misconception, and make about half of them false. ' +
  `A \`reason\` question is for Euclidean geometry only (parallel lines, triangles, circles): the learner picks the reason for a step from this fixed list, in these words and no others: ${GEOMETRY_REASONS.map((r) => `\`${r}\``).join(', ')}. ` +
  '`answerKind` is `reason` and `answer` is one reason of the list, word for word. ' +
  'When the question also asks for the value of the step, `answer` is the value, a semicolon, then the reason: `40; angles in the same segment` (the value is a whole number or a decimal, an angle or a length). ' +
  'Name parallel lines AB and CD, because the three reasons about parallel lines use those names. Use a `reason` question only in Euclidean geometry, and never as a warm-up question.'

/**
 * The second bullet a senior class's lesson writer gets after the questions bullet (P127): `steps`, the worked calculation of every question, shown to the
 * learner under "How to get there". The schema makes them required; this says what a good one is.
 */
const SENIOR_STEPS =
  'Every question, and every warm-up question, also has `steps`: 2 to 6 short lines, each one line of maths, that take the learner from the question to the answer, ' +
  'for example `["x/2 + 6 = 10", "x/2 = 4", "x = 8"]` for `Solve: x/2 + 6 = 10`. ' +
  'Write them in the same notation, one move on each line, with no sentences and no names, so that the learner can follow the working on paper. ' +
  'The last line is the result that the `answer` comes from. Work the steps out before you write the `answer`, and check that they agree.'

/**
 * The third bullet a senior class's lesson writer gets after the questions bullet (P131): a question is worded the way a teacher would say it. What is given
 * comes first and what to find second, there is one idea in a question, and the context (one or two short sentences) comes before the maths line, which is last.
 */
const SENIOR_PLAIN =
  'Write every question the way a teacher would say it: first what is given, then what to find, in that order, and one idea in each question. ' +
  'Write `f(x) = 3x + 1. Find x when f(x) = 10.` or `Solve 3x + 1 = 10.`, never `Solve f(x) = 10 when f(x) = 3x + 1`. ' +
  'When a question gives a function or an expression first, the command word comes after it. ' +
  'Use the command words Find, Solve, Expand, Factorise, Simplify and Calculate, and no double negatives. ' +
  'A question may have one or two short sentences of context before the maths (a word problem, a graph, money), and the maths line comes last, written in maths notation.'

/**
 * The fourth bullet a senior class's lesson writer gets after the questions bullet (P131): meaning. Every card, diagram step and the audio script says in one
 * plain sentence what its idea means or where it shows up, and the lesson is built warm-up, then the idea, then the questions. A taxi fare is in rand in
 * South Africa only; elsewhere the amounts have no currency sign.
 */
const seniorMeaning = (c: ClassContext) => {
  const fare = notSouthAfrica(c) ? '3 to start, 2 for every km' : 'R3 to start, R2 for every km'
  return (
    'Every card, every diagram step and the audio script says in one plain sentence what the idea means or where it shows up: ' +
    `a straight line \`y = 2x + 3\` is a taxi fare (${fare}), ` +
    'the roots of `y = x^2 − 4` are where the graph crosses the x-axis, and the point where two lines meet is where both plans cost the same. ' +
    'Start the body of a card and the caption of a step with that sentence. ' +
    'Never give a formula, a graph or a method without a word on what it is for. ' +
    'Build the lesson in this order: the warm-up recalls what the learner needs, the cards or steps build the idea one small piece at a time, then the questions use it.'
  )
}

export const PROMPT_RULES: Record<PromptJob, PromptRule[]> = {
  draft_map: [
    {
      find: ', such as "Adding fractions" for "Adding fractions with different denominators"',
      when: notMaths,
      replace: () => '',
    },
    {
      find: '(a lowercase group such as fractions, decimals, shape, measurement, data)',
      when: notMaths,
      replace: (c) => {
        const families = subjectProfile(c.subject).families
        return families ? `(a lowercase group such as ${families.join(', ')})` : '(a lowercase group: a short lowercase word of your own)'
      },
    },
    { find: 'Use a decimal comma in numbers (0,75).', when: isUSMaths, replace: () => 'Use a decimal point in numbers (0.75).' },
    { find: 'Use a decimal comma in numbers (0,75).', when: numberFormat, replace: () => 'Write numbers the way the documents write them.' },
  ],
  read_key: [
    { find: 'a smudge, a fraction bar or a missing line', when: notMaths, replace: () => 'a smudge or a missing line' },
    { find: '5. Use a decimal comma in numbers (0,75) and rand for money (R5).', when: isUSMaths, replace: () => '5. Use a decimal point in numbers (0.75) and dollars for money ($5).' },
    { find: '5. Use a decimal comma in numbers (0,75) and rand for money (R5).', when: numberFormat, replace: () => '5. Write numbers and money the way the memo writes them.' },
  ],
  read_paper: [
    // A practice of a senior class: the sentence of the file (or its currency sign variant) stays and one sentence about algebra follows it.
    {
      find: 'Keep fractions as `3/4` or `3 3/4`, decimals with the comma or point they used, and money with its `R`.',
      when: (c, place) => place === 'practice' && isSeniorMaths(c),
      replace: (c) =>
        `${
          notSouthAfrica(c)
            ? 'Keep fractions as `3/4` or `3 3/4`, decimals with the comma or point they used, and money with its currency sign.'
            : 'Keep fractions as `3/4` or `3 3/4`, decimals with the comma or point they used, and money with its `R`.'
        } Keep algebra as written: letters, powers as \`^\` or \`²\`, minus signs, brackets and \`√\`.`,
    },
    {
      find: 'Keep fractions as `3/4` or `3 3/4`, decimals with the comma or point they used, and money with its `R`.',
      when: notMaths,
      replace: () => 'Keep numbers, units and symbols exactly as written.',
    },
    {
      find: 'Keep fractions as `3/4` or `3 3/4`, decimals with the comma or point they used, and money with its `R`.',
      when: (c) => isMaths(c) && notSouthAfrica(c),
      replace: () => 'Keep fractions as `3/4` or `3 3/4`, decimals with the comma or point they used, and money with its currency sign.',
    },
    // Where the answer is on the page: a layout instruction, but it says "fractions", and a science paper has none.
    { find: 'as fractions of the page, 0 to 1', when: notMaths, replace: () => 'as parts of the page, 0 to 1' },
  ],
  diagnose: [
    { find: 'in a primary school class', when: outsidePrimary, replace: (c) => `in a Grade ${c.grade} class` },
    { find: ' (for example "Equivalent fractions")', when: notMaths, replace: () => '' },
    { find: '- Use plain words, decimal comma for decimals, rand for money.', when: isUSMaths, replace: () => '- Use plain words, a decimal point for decimals, dollars for money.' },
    { find: '- Use plain words, decimal comma for decimals, rand for money.', when: numberFormat, replace: () => '- Use plain words.' },
  ],
  class_report: [
    { find: 'for a primary school teacher', when: outsidePrimary, replace: (c) => `for a teacher of a Grade ${c.grade} class` },
    { find: '- Plain words, decimal comma for decimals, rand for money. No judgement of any child.', when: isUSMaths, replace: () => '- Plain words, a decimal point for decimals, dollars for money. No judgement of any child.' },
    { find: '- Plain words, decimal comma for decimals, rand for money. No judgement of any child.', when: numberFormat, replace: () => '- Plain words. No judgement of any child.' },
  ],
  write_lesson: [
    { find: 'for a school in South Africa', when: isUSMaths, replace: () => `for a school in the United States, with dollars for money. ${US_UNITS.replace(/\.$/, '')}` },
    {
      find: 'for a school in South Africa',
      when: notSouthAfrica,
      replace: (c) => (c.countryName === 'unknown' ? 'for a school' : `for a school in ${c.countryName}`),
    },
    { find: '`render` (`text`, or `fraction_sum` with `terms`)', when: notMaths, replace: () => '`render` (`text`)' },
    // A senior class: the rule comes before the two others on this sentence, so it wins (it is the one that is true of the class).
    {
      find: '`answer` must be one value that a computer can mark: `3/4`, `1 1/2`, `0,75`, `12`, `R5` or a choice letter. `answerKind` must match it (`fraction`, `mixed`, `decimal`, `whole`, `money`, `choice`). Money is in rand, decimals use a comma.',
      when: isSeniorMaths,
      replace: (c) => seniorAnswers(c),
    },
    {
      find: '`answer` must be one value that a computer can mark: `3/4`, `1 1/2`, `0,75`, `12`, `R5` or a choice letter. `answerKind` must match it (`fraction`, `mixed`, `decimal`, `whole`, `money`, `choice`). Money is in rand, decimals use a comma.',
      when: notMaths,
      replace: (c) => `\`answer\` must be one value that a computer can mark: ${subjectProfile(c.subject).answers}. \`answerKind\` must match it (\`whole\`, \`decimal\`, \`choice\`).`,
    },
    {
      find: '`answer` must be one value that a computer can mark: `3/4`, `1 1/2`, `0,75`, `12`, `R5` or a choice letter. `answerKind` must match it (`fraction`, `mixed`, `decimal`, `whole`, `money`, `choice`). Money is in rand, decimals use a comma.',
      when: (c) => isUSMaths(c) && !isSeniorMaths(c),
      replace: () =>
        '`answer` must be one value that a computer can mark: `3/4`, `1 1/2`, `0.75`, `12` or a choice letter. `answerKind` must match it (`fraction`, `mixed`, `decimal`, `whole`, `choice`). Decimals use a point. Money is in dollars: the question shows the dollar sign (`$5.25`) and `answer` is the number (`5.25`, `answerKind` `decimal`).',
    },
    {
      find: '`answer` must be one value that a computer can mark: `3/4`, `1 1/2`, `0,75`, `12`, `R5` or a choice letter. `answerKind` must match it (`fraction`, `mixed`, `decimal`, `whole`, `money`, `choice`). Money is in rand, decimals use a comma.',
      when: (c) => isMaths(c) && notSouthAfrica(c),
      replace: () =>
        '`answer` must be one value that a computer can mark: `3/4`, `1 1/2`, `12` or a choice letter, or a decimal written the way the class writes it. `answerKind` must match it (`fraction`, `mixed`, `decimal`, `whole`, `choice`).',
    },
    // A senior class: a learner, not a child (this rule is before the one below, so it wins).
    { find: 'for a Grade 6 child', when: isSeniorMaths, replace: (c) => `for a Grade ${c.grade} learner` },
    { find: 'for a Grade 6 child', when: (c) => c.grade !== 6, replace: (c) => `for a Grade ${c.grade} child` },
    { find: 'other than the maths.', when: notMaths, replace: () => 'other than the lesson.' },
    { find: 'with the working said out loud', when: notMaths, replace: () => 'with the ideas said out loud' },
    // A senior class: the maths of a question is written as an expression or an equation (P127), a question is worded plainly, what is given then what to find, and every card
    // and step says what its idea means (P131), and every question has worked steps (P127): four bullets after the questions bullet of the file.
    {
      find: SENIOR_QUESTIONS_BULLET,
      when: isSeniorMaths,
      replace: (c) => `${SENIOR_QUESTIONS_BULLET}\n- ${SENIOR_NOTATION}\n- ${SENIOR_PLAIN}\n- ${seniorMeaning(c)}\n- ${SENIOR_STEPS}\n- ${SENIOR_PICKS}`,
    },
    // A senior class: graphs on a grid and triangles, in a card, a step or a question.
    { find: 'Use only the diagram kinds in the schema.', when: isSeniorMaths, replace: () => SENIOR_PICTURES },
    // A senior class: a list, an order and a table (P150), as a bullet of "What to write" after the one that tells the answer kinds.
    {
      find: '- `why` says in one sentence what usually goes wrong.',
      when: isSeniorMaths,
      replace: (c) => `- ${seniorLists(!notSouthAfrica(c))}\n- \`why\` says in one sentence what usually goes wrong.`,
    },
  ],
  guidance: [
    { find: 'The child is in Grade 1 to 7: plain, warm, short words.', when: outsidePrimary, replace: (c) => `The child is in Grade ${c.grade}: plain, warm, short words.` },
    {
      find: 'for example "Amina is doing well. One thing to work on this week: adding fractions."',
      when: notMaths,
      replace: (c) => `for example "Amina is doing well. One thing to work on this week: the next topic in ${c.subject}."`,
    },
  ],
}

/** The line a non-baseline class adds on top of a prompt. */
export const classLine = (c: ClassContext) => `Subject: ${c.subject}. Grade: ${c.grade}. Country: ${c.countryName}.`

/**
 * The system prompt of `job` for a class. `baseText` is the .md text (or the plain fallback some jobs use). The baseline class,
 * and a class that could not be told (`null`), get `baseText` itself; any other class gets the rules that fire, below its line.
 */
export function renderPrompt(job: PromptJob, baseText: string, ctx: ClassContext | null, place?: PromptPlace): string {
  if (!ctx || isBaselineClass(ctx)) return baseText
  let text = baseText
  for (const rule of PROMPT_RULES[job]) {
    if (rule.when(ctx, place)) text = text.split(rule.find).join(rule.replace(ctx))
  }
  return `${classLine(ctx)}\n\n${text}`
}
