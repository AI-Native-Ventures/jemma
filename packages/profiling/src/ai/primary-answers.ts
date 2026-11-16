import type { ClassContext } from './subject-profile'

/**
 * The topics of Grades 1 to 6 Mathematics that are asked for the new answer kinds (P151), and what their lesson writer is told about them.
 *
 * Grades 1 to 6 are asked for six answer kinds (`jobs/write_lesson.md`, `PrimaryLessonSchema`), and a recorded demo answer is found by a hash of the whole
 * model call. So a lesson changes only when its TOPIC needs more: time, measurement, ordering, number patterns, data handling, money and place value. The
 * topic decides, by its name (a name of the CAPS curriculum, with or without "(Term 2)"); every other topic, the fraction topics of the demo above all, is
 * asked exactly as it was. `primaryKit` is the gate; `withPrimaryAnswers` adds the lines to the prompt; `PrimaryExtraLessonSchema` is the schema.
 */

/** True for a Mathematics class of Grade 1 to 6: the classes whose topic may need the new kinds. The baseline class (Grade 6, South Africa) is one of them. */
export const isMathsGrade1To6 = (c: ClassContext | null): c is ClassContext =>
  !!c && c.subjectKey === 'mathematics' && Number.isInteger(c.grade) && c.grade >= 1 && c.grade <= 6

export type PrimaryKit = 'time' | 'measure' | 'order' | 'patterns' | 'data' | 'money' | 'place'

/** A topic name as it is compared: lower case, words only, "(Term 2)" and an "&" put right. */
const norm = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\(\s*term\s*\d\s*\)/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()

/**
 * Which topic names belong to which kit. A pattern is anchored at the start of the name, so a name that only mentions one of these words ("Comparing
 * fractions", "Number sentences", "Problems in context: addition and subtraction") is never gated.
 */
const KIT_TOPICS: { kit: PrimaryKit; names: RegExp }[] = [
  { kit: 'time', names: /^(time|telling the time|time and the calendar|clocks?|calendars?)$/ },
  {
    kit: 'measure',
    names: /^(length|mass|capacity( and)?( volume)?|volume|temperature|perimeter|area|perimeter area( and)? volume|area perimeter( and)? volume|measuring|measurement)$/,
  },
  { kit: 'order', names: /^(describe compare and order numbers|ordering|ordering numbers|compare and order numbers|order numbers)$/ },
  { kit: 'patterns', names: /^(number patterns|numeric patterns)$/ },
  {
    kit: 'data',
    names: /^(data handling|collect and organi[sz]e data|collect and sort objects|represent data|represent sorted collection of objects|analy[sz]e and interpret data|discuss and report on sorted collection of objects)$/,
  },
  { kit: 'money', names: /^money$/ },
  { kit: 'place', names: /^(place value|counting and place value)$/ },
]

/**
 * The kit of a topic for a class, or null: the class is Mathematics, Grade 1 to 6, and the topic is one of the lists above. A senior class has its own
 * kinds, another subject has none, and a class that could not be told keeps the prompt as the file has it.
 */
export function primaryKit(c: ClassContext | null, topicName: string): PrimaryKit | null {
  if (!isMathsGrade1To6(c)) return null
  const name = norm(topicName ?? '')
  return KIT_TOPICS.find((k) => k.names.test(name))?.kit ?? null
}

/** The answer bullet of the prompt file ends before this one; the lines for a topic go between the two. */
const ANCHOR = '- `why` says in one sentence'

/**
 * The lines one kit adds to the lesson writer's prompt, in the way a young learner is asked: Grades 1 to 3 simply (o'clock and half past, whole units,
 * five items at most, tables of 2 x 3), Grades 4 to 6 fully. Each kind is a bullet that starts with its name in backticks, and only the kinds that fit the topic
 * are named. The example questions are the words a child reads.
 */
