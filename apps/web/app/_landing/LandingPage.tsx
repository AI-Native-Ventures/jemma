import { Audiences } from './Audiences'
import { BeadHem } from './Bits'
import { Closing } from './Closing'
import { Footer } from './Footer'
import { Header } from './Header'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import { Maths } from './Maths'
import { Plans } from './Plans'
import { Rules } from './Rules'
import { WhyHard } from './WhyHard'

/**
 * The landing page at "/". It talks to a learner: learn maths until you understand it. Every section is its own component with its own file,
 * so the page can be restyled later (from a design) without changing its structure: the bead hem and the Header, then Hero, HowItWorks, WhyHard,
 * Maths, Audiences, Plans, Rules and Closing, then the Footer, in this order. Light theme only, phone first.
 */
export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-ground font-sans text-ink">
      <BeadHem id="hem-top" />
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <WhyHard />
        <Maths />
        <Audiences />
        <Plans />
        <Rules />
        <Closing />
      </main>
      <Footer />
    </div>
  )
}
