"""Colours that now say the wrong thing: wrong answers in red, the unsure box in gold, right answers in green, on switches in green."""
import sys, os
KALAM_BOX = "border:2px solid #007749;border-radius:{r}px;display:flex;align-items:center;justify-content:center;font-family:Kalam"
FIX = {
    "teacher-fix-mark.dc.html": [(KALAM_BOX.format(r=3), KALAM_BOX.format(r=3).replace("#007749", "#E03C31"), 4),
                                 (KALAM_BOX.format(r=4), KALAM_BOX.format(r=4).replace("#007749", "#E03C31"), 1)],
    "parent-flag-mark.dc.html": [(KALAM_BOX.format(r=3), KALAM_BOX.format(r=3).replace("#007749", "#E03C31"), 4),
                                 (KALAM_BOX.format(r=4), KALAM_BOX.format(r=4).replace("#007749", "#E03C31"), 1)],
    "teacher-review.dc.html": [("border:3px solid #007749;border-radius:12px;box-shadow:0 0 0 999px", "border:3px solid #FFB81C;border-radius:12px;box-shadow:0 0 0 999px", 1)],
    "laptop-teacher-review.dc.html": [("border:3px solid #007749;border-radius:12px;box-shadow:0 0 0 999px", "border:3px solid #FFB81C;border-radius:12px;box-shadow:0 0 0 999px", 1)],
    "child-results.dc.html": [("background:#FFF6E2;border:1.5px solid #007749", "background:#DDEFE6;border:1.5px solid #007749", 2)],
    "q-results-graph.dc.html": [("background:#FFF6E2;border:1.5px solid #007749", "background:#DDEFE6;border:1.5px solid #007749", 2)],
    "parent-child-settings.dc.html": [("width:50px;height:30px;flex:none;border-radius:999px;background:#161616", "width:50px;height:30px;flex:none;border-radius:999px;background:#007749", 2)],
    "child-handback.dc.html": [('<path d="M66 5a61 61 0 0 1 52.8 30.5" fill="none" stroke="#007749" stroke-width="6" stroke-linecap="round"/>',
                                '<path d="M66 5a61 61 0 0 1 52.8 30.5" fill="none" stroke="#FFB81C" stroke-width="6" stroke-linecap="round"/>', 1),
                               ('<span style="font-size:13px;color:#CBC8C1">to see how it went</span>', '<span style="font-size:13px;color:#E8F3EC">to see how it went</span>', 1)],
    "teacher-class-settings.dc.html": [("width:50px;height:30px;flex:none;border-radius:999px;background:#161616", "width:50px;height:30px;flex:none;border-radius:999px;background:#007749", 1)],
}
d = sys.argv[1]
for name, edits in FIX.items():
    p = os.path.join(d, name)
    t = open(p, encoding="utf-8").read()
    for old, new, n in edits:
        assert t.count(old) == n, (name, old[:50], t.count(old))
        t = t.replace(old, new)
    open(p, "w", encoding="utf-8").write(t)
    print("fixed", name)
