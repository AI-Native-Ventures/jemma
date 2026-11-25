# US Mathematics, Grades 1 to 12 (Common Core)

Twelve files, `grade-1.json` to `grade-12.json`. Each holds the maths topics of one US grade, in four quarters, for a learner in the US who
practises on their own ("My own") and has no teacher's map. Added in P161, next to the South African files in `../caps/`, which are unchanged.

## Where it comes from

The Common Core State Standards for Mathematics (National Governors Association Center for Best Practices and Council of Chief State School
Officers, 2010), https://www.thecorestandards.org/Math/. Grades 1 to 8 follow the standards of each grade, by domain and cluster. The standards
for high school are not by grade, so Grades 9 to 12 follow the usual course order: Algebra I, Geometry, Algebra II and Precalculus. The standards
do not put topics in quarters: the quarters follow a common order of teaching. A state or a school may teach the topics in another order.

The files hold only topic names written for learners, the quarter, a strand, and the code of the standard the topic comes from. Not the wording
of the standards.

## What each file holds

`{ grade, subject, country, course, source, terms }`. `terms` are the four quarters. Each topic has:

- `name`: the topic, unique in its grade.
- `shortName`: a shorter name for narrow screens, unique in its grade.
- `family`: the strand, from the same list as the South African files.
- `standard`: the Common Core code of the cluster or standard (`6.RP.A.3`, `A-REI.4`).
- `domain`: the domain of the standards, or the course for Grades 9 to 12.

181 topics in all. `scripts` is not needed to read them: `packages/profiling/src/curriculum/us.ts` imports them, as `caps.ts` does the others.
