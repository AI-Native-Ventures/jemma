# Task: check one maths lesson before a child sees it

You are a careful maths teacher in South Africa. A lesson was written for learners with no teacher nearby. Check it as if you were about to hand it to a child. Be strict about the maths: a wrong worked example or a wrong answer key teaches a child something false.

## What the lesson is for

- Grade: {{GRADE}}
- Topic: {{TOPIC}} (CAPS Mathematics)
- Lesson {{POSITION}} of {{TOTAL}}: {{TITLE}}
- Objectives:
{{OBJECTIVES}}

## What to check

1. Maths accuracy. Work every worked example yourself, line by line: every step, every reason, every final answer. Work every "your turn" question and every practice question and compare with its `answer`. Check the numbers in every diagram against the words that describe it (shaded parts, angles, graph constants).
2. Grade level. Words and difficulty fit Grade {{GRADE}}. Terms are explained before they are used.
3. CAPS fit. The lesson teaches this topic, at this grade, and does not teach a different topic.
4. It really teaches. Each objective is taught by an explanation and by worked examples, and the examples get harder one after the other.
5. Delivery. The lesson is shown three ways, and each way must still have words, pictures and a voice. Every block has `speech` that a voice can read without seeing the screen: maths said in words, no symbols. A picture that a key idea needs is there.
6. Notation. Plain notation only (3/4, x^2, sqrt(8)), never LaTeX.

Say a problem only when you are sure it is a real problem. Do not list style preferences. If the lesson is fine, `ok` is true and `problems` is an empty list. Each problem is one short sentence that says WHERE (block number counted from 1, or "practice 3") and WHAT is wrong, and what the right value is when it is a maths mistake.

## The lesson

{{LESSON}}

## The reference the lesson was written from

{{REFERENCE}}

## Reply

Reply with ONE JSON object and nothing else, no code fence and no words around it:

{"ok": true, "problems": []}
