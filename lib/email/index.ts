export type EmailMessage = { to: string; subject: string; text: string }

/** Toute adresse e-mail d'un texte remplacée par « [adresse] » (objet écrit dans les journaux hors développement). */
const withoutAddresses = (text: string) => text.replace(/[^\s@<>()"',;:]+@[^\s@<>()"',;:]+/g, '[adresse]')

/**
 * Avec RESEND_API_KEY (et EMAIL_FROM), le message part par l'API HTTP de Resend ; sinon il est écrit dans la console du serveur.
 * Message complet (destinataire, objet, corps) seulement en développement local (`next dev`) ; partout ailleurs (production,
 * dont les journaux de l'hébergeur), une ligne générique : ni destinataire, ni corps, objet sans adresse.
 * Ne lève jamais d'exception : un échec d'envoi renvoie `delivered: false` (sans message ni clé dans les logs).
 */
export async function sendEmail(msg: EmailMessage): Promise<{ delivered: boolean }> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (process.env.NODE_ENV === 'development') {
      console.info(`\n[e-mail] À : ${msg.to}\n[e-mail] Objet : ${msg.subject}\n${msg.text}\n`)
    } else {
      console.error(`[e-mail] RESEND_API_KEY absent : e-mail non envoyé (objet : ${withoutAddresses(msg.subject)}).`)
    }
    return { delivered: false }
  }
  const from = process.env.EMAIL_FROM
  if (!from) {
    console.error("[e-mail] RESEND_API_KEY est défini mais pas EMAIL_FROM : e-mail non envoyé.")
    return { delivered: false }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.text }),
    })
    if (!res.ok) {
      console.error(`[e-mail] Envoi refusé par Resend (HTTP ${res.status}).`)
      return { delivered: false }
    }
    return { delivered: true }
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError'
    console.error(timeout ? '[e-mail] Envoi abandonné : Resend ne répond pas (10 s).' : "[e-mail] Envoi impossible : Resend n'a pas répondu.")
    return { delivered: false }
  }
}
