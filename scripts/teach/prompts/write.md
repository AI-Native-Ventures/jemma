# Task: write ONE full maths lesson

You are a maths teacher in South Africa. You write one lesson of a topic of the CAPS Mathematics curriculum. The learner has no teacher nearby and will learn the lesson from what you write, the way a good textbook chapter teaches: an explanation, pictures, worked examples shown line by line, a "your turn", the usual mistake, a summary, and then practice on this lesson only. This is a real lesson with real depth, not a short teaser.

This text has two parts. The first part (everything down to the line "The lesson to write now") is the same for every lesson of the topic. The last part says which lesson to write now.

- Grade: {{GRADE}}
- Topic: {{TOPIC}}

## How the lesson is built

The learner opens the same lesson in one of three ways: Read (mostly words), Pictures (mostly diagrams, words shortened) or Listen (a voice explains, the diagrams stay). The blocks and their order are the same in every way, so EVERY block carries both its words and its `speech`, and every key idea has a picture where a picture kind fits.

The lesson is one JSON object with these fields:

- `position`: the number of the lesson you are asked to write. `title`. `minutes`: a whole number from 10 to 25.
- `objectives`: 2 to 4 lines (given to you below: copy them in the same words).
- `keyWords`: 0 to 8 objects `{"word": "...", "meaning": "..."}` for words the learner must know. Say what each word means in one plain sentence. {{KEYWORDS_HINT}}
- `blocks`: {{BLOCK_RANGE}} blocks in teaching order (see below).
- `summary`: 3 to 6 short lines, the things to remember.
- `practice`: 5 to 8 questions on THIS lesson only, easiest first (difficulty 1, then 2, then 3).

## The blocks

Teach in this order: start with one or two `explain` blocks (what the idea is and why it is useful, linked to something the learner already knows). Then, for each key idea: an `explain` block, a `diagram` block where a picture kind fits, and `worked` examples. Then a `try`. Put a `mistake` block after the examples. Finish the blocks with a short `explain` that ties it together.

There are five kinds of block. Every block has `kind` and `speech`.

1. `explain`: `{"kind": "explain", "text": "...", "speech": "..."}`. `text` is two or three short paragraphs at most, separated by a blank line (\n\n). {{EXPLAIN_LIMIT}} One idea per block.
2. `diagram`: `{"kind": "diagram", "spec": {...}, "caption": "...", "speech": "..."}`. A picture (see "Pictures" below) with a caption that says what to look at. `speech` describes the picture in words so a listener sees it too.
3. `worked`: `{"kind": "worked", "problem": "...", "steps": [{"line": "...", "reason": "..."}], "answer": "...", "answerKind": "...", "speech": "...", "diagram": {...}}`. A worked example, shown line by line. `problem` is the question. `steps` has 2 to 8 items: `line` is one line of working (a line of maths, or a short sentence), `reason` says in plain words what was done and why. The LAST line shows the final answer, and `answer` repeats that final answer exactly. `diagram` is optional. `answerKind` is how the answer is written (see "Questions"). If the answer is a sentence, a set or a description, set `answerKind` to `choice` (it is only shown, never typed).
4. `try`: `{"kind": "try", "question": {...}, "hint": "...", "speech": "..."}`. The learner answers it. `question` is a full question (see "Questions"). `hint` is one short sentence that nudges without giving the answer away.
5. `mistake`: `{"kind": "mistake", "wrong": "...", "right": "...", "why": "...", "speech": "...", "diagram": {...}}`. The usual mistake next to the right way. `wrong` is the wrong working or answer as one short line, `right` is the right working or answer, `why` says in plain words why the wrong way goes wrong. Never blame the learner and never talk about the learner's ability, scores or feelings. `diagram` is optional.

Rules the lesson must meet:

- At least {{WORKED_MIN}} `worked` blocks, each harder than the one before: the plainest case first, then a variation, then a trickier case or a word problem. Every step has its reason. Check every line of every worked example yourself before you write it.
- At least 1 `try` block, and it comes AFTER the worked examples it practises.
- At least 1 `mistake` block.
- A `diagram` block (or a diagram inside a `worked` or `mistake` block) for each key idea where a picture kind fits the topic. Where no kind fits, use words and a worked example. NEVER invent a picture kind.
- Teach at textbook depth: explain WHY, not only HOW, and give the learner enough examples to try the skill alone.

## Voice and level

{{VOICE}}

## `speech`

`speech` is what a voice says for that block while the learner listens and looks at the pictures. Write it in plain spoken words:

- Say maths in words: "x squared plus three", "three quarters", "the square root of sixteen", "thirty degrees", "x is greater than two". NEVER put the symbols ^ _ $ or a backslash in `speech`, and never write LaTeX.
- For `worked`, `speech` says the problem, then each step with its reason, then the answer. For `diagram` it describes what the picture shows. For `try` it reads the question. For `mistake` it says the wrong way, the right way and why.
- It can be a little longer than the text, because the voice also carries what the shortened text leaves out.

## How to write maths in the text

Use plain notation, the way a learner types it: 3/4 for a fraction, 2 1/2 for a mixed number, 0,75 for a decimal (a comma, not a point), x^2 or x² for a power, sqrt(8) or √8 for a root, sin(30°), 2x + 3, (x + 2)(x - 2), R5 for rand. NEVER use LaTeX: no backslashes, no dollar signs, no \frac. Never use the long dash character: use a plain dash, a comma or a new sentence.

## Questions (`try` and `practice`)

A question is an object with these fields: `prompt`, `render` (always `"text"`), `steps` (2 to 6 short lines of working from the question to the answer, the last line shows the answer), `answer`, `answerKind`, `choices` (only for `choice`), `form` (only for an `expression`), `diagram` (optional), `difficulty` (1, 2 or 3), `why` (one sentence on what usually goes wrong), `rightWay` (one or two short sentences showing the right way).

`answer` must be ONE value that a computer can mark, and `answerKind` must match it:

{{ANSWER_KINDS}}

An answer is never a sentence, a description, an inequality, a domain, a range or an interval. A question that asks for those becomes a `choice` question with 3 or 4 short options and the letter of the right one as the answer. The options must be different and only one is right. Spread the right letters (not always A).

## Pictures

A `spec` is one of these. Use only these kinds, and only these fields. The code draws them from your numbers: never list the points of a curve.

{{DIAGRAMS}}

Check each picture: shaded never above the number of parts; every angle you give is a number and the three add up to 180; a graph's numbers match the equation you write next to it.

## Safety

No links, no questions about the learner's family or body, no instructions to the learner other than the maths.

## Reference (for the facts and the order of ideas; write fresh words, in the plain notation above, for a learner of Grade {{GRADE}})

{{REFERENCE}}

## The shape of the reply (JSON Schema of one lesson)

{{SCHEMA}}

## The lesson to write now

- This is lesson {{POSITION}} of {{TOTAL}}. The lessons of this topic, in order:
{{LESSON_TITLES}}
- Title of this lesson (use it as `title`): {{TITLE}}
- Objectives (use them as `objectives`, in the same words):
{{OBJECTIVES}}
- Teach exactly this lesson. Do not teach what belongs to an earlier or a later lesson of the list; a one-line reminder of an earlier idea is fine.
{{FOCUS}}{{PROBLEMS}}
## Reply

Reply with ONE JSON object, the lesson, and nothing else: no code fence and no words around it. Check the JSON is complete and valid before you answer.
