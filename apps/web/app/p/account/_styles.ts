import type { CSSProperties } from 'react'

export const outlineButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 56,
  padding: '12px 20px',
  textAlign: 'center',
  textWrap: 'balance',
  borderRadius: 14,
  border: '1.5px solid #1F1D36',
  background: '#FFFFFF',
  color: '#1F1D36',
  fontSize: 16,
  fontWeight: 600,
}

export const dangerButton: CSSProperties = { ...outlineButton, gap: 0, border: '1.5px solid #B8381F', color: '#B8381F' }
