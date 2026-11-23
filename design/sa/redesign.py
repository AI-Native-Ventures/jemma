#!/usr/bin/env python3
"""Add the South African touches to every Jemma app board.
usage: redesign.py <src_dir> <dst_dir>
Progress dots become beads, finished steps turn green,
ticks in black circles turn green. Some screens get a drawing, a bead ring or a gem burst."""
import os, re, sys, json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

GREEN = kit.GREEN


def root_match(t):
    i = t.index("</helmet>") + len("</helmet>")
    return re.compile(r"<(div|section)\b[^>]*>").search(t, i)


DOT = re.compile(r'<span style="width:(1[0-4])px;height:\1px;border-radius:999px;'
                 r'(background:#161616|border:3px solid #007749|border:1\.5px solid #8F8D88)"></span>')
DOT_STATE = {"background:#161616": "done", "border:3px solid #007749": "now", "border:1.5px solid #8F8D88": "next"}
GROUP = re.compile(r'(<span aria-hidden="true" style="display:flex;(?:align-items:center;)?gap:\d+px">)'
                   r'((?:\s*<span style="width:1[0-4]px;height:1[0-4]px;border-radius:999px;[^"]*"></span>){3,})(\s*</span>)')


def bead_dots(t, stats):
    def group(m):
        inner = DOT.sub(lambda d: kit.bead_dot(DOT_STATE[d.group(2)], int(d.group(1)) + 3), m.group(2))
        stats["dot_groups"] += 1
        opener = m.group(1)
        if "align-items" not in opener:
            opener = opener.replace('style="display:flex;', 'style="display:flex;align-items:center;', 1)
        return opener + inner + m.group(3)
    return GROUP.sub(group, t)


def green_steps(t, stats):
    def ol(m):
        s = m.group(0)
        n = s.count('style="height:6px;border-radius:999px;background:#161616"')
        stats["green_steps"] += n
        return s.replace('style="height:6px;border-radius:999px;background:#161616"', f'style="height:6px;border-radius:999px;background:{GREEN}"')
    return re.sub(r'<ol aria-label="Session steps".*?</ol>', ol, t, flags=re.S)


TICK = re.compile(r'(<span [^>]*?)background:#161616([^>]*>\s*<svg[^>]*>\s*<path d="m5 12\.5 4\.5 4\.5L19 7\.5"\s*/>\s*</svg>\s*</span>)')


def green_ticks(t, stats):
    t2, n = TICK.subn(lambda m: m.group(1) + "background:" + GREEN + m.group(2), t)
    stats["green_ticks"] += n
    return t2


def centre(inner_svg, width, extra_style=""):
    return (f'<div aria-hidden="true" data-sa="drawing" style="display:flex;justify-content:center;{extra_style}">'
            f'<div style="width:{width}px">{inner_svg}</div></div>')


def must_replace(t, old, new, name):
    assert t.count(old) == 1, (name, t.count(old), old[:80])
    return t.replace(old, new, 1)


# ---------------------------------------------------------------- screen by screen
def sp_sign_in(t):
    return must_replace(t, '<div style="flex:1"></div>\n  <a href="Main.dc.html"',
                        f'<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:0">'
                        f'<div aria-hidden="true" data-sa="drawing" style="width:176px">{kit.ill_welcome()}</div></div>\n  <a href="Main.dc.html"', "sign-in")


def sp_empty_class(t):
    old = 'I can start marking for you.</h1>\n    </div>\n'
    return must_replace(t, old, old + "\n    " + centre(kit.ill_chalkboard(), 216) + "\n", "empty-class")


def sp_empty_profile(t):
    old = "Let's find where she is in Maths.</h1>\n      </div>\n    </div>\n"
    return must_replace(t, old, old + "\n    " + centre(kit.ill_welcome(), 228) + "\n", "empty-profile")


def sp_loading(t):
    m = re.search(r'<span aria-hidden="true" style="position:relative;width:120px;height:120px;[^"]*">.*?</svg>\s*<svg.*?</svg>\s*</span>', t, re.S)
    return t[:m.start()] + f'<span aria-hidden="true" data-sa="bead-ring" style="display:block;width:120px;height:120px">{kit.bead_ring(7)}</span>' + t[m.end():]


def sp_child_error(t):
    m = re.search(r'<span aria-hidden="true" style="position:relative;width:84px;height:84px;[^"]*">.*?</svg>\s*<svg.*?</svg>\s*</span>', t, re.S)
    return t[:m.start()] + f'<span aria-hidden="true" data-sa="bead-ring" style="display:block;width:100px;height:100px">{kit.bead_ring(3, paused=True, width_css="100px")}</span>' + t[m.end():]


def sp_state_error(t):
    m = re.search(r'<span aria-hidden="true" style="width:48px;height:48px;border-radius:14px;background:#FFF3DA;[^"]*">.*?</svg></span>', t, re.S)
    return t[:m.start()] + f'<div aria-hidden="true" data-sa="drawing" style="width:176px">{kit.ill_oops()}</div>' + t[m.end():]


