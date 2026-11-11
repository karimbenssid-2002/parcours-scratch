/** Correction automatique active : seulement là où Chromium et la boucle de fond existent (en local), jamais en ligne.
 * Il faut aussi que le build l'ait gardée : AUTOGRADE_AU_BUILD est remplacé au build par « 0 » sans AUTOGRADE_ENABLED
 * (next.config.ts), et Chromium et l'éditeur Scratch manquent alors au code déployé, même si la variable est définie
 * à l'exécution. */
export function autogradeEnabled(): boolean {
  return process.env.AUTOGRADE_ENABLED === '1' && process.env.AUTOGRADE_AU_BUILD !== '0'
}

export const AUTOGRADE_UNAVAILABLE = 'Correction automatique non disponible sur ce site.'
