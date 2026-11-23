/**
 * The made-up school (the demo copy at /demo, its sample papers, sample files and made-up learners) is for local runs and the automatic tests only.
 * `./start.sh` turns it on with `JEMMA_DEMO=1`, and the unit tests run with it on. The live app does not set it, so there /demo and /kit are not
 * found, no screen shows a demo part, and no demo action runs, even for a browser that still holds an old demo cookie.
 */
export function demoOn(): boolean {
  return process.env.JEMMA_DEMO === '1' || process.env.NODE_ENV === 'test'
}
