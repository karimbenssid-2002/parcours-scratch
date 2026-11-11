// Envoi d'un projet Scratch depuis le navigateur. Les fonctions Vercel refusent les corps de plus de 4,5 Mo :
// avec le stockage en ligne, le fichier part directement dans le bucket (URL signée choisie par le serveur),
// puis le serveur relit, vérifie et enregistre le fichier déposé. En local, le corps part au serveur comme avant.
// Aucune clé Supabase ici : le jeton de l'URL signée suffit (même requête que `uploadToSignedUrl` de storage-js).

type Ticket = { url: string; token: string; path: string } | { direct: true }

const failed = () =>
  new Response(JSON.stringify({ error: 'L’envoi du fichier a échoué.' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  })

/** Envoie le projet à `endpoint` (PUT) ; renvoie la réponse du serveur (ou une erreur JSON en français). */
export async function uploadProject(endpoint: string, bytes: Blob): Promise<Response> {
  const ticketRes = await fetch(`${endpoint}?upload=1`, { cache: 'no-store' })
  if (!ticketRes.ok) return ticketRes
  const ticket = (await ticketRes.json()) as Ticket
  if ('direct' in ticket) {
    return fetch(endpoint, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'application/octet-stream' } })
  }
  const sent = await fetch(ticket.url, {
    method: 'PUT',
    body: bytes,
    headers: { 'x-upsert': 'false', 'content-type': 'application/octet-stream', 'cache-control': 'max-age=3600' },
  })
  if (!sent.ok) return failed()
  return fetch(endpoint, { method: 'PUT', body: JSON.stringify({ path: ticket.path }), headers: { 'Content-Type': 'application/json' } })
}
