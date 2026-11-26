/**
 * P187: how Jemma writes the numbers and points it makes itself (a point it labels, a number in a picture, a decimal it works out, the example in a hint), by
 * the country of the learner's space. In South Africa, and every country but the US: a decimal comma and a semicolon between the two numbers of a point,
 * 2,5 and (2; 3). In the US: a decimal point and a comma, 2.5 and (2, 3). What a learner types is read either way (meaning.ts), and the keys and the stored
 * answers keep their own writing. Pure.
 */
export type Notation = 'za' | 'us'

/** The notation of a country (a two-letter code, as a space stores it): the US one for the US, the South African one for every other country. */
export const notationOf = (country: string | null | undefined): Notation => ((country ?? '').trim().toUpperCase() === 'US' ? 'us' : 'za')

/**
 * A text Jemma wrote the South African way, as the notation writes it. For the US a decimal comma (a comma between two digits) is a decimal point, and the
 * semicolon between the two numbers of a point is a comma: "(1,5 ; −2)" is "(1.5, −2)". For South Africa the text comes back the very same.
 */
export function inNotation(text: string, n: Notation): string {
  if (n !== 'us' || !text) return text
  return text.replace(/(\d),(\d)/g, '$1.$2').replace(/\(([^();]*?)\s*;\s*([^();]*?)\)/g, '($1, $2)')
}

/** A number as the notation writes it, to at most six decimals: 2,5 or 2.5. */
export function numberIn(v: number, n: Notation): string {
  const s = String(Math.round(v * 1e6) / 1e6)
  return n === 'us' ? s : s.replace('.', ',')
}

/** A point as the notation writes it, from its two numbers as written: (2; 3) or (2, 3). */
export const pointIn = (x: string, y: string, n: Notation): string => (n === 'us' ? `(${x}, ${y})` : `(${x}; ${y})`)

/** How a hint says to write a decimal, with its example: "with a comma, like 0,5" or "with a decimal point, like 0.5". */
export const decimalWords = (n: Notation): string => (n === 'us' ? 'with a decimal point, like 0.5' : 'with a comma, like 0,5')
