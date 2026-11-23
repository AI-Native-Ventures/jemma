#!/usr/bin/env python3
"""Jemma app code: from coral and ink to South African colours, with the same roles as the design canvas.
usage: code_sa.py <repo_root>
It ran on develop at 3ce6b9c (15 Nov) and again at cd88e10 (23 Nov). It is safe to run again: a change that is already made, or whose
line has moved on, is skipped and listed at the end under "SKIPPED" for a person to check.
Roles: green is go (confirm buttons, picked, done ticks, finished steps, switches that are on, the line being read),
gold is the gem (gems, bright buttons, fills, the one thing to look at), red is the red pen (wrong answers, alerts),
black is the words. Colours only, no flag."""
import os, re, sys, glob

ROOT = sys.argv[1]
WEB = os.path.join(ROOT, "apps/web")
LOG = []
SKIPPED = []


def rd(p):
    return open(p, encoding="utf-8").read()


def wr(p, t):
    open(p, "w", encoding="utf-8").write(t)


def edit(rel, old, new, count=1, base=WEB):
    """One exact change. The code moves on, so a line that is gone is skipped and listed, never an error."""
    p = os.path.join(base, rel)
    if not os.path.exists(p):
        SKIPPED.append(f"{rel}: the file is gone ({old[:60]!r})")
        return
    t = rd(p)
    n = t.count(old)
    if n == 0:
        if new not in t:
            SKIPPED.append(f"{rel}: not found: {old[:90]!r}  ->  {new[:70]!r}")
        return
    wr(p, t.replace(old, new))
    LOG.append(f"{rel}: {old[:40]!r} x{n}" + ("" if n == count else f" (expected {count})"))


def files(base, exts=(".tsx", ".ts", ".css", ".mjs")):
    out = []
    for d in ("app", "components", "lib", "test", "e2e"):
        for p in glob.glob(os.path.join(base, d, "**", "*"), recursive=True):
            if p.endswith(exts) and "node_modules" not in p:
                out.append(p)
    return out


# ---------------------------------------------------------------- 1. the tokens
GLOBALS = os.path.join(WEB, "app/globals.css")
g = rd(GLOBALS)
old_theme = g[g.index("@theme static {"):g.index("--font-sans")]
ALREADY = "--color-coral" not in old_theme
new_theme = """@theme static {
  /* South African colours. Green is go, gold is the gem, black is the words, red is the red pen, blue is the pen you write with. */
  --color-ink: #161616;
  --color-body: #5c5a55;
  --color-muted: #5f5d58;
  --color-muted-2: #8f8d88;
  --color-green: #007749;
  --color-green-deep: #005c38;
  --color-green-tint: #ddefe6;
  --color-gold: #ffb81c;
  --color-gold-deep: #e3a008;
  --color-gold-tint: #ffedc6;
  --color-gold-soft: #ffe3a8;
  --color-gold-wash: #fff8e8;
  --color-red: #e03c31;
  --color-red-text: #b8281e;
  --color-blue: #001489;
  --color-ground: #f8f6f1;
  --color-card: #ffffff;
  --color-line: #e8e5de;
  --color-soft: #f0eee8;
  --color-soft-2: #f4f2ee;
  --color-soft-3: #ece9e2;
  --color-soft-4: #efece6;
  --color-navy: #12308c;
  --color-edge: #d2cfc7;

  """
if not ALREADY:
    g = g.replace(old_theme, new_theme)
    wr(GLOBALS, g)
    LOG.append("globals.css: South African tokens")

