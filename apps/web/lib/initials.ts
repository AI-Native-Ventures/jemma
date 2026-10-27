/** Two letters for an avatar: first letters of the first two words ("Ms Banda" gives "MB", "Amina" gives "AM"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}