def sp_reading(t):
    m = re.search(r'<span aria-hidden="true" style="width:44px;height:44px;border-radius:14px;background:#FFF6E2;[^"]*">.*?</svg>\s*</span>', t, re.S)
    t = t[:m.start()] + f'<div aria-hidden="true" data-sa="drawing" style="width:184px">{kit.ill_reading()}</div>' + t[m.end():]
    bar = re.search(r'<div aria-hidden="true" style="height:10px;border-radius:999px;background:#EFECE6;overflow:hidden;display:flex">\s*<span style="width:60%;[^"]*"></span>\s*</div>', t)
    beads = "".join(kit.bead_dot(s, 24) for s in ("done", "done", "done", "now", "next"))
    return t[:bar.start()] + f'<div aria-hidden="true" data-sa="bead-progress" style="display:flex;align-items:center;gap:8px">{beads}</div>' + t[bar.end():]


def sp_link_pending(t):
    old = "Waiting for Ms Banda to say yes.</h1>\n      </div>\n    </div>\n"
    return must_replace(t, old, old + "\n    " + centre(kit.ill_link(), 232) + "\n", "link-pending")


def sp_nothing_tonight(t):
    i = t.rindex("</main>")
    return t[:i] + centre(kit.ill_night(), 236, "margin-top:auto") + "\n  " + t[i:]


def sp_handback(t):
    m = re.search(r'<span aria-hidden="true" style="position:relative;width:150px;height:110px">.*?</span>', t, re.S)
    return t[:m.start()] + f'<span aria-hidden="true" data-sa="gem-burst" style="display:block;width:172px">{kit.gem_burst(width_css="172px")}</span>' + t[m.end():]


def sa_gems_row(t):
    """the three little gems over 'You finished' become beads in the five colours"""
    m = re.search(r'(<span aria-hidden="true" style="display:flex;gap:6px">)\s*<svg width="(1[68])"[^>]*>.*?</svg>\s*<svg.*?</svg>\s*<svg.*?</svg>\s*(</span>)', t, re.S)
    size = int(m.group(2))
    cols = (kit.GREEN, kit.GOLD, kit.RED, kit.BLUE, kit.GOLD)
    beads = "".join(f'<svg width="{size}" height="{size}" viewBox="0 0 16 16"><polygon points="8,1 15,8 8,15 1,8" fill="{c}"/></svg>' for c in cols)
    return t[:m.start()] + m.group(1).replace("display:flex;", "display:flex;align-items:center;", 1) + beads + m.group(3) + t[m.end():]


def sp_job_stopped(t):
    m = re.search(r'<span aria-hidden="true" style="width:48px;height:48px;flex:none;border-radius:14px;background:#FFEDC6;[^"]*">.*?</svg></span>', t, re.S)
    return t[:m.start()] + f'<div aria-hidden="true" data-sa="drawing" style="width:150px;flex:none">{kit.ill_oops()}</div>' + t[m.end():]


SCREENS = {
    "shared-sign-in.dc.html": sp_sign_in,
    "state-empty-class.dc.html": sp_empty_class,
    "parent-empty-profile.dc.html": sp_empty_profile,
    "child-loading.dc.html": sp_loading,
    "child-error.dc.html": sp_child_error,
    "state-error.dc.html": sp_state_error,
    "teacher-reading.dc.html": sp_reading,
    "parent-link-pending.dc.html": sp_link_pending,
    "child-nothing-tonight.dc.html": sp_nothing_tonight,
    "child-handback.dc.html": sp_handback,
    "child-results.dc.html": sa_gems_row,
    "q-results-graph.dc.html": sa_gems_row,
    "desktop-job-stopped.dc.html": sp_job_stopped,
}


GROW = {"parent-empty-profile.dc.html": 1084, "state-empty-class.dc.html": 1020, "state-error.dc.html": 956,
        "teacher-reading.dc.html": 1092, "parent-link-pending.dc.html": 896}


def grow(name, t):
    m = root_match(t)
    tag = m.group(0)
    old = re.search(r"height:(\d+)px", tag)
    h0, h1 = int(old.group(1)), GROW[name]
    tag = tag[:old.start()] + f"height:{h1}px" + tag[old.end():]
    t = t[:m.start()] + tag + t[m.end():]
    return must_replace(t, f'"height":{h0}}}', f'"height":{h1}}}', name + " preview")


def redesign(name, t, stats):
    if name in SCREENS:
        t = SCREENS[name](t)
        stats["screens"] += 1
    t = bead_dots(t, stats)
    t = green_steps(t, stats)
    t = green_ticks(t, stats)
    if name in GROW:
        t = grow(name, t)
    return t


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    stats = {k: 0 for k in ("screens", "dot_groups", "green_steps", "green_ticks")}
    names = sorted(f for f in os.listdir(src) if f.endswith(".dc.html"))
    for n in names:
        t = open(os.path.join(src, n), encoding="utf-8").read()
        open(os.path.join(dst, n), "w", encoding="utf-8").write(redesign(n, t, stats))
    print(len(names), "files", stats)