# ---------------------------------------------------------------- 2. roles that need a colour other than the plain swap
# coral things that are not gold
edit("app/t/[classId]/needs-you/[itemId]/page.tsx", "border-[3px] border-coral shadow", "border-[3px] border-gold shadow")  # the answer Jemma is unsure about
edit("app/t/[classId]/papers/[paperId]/PhotoViewer.tsx", "outline-coral", "outline-gold")
edit("app/t/[classId]/papers/[paperId]/fix/FixMark.tsx", "'border-2 border-coral'", "'border-2 border-red'")  # wrong answers
edit("app/t/[classId]/papers/[paperId]/fix/FixMark.tsx", "rounded-[4px] border-2 border-coral", "rounded-[4px] border-2 border-red")
edit("app/k/session/_parts/Results.tsx", "border-[1.5px] border-coral bg-[#FFF1ED]", "border-[1.5px] border-green bg-green-tint")  # the right answer
qs = "app/k/session/_parts/QuestionScreen.tsx"
t = rd(os.path.join(WEB, qs))
n = t.count("border-[3px] border-coral text-") + t.count("border-[3px] border-coral bg-card")
t = t.replace("border-[3px] border-coral text-", "border-[3px] border-green text-").replace("border-[3px] border-coral bg-card", "border-[3px] border-green bg-card")
t = t.replace('className="border-[3px] border-coral text-[34px]"', 'className="border-[3px] border-green text-[34px]"')
wr(os.path.join(WEB, qs), t)
LOG.append(f"{qs}: answer boxes green x{n}+")

for rel, old, new in [
    ("app/(auth)/sign-up/SignUpForm.tsx", ".cb:focus-visible + .cbx{outline:3px solid #FF6A4D", ".cb:focus-visible + .cbx{outline:3px solid #007749"),
    ("app/(auth)/sign-up/SignUpForm.tsx", ".cb:checked + .cbx{background:#1F1D36;border-color:#1F1D36}", ".cb:checked + .cbx{background:#007749;border-color:#007749}"),
    ("app/p/[childId]/snap/[paperId]/ReadingScreen.tsx", "outline: '2px solid #FF6A4D', outlineOffset: 3, background: 'rgba(255,106,77,0.12)'", "outline: '2px solid #007749', outlineOffset: 3, background: 'rgba(0,119,73,0.10)'"),
    ("components/questions/AnswerBox.tsx", "border: '3px solid #FF6A4D'", "border: '3px solid #007749'"),
    ("app/t/[classId]/curriculum/map/MapLaptop.tsx", "border: '1.5px solid #FF6A4D'", "border: '1.5px solid #007749'"),
    ("app/p/[childId]/papers/[paperId]/flag/page.tsx", "border: '2px solid #FF6A4D'", "border: '2px solid #E03C31'"),
    ("app/p/[childId]/papers/_parts.tsx", "border: miss ? '2px solid #FF6A4D'", "border: miss ? '2px solid #E03C31'"),
    ("app/p/[childId]/papers/_parts.tsx", "highlight ? { background: '#FFF4F1', outline: '2px solid #FF6A4D'", "highlight ? { background: '#FFF8E8', outline: '2px solid #FFB81C'"),
    ("app/p/[childId]/tests/_laptop.tsx", "border:${miss ? '2px solid #FF6A4D'", "border:${miss ? '2px solid #E03C31'"),
    ("app/p/[childId]/tests/_laptop.tsx", "highlight ? { background: '#FFF4F1', outline: '2px solid #FF6A4D'", "highlight ? { background: '#FFF8E8', outline: '2px solid #FFB81C'"),
]:
    edit(rel, old, new)
edit("app/t/[classId]/curriculum/map/MapLaptop.tsx", "border: '2px solid #FF6A4D'", "border: '2px solid #007749'", 2)
edit("app/p/[childId]/snap/photo/PhotoScreen.tsx", "'4px solid #FF6A4D'", "'4px solid #007749'", 2)

# spinners and rings that move: green, like the canvas
for p in files(WEB, (".tsx",)):
    t = rd(p)
    t2 = t.replace('stroke="#FF6A4D"', 'stroke="#007749"')
    if t2 != t:
        wr(p, t2)
        LOG.append(f"{os.path.relpath(p, WEB)}: spinner green")

