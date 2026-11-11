import { describe, expect, it } from 'vitest'
import { decide } from '@/lib/auth/routing'
import type { AdminClaims, StudentClaims } from '@/lib/auth/jwt'

const prof: AdminClaims = { teacherId: 't', username: 'p', role: 'prof', mustChangePassword: false }
const admin: AdminClaims = { ...prof, role: 'admin' }
const eleve: StudentClaims = { studentId: 's', mustChangePassword: false }

describe('decide — espace admin', () => {
  it('envoie un anonyme vers la connexion', () => {
    expect(decide('/admin', null, null)).toEqual({ redirect: '/admin/login' })
    expect(decide('/admin/demandes', null, eleve)).toEqual({ redirect: '/admin/login' })
  })
  it('laisse passer les pages publiques', () => {
    for (const p of ['/admin/login', '/admin/demande-compte', '/admin/mot-de-passe-oublie', '/admin/deconnexion'])
      expect(decide(p, null, null)).toBeNull()
  })
  it('force le changement de mot de passe', () => {
    const c = { ...prof, mustChangePassword: true }
    expect(decide('/admin', c, null)).toEqual({ redirect: '/admin/changer-mot-de-passe' })
    expect(decide('/admin/changer-mot-de-passe', c, null)).toBeNull()
    expect(decide('/admin/deconnexion', c, null)).toBeNull()
  })
  it("renvoie un connecté de la page de connexion vers l'accueil admin", () => {
    expect(decide('/admin/login', prof, null)).toEqual({ redirect: '/admin' })
  })
  it("réserve les pages d'administration à l'admin", () => {
    expect(decide('/admin/demandes', prof, null)).toEqual({ redirect: '/admin' })
    expect(decide('/admin/enseignants', prof, null)).toEqual({ redirect: '/admin' })
    expect(decide('/admin/demandes', admin, null)).toBeNull()
  })
})

describe('decide — espace élève', () => {
  it('envoie un anonyme vers /connexion', () => {
    expect(decide('/', null, null)).toEqual({ redirect: '/connexion' })
    expect(decide('/profil', null, null)).toEqual({ redirect: '/connexion' })
  })
  it('une session enseignant ne vaut pas session élève', () => {
    expect(decide('/profil', admin, null)).toEqual({ redirect: '/connexion' })
  })
  it('l’appli élève reste côté élève, même pour un enseignant connecté (l’appli prof a sa propre entrée)', () => {
    expect(decide('/', admin, null)).toEqual({ redirect: '/connexion' })
  })
  it('laisse passer les pages publiques élève', () => {
    expect(decide('/connexion', null, null)).toBeNull()
    expect(decide('/premiere-connexion', null, null)).toBeNull()
    expect(decide('/deconnexion', null, null)).toBeNull()
  })
  it('renvoie un élève connecté vers son parcours', () => {
    expect(decide('/connexion', null, eleve)).toEqual({ redirect: '/' })
    expect(decide('/premiere-connexion', null, eleve)).toEqual({ redirect: '/' })
  })
  it('force le changement de mot de passe élève', () => {
    const c = { ...eleve, mustChangePassword: true }
    expect(decide('/', null, c)).toEqual({ redirect: '/nouveau-mot-de-passe' })
    expect(decide('/nouveau-mot-de-passe', null, c)).toBeNull()
  })
  it('bloque /nouveau-mot-de-passe sans session', () => {
    expect(decide('/nouveau-mot-de-passe', null, null)).toEqual({ redirect: '/connexion' })
  })
})
