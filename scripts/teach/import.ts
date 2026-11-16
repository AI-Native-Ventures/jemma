import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { TopicLessonsSchema } from '@jemma/profiling/schemas'
import { REPO_ROOT } from './topics'

/**
 * Prints one SQL transaction that puts every ready lesson of content/lessons into `topic_lessons`. It does not connect to anything: the
 * coordinator runs the output with psql on the right project. Re-running it is safe: a lesson is updated in place (same grade, base name,
 * position and version), never doubled.
 */

const TAG = '$jemma$'

/** A text as a dollar-quoted SQL string. Quotes, backslashes and $$ inside it need no escaping; the tag itself, or a NUL character, cannot be carried. */
export function dollarQuote(text: string): string {
  // `(text + TAG).indexOf(TAG)` is where the quote would end: only at the very end is safe (a text ending in "$jemma" would close the quote early).
  if ((text + TAG).indexOf(TAG) !== text.length) throw new Error(`a text holds the tag ${TAG}, it cannot be quoted`)
  if (text.includes(String.fromCharCode(0))) throw new Error('a text holds a NUL character, Postgres cannot store it')
  return `${TAG}${text}${TAG}`
}

const json = (value: unknown) => {
  const text = JSON.stringify(value)
  // JSON.stringify writes a NUL character as the six characters \u0000, and jsonb refuses that.
  if (text.includes('\\u0000')) throw new Error('a lesson holds a NUL character, jsonb cannot store it')
  return `${dollarQuote(text)}::jsonb`
}

export function buildImportSql(root = REPO_ROOT, opts: { version?: number } = {}): { sql: string; lessons: number; topics: number } {
  const version = opts.version ?? 1
  const base = join(root, 'content/lessons')
  const grades = existsSync(base) ? readdirSync(base).filter((d) => /^grade-\d+$/.test(d)).sort((a, b) => Number(a.slice(6)) - Number(b.slice(6))) : []
  const statements: string[] = []
  let topics = 0
  for (const grade of grades) {
    for (const name of readdirSync(join(base, grade)).filter((f) => f.endsWith('.json')).sort()) {
      const parsed = TopicLessonsSchema.safeParse(JSON.parse(readFileSync(join(base, grade, name), 'utf8')))
      if (!parsed.success) throw new Error(`${grade}/${name} is not a valid topic file: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`)
      const file = parsed.data
      const ready = file.lessons.filter((l) => file.status.find((s) => s.position === l.position)?.status === 'ready')
      if (ready.length === 0) continue
      topics += 1
      for (const lesson of ready) {
        const status = file.status.find((s) => s.position === lesson.position)!
        const checks = { problems: status.problems, writer: status.writer, reviewer: status.reviewer, generatedAt: file.generatedAt, checked: 'code and a second model' }
        statements.push(
          `insert into topic_lessons (grade, base_name, family, position, title, content, source, status, checks, model, version) values (${file.grade}, ${dollarQuote(file.baseName)}, ${dollarQuote(file.family)}, ${lesson.position}, ${dollarQuote(lesson.title)}, ${json(lesson)}, ${json(file.source)}, 'ready', ${json(checks)}, ${dollarQuote(status.writer || 'unknown')}, ${version}) ` +
            'on conflict (grade, base_name, position, version) do update set family = excluded.family, title = excluded.title, content = excluded.content, source = excluded.source, status = excluded.status, checks = excluded.checks, model = excluded.model;',
        )
      }
    }
  }
  return { sql: `begin;\n${statements.join('\n')}${statements.length ? '\n' : ''}commit;\n`, lessons: statements.length, topics }
}

export function main(argv = process.argv.slice(2)): void {
  const { values } = parseArgs({ args: argv, options: { version: { type: 'string' } }, allowPositionals: false })
  const { sql, lessons, topics } = buildImportSql(REPO_ROOT, { version: values.version ? Number(values.version) : 1 })
  process.stdout.write(sql)
  console.error(`-- ${lessons} lessons of ${topics} topics`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
