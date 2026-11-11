import type { LoginKind } from '@/lib/auth/identity'

// Erreurs de connexion passées aux pages par `?erreur=<code>` (retour de Google, connexion de développement).
// Tutoiement côté élève, vouvoiement côté enseignant.

export const LOGIN_ERRORS = ['expire', 'domaine', 'non-verifiee', 'non-inscrit', 'en-attente', 'aucun', 'trop', 'echec'] as const
export type LoginError = (typeof LOGIN_ERRORS)[number]

const MESSAGES: Record<LoginKind, Partial<Record<LoginError, string>>> = {
  eleve: {
    expire: 'La connexion a expiré, recommence.',
    domaine: 'Utilise ton adresse du collège.',
    'non-verifiee': "Ton adresse n'est pas vérifiée par Google.",
    'non-inscrit': "Ton professeur ne t'a pas encore inscrit.",
    trop: 'Trop de tentatives. Réessaie dans 15 minutes.',
    echec: 'La connexion avec Google a échoué. Réessaie.',
  },
  enseignant: {
    expire: 'La connexion a expiré, recommencez.',
    domaine: 'Utilisez votre adresse du collège (@malraux-rabat.org ou @mlfmonde.org).',
    'non-verifiee': "Votre adresse n'est pas vérifiée par Google.",
    'en-attente': 'Votre inscription est en cours de validation.',
    aucun: 'Aucun compte enseignant actif pour cette adresse.',
    trop: 'Trop de tentatives. Réessayez dans 15 minutes.',
    echec: 'La connexion avec Google a échoué. Réessayez.',
  },
}

/** Message à afficher, ou null pour un code absent, inconnu ou étranger à ce rôle. */
export function loginErrorMessage(kind: LoginKind, code: unknown): string | null {
  if (typeof code !== 'string' || !(LOGIN_ERRORS as readonly string[]).includes(code)) return null
  return MESSAGES[kind][code as LoginError] ?? null
}

/** Page de connexion du rôle, avec le code d'erreur éventuel. */
export function loginPath(kind: LoginKind, error?: LoginError): string {
  const base = kind === 'eleve' ? '/connexion' : '/admin/login'
  return error ? `${base}?erreur=${error}` : base
}

/** Rappel pour ordinateur partagé, seulement après une déconnexion (`?deconnexion=1`, posé par les routes de déconnexion). */
export function logoutHint(kind: LoginKind, flag: unknown): string | null {
  if (flag !== '1') return null
  return kind === 'eleve'
    ? 'Sur un ordinateur partagé, déconnecte-toi aussi de ton compte Google.'
    : 'Sur un ordinateur partagé, déconnectez-vous aussi de votre compte Google.'
}
