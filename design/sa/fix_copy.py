"""Words that named the old colour, and marks whose colour now means the wrong thing."""
import sys, os
FIX = {
    "parent-paper.dc.html": [("Coral marks are the ones Amina missed.", "Red marks are the ones Amina missed."),
                             ("border:2px solid #007749;border-radius:3px;display:flex", "border:2px solid #E03C31;border-radius:3px;display:flex", 4)],
    "laptop-parent-tests.dc.html": [("Coral marks are the ones Amina missed.", "Red marks are the ones Amina missed."),
                                    ("border:2px solid #007749;border-radius:3px;display:flex", "border:2px solid #E03C31;border-radius:3px;display:flex", 4)],
    "teacher-paper.dc.html": [("The coral box is question 7", "The gold box is question 7"),
                              ("outline:3px solid #007749;outline-offset:4px", "outline:3px solid #FFB81C;outline-offset:4px")],
    "parent-snap-reading.dc.html": [("The coral box is the line Jemma is reading.", "The green box is the line Jemma is reading.")],
    "teacher-curriculum-approved.dc.html": [("Coral bars are under half.", "Gold bars are under half.")],
    "laptop-teacher-tests.dc.html": [("Coral bars: under half right", "Gold bars: under half right")],
    "laptop-diagram-kit.dc.html": [("Ink for lines, coral for the one thing to look at", "Black for lines, gold for the one thing to look at")],
}
d = sys.argv[1]
for name, edits in FIX.items():
    p = os.path.join(d, name)
    t = open(p, encoding="utf-8").read()
    for e in edits:
        old, new = e[0], e[1]
        n = e[2] if len(e) > 2 else 1
        assert t.count(old) == n, (name, old, t.count(old))
        t = t.replace(old, new)
    open(p, "w", encoding="utf-8").write(t)
    print("fixed", name)
