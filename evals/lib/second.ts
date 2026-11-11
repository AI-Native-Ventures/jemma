import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseResult, type ResultFile } from './result'

/** Which folders of `evals/results` are runs, which one is the main run, and how the other ones are read. */

export type RunFolder = { name: string; taskIds: string[] }

const RESULT_FILE = /^(.+)-(\d+)\.json$/

/** The run folders in `root`, in name order. Rehearsals, hidden folders and loose files are not runs. */
export function listRunFolders(root: string): RunFolder[] {
  return readdirSync(root)
    .filter((name) => !name.startsWith('rehearsal-') && !name.startsWith('.') && statSync(join(root, name)).isDirectory())
    .sort()
    .map((name) => ({
      name,
      taskIds: [...new Set(readdirSync(join(root, name)).flatMap((file) => RESULT_FILE.exec(file)?.[1] ?? []))].sort(),
    }))
}

/**
 * The run that EVALS.md is about: the run id that was asked for, else the newest folder (by name) that has results for
 * every task. A folder that covers only some tasks, such as a one-task run on another model, is never the main run.
 */
export function chooseMainRun(folders: RunFolder[], taskIds: string[], explicit?: string): string {
  if (explicit) return explicit
  const runs = folders.filter((f) => !f.name.startsWith('rehearsal-'))
  const complete = runs.filter((f) => taskIds.every((id) => f.taskIds.includes(id))).map((f) => f.name).sort()
  const last = complete.at(-1)
  if (last) return last
  const best = [...runs].sort((a, b) => b.taskIds.length - a.taskIds.length)[0]
  throw new Error(
    best
      ? `no run folder covers every task. The closest, ${best.name}, has no result for: ${taskIds.filter((id) => !best.taskIds.includes(id)).join(', ')}. Name a run with --run.`
      : 'no run folder covers every task: there is no run folder in evals/results.',
  )
}

/** Every result file of a folder, with its stream file next to it. Refuses a file that holds another task or run. */
export function loadSecondRun(dir: string, runId: string): ResultFile[] {
  const found = readdirSync(dir)
    .flatMap((file) => {
      const m = RESULT_FILE.exec(file)
      return m ? [{ file, taskId: m[1]!, n: Number(m[2]) }] : []
    })
    .sort((a, b) => a.taskId.localeCompare(b.taskId) || a.n - b.n)
  const out: ResultFile[] = []
  for (const f of found) {
    const stream = f.file.replace(/\.json$/, '.jsonl')
    if (!existsSync(join(dir, stream))) throw new Error(`${runId}: the stream file ${stream} is missing`)
    const result = parseResult(readFileSync(join(dir, f.file), 'utf8'), join(dir, f.file))
    if (result.taskId !== f.taskId || result.n !== f.n) throw new Error(`${join(dir, f.file)}: holds task ${result.taskId} run ${result.n}`)
    out.push(result)
  }
  return out
}