# ---------------------------------------------------------------- 3. black that turns green: confirm buttons, picked chips, done ticks, finished steps
SIZE = re.compile(r"(?<![\w-])(min-h-\[52px\]|min-h-14|min-h-12|min-h-11|min-h-\[60px\]|min-h-\[68px\]|min-h-\[56px\]|h-\[52px\]|h-11|h-12|h-\[46px\]|h-\[68px\]|h-\[60px\])(?![\w-])")
KEEP_BLACK = {("app/t/[classId]/papers/[paperId]/fix/FixMark.tsx", "const toggle")}  # Right and Wrong stay black: green must not mean wrong
green_lines = 0
for p in files(WEB, (".tsx", ".ts")):
    rel = os.path.relpath(p, WEB)
    if rel.startswith(("test/", "e2e/")):
        continue
    lines = rd(p).split("\n")
    changed = False
    for i, line in enumerate(lines):
        if not re.search(r"(?<![\w-])bg-ink(?![\w/-])", line) or "text-white" not in line or not SIZE.search(line):
            continue
        if any(rel == f and k in line for f, k in KEEP_BLACK):
            continue
        new = re.sub(r"(?<![\w-])border-ink bg-ink(?![\w/-])", "border-green bg-green", line)
        new = re.sub(r"(?<![\w-])border-\[3px\] border-ink bg-ink(?![\w/-])", "border-[3px] border-green bg-green", new)
        new = re.sub(r"(?<![\w-])bg-ink(?![\w/-])", "bg-green", new)
        if new != line:
            lines[i] = new
            changed = True
            green_lines += 1
    if changed:
        wr(p, "\n".join(lines))
LOG.append(f"green buttons and chips (lines): {green_lines}")

for rel, old, new, n in [
    ("components/ui/Button.tsx", "primary: 'bg-ink text-white font-semibold'", "primary: 'bg-green text-white font-semibold'", 1),
    ("app/k/maths/GradeChips.tsx", "const on = `${chip} bg-ink text-white`", "const on = `${chip} bg-green text-white`", 1),
    ("app/k/WorkspaceSwitch.tsx", "const filled = `${base} border-[1.5px] border-ink bg-ink text-white`", "const filled = `${base} border-[1.5px] border-green bg-green text-white`", 1),
    ("app/k/session/_parts/QuestionScreen.tsx", "on ? 'border-[3px] border-ink bg-ink text-white'", "on ? 'border-[3px] border-green bg-green text-white'", 1),
    ("app/k/done/HoldToOpen.tsx", "rounded-pill border-0 bg-ink p-0 text-white", "rounded-pill border-0 bg-green p-0 text-white", 1),
    ("app/t/[classId]/settings/SettingsClient.tsx", 'className="relative h-[30px] w-[50px] flex-none rounded-pill bg-ink"', 'className="relative h-[30px] w-[50px] flex-none rounded-pill bg-green"', 1),
    ("app/p/account/_ui.tsx", "width: 50, height: 30, flex: 'none', borderRadius: 999, background: '#1F1D36'", "width: 50, height: 30, flex: 'none', borderRadius: 999, background: '#007749'", 1),
    # done ticks
    ("app/t/onboarding/OnboardingForm.tsx", 'className="flex size-[26px] items-center justify-center rounded-pill bg-ink"', 'className="flex size-[26px] items-center justify-center rounded-pill bg-green"', 1),
    ("app/t/[classId]/needs-you/[itemId]/NamePicker.tsx", 'className="flex size-[26px] items-center justify-center rounded-pill bg-ink"', 'className="flex size-[26px] items-center justify-center rounded-pill bg-green"', 1),
    ("app/t/[classId]/year-end/YearEnd.tsx", 'className="flex size-[26px] flex-none items-center justify-center rounded-pill bg-ink"', 'className="flex size-[26px] flex-none items-center justify-center rounded-pill bg-green"', 2),
    ("app/t/[classId]/snap/[testId]/papers/LaptopSnap.tsx", 'className="flex size-7 flex-none items-center justify-center rounded-pill bg-ink"', 'className="flex size-7 flex-none items-center justify-center rounded-pill bg-green"', 1),
    ("app/t/new/[classId]/page.tsx", 'className="flex size-[30px] flex-none items-center justify-center rounded-pill bg-ink"', 'className="flex size-[30px] flex-none items-center justify-center rounded-pill bg-green"', 1),
    ("app/k/session/_parts/Status.tsx", 'className="flex size-8 items-center justify-center rounded-pill bg-ink"', 'className="flex size-8 items-center justify-center rounded-pill bg-green"', 1),
    ("app/p/[childId]/snap/[paperId]/ReadingScreen.tsx", 'className="flex size-7 flex-none items-center justify-center rounded-full bg-ink"', 'className="flex size-7 flex-none items-center justify-center rounded-full bg-green"', 1),
    ("app/p/[childId]/snap/SnapKindPicker.tsx", 'rounded-full bg-ink">{tick(14, 3', 'rounded-full bg-green">{tick(14, 3', 1),
    ("app/p/[childId]/snap/[paperId]/saved/page.tsx", 'className="flex size-14 items-center justify-center rounded-18 bg-ink"', 'className="flex size-14 items-center justify-center rounded-18 bg-green"', 1),
    # finished steps
    ("app/k/session/_parts/StepHeader.tsx", "state === 'past' ? 'bg-ink'", "state === 'past' ? 'bg-green'", 1),
    ("app/demo/switch/page.tsx", "n < demo.step ? 'bg-ink'", "n < demo.step ? 'bg-green'", 1),
    ("app/k/session/_parts/LearnCards.tsx", "i < card ? 'w-2 bg-ink'", "i < card ? 'w-2 bg-green'", 1),
    ("app/t/[classId]/snap/[testId]/key/page.tsx", '<span className="h-1 rounded-pill bg-ink" />', '<span className="h-1 rounded-pill bg-green" />', 1),
]:
    edit(rel, old, new, n)

