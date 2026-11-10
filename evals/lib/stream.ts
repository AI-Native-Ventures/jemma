/** For each tool (`server__tool`), the content types its answers carried in a goose stream: `text`, `image`. */
export function answerContentTypes(stdout: string): Record<string, string[]> {
  const names = new Map<string, string>()
  const seen: Record<string, Set<string>> = {}
  for (const line of stdout.split('\n')) {
    if (!line.trim().startsWith('{')) continue
    let ev: Record<string, any>
    try {
      ev = JSON.parse(line)
    } catch {
      continue
    }
    if (ev.type !== 'message' || !ev.message) continue
    for (const item of Array.isArray(ev.message.content) ? ev.message.content : []) {
      if (item?.type === 'toolRequest') {
        const value = item.toolCall?.status === 'success' ? item.toolCall.value : null
        if (typeof value?.name === 'string') names.set(String(item.id), value.name)
      } else if (item?.type === 'toolResponse') {
        const name = names.get(String(item.id))
        if (!name) continue
        const content = item.toolResult?.value?.content
        for (const c of Array.isArray(content) ? content : []) {
          if (typeof c?.type === 'string') (seen[name] ??= new Set()).add(c.type)
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(seen).map(([name, types]) => [name, [...types].sort()]))
}

/** The goose stream of each attempt as one saved file: a header line per attempt, then the JSON events. Banner lines are dropped. */
export function streamLines(attempts: { model: string; seconds: number; status: string; timedOut: boolean; saved: boolean; stdout: string }[]): string {
  const lines: string[] = []
  for (const a of attempts) {
    lines.push(JSON.stringify({ type: 'jemma_attempt', model: a.model, seconds: Number(a.seconds.toFixed(1)), status: a.status, timedOut: a.timedOut, saved: a.saved }))
    for (const line of a.stdout.split('\n')) if (line.trim().startsWith('{')) lines.push(line.replace(/"data":"[A-Za-z0-9+/=]{200,}"/g, (m) => `"data":"<${m.length - 9} characters of image data>"`))
  }
  return lines.join('\n') + '\n'
}
