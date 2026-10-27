// Node module hooks: `import x from './job.md'` and `'./job.md?raw'` give the file's text, like the
// wrangler Text rule in the agent worker and the vitest plugin do. Lets tsx scripts load the job prompts.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function load(url, context, next) {
  const clean = url.split('?')[0]
  if (clean.endsWith('.md')) {
    return { format: 'module', shortCircuit: true, source: `export default ${JSON.stringify(readFileSync(fileURLToPath(clean), 'utf8'))}` }
  }
  return next(url, context)
}
