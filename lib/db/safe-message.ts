/** Message d'erreur seul (jamais l'objet : le pilote PostgreSQL y joint l'adresse ou les paramètres), sans le mot de passe.
 * Pour les scripts lancés contre la base en ligne (seed, migrations, export). */
export function safeMessage(e: unknown, url = process.env.DATABASE_URL): string {
  let msg = e instanceof Error ? e.message : String(e)
  const password = url && /^[a-z]+:\/\/[^:/]*:(.+)@[^@]*$/i.exec(url)?.[1]
  if (url) msg = msg.split(url).join('[DATABASE_URL]')
  if (password) msg = msg.split(password).join('***')
  return msg
}
