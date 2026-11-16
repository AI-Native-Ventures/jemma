import katex from 'katex'

/** One line of LaTeX as KaTeX HTML, drawn on the server or in the browser (no network, no script at all), or null when KaTeX cannot draw it. */
export function katexHtml(latex: string): string | null {
  try {
    // throwOnError is on so that any error comes back as null (the text is then drawn as it was typed) and never as KaTeX's red error text.
    return katex.renderToString(latex, { throwOnError: true, output: 'html', displayMode: false, strict: 'ignore' })
  } catch {
    return null
  }
}
