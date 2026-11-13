import { describe, expect, it } from 'vitest'
import { swScope } from '@/lib/pwa/registration'

// Android confie les notifications à l'appli installée dont la portée couvre le service worker : une portée par appli.
describe('portée du service worker', () => {
  it("appli enseignant : /admin (comme la portée de son manifeste)", () => { expect(swScope('admin')).toBe('/admin') })
  it('appli élève : /', () => { expect(swScope('eleve')).toBe('/') })
})
