// Appelé une fois au démarrage du serveur Next : reprend les corrections automatiques en cours (lots IA, tâches interrompues).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Remplacé par une constante au build (next.config.ts, `env`) : construit sans correction automatique (en ligne),
  // le code mort ci-dessous disparaît, et avec lui Chromium, l'éditeur Scratch et PGlite des fichiers déployés.
  if (process.env.AUTOGRADE_AU_BUILD === '0') return
  const { autogradeEnabled } = await import('@/lib/autograde/enabled')
  if (!autogradeEnabled()) return // en ligne : ni Chromium ni boucle de fond
  const { ensureWorker } = await import('@/lib/autograde/worker')
  ensureWorker()
}
