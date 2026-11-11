/** Inscription des élèves par mot de passe : fermée en ligne (STUDENT_REGISTRATION_OPEN absent) tant que la connexion
 * Google n'est pas en place, car rien n'y prouve qu'on est bien l'élève de l'adresse. Ouverte en local (`1`). */
export function studentRegistrationOpen(): boolean {
  return process.env.STUDENT_REGISTRATION_OPEN === '1'
}

export const REGISTRATION_CLOSED = 'Les inscriptions des élèves ne sont pas encore ouvertes.'
