import { InstallPrompt } from '@/components/install'

export const metadata = { title: 'Install Jemma' }

const bar = { display: 'block', borderRadius: 999, background: '#DCDAE8', height: 26 } as const
const block = (height: number) => ({ display: 'block', height, borderRadius: 18, background: '#FFFFFF', border: '1px solid #E7E6EF' }) as const

/** The install sheet over a dimmed, empty child "Today", as drawn on board `install-prompt`. */
export default function InstallPage() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 10px 6px 12px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 38, height: 38, borderRadius: 999, background: '#FFD3C7', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</span>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: 19, fontWeight: 700 }}>Amina</span>
            <span style={{ fontSize: 13, color: '#5D5A73' }}>Grade 6 · Hillview Primary</span>
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 6 }}>
          <span style={{ width: 30, height: 30, borderRadius: 10, background: '#E9E7F3' }} />
          <span style={{ width: 30, height: 30, borderRadius: 10, background: '#E9E7F3' }} />
        </span>
      </header>
      <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 20px' }}>
        <span style={{ ...bar, width: 300 }} />
        <span style={{ ...bar, width: 240 }} />
        <span style={block(96)} />
        <span style={block(200)} />
        <span style={block(140)} />
      </div>
      <InstallPrompt forceOpen />
    </div>
  )
}
