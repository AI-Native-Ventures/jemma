import { describe, expect, it } from 'vitest'
import { menuLines, progressText } from '../src/menu'
import { timeLeft } from '../src/status'

const labels = (l: ReturnType<typeof menuLines>) => l.map((x) => (x.type === 'separator' ? '---' : x.label))

describe('tray menu lines (board: desktop-menu)', () => {
  it('shows the job card, earlier jobs and the four actions while working', () => {
    const lines = menuLines({
      agentName: 'Claude Code',
      status: { kind: 'running', label: 'Reading 3 of 5 papers', done: 2, total: 5, className: '6B Mathematics', snappedAt: '15:40', timeLeft: 'About a minute left' },
      history: [
        { time: '14:14', text: "Planned tonight's lessons, 5 learners" },
        { time: '14:13', text: 'Wrote a 10 minute reteach' },
      ],
    })
    expect(labels(lines)).toEqual([
      'Jemma Desktop',
      'Claude Code · Working',
      '---',
      'Reading 3 of 5 papers',
      '6B Mathematics · snapped at 15:40',
      '▰▰▰▰▰▰▱▱▱▱',
      'About a minute left',
      '---',
      'Earlier today',
      "14:14  Planned tonight's lessons, 5 learners",
      '14:13  Wrote a 10 minute reteach',
      '---',
      'Pause Jemma',
      'Open Jemma',
      'Settings',
      '---',
      'Quit Jemma Desktop',
    ])
  })

  it('says Resume when paused and is off without an agent', () => {
    expect(labels(menuLines({ agentName: 'Codex', status: { kind: 'paused' }, history: [] }))).toContain('Resume Jemma')
    expect(labels(menuLines({ agentName: null, status: { kind: 'off' }, history: [] }))[1]).toBe('Jemma Desktop is off')
  })

  it('draws progress and estimates time left', () => {
    expect(progressText(3, 5)).toBe('▰▰▰▰▰▰▱▱▱▱')
    expect(timeLeft(3, 5, 90_000)).toBe('About a minute left')
    expect(timeLeft(1, 5, 120_000)).toBe('About 8 minutes left')
    expect(timeLeft(0, 5, 1000)).toBeNull()
  })
})
