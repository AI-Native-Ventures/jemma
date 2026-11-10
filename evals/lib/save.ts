import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertNoLeaks, clean } from './redact'
import { baseName, type ResultFile } from './result'
import { streamLines } from './stream'

export type SavedAttempt = { model: string; seconds: number; status: string; timedOut: boolean; saved: boolean; stdout: string }

/** Writes the stream and the result with every secret and local path taken out. A guard stops a leak that `clean` missed. */
export function saveResult(result: ResultFile, attempts: SavedAttempt[], secrets: string[], outDir: string, places: [string, string][]): ResultFile {
  mkdirSync(outDir, { recursive: true })
  const placed = places.filter(([from]) => from)
  const stream = clean(streamLines(attempts), secrets, placed)
  let scrubbed = stream.scrubbed
  let jsonText = ''
  for (let i = 0; i < 2; i++) {
    const cleaned = clean(JSON.stringify({ ...result, scrubbed }, null, 2), secrets, placed)
    scrubbed = scrubbed || cleaned.scrubbed
    jsonText = cleaned.text
  }
  let streamText = stream.text
  try {
    assertNoLeaks(streamText, secrets, 'stream')
    assertNoLeaks(jsonText, secrets, 'result')
  } catch (err) {
    streamText = JSON.stringify({ type: 'jemma_withheld', reason: err instanceof Error ? err.message : 'leak guard' }) + '\n'
    const withheld = { ...result, scrubbed: true, error: `${result.error ?? ''} saved text withheld by the leak guard`.trim(), pass: false }
    jsonText = clean(JSON.stringify(withheld, null, 2), secrets, placed).text
  }
  writeFileSync(join(outDir, result.stream), streamText)
  writeFileSync(join(outDir, `${baseName(result.taskId, result.n)}.json`), jsonText + '\n')
  return JSON.parse(jsonText) as ResultFile
}