# inline-styled confirm buttons: black, white words, 44 px or taller, square-ish corners
INLINE_BTN = re.compile(r"background: ?(?:'#1F1D36'|ink\b)|background:#1F1D36")
INLINE_SIZE = re.compile(r"(?:\bheight: ?(?:4[4-9]|5\d|6\d)\b|minHeight: ?(?:4[4-9]|5\d|6\d)\b|(?:min-)?height:(?:4[4-9]|5\d|6\d)px|padding: ?'1[02]px 20px'|padding:1[02]px 20px)")
inline_n = 0
for p in files(WEB, (".tsx",)):
    rel = os.path.relpath(p, WEB)
    lines = rd(p).split("\n")
    changed = False
    for i, line in enumerate(lines):
        if not INLINE_BTN.search(line) or not re.search(r"color: ?'#FFFFFF'|color:#FFFFFF", line) or not INLINE_SIZE.search(line):
            continue
        if re.search(r"borderRadius: ?999|border-radius:999px", line):
            continue
        new = line.replace("background: '#1F1D36'", "background: '#007749'").replace("background:#1F1D36", "background:#007749")
        new = re.sub(r"background: ?ink\b", "background: '#007749'", new)
        if new != line:
            lines[i] = new
            changed = True
            inline_n += 1
    if changed:
        wr(p, "\n".join(lines))
LOG.append(f"inline confirm buttons: {inline_n}")
edit("app/p/[childId]/activities/new/ActivityForm.tsx", "const ON = 'border:none;background:#1F1D36;color:#FFFFFF'", "const ON = 'border:none;background:#007749;color:#FFFFFF'")
edit("app/p/[childId]/papers/[paperId]/flag/page.tsx", "...btn, border: 'none', background: '#1F1D36'", "...btn, border: 'none', background: '#007749'")
edit("app/(auth)/_parts.tsx", "  background: colors.ink,", "  background: colors.green,")
for rel in ("app/(auth)/_parts.tsx", "app/p/account/_ui.tsx"):
    edit(rel, "coral: '#FF6A4D', coralText: '#B8381F' }", "gold: '#FFB81C', redText: '#B8281E', green: '#007749' }")
for p in files(WEB, (".tsx", ".ts")):
    t = rd(p)
    t2 = re.sub(r"\bcolors\.coralText\b", "colors.redText", t)
    t2 = re.sub(r"\bcolors\.coral\b", "colors.gold", t2)
    if t2 != t:
        wr(p, t2)
        LOG.append(f"{os.path.relpath(p, WEB)}: colors.coral renamed")

