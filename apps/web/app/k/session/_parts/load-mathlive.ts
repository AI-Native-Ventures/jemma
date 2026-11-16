// P146: the maths editor is one module, loaded on demand. A question with several boxes starts one editor for each box in the same moment: they share the one
// load, so the module is asked for once. A load that failed is forgotten, so the next box asks again (a dropped connection is not remembered).

let loading: Promise<typeof import('mathlive')> | null = null

export function loadMathlive(): Promise<typeof import('mathlive')> {
  loading ??= import('mathlive').catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}
