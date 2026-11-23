"""South African touches for the Jemma app: bead dots, bead ring, gem burst and drawings.
One source for the design canvas and for the app code. Colours only, no flag. No dashes or dash-like marks."""

BLACK = "#161616"
GREEN = "#007749"
GOLD = "#FFB81C"
GOLD_HI = "#FFD66B"
RED = "#E03C31"
RED_TEXT = "#B8281E"
BLUE = "#001489"
PEN = "#12308C"
WHITE = "#FFFFFF"
BG = "#F8F6F1"
SUB = "#5C5A55"
LINE = "#E6E3DC"
GREENT = "#DDEFE6"
GOLDT = "#FFF1CC"
SAND = "#F1ECE2"
GREY = "#8F8D88"
PALE = "#D9D6CE"
PINK = "#F4B6B1"
SW = 2.2  # outline width


def gem(cx, cy, r, fill=GOLD, stroke=None, sw=SW, hi=False):
    pts = f"{cx:g},{cy - r:g} {cx + r:g},{cy:g} {cx:g},{cy + r:g} {cx - r:g},{cy:g}"
    out = f'<polygon points="{pts}" fill="{fill}"'
    out += f' stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>' if stroke else "/>"
    if hi:  # a lighter facet on the top left
        out = (f'<polygon points="{pts}" fill="{fill}"/>'
               f'<polygon points="{cx:g},{cy - r:g} {cx - r:g},{cy:g} {cx:g},{cy:g}" fill="{GOLD_HI}"/>'
               + (f'<polygon points="{pts}" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>' if stroke else ""))
    return out


def svg(vb_w, vb_h, body, label=None, width_css="100%"):
    aria = f'role="img" aria-label="{label}"' if label else 'aria-hidden="true"'
    return (f'<svg viewBox="0 0 {vb_w} {vb_h}" {aria} style="display:block;width:{width_css};height:auto;'
            f'aspect-ratio:{vb_w} / {vb_h}">{body}</svg>')


# ---------------------------------------------------------------- bead dots: question dots become beads
def bead_dot(state, size=14):
    """done: a green bead; now: a gold bead with a black edge; next: an empty bead."""
    r = size / 2
    c = r
    if state == "done":
        body = gem(c, c, r - 0.5, GREEN)
    elif state == "now":
        body = gem(c, c, r - 1.2, GOLD, BLACK, 1.6)
    else:
        body = gem(c, c, r - 1.2, "none", GREY, 1.4)
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 {size} {size}" aria-hidden="true" '
            f'style="display:block;flex:none">{body}</svg>')


# ---------------------------------------------------------------- bead ring: the loader around the gem
def bead_ring(lit=7, n=12, label=None, width_css="120px", paused=False):
    import math
    cx = cy = 60
    R = 44
    beads = []
    cols = (GREEN, GOLD, RED, BLUE, GOLD, GREEN)
    for i in range(n):
        a = -math.pi / 2 + i * 2 * math.pi / n
        x, y = cx + R * math.cos(a), cy + R * math.sin(a)
        if i < lit:
            beads.append(gem(round(x, 1), round(y, 1), 7, cols[i % len(cols)]))
        else:
            beads.append(gem(round(x, 1), round(y, 1), 6, "none", PALE, 1.6))
    centre = gem(cx, cy, 20, GOLD, hi=True)
    if paused:
        centre += gem(cx, cy, 20, "none", BLACK, 2)
    return svg(120, 120, "".join(beads) + centre, label, width_css)


# ---------------------------------------------------------------- gem burst: the moment you finish something
def gem_burst(label=None, width_css="200px"):
    body = [
        f'<circle cx="100" cy="66" r="50" fill="{GOLDT}"/>',
        gem(100, 66, 30, GOLD, BLACK, SW, hi=True),
        gem(46, 40, 9, GREEN), gem(156, 34, 8, RED), gem(164, 92, 10, BLUE), gem(36, 96, 7, GOLD, BLACK, 1.8),
        gem(70, 14, 5, BLACK), gem(132, 118, 5.5, GREEN), gem(126, 12, 4.5, GOLD), gem(66, 118, 4.5, RED),
        f'<circle cx="24" cy="64" r="3" fill="{GREEN}"/><circle cx="178" cy="62" r="3" fill="{GOLD}"/>',
        f'<circle cx="98" cy="128" r="2.6" fill="{BLUE}"/><circle cx="100" cy="6" r="2.6" fill="{RED}"/>',
    ]
    return svg(200, 134, "".join(body), label, width_css)


