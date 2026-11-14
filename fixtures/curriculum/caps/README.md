# CAPS Mathematics, Grades 1 to 12 (South Africa)

Twelve files, `grade-1.json` to `grade-12.json`. Each holds the topics of the South African Mathematics curriculum for one grade, term by term, in the order the Department of Basic Education lists them. Jemma loads them as a draft topic map (`packages/profiling/src/curriculum/caps.ts`). A teacher checks and approves the map before anything uses it.

## Where it comes from

Four public documents of the Department of Basic Education, all from 2011, all on https://www.education.gov.za:

| Grades | Document | Address |
| --- | --- | --- |
| 1 to 3 | Curriculum and Assessment Policy Statement (CAPS), Foundation Phase, Grades 1-3, Mathematics (English) | https://www.education.gov.za/Portals/0/CD/National%20Curriculum%20Statements%20and%20Vocational/CAPS%20MATHS%20%20ENGLISH%20GR%201-3%20FS.pdf |
| 4 to 6 | CAPS Mathematics, Intermediate Phase, Grades 4-6 | https://www.education.gov.za/Portals/0/CD/National%20Curriculum%20Statements%20and%20Vocational/CAPS%20IP%20%20MATHEMATICS%20GR%204-6%20web.pdf |
| 7 to 9 | CAPS Mathematics, Senior Phase, Grades 7-9 | https://www.education.gov.za/Portals/0/CD/National%20Curriculum%20Statements%20and%20Vocational/CAPS%20SP%20%20MATHEMATICS%20GR%207-9.pdf |
| 10 to 12 | CAPS Mathematics, Further Education and Training Phase, Grades 10-12 | https://www.education.gov.za/Portals/0/CD/National%20Curriculum%20Statements%20and%20Vocational/CAPS%20FET%20_%20MATHEMATICS%20_%20GR%2010-12%20_%20Web_1133.pdf |

The documents themselves are not in this repository and remain the Department's. The files hold only the topic names, the term each topic is in, the order, and a strand for each topic. The wording of the documents is not copied, and the weeks and hours are not kept. The `source` of each file names the document and the pages the topics were read from.

The topics were read from the documents by four AI research agents (one for each document) and put into one shape by a script.

## What each file holds

`{ grade, phase, subject, country, source, terms }`. Each topic has:

- `name`: the topic, unique in its grade.
- `shortName`: a shorter name for narrow screens, unique in its grade.
- `family`: the strand. One of `whole_numbers`, `fractions`, `decimals`, `shapes`, `measurement`, `data`, `patterns`, `probability`, `integers_and_exponents`, `functions`, `algebra`, `trigonometry`, `analytical_geometry`, `finance`, `calculus`.
- `capsName`: the name as the document prints it.
- `contentArea`: the content area of the document the topic sits under.

488 topics in all.

## How the files were put together

- Names are tidied: print typos such as "dvision" and stray spaces are fixed. The document's own name is kept in `capsName`.
- Rows named "Mental Mathematics" are left out, and so are the Foundation Phase rows that are ways of working ("Problem-solving techniques", "Techniques"). Revision and exam rows are left out too.
- A topic that the document repeats in a later term carries that term in its name, for example "Common fractions (Term 4)".
- In the Foundation Phase the document teaches almost every row in every term. A row repeats in every term it is taught, with the term in its name, as in the other phases, so each term of Grades 1 to 3 has its own list.
- The strand (`family`) is given by a rule from the content area of the document and the name of the topic. It is a reading, not something the document states.

## What is not verified

- The documents disagree with themselves in a few places, and the pacing table was followed. Examples: Grade 5 Term 2 gives Length 6 hours in the table and 7 hours in the clarification table; Grade 6 Term 1 gives Common fractions 10 hours and 5 hours; Grade 10 Term 3 gives Measurement 1 week and 2 weeks; Grade 12 Term 3 gives Statistics 2 weeks and 1 week. No hours or weeks are in the files, but a topic's term rests on the table that was followed.
- Only the 2011 editions were read. The Department and the provinces have published later yearly teaching plans, and they may order or pace topics differently. They were not read.
- In the Foundation Phase the Data Handling cells are merged across rows in the document. They were split by reading which sentence belongs to which row.
- Some strands are judgement calls. For example Grade 12 "Polynomial functions" is under `algebra` because the overview places the Remainder and Factor Theorems there, and "Counting and probability" is under `probability`.
- A term with no topic has an empty list in its file, and the draft map leaves it out. Grade 12 Term 4 has none: the table gives revision and exams only.
- Formulas, symbols and diagrams in the tables did not come out as text, so the files hold names only.
- The Senior Phase clarification tables were read from extracted text, not page by page as images. The time allocation tables were checked as page images.
- No prerequisites and no usual mistakes are given for any topic, because the documents do not give them.