# ---------------------------------------------------------------- 4. diagrams: lines to look at are green, fills gold
sh = "components/diagrams/shared.tsx"
t = rd(os.path.join(WEB, sh))
t = t.replace("export const INK = '#1F1D36'\nexport const CORAL = '#FF6A4D'\nexport const CORAL_TEXT = '#B8381F'\nexport const CORAL_TINT = '#FFE3DA'\nexport const CORAL_SOFT = '#FFD3C7'\nexport const BODY = '#5D5A73'\nexport const SOFT = '#F4F3F8'\nexport const SOFT_3 = '#E9E7F3'\nexport const EDGE = '#CFCDDC'",
              "export const INK = '#161616'\nexport const GOLD = '#FFB81C'\nexport const GREEN = '#007749'\nexport const RED_TEXT = '#B8281E'\nexport const GOLD_TINT = '#FFEDC6'\nexport const GOLD_SOFT = '#FFE3A8'\nexport const BODY = '#5C5A55'\nexport const SOFT = '#F4F2EE'\nexport const SOFT_3 = '#ECE9E2'\nexport const EDGE = '#D2CFC7'")
if "GREEN = '#007749'" in t:
    wr(os.path.join(WEB, sh), t)
else:
    SKIPPED.append(f"{sh}: the colour constants at the top have changed, set them by hand")
for p in glob.glob(os.path.join(WEB, "components/diagrams/*.tsx")) + glob.glob(os.path.join(WEB, "components/questions/*.tsx")) + glob.glob(os.path.join(WEB, "app/**/*.tsx"), recursive=True):
    t = rd(p)
    if "CORAL" not in t:
        continue
    t2 = t
    if "stroke={CORAL}" in t2:
        t2 = t2.replace("stroke={CORAL}", "stroke={GREEN}")
        t2 = re.sub(r"import \{([^}]*)\bCORAL\b", lambda m: "import {" + m.group(1) + "CORAL, GREEN", t2, count=1)
    t2 = re.sub(r"\bCORAL_TEXT\b", "RED_TEXT", t2)
    t2 = re.sub(r"\bCORAL_TINT\b", "GOLD_TINT", t2)
    t2 = re.sub(r"\bCORAL_SOFT\b", "GOLD_SOFT", t2)
    t2 = re.sub(r"\bCORAL\b", "GOLD", t2)
    if t2 != t:
        wr(p, t2)
        LOG.append(f"{os.path.relpath(p, WEB)}: diagram colours")

# ---------------------------------------------------------------- 5. component tones named after the old colour
edit("components/ui/Button.tsx", "export type ButtonVariant = 'primary' | 'secondary' | 'coral' | 'link'", "export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'link'")
edit("components/ui/Button.tsx", "  coral: 'bg-coral text-ink font-bold',", "  gold: 'bg-gold text-ink font-bold',")
edit("components/ui/Card.tsx", "export type CardTone = 'plain' | 'coral' | 'ink'", "export type CardTone = 'plain' | 'gold' | 'ink'")
edit("components/ui/Card.tsx", "  coral: 'bg-coral-wash border border-[#FFC9BB]',", "  gold: 'bg-gold-wash border border-[#FFDC93]',")
edit("components/ui/Pill.tsx", "export type PillTone = 'soft' | 'coral' | 'ink' | 'danger' | 'quiet'", "export type PillTone = 'soft' | 'gold' | 'ink' | 'danger' | 'quiet'")
edit("components/ui/Pill.tsx", "  coral: 'bg-coral-tint text-ink',", "  gold: 'bg-gold-tint text-ink',")
for p in files(WEB, (".tsx",)):
    t = rd(p)
    t2 = re.sub(r'\b(variant|tone)="coral"', r'\1="gold"', t)
    t2 = re.sub(r"(tone=\{[^}]*?)'coral'", r"\1'gold'", t2)
    if t2 != t:
        wr(p, t2)
        LOG.append(f"{os.path.relpath(p, WEB)}: tone coral -> gold")

# ---------------------------------------------------------------- 6. class names: coral becomes gold, coral-text becomes red-text
PFX = r"((?:[a-z0-9-]+:|\[[^\]]+\]:)*)"
UTIL = r"(bg|text|border|outline|ring|fill|stroke|from|to|via|accent|decoration|divide|shadow|caret|placeholder)"
cls_n = 0
STORY = {"test/p86-old-kinds-pinned.test.tsx"}  # its comment tells the story of the change in the old words: leave them
for p in files(WEB, (".tsx", ".ts", ".css")):
    if os.path.relpath(p, WEB) in STORY:
        continue
    t = rd(p)
    t2 = re.sub(r"(?<![\w-])" + PFX + UTIL + r"-coral-text(?![\w-])", r"\1\2-red-text", t)
    t2 = re.sub(r"(?<![\w-])" + PFX + UTIL + r"-coral-(tint|soft|wash)(?![\w-])", r"\1\2-gold-\3", t2)
    t2 = re.sub(r"(?<![\w-])" + PFX + UTIL + r"-coral(?![\w-])", r"\1\2-gold", t2)
    if t2 != t:
        cls_n += 1
        wr(p, t2)