export function primaryAnswerBlock(kit: PrimaryKit, c: ClassContext): string {
  const young = c.grade <= 3
  const rand = c.country === 'ZA'
  const lines: string[] = [
    '- This topic may also use the new answer kinds named below. Use one only when it fits better than a number, and keep most questions as they are. Use them only for the 15 questions, never in the warm-up. Write the `answer` exactly as shown, because the computer reads it. Never put the answer in the `prompt`.',
  ]
  const when = (text: string) => lines.push(text)

  switch (kit) {
    case 'time':
      when(
        young
          ? '- `time`: the answer is a time of day or how long something takes. Use o\'clock and half past only: the `answer` is `3:00` or `3:30` (hours, a colon, minutes), and a length of time is whole hours like `2 h`. Write the question in words: "The film starts at 2:00 and lasts 1 hour. What time does it end?" or "School starts at 8:00 and ends at 1:00. How many hours is that?"'
          : '- `time`: the answer is a time of day or how long something takes. The `answer` is `3:15` (hours, a colon, minutes: `9:05`, `12:40`) or a length of time like `2 h 15 min`. Use quarter past, half past, quarter to and the minutes in between. Write the question in words: "A film starts at 2:15 and lasts 1 hour 30 minutes. What time does it end?" or "How long is it from 9:00 to 11:15?"',
      )
      when(
        '- There is no clock picture, so never ask the learner to read a clock face. When you want that, ask it as a `choice` question: "Which time is half past 3?" with the times as choices.',
      )
      break
    case 'measure':
      when(
        young
          ? '- `unit`: for length, mass, capacity and temperature a question may have `unit`, the unit as it is written (`cm`, `m`, `g`, `kg`, `ml`, `l`, `°C`). The `prompt` then asks for the number only ("How long is the pencil, in cm?"), the `answer` is the whole number without its unit (`12`) and the learner sees the unit after the answer box. Keep one unit all through a question: no changing between units.'
          : '- `unit`: for length, mass, capacity, volume, perimeter, area and temperature a question may have `unit`, the unit as it is written (`cm`, `m`, `km`, `g`, `kg`, `ml`, `l`, `°C`, `cm²`, `m²`). The `prompt` then asks for the number only ("How long is the pencil, in cm?"), the `answer` is the number without its unit (`12`) and the learner sees the unit after the answer box. A question may ask to change one unit to another ("How many cm are in 3 m?"): `unit` is then the unit of the answer.',
      )
      break
    case 'order':
      when(
        young
          ? '- `order`: the learner puts numbers in order. Give at most 5 whole numbers: the `answer` is the numbers in the right order, separated by `; ` (`9; 18; 45; 72`), and the screen shows them as chips in a mixed-up order for the learner to tap. The `prompt` says which way: "Put the numbers in order. Start with the smallest." or "Start with the biggest."'
          : '- `order`: the learner puts numbers in order. Give 3 to 6 numbers (whole numbers, decimals or fractions): the `answer` is the numbers in the right order, separated by `; ` (`0,25; 0,5; 0,75`), and the screen shows them as chips in a mixed-up order for the learner to tap. The `prompt` says which way: "Put the numbers in order. Start with the smallest." or "Start with the biggest."',
      )
      break
    case 'patterns':
      when(
        young
          ? '- `list`: several numbers in a row, with a semicolon between them. Use it for the next numbers of a pattern ("What are the next three numbers? 2, 4, 6, 8, ..."): at most 3 numbers, the `answer` is `10; 12; 14` and `ordered` is `true`.'
          : '- `list`: several values in a row, with a semicolon between them (a comma is part of a decimal, so never cut a list at a comma). Use it for the next terms of a number pattern ("What are the next three numbers? 3, 7, 11, 15, ..."): the `answer` is `19; 23; 27` and `ordered` is `true`.',
      )
      break
    case 'data':
      when(
        young
          ? '- `table`: a small table the learner fills in (a tally or a count of things). Keep it to 2 x 3: 2 columns and 3 rows, with one or two empty cells. Give `table` with `columns` (the headings) and `rows` (each row has one entry for each column: the text that is given, or `null` for a cell the learner fills). The `answer` holds the values of the `null` cells, left to right and top to bottom, separated by `; `, so it has exactly as many values as the table has `null`s.'
          : '- `table`: a small table the learner fills in (a tally or frequency table, the numbers read from a graph). Give `table` with `columns` (the headings, at most 4) and `rows` (at most 6; each row has one entry for each column: the text that is given, or `null` for a cell the learner fills). The `answer` holds the values of the `null` cells, left to right and top to bottom, separated by `; `, so it has exactly as many values as the table has `null`s.',
      )
      when(
        '- `list`: several values in a row, for when the answer is more than one number (the heights of the bars of a graph, the numbers of a tally): the `answer` is the values with a semicolon between them (`3; 5; 7`), and `ordered` is `true` when the order matters and `false` when any order is right.',
      )
      break
    case 'money':
      when(
        rand
          ? '- Money is in rand and cents: a money answer is `money` with the key written to the cent, like `R12,50`, and the learner types the amount.'
          : '- A money answer is `decimal` with the amount written the way the class writes it, and the learner types the amount.',
      )
      when(
        '- `order`: the learner puts amounts in order. Give ' +
          (young ? 'at most 5' : '3 to 6') +
          ` amounts as plain numbers: the \`answer\` is the amounts in the right order, separated by \`; \` (\`${rand ? '2,5; 5; 10' : '2.5; 5; 10'}\`), and the screen shows them as chips in a mixed-up order for the learner to tap. The \`prompt\` says which way: "Put the amounts in order. Start with the smallest."`,
      )
      when(
        '- `table`: a small price list or a bill the learner fills in. ' +
          (young ? 'Keep it to 2 x 3. ' : 'At most 4 columns and 6 rows. ') +
          'Give `table` with `columns` and `rows` (the text that is given, or `null` for a cell the learner fills). The `answer` holds the values of the `null` cells, left to right and top to bottom, separated by `; `.',
      )
      break
    case 'place':
      when(
        '- `list`: the parts of a number, for example a number written in expanded form: the `answer` is `300; 40; 5` for 345 (a semicolon between the parts) and `ordered` is `true`.',
      )
      when(
        young
          ? '- `order`: the learner puts numbers in order. Give at most 5 whole numbers: the `answer` is the numbers in the right order, separated by `; ` (`18; 45; 72`), and the screen shows them as chips in a mixed-up order for the learner to tap. The `prompt` says which way: "Put the numbers in order. Start with the smallest."'
          : '- `order`: the learner puts numbers in order. Give 3 to 6 numbers: the `answer` is the numbers in the right order, separated by `; ` (`1205; 1250; 2105`), and the screen shows them as chips in a mixed-up order for the learner to tap. The `prompt` says which way: "Put the numbers in order. Start with the smallest."',
      )
      break
  }
  return lines.join('\n')
}

/** The prompt of a gated topic: the prompt as it was, with the lines of its kit after the answer bullet (at the end when a prompt has no such bullet). */
export function withPrimaryAnswers(prompt: string, kit: PrimaryKit, c: ClassContext): string {
  const block = primaryAnswerBlock(kit, c)
  const at = prompt.indexOf(ANCHOR)
  return at < 0 ? `${prompt}\n${block}` : `${prompt.slice(0, at)}${block}\n${prompt.slice(at)}`
}
