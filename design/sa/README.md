# South African colours and touches

Jemma uses the colours of the South African flag. Colours only, no flag.

| Colour | Hex | What it is for |
| --- | --- | --- |
| Green | `#007749` | Go: confirm buttons, a picked chip, a done tick, a finished step, a switch that is on, the line Jemma is reading, a right answer |
| Gold | `#FFB81C` | The gem: gems, bright buttons (black words on them), fills, the one thing to look at (the answer Jemma is unsure about) |
| Black | `#161616` | The words, lines, outline buttons, data bars |
| Red | `#E03C31` (`#B8281E` for words) | The red pen: wrong answers, alerts |
| Blue | `#001489` (`#12308C` for handwriting) | The pen a learner writes with |
| White and warm greys | `#FFFFFF`, `#F8F6F1`, `#E8E5DE` | Space |

In the web app these are the tokens in `apps/web/app/globals.css` (`ink`, `green`, `gold`, `red`, `red-text`, `blue`, `navy` and the greys).
Gold never carries words on white: it is too pale to read. Words in an accent colour use `red-text`.

## The touches

They are the same on the design canvas (the "South African touches" board in `design/v1-screens/sa-kit.dc.html`) and in the app (`apps/web/components/sa`).

- **Beads for progress.** Question dots are beads (`BeadRow`): green is done, gold is now, empty is next. Finished steps are green.
- **The bead ring.** Twelve beads round the gem while a lesson gets ready (`BeadRing`), standing still when it is slow.
- **The gem burst.** When a session is finished (`GemBurst`), and the five bead colours over the results (`GemRow`).
- **Drawings.** Welcome (sign in), a chalkboard (a new class), reading (Jemma reading the pile), a torn page with a plaster (errors, nothing is lost), night (nothing new tonight) and two phones joined by beads (waiting for a teacher). They are decoration: the words next to them say the same.

## The files here

- `kit.py`: the drawings, beads, ring and burst, one source for the canvas and the app.
- `gen_tsx.py <apps/web>`: writes `apps/web/components/sa/*.tsx` from `kit.py`. Change a drawing in `kit.py`, then run it again.
- `gen_kit_board.py`: the kit board of the canvas.
- `redesign.py`, `fix_copy.py`, `fix_semantics.py`: how the canvas boards got the touches (beads, drawings, taller frames) and the colour fixes (wrong answers red, the unsure box gold, words that said "coral").
- `code_sa.py`: how the app code went from coral and ink to these colours (tokens, roles, the hex table). It ran on develop at 3ce6b9c (15 Nov) and again at cd88e10 (23 Nov). It is safe to run again: a change that is already made is left alone, and a line that has moved on is listed under SKIPPED for a person to check.
- `recolor_shots.py`: how the landing screenshots were recoloured (coral to gold, ink to black, big black buttons green).