LOG.append(f"class renames in {cls_n} files")

# ---------------------------------------------------------------- 7. every other hex: the same table as the canvas
HEX = {
    "#1F1D36": "#161616", "#FF6A4D": "#FFB81C", "#E8553A": "#E3A008", "#B8381F": "#B8281E", "#121022": "#0E0E0E",
    "#3A3757": "#2E2E2E", "#4A4766": "#3F3E3B", "#4A4762": "#3F3E3B", "#6A6782": "#5F5D58", "#6B6888": "#66645F",
    "#5D5A73": "#5C5A55", "#8C89A3": "#8F8D88", "#BDBACD": "#BEBBB3", "#CFCDDC": "#D2CFC7", "#C9C6DA": "#CBC8C1",
    "#D6D4E2": "#D9D6CE", "#D6D4E3": "#D9D6CE", "#D7D5E4": "#D9D6CE", "#DCDAE8": "#DEDBD3", "#E3E1EE": "#E6E3DC",
    "#E7E6EF": "#E8E5DE", "#E9E7F3": "#ECE9E2", "#EEEDF5": "#EFECE6", "#EFEEF4": "#F0EEE8", "#F4F3F8": "#F4F2EE",
    "#F7F7FA": "#F8F6F1", "#F7F6FB": "#F8F6F1",
    "#FFE3DA": "#FFEDC6", "#FFD3C7": "#FFE3A8", "#FFC9BB": "#FFDC93", "#FFF4F1": "#FFF8E8", "#FFEDE8": "#FFF3DA",
    "#FFF1ED": "#FFF6E2", "#E7A9A0": "#E8C27A",
    "#2F3A56": "#12308C",
    "#E9E8F0": "#EBE8E1", "#DCDBE6": "#DEDBD3", "#D3D1E0": "#D6D3CB", "#E4E3EC": "#E7E4DD",
}
RGBA = [(r"rgba\(31, ?29, ?54,", "rgba(22,22,22,"), (r"rgba\(18, ?16, ?34,", "rgba(14,14,14,"),
        (r"rgba\(255, ?106, ?77,", "rgba(255,184,28,"), (r"rgba\(70, ?70, ?90,", "rgba(60,60,58,")]


def swap_hex(t):
    def one(m):
        s = m.group(0)
        new = HEX.get(s.upper())
        if not new:
            return s
        lower = s == s.lower() and s != s.upper()
        return new.lower() if lower else new
    t = re.sub(r"#[0-9A-Fa-f]{6}\b", one, t)
    for a, b in RGBA:
        t = re.sub(a, b, t)
    return t


hex_n = 0
for p in files(WEB, (".tsx", ".ts", ".css")):
    rel = os.path.relpath(p, WEB)
    if rel.startswith(("test/", "e2e/")):
        continue
    t = rd(p)
    t2 = swap_hex(t)
    if t2 != t:
        hex_n += 1
        wr(p, t2)
LOG.append(f"hex swaps in {hex_n} files")

var_n = 0
for p in files(WEB, (".tsx", ".ts", ".css")):
    t = rd(p)
    t2 = t.replace("var(--color-coral-text)", "var(--color-red-text)")
    t2 = re.sub(r"var\(--color-coral-(tint|soft|wash)\)", r"var(--color-gold-\1)", t2)
    t2 = t2.replace("var(--color-coral)", "var(--color-gold)")
    if t2 != t:
        var_n += 1
        wr(p, t2)
LOG.append(f"CSS variables renamed in {var_n} files")

edit("app/manifest.ts", "theme_color: '#FFB81C'", "theme_color: '#007749'")

print("\n".join(LOG))
if SKIPPED:
    print("\nSKIPPED, for a person to check:")
    print("\n".join("  " + x for x in SKIPPED))
