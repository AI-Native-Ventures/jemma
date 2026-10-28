import type { Status } from './status'

export type MenuAction = 'pause' | 'open' | 'settings' | 'quit'
export type MenuLine = { type: 'separator' } | { type: 'text'; label: string } | { type: 'action'; label: string; action: MenuAction }
export type MenuInfo = {
  agentName: string | null
  status: Status
  /** Earlier jobs today, newest first, from the activity log. */
  history: { time: string; text: string }[]
}

const BAR = 10

/** `▰▰▰▰▰▰▱▱▱▱`: the board's progress bar as text, since a native menu cannot draw one. */
export function progressText(done: number, total: number): string {
  const filled = Math.max(0, Math.min(BAR, Math.round((done / total) * BAR)))
  return '▰'.repeat(filled) + '▱'.repeat(BAR - filled)
}

const WORD = { off: 'Jemma Desktop is off', ready: 'Ready', paused: 'Paused', running: 'Working', cant_run: "Can't run" } as const

/**
 * The tray menu's lines, in the order and words of the desktop-menu board. A native macOS menu has no icons
 * here, no bold, no progress bar and no cards, so the job card becomes plain disabled lines.
 */
export function menuLines(info: MenuInfo): MenuLine[] {
  const s = info.status
  const lines: MenuLine[] = [{ type: 'text', label: 'Jemma Desktop' }]
  lines.push({ type: 'text', label: s.kind === 'off' || !info.agentName ? WORD.off : `${info.agentName} · ${WORD[s.kind]}` })
  if (s.kind === 'running') {
    lines.push({ type: 'separator' }, { type: 'text', label: s.label })
    if (s.className && s.snappedAt) lines.push({ type: 'text', label: `${s.className} · snapped at ${s.snappedAt}` })
    if (s.total) lines.push({ type: 'text', label: progressText(Math.min((s.done ?? 0) + 1, s.total), s.total) })
    if (s.timeLeft) lines.push({ type: 'text', label: s.timeLeft })
  }
  if (s.kind === 'cant_run') lines.push({ type: 'separator' }, { type: 'text', label: s.reason })
  if (info.history.length) {
    lines.push({ type: 'separator' }, { type: 'text', label: 'Earlier today' })
    for (const h of info.history) lines.push({ type: 'text', label: `${h.time}  ${h.text}` })
  }
  lines.push({ type: 'separator' })
  lines.push({ type: 'action', label: s.kind === 'paused' ? 'Resume Jemma' : 'Pause Jemma', action: 'pause' })
  lines.push({ type: 'action', label: 'Open Jemma', action: 'open' })
  lines.push({ type: 'action', label: 'Settings', action: 'settings' })
  lines.push({ type: 'separator' })
  lines.push({ type: 'action', label: 'Quit Jemma Desktop', action: 'quit' })
  return lines
}
