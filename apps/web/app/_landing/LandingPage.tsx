import { Audiences } from './Audiences'
import { Footer } from './Footer'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import { Rules } from './Rules'

/**
 * The landing page at "/". Every section is its own component with its own file, so the page can be restyled later (from a design) without
 * changing its structure: Hero, HowItWorks, Audiences, Rules and Footer, in this order. Light theme only, phone first.
 */
export function LandingPage() {
  return (
    <div className="min-h-dvh bg-ground font-sans text-ink">
      <main>
        <Hero />
        <HowItWorks />
        <Audiences />
        <Rules />
      </main>
      <Footer />
    </div>
  )
}