# ---------------------------------------------------------------- drawings
def _book(x, y, w, h, cover, rot=0, label_box=True):
    cx, cy = x + w / 2, y + h / 2
    out = [f'<g transform="rotate({rot} {cx:g} {cy:g})">',
           f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{cover}" stroke="{BLACK}" stroke-width="{SW}"/>',
           f'<rect x="{x + 10}" y="{y + 5}" width="{w - 14}" height="{h - 10}" rx="2" fill="{WHITE}" stroke="{BLACK}" stroke-width="1.4"/>',
           f'<path d="M{x + 14} {y + h / 2 - 2.5}H{x + w - 8}M{x + 14} {y + h / 2 + 2.5}H{x + w - 8}" stroke="{PALE}" stroke-width="1.2"/>']
    out.append("</g>")
    return "".join(out)


def _pencil(x, y, length, rot):
    return (f'<g transform="rotate({rot} {x} {y})">'
            f'<rect x="{x}" y="{y - 5}" width="{length}" height="10" rx="1.5" fill="{GOLD}" stroke="{BLACK}" stroke-width="1.8"/>'
            f'<path d="M{x} {y - 5}L{x - 13} {y}L{x} {y + 5}Z" fill="{SAND}" stroke="{BLACK}" stroke-width="1.8" stroke-linejoin="round"/>'
            f'<path d="M{x - 8.5} {y - 1.7}L{x - 13} {y}L{x - 8.5} {y + 1.7}Z" fill="{BLACK}"/>'
            f'<rect x="{x + length}" y="{y - 5}" width="7" height="10" fill="{PALE}" stroke="{BLACK}" stroke-width="1.8"/>'
            f'<rect x="{x + length + 7}" y="{y - 5}" width="9" height="10" rx="3" fill="{RED}" stroke="{BLACK}" stroke-width="1.8"/>'
            f'</g>')


def _protea(cx, base_y):
    """a king protea in a jam jar: a wide bowl of pointed pink bracts round a pale dome"""
    fx, fy = cx, base_y - 70  # where the bracts meet
    back, front = [], []
    for ang, ln in ((-84, 22), (-63, 27), (-42, 30), (-21, 31), (0, 31), (21, 31), (42, 30), (63, 27), (84, 22)):
        p = (f'<path transform="rotate({ang} {fx} {fy})" d="M{fx - 5.5} {fy}C{fx - 6} {fy - ln * 0.5} {fx - 2.5} {fy - ln * 0.86} {fx} {fy - ln}'
             f'C{fx + 2.5} {fy - ln * 0.86} {fx + 6} {fy - ln * 0.5} {fx + 5.5} {fy}Z" fill="{PINK}" stroke="{BLACK}" stroke-width="1.4" stroke-linejoin="round"/>')
        (front if abs(ang) > 50 else back).append(p)
    dots = "".join(f'<circle cx="{fx + dx}" cy="{fy + dy}" r="1.1" fill="{RED_TEXT}" fill-opacity="0.55"/>'
                   for dx, dy in ((-4, -9), (1, -13), (5, -8), (-5, -3), (0, -6), (5, -2), (-2, -17)))
    return "".join([
        f'<path d="M{cx} {base_y - 30}V{fy + 4}" stroke="{GREEN}" stroke-width="3" stroke-linecap="round"/>',
        f'<path d="M{cx} {base_y - 38}c-11-1-18-7-21-15 10-1 17 5 21 15z" fill="{GREEN}" stroke="{BLACK}" stroke-width="1.2"/>',
        f'<path d="M{cx} {base_y - 46}c10-2 16-9 18-17-9 0-15 6-18 17z" fill="{GREEN}" stroke="{BLACK}" stroke-width="1.2"/>',
        *back,
        f'<path d="M{fx - 10} {fy + 1}C{fx - 10} {fy - 14} {fx - 6} {fy - 22} {fx} {fy - 22}C{fx + 6} {fy - 22} {fx + 10} {fy - 14} {fx + 10} {fy + 1}Z" fill="#FBE6DF" stroke="{BLACK}" stroke-width="1.5"/>',
        dots,
        *front,
        f'<path d="M{fx - 17} {fy - 3}Q{fx} {fy + 12} {fx + 17} {fy - 3}Q{fx} {fy + 4} {fx - 17} {fy - 3}Z" fill="{PINK}" stroke="{BLACK}" stroke-width="1.4" stroke-linejoin="round"/>',
        f'<path d="M{cx - 15} {base_y - 20}h30v14a8 8 0 0 1-8 8h-14a8 8 0 0 1-8-8z" fill="{GREENT}"/>',
        f'<path d="M{cx - 15} {base_y - 32}h30v26a8 8 0 0 1-8 8h-14a8 8 0 0 1-8-8z" fill="none" stroke="{BLACK}" stroke-width="{SW}" stroke-linejoin="round"/>',
        f'<rect x="{cx - 17}" y="{base_y - 36}" width="34" height="6" rx="2" fill="{GOLD}" stroke="{BLACK}" stroke-width="1.8"/>',
    ])


