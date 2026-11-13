/** Portée du service worker de chaque appli installée. Sur Android, Chrome confie les notifications à l'appli
 *  installée dont la portée couvre celle du service worker : l'appli enseignant (/admin) a donc besoin du sien, sinon
 *  l'abonnement échoue (« AbortError: Registration failed - push service error »). */
export function swScope(app: 'admin' | 'eleve'): string {
  return app === 'admin' ? '/admin' : '/'
}

/** Enregistrement du service worker de cette appli (créé au besoin), une fois actif. */
export async function appRegistration(app: 'admin' | 'eleve'): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: swScope(app) })
  if (registration.active) return registration
  const worker = registration.installing ?? registration.waiting
  if (worker) {
    await new Promise<void>((resolve, reject) => {
      const onChange = () => {
        if (worker.state === 'activated') { worker.removeEventListener('statechange', onChange); resolve() }
        else if (worker.state === 'redundant') { worker.removeEventListener('statechange', onChange); reject(new Error('service worker abandonné')) }
      }
      worker.addEventListener('statechange', onChange)
      onChange()
    })
  }
  return registration
}
