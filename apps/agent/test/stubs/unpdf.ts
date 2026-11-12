// A stand-in for `unpdf` (PDF.js) in the agent tests that never read a PDF (the `agent` project, vitest.config.ts).
// The Worker imports PDF.js for the curriculum reader. PDF.js is 1.7 MB of code, and Vitest sends every module it already knows
// of to a Worker that starts in one WebSocket message: with PDF.js in it the message is too large for workerd (error 1009) and
// the Worker dies. The test that really reads a PDF in workerd is in its own project (vitest.pdf.config.ts) and uses the real one.
const stub = (): never => {
  throw new Error('unpdf is a stand-in in this test project: a test that reads a PDF belongs to the agent-pdf project (vitest.pdf.config.ts)')
}

export const getDocumentProxy = stub
export const extractText = stub
