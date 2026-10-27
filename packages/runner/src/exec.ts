import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/** Where a desktop app finds the CLIs when launched from Finder with a short PATH. */
export function defaultExtraDirs(): string[] {
  return [join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']
}

/** Finds an executable on PATH (read at call time), then in the extra dirs. Never the shell function. */
export function findBin(name: string, extraDirs: string[] = defaultExtraDirs()): string | null {
  const dirs = [...(process.env.PATH ?? '').split(delimiter), ...extraDirs].filter(Boolean)
  for (const dir of dirs) {
    const file = join(dir, name)
    try {
      accessSync(file, constants.X_OK)
      return file
    } catch {
      // keep looking
    }
  }
  return null
}

export type ExecResult = { code: number | null; stdout: string; stderr: string }

/** Runs a short command and collects its output. Never throws. */
export function exec(bin: string, args: string[], timeoutMs = 10_000): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 4_000_000 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? ((err as NodeJS.ErrnoException).code as unknown as number) : 1) : 0
      resolve({ code, stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

/** Kills a detached child and everything it started. */
export function killTree(child: ChildProcess): void {
  if (!child.pid) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
}

export { spawn }
