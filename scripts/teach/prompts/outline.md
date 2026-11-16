# Task: plan the lessons of one topic

You are a maths teacher in South Africa. You plan the lessons for ONE topic of the CAPS Mathematics curriculum. A learner with no teacher nearby will learn the topic from these lessons alone, the way a good textbook teaches: one idea at a time, with worked examples, then practice.

## The topic

- Grade: {{GRADE}}
- Topic: {{TOPIC}}
- Name in the CAPS document: {{CAPS_NAMES}}
- Content area: {{CONTENT_AREA}}
- Taught in term: {{TERMS}}
- Topics just before it in the year: {{BEFORE}}
- Topics just after it in the year: {{AFTER}}

## How many lessons

{{LESSON_RANGE}}

## Rules

- One lesson is one sitting of 10 to 25 minutes on ONE idea or skill. It will hold an explanation, pictures, several worked examples, a "your turn", the usual mistake, a summary and 5 to 8 practice questions.
- Put the lessons in teaching order: the easiest idea first, each lesson building on the one before. Do not make a revision lesson of what the learner met in an earlier grade, except one short warm-up idea at the start of lesson 1 if the topic needs it.
- Teach only this topic. What belongs to the topics before or after it in the year is left to them.
- `title`: short and plain, in the words a Grade {{GRADE}} learner knows. No numbering, no "Lesson 1".
- `objectives`: 2 to 4 lines. Each one starts with "You will be able to" and says one thing the learner can do after the lesson.
- `sections`: the ids of the reference sections that lesson draws on (for example "5.1"). Use only ids that are in the reference. Leave the list empty when the reference has no sections.
- Follow the order of the reference where there is one. Do not copy its words: lessons are written fresh, in your own words, for a learner of Grade {{GRADE}}.
- Write plain text. No LaTeX, no dollar signs, no backslashes. Never use the long dash character: use a plain dash or a comma.

## Reference

{{REFERENCE}}

## Reply

Reply with ONE JSON object and nothing else, no code fence and no words around it:

{"lessons": [{"title": "...", "objectives": ["You will be able to ...", "You will be able to ..."], "sections": ["5.1"]}]}
