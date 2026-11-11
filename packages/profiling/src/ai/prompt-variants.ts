import { isBaselineClass, subjectProfile, type ClassContext } from './subject-profile'

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
 * The long view is not here: its prompt belongs to another packet. A rule never reads a file at run time; the tests check that
 * every `find` still occurs in its file, and the sha256 of each file, so an edit of a file cannot go unnoticed.
 */

export const PROMPT_JOBS = ['draft_map', 'read_key', 'read_paper', 'diagnose', 'class_report', 'write_lesson', 'guidance'] as const
export type PromptJob = (typeof PROMPT_JOBS)[number]

export type PromptRule = {
  /** An exact phrase of the .md file. */
  find: string
  when: (c: ClassContext) => boolean
  replace: (c: ClassContext) => string
}

const isMaths = (c: ClassContext) => c.subjectKey === 'mathematics'
const notMaths = (c: ClassContext) => !isMaths(c)
const notSouthAfrica = (c: ClassContext) => c.country !== 'ZA'
/** A number format (the decimal comma, rand) is South African, and a subject other than Mathematics has no use for it. */
const numberFormat = (c: ClassContext) => notSouthAfrica(c) || notMaths(c)
/** The sentences about primary school and Grades 1 to 7 are true of these grades. */
const outsidePrimary = (c: ClassContext) => c.grade < 1 || c.grade > 7

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
    { find: 'Use a decimal comma in numbers (0,75).', when: numberFormat, replace: () => 'Write numbers the way the documents write them.' },
  ],
  read_key: [
    { find: 'a smudge, a fraction bar or a missing line', when: notMaths, replace: () => 'a smudge or a missing line' },
    { find: '5. Use a decimal comma in numbers (0,75) and rand for money (R5).', when: numberFormat, replace: () => '5. Write numbers and money the way the memo writes them.' },
  ],
  read_paper: [
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
    { find: '- Use plain words, decimal comma for decimals, rand for money.', when: numberFormat, replace: () => '- Use plain words.' },
  ],
  class_report: [
    { find: 'for a primary school teacher', when: outsidePrimary, replace: (c) => `for a teacher of a Grade ${c.grade} class` },
    { find: '- Plain words, decimal comma for decimals, rand for money. No judgement of any child.', when: numberFormat, replace: () => '- Plain words. No judgement of any child.' },
  ],
  write_lesson: [
    {
      find: 'for a school in South Africa',
      when: notSouthAfrica,
      replace: (c) => (c.countryName === 'unknown' ? 'for a school' : `for a school in ${c.countryName}`),
    },
    { find: '`render` (`text`, or `fraction_sum` with `terms`)', when: notMaths, replace: () => '`render` (`text`)' },
    {
      find: '`answer` must be one value that a computer can mark: `3/4`, `1 1/2`, `0,75`, `12`, `R5` or a choice letter. `answerKind` must match it (`fraction`, `mixed`, `decimal`, `whole`, `money`, `choice`). Money is in rand, decimals use a comma.',
      when: notMaths,
      replace: (c) => `\`answer\` must be one value that a computer can mark: ${subjectProfile(c.subject).answers}. \`answerKind\` must match it (\`whole\`, \`decimal\`, \`choice\`).`,
    },
    {
      find: '`answer` must be one value that a computer can mark: `3/4`, `1 1/2`, `0,75`, `12`, `R5` or a choice letter. `answerKind` must match it (`fraction`, `mixed`, `decimal`, `whole`, `money`, `choice`). Money is in rand, decimals use a comma.',
      when: (c) => isMaths(c) && notSouthAfrica(c),
      replace: () =>
        '`answer` must be one value that a computer can mark: `3/4`, `1 1/2`, `12` or a choice letter, or a decimal written the way the class writes it. `answerKind` must match it (`fraction`, `mixed`, `decimal`, `whole`, `choice`).',
    },
    { find: 'for a Grade 6 child', when: (c) => c.grade !== 6, replace: (c) => `for a Grade ${c.grade} child` },
    { find: 'other than the maths.', when: notMaths, replace: () => 'other than the lesson.' },
    { find: 'with the working said out loud', when: notMaths, replace: () => 'with the ideas said out loud' },
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
export function renderPrompt(job: PromptJob, baseText: string, ctx: ClassContext | null): string {
  if (!ctx || isBaselineClass(ctx)) return baseText
  let text = baseText
  for (const rule of PROMPT_RULES[job]) {
    if (rule.when(ctx)) text = text.split(rule.find).join(rule.replace(ctx))
  }
  return `${classLine(ctx)}\n\n${text}`
}
