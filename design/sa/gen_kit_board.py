"""The kit board: the South African touches in one place, for the canvas and for whoever builds them."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

W, H = 1440, 1228
F = "Outfit, system-ui, -apple-system, 'Segoe UI', sans-serif"


def card(title, line, body, extra=""):
    return (f'<section style="display:flex;flex-direction:column;gap:14px;padding:24px;background:#FFFFFF;border:1px solid #E8E5DE;border-radius:24px;{extra}">'
            f'<h2 style="margin:0;font-size:24px;line-height:1.2;font-weight:700">{title}</h2>'
            f'<p style="margin:0;font-size:17px;line-height:1.45;color:#5C5A55">{line}</p>{body}</section>')


dots = "".join(kit.bead_dot(s, 22) for s in ("done", "done", "now", "next", "next"))
steps = "".join(
    f'<span style="display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:{"700" if c == kit.GOLD else "500"};color:#161616">'
    f'<span style="height:6px;border-radius:999px;background:{c}"></span>{w}</span>'
    for w, c in (("Warm-up", kit.GREEN), ("Learn", kit.GREEN), ("Try", kit.GOLD), ("Results", "#E6E3DC")))
beads_body = (f'<div style="display:flex;flex-direction:column;gap:18px">'
              f'<div style="display:flex;align-items:center;gap:10px">{dots}<span style="margin-left:8px;font-size:15px;color:#5C5A55">Question 3 of 5</span></div>'
              f'<div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:8px;max-width:100%">{steps}</div>'
              f'<div style="display:flex;align-items:center;gap:10px"><span style="width:28px;height:28px;border-radius:999px;background:{kit.GREEN};display:flex;align-items:center;justify-content:center">'
              f'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>'
              f'<span style="font-size:15px;color:#5C5A55">A done tick is green</span></div></div>')

drawings = [("welcome", "Sign in, and a new child"), ("chalkboard", "A new class"), ("reading", "Jemma is reading"),
            ("oops", "Something broke. Nothing is lost."), ("night", "Nothing tonight"), ("link", "Waiting for a yes")]
draw_cells = "".join(
    f'<figure style="margin:0;display:flex;flex-direction:column;gap:10px;padding:18px;background:#F8F6F1;border-radius:18px">'
    f'<div style="width:100%;max-width:300px;margin:0 auto">{kit.DRAWINGS[k]()}</div>'
    f'<figcaption style="font-size:16px;font-weight:600;text-align:center">{c}</figcaption></figure>' for k, c in drawings)

swatches = "".join(
    f'<span style="display:flex;align-items:center;gap:10px;font-size:15px"><span style="width:28px;height:28px;border-radius:8px;background:{c};border:1px solid #E6E3DC"></span>'
    f'<span><b style="font-weight:600">{n}</b> <span style="color:#5C5A55">{r}</span></span></span>'
    for c, n, r in ((kit.GREEN, "Green", "go, done, picked"), (kit.GOLD, "Gold", "the gem, bright buttons"), (kit.BLACK, "Black", "the words"),
                    (kit.RED, "Red", "the red pen"), (kit.BLUE, "Blue", "the pen you write with"), ("#FFFFFF", "White", "space")))

body = f"""<div style="width:{W}px;height:{H}px;background:#F8F6F1;font-family:{F};color:#161616;display:flex;flex-direction:column;gap:28px;padding:56px 56px 48px;overflow:hidden;position:relative">
  <header style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:24px">
    <div style="display:flex;flex-direction:column;gap:10px;max-width:760px">
      <div style="display:flex;gap:14px;align-items:flex-start">
        <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;margin-top:14px"><polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="{kit.GOLD}"/></svg>
        <h1 style="margin:0;font-size:52px;line-height:1.08;font-weight:700;letter-spacing:-0.02em">South African touches</h1>
      </div>
      <p style="margin:0;font-size:20px;line-height:1.45;color:#5C5A55">The same parts on every screen, in the app and on this canvas. Beads tie it together.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2, minmax(0, auto));gap:10px 28px">{swatches}</div>
  </header>
  <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:24px">
    {card("Beads for progress", "A bead for each question. Green is done, gold is now.", beads_body)}
    {card("The gem burst", "When you finish, the gem bursts.", f'<div style="display:flex;justify-content:center">{kit.gem_burst(width_css="220px")}</div>')}
    {card("The bead ring", "While a lesson gets ready. Fewer beads when it is slow.", f'<div style="display:flex;justify-content:center;gap:24px">{kit.bead_ring(7, width_css="130px")}{kit.bead_ring(3, paused=True, width_css="130px")}</div>')}
  </div>
  {card("Drawings", "For welcome, waiting, empty and error screens. They say the same as the words next to them.", f'<div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:16px">{draw_cells}</div>')}
</div>"""

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>South African touches</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>
body{{margin:0;background:#F8F6F1}}
*{{box-sizing:border-box}}
</style>
</helmet>
{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{W},"height":{H}}}}}'>
class Component extends DCLogic {{
  renderVals() {{
    return {{}};
  }}
}}
</script>
</body>
</html>
"""
out = sys.argv[1] if len(sys.argv) > 1 else "sa-kit.dc.html"
open(out, "w", encoding="utf-8").write(html)
print("wrote", out)
