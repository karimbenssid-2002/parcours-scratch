import { describe, expect, it } from 'vitest'
import { loginErrorMessage, loginPath, logoutHint } from '@/lib/auth/login-errors'

describe('rappel après déconnexion', () => {
  it('seulement avec ?deconnexion=1 ; tutoiement côté élève, vouvoiement côté enseignant', () => {
    expect(logoutHint('eleve', '1')).toBe('Sur un ordinateur partagé, déconnecte-toi aussi de ton compte Google.')
    expect(logoutHint('enseignant', '1')).toBe('Sur un ordinateur partagé, déconnectez-vous aussi de votre compte Google.')
    for (const v of [undefined, '', '0', ['1', '1'], 'oui']) {
      expect(logoutHint('eleve', v)).toBeNull()
      expect(logoutHint('enseignant', v)).toBeNull()
    }
  })
})

describe('messages de connexion', () => {
  it('élève : messages exacts (tutoiement)', () => {
    expect(loginErrorMessage('eleve', 'non-inscrit')).toBe("Ton professeur ne t'a pas encore inscrit.")
    expect(loginErrorMessage('eleve', 'domaine')).toBe('Utilise ton adresse du collège.')
    expect(loginErrorMessage('eleve', 'expire')).toBe('La connexion a expiré, recommence.')
  })

  it('enseignant : messages exacts (vouvoiement)', () => {
    expect(loginErrorMessage('enseignant', 'en-attente')).toBe('Votre inscription est en cours de validation.')
    expect(loginErrorMessage('enseignant', 'aucun')).toBe('Aucun compte enseignant actif pour cette adresse.')
    expect(loginErrorMessage('enseignant', 'domaine')).toBe('Utilisez votre adresse du collège (@malraux-rabat.org ou @mlfmonde.org).')
  })

  it('code inconnu, absent ou étranger au rôle → aucun message', () => {
    expect(loginErrorMessage('eleve', undefined)).toBeNull()
    expect(loginErrorMessage('eleve', '<script>')).toBeNull()
    expect(loginErrorMessage('eleve', ['expire'])).toBeNull()
    expect(loginErrorMessage('eleve', 'en-attente')).toBeNull()
    expect(loginErrorMessage('enseignant', 'non-inscrit')).toBeNull()
  })

  it('chemins des pages', () => {
    expect(loginPath('eleve')).toBe('/connexion')
    expect(loginPath('enseignant', 'aucun')).toBe('/admin/login?erreur=aucun')
  })
})