def ill_welcome(width_css="100%"):
    """two exercise books, a pencil, the gem rising, a bead bookmark and a protea in a jar"""
    b = [f'<ellipse cx="116" cy="138" rx="104" ry="7" fill="{SAND}"/>',
         _book(30, 108, 150, 26, GREEN, -2),
         _book(44, 84, 128, 24, GOLD, 2.5),
         f'<path d="M150 86V122" stroke="{BLACK}" stroke-width="1.2"/>',
         gem(150, 101, 3.6, GREEN), gem(150, 108.5, 3.6, GOLD, BLACK, 1), gem(150, 116, 3.6, RED), gem(150, 123.5, 3.6, BLUE),
         gem(104, 40, 24, GOLD, BLACK, SW, hi=True),
         gem(62, 26, 6, GREEN), gem(146, 22, 5, RED), gem(140, 54, 4, BLUE), gem(78, 58, 3.5, BLACK),
         f'<circle cx="124" cy="10" r="2.6" fill="{GOLD}"/><circle cx="48" cy="52" r="2.4" fill="{RED}"/>',
         _protea(204, 136)]
    return svg(240, 150, "".join(b), None, width_css)


def ill_chalkboard(width_css="100%"):
    """a new class: a green chalkboard with the class name and a chalk gem"""
    b = [f'<ellipse cx="120" cy="140" rx="96" ry="6" fill="{SAND}"/>',
         f'<path d="M64 118L52 140M176 118L188 140" stroke="{BLACK}" stroke-width="{SW}" stroke-linecap="round"/>',
         f'<rect x="26" y="10" width="188" height="112" rx="8" fill="{SAND}" stroke="{BLACK}" stroke-width="{SW}"/>',
         f'<rect x="36" y="20" width="168" height="92" rx="4" fill="{GREEN}"/>',
         f'<text x="60" y="78" font-family="Outfit, system-ui, sans-serif" font-size="40" font-weight="700" fill="{WHITE}" fill-opacity="0.92">6A</text>',
         gem(150, 50, 15, "none", WHITE, 2.4),
         f'<path d="M136 86l7 7 14-15" stroke="{WHITE}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.9"/>',
         f'<circle cx="186" cy="34" r="2" fill="{WHITE}" fill-opacity="0.7"/><circle cx="52" cy="98" r="1.6" fill="{WHITE}" fill-opacity="0.6"/>',
         f'<rect x="30" y="118" width="180" height="8" rx="3" fill="{SAND}" stroke="{BLACK}" stroke-width="{SW}"/>',
         f'<rect x="58" y="113" width="18" height="6" rx="2" fill="{WHITE}" stroke="{BLACK}" stroke-width="1.4"/>',
         f'<rect x="150" y="109" width="28" height="10" rx="2.5" fill="{GOLD}" stroke="{BLACK}" stroke-width="1.6"/>',
         f'<rect x="150" y="109" width="28" height="4" rx="2" fill="{BLACK}"/>']
    return svg(240, 150, "".join(b), None, width_css)


