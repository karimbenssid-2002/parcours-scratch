// Décisions pures du service worker pour les notifications (chargé par sw.js avec importScripts, testé sous Node).
;(function (root) {
  var TITLE = 'Parcours Scratch'

  // Les deux web apps installées : /admin (enseignant) et le reste (élève).
  function spaceOf(pathname) {
    return pathname === '/admin' || pathname.indexOf('/admin/') === 0 ? 'admin' : 'eleve'
  }

  // Chemin relatif (chemin + requête + ancre) si l'adresse est de même origine, sinon null.
  function sameOriginTarget(raw, origin) {
    try {
      var u = new URL(String(raw), origin)
      return u.origin === origin ? u.pathname + u.search + u.hash : null
    } catch {
      return null
    }
  }

  // Icône de l'appli (celle des manifests) selon l'espace visé.
  function iconFor(path) {
    return spaceOf(path.split(/[?#]/)[0]) === 'admin' ? '/icons/prof-192.png' : '/icons/icon-192.png'
  }

  // Contenu à afficher pour un message push (JSON). Message absent ou illisible : notification neutre (le navigateur
  // exige d'afficher quelque chose à chaque push).
  function notificationFrom(text, origin) {
    var data
    try { data = JSON.parse(text) } catch { data = null }
    if (!data || typeof data !== 'object') data = {}
    var path = sameOriginTarget(typeof data.url === 'string' ? data.url : '/', origin) || '/'
    var options = {
      body: typeof data.body === 'string' ? data.body : '',
      data: { url: path },
      icon: iconFor(path),
    }
    if (typeof data.tag === 'string' && data.tag) options.tag = data.tag
    return { title: typeof data.title === 'string' && data.title ? data.title : TITLE, options: options }
  }

  // Clic : { kind: 'ignore' } | { kind: 'focus', index, url } | { kind: 'open', url }.
  // `windows` : adresses complètes des fenêtres de l'appli, dans l'ordre.
  function clickAction(rawUrl, origin, windows) {
    var path = typeof rawUrl === 'string' ? sameOriginTarget(rawUrl, origin) : null
    if (path === null) return { kind: 'ignore' }
    var space = spaceOf(path.split(/[?#]/)[0])
    for (var i = 0; i < windows.length; i++) {
      var w
      try { w = new URL(windows[i]) } catch { continue }
      if (w.origin === origin && spaceOf(w.pathname) === space) return { kind: 'focus', index: i, url: path }
    }
    return { kind: 'open', url: path }
  }

  var api = { spaceOf: spaceOf, sameOriginTarget: sameOriginTarget, iconFor: iconFor, notificationFrom: notificationFrom, clickAction: clickAction }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.swClick = api
})(typeof self !== 'undefined' ? self : this)
