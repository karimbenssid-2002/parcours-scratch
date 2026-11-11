import { describe, expect, it } from 'vitest'
import { parseTheme } from '@/lib/ui/theme'

describe('parseTheme', () => {
  it('accepte « light » et « dark »', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
  })
  it('ignore toute autre valeur : le système décide', () => {
    for (const v of [undefined, '', 'DARK', 'auto', 'dark;']) expect(parseTheme(v)).toBeUndefined()
  })
})