def _paper(x, y, w, h, rot, rows=5, marks=None):
    cx, cy = x + w / 2, y + h / 2
    out = [f'<g transform="rotate({rot} {cx:g} {cy:g})">',
           f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="{WHITE}" stroke="{BLACK}" stroke-width="{SW}"/>',
           f'<rect x="{x + 12}" y="{y + 12}" width="{w * 0.45:g}" height="6" rx="3" fill="{BLACK}"/>']
    gap = (h - 36) / rows
    for i in range(rows):
        yy = y + 32 + i * gap
        out.append(f'<rect x="{x + 12}" y="{yy:g}" width="{w * (0.32 + 0.08 * (i % 3)):g}" height="5" rx="2.5" fill="{PALE}"/>')
        out.append(f'<path d="M{x + w * 0.62:g} {yy + 4:g}c3-6 5-6 6-1s4 4 6-1 4-4 6 0" stroke="{PEN}" stroke-width="1.6" fill="none" stroke-linecap="round"/>')
        if marks and i < len(marks):
            mx = x + w - 12
            if marks[i] == "t":
                out.append(f'<path d="M{mx - 6:g} {yy + 2:g}l3 3.4 6-7" stroke="{GREEN}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
            elif marks[i] == "x":
                out.append(f'<path d="M{mx - 5:g} {yy - 2:g}l7 7M{mx + 2:g} {yy - 2:g}l-7 7" stroke="{RED}" stroke-width="2.4" stroke-linecap="round"/>')
    out.append("</g>")
    return "".join(out)


def ill_reading(width_css="100%"):
    """Jemma reads a paper: a green reading band and a lens with a tick"""
    b = [f'<ellipse cx="120" cy="140" rx="90" ry="6" fill="{SAND}"/>',
         _paper(62, 12, 104, 124, -4, 5, "ttxt"),
         f'<g transform="rotate(-4 114 74)"><rect x="56" y="62" width="116" height="20" rx="4" fill="{GREEN}" fill-opacity="0.16"/></g>',
         f'<path d="M184 104l20 20" stroke="{BLACK}" stroke-width="7" stroke-linecap="round"/>',
         f'<path d="M184 104l20 20" stroke="{GOLD}" stroke-width="3.6" stroke-linecap="round"/>',
         f'<circle cx="168" cy="88" r="22" fill="{GREENT}" fill-opacity="0.9" stroke="{BLACK}" stroke-width="{SW}"/>',
         f'<path d="M158 88l7 7 12-14" stroke="{GREEN}" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
         gem(44, 40, 8, GOLD, BLACK, 1.8), gem(30, 64, 4, GREEN), gem(206, 28, 5, RED), gem(196, 50, 3.5, BLUE)]
    return svg(240, 150, "".join(b), None, width_css)


def ill_oops(width_css="100%"):
    """a torn page with a plaster on it: something broke, nothing is lost"""
    torn = ("M66 14H160a5 5 0 0 1 5 5V96l-9 6 8 7-9 6 9 7-8 6V131a5 5 0 0 1-5 5H66a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5Z")
    b = [f'<ellipse cx="120" cy="141" rx="92" ry="6" fill="{SAND}"/>',
         f'<path d="{torn}" fill="{WHITE}" stroke="{BLACK}" stroke-width="{SW}" stroke-linejoin="round"/>',
         f'<rect x="74" y="26" width="48" height="6" rx="3" fill="{BLACK}"/>',
         f'<rect x="74" y="46" width="36" height="5" rx="2.5" fill="{PALE}"/><rect x="74" y="62" width="44" height="5" rx="2.5" fill="{PALE}"/>'
         f'<rect x="74" y="78" width="30" height="5" rx="2.5" fill="{PALE}"/><rect x="74" y="94" width="40" height="5" rx="2.5" fill="{PALE}"/>',
         f'<path d="M120 50c3-6 5-6 6-1s4 4 6-1 4-4 6 0M120 66c3-6 5-6 6-1s4 4 6-1" stroke="{PEN}" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
         f'<path d="M172 98l-7 7 8 6-8 7 8 6-7 7v5a5 5 0 0 0 5 5h26a5 5 0 0 0 5-5V103a5 5 0 0 0-5-5Z" fill="{WHITE}" stroke="{BLACK}" stroke-width="{SW}" stroke-linejoin="round" transform="rotate(8 186 120)"/>',
         f'<g transform="rotate(-24 160 112)"><rect x="128" y="102" width="66" height="22" rx="11" fill="#F6D9A8" stroke="{BLACK}" stroke-width="{SW}"/>'
         f'<rect x="150" y="104" width="22" height="18" rx="3" fill="#EEC384"/>'
         f'<circle cx="138" cy="110" r="1.3" fill="{SUB}"/><circle cx="138" cy="116" r="1.3" fill="{SUB}"/><circle cx="143" cy="113" r="1.3" fill="{SUB}"/>'
         f'<circle cx="184" cy="110" r="1.3" fill="{SUB}"/><circle cx="184" cy="116" r="1.3" fill="{SUB}"/><circle cx="179" cy="113" r="1.3" fill="{SUB}"/></g>',
         gem(40, 34, 9, GOLD, BLACK, 1.8), gem(206, 30, 5, GREEN), gem(26, 60, 3.5, RED)]
    return svg(240, 150, "".join(b), None, width_css)


def ill_night(width_css="100%"):
    """nothing tonight: a moon, gem stars, a closed book and a cup of rooibos"""
    b = [f'<ellipse cx="120" cy="140" rx="100" ry="6" fill="{SAND}"/>',
         f'<path d="M58 14a26 26 0 1 0 28 40 21 21 0 1 1-28-40z" fill="{GOLD}" stroke="{BLACK}" stroke-width="{SW}" stroke-linejoin="round"/>',
         gem(118, 20, 6, GREEN), gem(150, 40, 4.5, RED), gem(184, 18, 7, GOLD, BLACK, 1.6), gem(206, 48, 4, BLUE), gem(98, 52, 3.5, BLACK),
         f'<circle cx="140" cy="12" r="2.2" fill="{GOLD}"/><circle cx="224" cy="26" r="2" fill="{GREEN}"/>',
         _book(34, 104, 128, 28, GREEN, -1.5),
         _pencil(64, 98, 60, 4),
         f'<path d="M186 96h30v28a10 10 0 0 1-10 10h-10a10 10 0 0 1-10-10z" fill="{WHITE}" stroke="{BLACK}" stroke-width="{SW}" stroke-linejoin="round"/>',
         f'<path d="M216 104h4a7 7 0 0 1 0 14h-4" fill="none" stroke="{BLACK}" stroke-width="{SW}"/>',
         f'<rect x="186" y="108" width="30" height="7" fill="{RED}"/>',
         f'<path d="M186 96h30v28a10 10 0 0 1-10 10h-10a10 10 0 0 1-10-10z" fill="none" stroke="{BLACK}" stroke-width="{SW}" stroke-linejoin="round"/>',
         f'<path d="M196 88c-4-5 4-8 0-14M206 88c-4-5 4-8 0-14" stroke="{GREY}" stroke-width="2" fill="none" stroke-linecap="round"/>']
    return svg(240, 150, "".join(b), None, width_css)


def _phone(x, y, w, h, screen_fill=WHITE):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{BLACK}"/>'
            f'<rect x="{x + 5}" y="{y + 9}" width="{w - 10}" height="{h - 18}" rx="6" fill="{screen_fill}"/>')


