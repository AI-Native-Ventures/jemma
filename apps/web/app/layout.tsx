import type { Metadata } from 'next'
import { Kalam, Outfit } from 'next/font/google'
import { NavProgress } from '@/components/ui/NavProgress'
// KaTeX's own stylesheet and its fonts, served from this app (the css url()s are rewritten to files of the build): no request to a CDN or any other site.
import 'katex/dist/katex.min.css'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-outfit' })
const kalam = Kalam({ subsets: ['latin'], weight: ['400'], variable: '--font-kalam' })

export const metadata: Metadata = {
  title: 'Jemma',
  description: 'Jemma learns how each child learns and helps teachers and parents act on it.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${kalam.variable}`}>
      <body>
        <NavProgress />
        {children}
      </body>
    </html>
  )
}
