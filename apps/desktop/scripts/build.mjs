// Bundles the Electron main and preload into dist/ (everything but electron itself, so the packaged app needs no node_modules),
// and copies the plain pages and the job prompts the runner reads.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
rmSync(join(root, 'dist'), { recursive: true, force: true })
mkdirSync(join(root, 'dist'), { recursive: true })

await build({
  entryPoints: { main: join(root, 'src/main.ts'), preload: join(root, 'src/preload.ts') },
  outdir: join(root, 'dist'),
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  loader: { '.md': 'text' },
  define: { 'process.env.JEMMA_DEFAULT_WEB_URL': JSON.stringify(process.env.JEMMA_DEFAULT_WEB_URL ?? 'http://localhost:3000') },
  logLevel: 'warning',
})

cpSync(join(root, 'src/pages'), join(root, 'dist/pages'), { recursive: true })
cpSync(join(root, 'assets'), join(root, 'dist/assets'), { recursive: true })
const jobs = join(root, '../../packages/profiling/src/jobs')
mkdirSync(join(root, 'dist/jobs'), { recursive: true })
for (const f of readdirSync(jobs)) if (f.endsWith('.md')) cpSync(join(jobs, f), join(root, 'dist/jobs', f))