def _bead_string(points, cols=(GREEN, GOLD, RED, BLUE, BLACK, GOLD), r=4.2):
    return "".join(gem(round(x, 1), round(y, 1), r, cols[i % len(cols)]) for i, (x, y) in enumerate(points))


def _curve(p0, p1, p2, n):
    pts = []
    for i in range(n):
        t = (i + 1) / (n + 1)
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    return pts


def ill_link(width_css="100%", clock=True):
    """two phones joined by a string of beads: a parent and a teacher, linking"""
    b = [f'<ellipse cx="120" cy="141" rx="100" ry="6" fill="{SAND}"/>',
         _phone(22, 30, 58, 104),
         f'<circle cx="51" cy="66" r="11" fill="{GOLD}"/><rect x="36" y="84" width="30" height="5" rx="2.5" fill="{PALE}"/>'
         f'<rect x="40" y="94" width="22" height="5" rx="2.5" fill="{PALE}"/>',
         _phone(160, 30, 58, 104),
         f'<rect x="170" y="52" width="38" height="24" rx="5" fill="{GREENT}"/>'
         f'<path d="M181 64l5 5 10-11" stroke="{GREEN}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
         f'<rect x="172" y="86" width="34" height="5" rx="2.5" fill="{PALE}"/><rect x="176" y="96" width="26" height="5" rx="2.5" fill="{PALE}"/>',
         f'<path d="M80 92Q120 132 160 92" stroke="{BLACK}" stroke-width="1.2" fill="none"/>',
         _bead_string(_curve((80, 92), (120, 132), (160, 92), 9)),
         gem(120, 22, 7, GOLD, BLACK, 1.6), gem(100, 40, 3.5, GREEN), gem(140, 40, 3.5, RED)]
    if clock:
        b.append(f'<circle cx="120" cy="66" r="13" fill="{WHITE}" stroke="{BLACK}" stroke-width="{SW}"/>'
                 f'<path d="M120 58v8l6 4" stroke="{BLACK}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    return svg(240, 150, "".join(b), None, width_css)


def ill_desktop(width_css="100%"):
    """the teacher's laptop helper is asleep: a laptop with a moon on its screen, the plug out"""
    b = [f'<ellipse cx="120" cy="140" rx="104" ry="6" fill="{SAND}"/>',
         f'<rect x="50" y="22" width="132" height="88" rx="8" fill="{BLACK}"/>',
         f'<rect x="57" y="29" width="118" height="74" rx="4" fill="{SAND}"/>',
         f'<path d="M108 48a14 14 0 1 0 15 22 11.5 11.5 0 1 1-15-22z" fill="{GOLD}" stroke="{BLACK}" stroke-width="1.8" stroke-linejoin="round"/>',
         gem(138, 52, 5, GREEN), gem(146, 76, 3.5, RED), gem(90, 84, 3, BLUE),
         f'<path d="M36 110h160l-10 16H46z" fill="{PALE}" stroke="{BLACK}" stroke-width="{SW}" stroke-linejoin="round"/>',
         f'<rect x="100" y="114" width="32" height="5" rx="2.5" fill="{WHITE}"/>',
         f'<path d="M196 118c14 0 18 10 30 10" stroke="{BLACK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
         f'<rect x="206" y="88" width="16" height="22" rx="4" fill="{WHITE}" stroke="{BLACK}" stroke-width="{SW}"/>',
         f'<path d="M210 88v-8M218 88v-8" stroke="{BLACK}" stroke-width="2.4" stroke-linecap="round"/>',
         f'<path d="M214 110v6c0 6-6 6-6 10" stroke="{BLACK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>']
    return svg(240, 150, "".join(b), None, width_css)


DRAWINGS = {
    "welcome": ill_welcome, "chalkboard": ill_chalkboard, "reading": ill_reading, "oops": ill_oops,
    "night": ill_night, "link": ill_link, "desktop": ill_desktop,
}
