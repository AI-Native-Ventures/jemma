import { Children, type ReactNode } from 'react'

/**
 * An icon and the words of a button as one centred group. The icon sits in the line of words, beside the first word, so when a long label
 * wraps to two lines the icon stays with the words and does not sit alone at the far edge of the button. The first word and the icon are kept
 * together, so the icon is never left at the end of a line. Put it as the only content of a button that centres its content.
 * The icon is only a picture: a screen reader gets the words.
 */
export function IconLabel({ icon, children, gap = 12 }: { icon: ReactNode; children: ReactNode; gap?: number }) {
  const nodes = Children.toArray(children)
  const head = nodes[0]
  let first: ReactNode = head
  let rest: ReactNode[] = nodes.slice(1)
  if (typeof head === 'string') {
    const space = head.indexOf(' ')
    first = space < 0 ? head : head.slice(0, space)
    rest = space < 0 ? rest : [head.slice(space), ...rest]
  }
  return (
    <span className="text-center text-balance">
      <span className="whitespace-nowrap">
        <span aria-hidden="true" className="inline-flex flex-none align-middle" style={{ marginRight: gap }}>
          {icon}
        </span>
        {first}
      </span>
      {rest}
    </span>
  )
}
