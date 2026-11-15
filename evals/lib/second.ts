import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { LOCAL_FOLDER_PREFIX } from './args'
import { parseResult, type ResultFile } from './result'

/** Which folders of `evals/results` are runs, which one is the main run, and how the other ones are read. */

export type RunFolder = { name: string; taskIds: string[] }

const RESULT_FILE = /^(.+)-(\d+)\.json$/

/** A run on a model on this computer (Ollama): shown in its own section of EVALS.md, never as the main run or as a second model. */
export const isLocalRunFolder = (name: string): boolean => name.startsWith(LOCAL_FOLDER_PREFIX)

/** The run folders in `root`, in name order. Rehearsals, local runs, hidden folders and loose files are not runs. */
export function listRunFolders(root: string): RunFolder[] {
  return readdirSync(root)
    .filter((name) => !name.startsWith('rehearsal-') && !isLocalRunFolder(name) && !name.startsWith('.') && statSync(join(root, name)).isDirectory())
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
  const runs = folders.filter((f) => !f.name.startsWith('rehearsal-') && !isLocalRunFolder(f.name))
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

/** The folders of local runs in `root` (a model on this computer), in name order. */
export function listLocalRunFolders(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => isLocalRunFolder(name) && statSync(join(root, name)).isDirectory())
    .sort()
}

/** Every result of a local run folder. Refuses a result that is not from a local run: a folder named `local-` holds local runs only. */
export function loadLocalRun(dir: string, runId: string): ResultFile[] {
  return readdirSync(dir)
    .flatMap((file) => (RESULT_FILE.test(file) ? [file] : []))
    .sort()
    .map((file) => {
      const result = parseResult(readFileSync(join(dir, file), 'utf8'), join(dir, file))
      if (result.provider !== 'ollama') throw new Error(`${runId}/${file}: not a local run (its provider is ${result.provider ?? 'openrouter'}), but the folder is named local-`)
      return result
    })
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
