import type { Metadata } from 'next'
import { Kalam, Outfit } from 'next/font/google'
import { NavProgress } from '@/components/ui/NavProgress'
import { TagKeeper } from '@/components/TagKeeper'
// KaTeX's own stylesheet and its fonts, served from this app (the css url()s are rewritten to files of the build): no request to a CDN or any other site.
import 'katex/dist/katex.min.css'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-outfit' })
const kalam = Kalam({ subsets: ['latin'], weight: ['400'], variable: '--font-kalam' })

export const metadata: Metadata = {
  title: 'Jemma',
  description: 'Jemma teaches you a short lesson, marks your answers, and teaches again what you got wrong. Every lesson is free.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${kalam.variable}`}>
      <body>
        <NavProgress />
        <TagKeeper />
        {children}
      </body>
    </html>
  )
}
