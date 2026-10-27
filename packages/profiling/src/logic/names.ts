const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

/** True when the edit distance between a and b is at most 1. */
function withinOne(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

export function matchName(
  read: string,
  roster: { id: string; name: string }[],
): { childId: string | null; confidence: number } {
  const r = norm(read)
  const none = { childId: null, confidence: 0 }
  if (!r) return none
  const forms = roster.map((c) => {
    const full = norm(c.name)
    return { id: c.id, full, first: full.split(' ')[0]! }
  })
  const exact = forms.filter((f) => f.first === r || f.full === r)
  if (exact.length === 1) return { childId: exact[0]!.id, confidence: 1 }
  if (exact.length > 1) return none
  const near = forms.filter((f) => withinOne(r, f.first) || withinOne(r, f.full))
  if (near.length === 1) return { childId: near[0]!.id, confidence: 0.85 }
  return none
}
