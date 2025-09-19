import { describe, it, expect, beforeEach, vi } from 'vitest'
import { t } from '../i18n'


describe('i18n t()', () => {
  beforeEach(() => {
    ;(globalThis as any).browser = {
      i18n: {
        getMessage: vi.fn((key: string, subs?: string[]) => {
          if (key === 'auto_status') return `Auto capturing… ${subs?.[0]}/${subs?.[1]}`
          if (key === 'button_capture') return 'Capture'
          return ''
        })
      }
    }
  })

  it('returns localized string', () => {
    expect(t('button_capture')).toBe('Capture')
  })

  it('substitutes parameters', () => {
    expect(t('auto_status', [3, 10])).toBe('Auto capturing… 3/10')
  })

  it('falls back to key if missing', () => {
    expect(t('missing_key')).toBe('missing_key')
  })
})
