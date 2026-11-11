import { describe, expect, it } from 'vitest'
import { decide } from '@/lib/auth/routing'
import type { AdminClaims, StudentClaims } from '@/lib/auth/jwt'

const prof: AdminClaims = { teacherId: 't', username: 'p', role: 'prof' }
const admin: AdminClaims = { ...prof, role: 'admin' }
const eleve: StudentClaims = { studentId: 's' }

describe('decide — espace admin', () => {
  it('envoie un anonyme vers la connexion', () => {
    expect(decide('/admin', null, null)).toEqual({ redirect: '/admin/login' })
    expect(decide('/admin/demandes', null, eleve)).toEqual({ redirect: '/admin/login' })
  })
  it('laisse passer les pages publiques', () => {
    for (const p of ['/admin/login', '/admin/demande-compte', '/admin/deconnexion'])
      expect(decide(p, null, null)).toBeNull()
  })
  it('les anciennes pages de mot de passe ne sont plus publiques', () => {
    for (const p of ['/admin/mot-de-passe-oublie', '/admin/changer-mot-de-passe'])
      expect(decide(p, null, null)).toEqual({ redirect: '/admin/login' })
    expect(decide('/admin', prof, null)).toBeNull()
    expect(decide('/admin/deconnexion', prof, null)).toBeNull()
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
    expect(decide('/deconnexion', null, null)).toBeNull()
  })
  it('renvoie un élève connecté vers son parcours', () => {
    expect(decide('/connexion', null, eleve)).toEqual({ redirect: '/' })
    expect(decide('/', null, eleve)).toBeNull()
  })
  it('les anciennes pages de mot de passe ne sont plus publiques', () => {
    for (const p of ['/premiere-connexion', '/nouveau-mot-de-passe']) expect(decide(p, null, null)).toEqual({ redirect: '/connexion' })
  })
})

describe('decide — connexion (/auth/*)', () => {
  it('laisse passer /auth/* sans session ou avec une session', () => {
    for (const p of ['/auth/google/eleve', '/auth/google/enseignant', '/auth/google/callback', '/auth/dev']) {
      expect(decide(p, null, null)).toBeNull()
      expect(decide(p, prof, eleve)).toBeNull()
    }
  })
  it("n'ouvre pas pour autant un chemin voisin", () => {
    expect(decide('/authentification', null, null)).toEqual({ redirect: '/connexion' })
  })
})

describe('decide — règles de confidentialité', () => {
  it('lisibles par tous, connecté ou non', () => {
    expect(decide('/confidentialite', null, null)).toBeNull()
    expect(decide('/confidentialite', null, { studentId: 's1' })).toBeNull()
    expect(decide('/confidentialite', { teacherId: 't1', username: 'prof.exemple', role: 'prof' }, null)).toBeNull()
  })
})
