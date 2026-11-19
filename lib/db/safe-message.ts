/** Message d'erreur seul (jamais l'objet : le pilote PostgreSQL y joint l'adresse ou les paramètres), sans le mot de passe.
 * Pour les scripts lancés contre la base en ligne (seed, migrations, export). */
export function safeMessage(e: unknown, url = process.env.DATABASE_URL): string {
  let msg = e instanceof Error ? e.message : String(e)
  const password = url && /^[a-z]+:\/\/[^:/]*:(.+)@[^@]*$/i.exec(url)?.[1]
  if (url) msg = msg.split(url).join('[DATABASE_URL]')
  if (password) msg = msg.split(password).join('***')
  return msg
}

/**
 * Cause d'une erreur serveur pour un journal : message seul via safeMessage, celui du pilote plutôt que celui de Drizzle
 * (« Failed query… params: » cite les paramètres, donc l'adresse), toute adresse masquée, une ligne de 200 caractères au plus.
 */
export function safeErrorDetail(e: unknown): string {
  const cause = e instanceof Error && e.cause instanceof Error && /^Failed query:/.test(e.message) ? e.cause : e
  return safeMessage(cause).replace(/[^\s@'"(),;:<>=]+@[^\s@'"(),;:<>=]+/g, '[adresse]').replace(/\s+/g, ' ').slice(0, 200)
}

/**
 * Requête dont les paramètres portent une adresse e-mail, appelée hors d'un endroit qui journalise lui-même sans donnée
 * personnelle (pages, gardes de session, routes API) : une erreur remonte sous la forme d'une Error neuve, au message
 * réduit par safeErrorDetail, sans `cause` ni propriétés (`params`, `detail`…) que le journal de Next afficherait.
 */
export async function withoutPersonalData<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (e) {
    throw new Error(safeErrorDetail(e))
  }
}
