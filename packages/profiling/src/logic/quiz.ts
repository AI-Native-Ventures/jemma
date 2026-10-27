type Level = 1 | 2 | 3

export function nextDifficulty(
  current: Level,
  results: boolean[],
): { next: Level; adapted: 'easier' | 'harder' | null } {
  let level: Level = current
  let streak = 0
  let adapted: 'easier' | 'harder' | null = null
  for (const right of results) {
    if (!right) {
      streak = 0
      if (level > 1) {
        level = (level - 1) as Level
        adapted = 'easier'
      }
    } else if (++streak === 2) {
      streak = 0
      if (level < 3) {
        level = (level + 1) as Level
        adapted = 'harder'
      }
    }
  }
  return { next: level, adapted }
}
