/**
 * Services push des navigateurs acceptés (FCM, Apple, Mozilla, Windows). L'endpoint vient du client : sans cette liste,
 * le serveur enverrait des requêtes vers n'importe quelle adresse (SSRF). Comparaison sur le nom d'hôte analysé.
 */
const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com'])
const SUFFIXES = ['.push.apple.com', '.notify.windows.com']

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try { url = new URL(endpoint) } catch { return false }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return false // adresse IP
  return EXACT_HOSTS.has(host) || SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length)
}
