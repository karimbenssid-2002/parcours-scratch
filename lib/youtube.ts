const ID = /^[A-Za-z0-9_-]{11}$/

export function parseYoutubeId(input: string): string | null {
  const s = input.trim()
  if (ID.test(s)) return s
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0]
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else id = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ?? null
  }
  return id && ID.test(id) ? id : null
}

export function youtubeEmbedUrl(id: string): string {
  // hl=fr : sans ce paramètre, YouTube choisit la langue de son interface d'après l'IP (arabe au Maroc).
  return `https://www.youtube-nocookie.com/embed/${id}?hl=fr&cc_lang_pref=fr`
}
