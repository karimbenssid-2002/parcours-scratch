// Adaptation node:http ↔ gestionnaire Request/Response (handler.ts). Journal : une ligne courte par requête, sans contenu.
import http from 'node:http'

/** Au-delà, un corps refusé n'est plus lu pour être jeté : la connexion est coupée. */
const DRAIN_MAX_BYTES = 64 * 1024 * 1024

/**
 * Corps de la requête en flux web. Abandonné (corps trop gros, refusé…), le reste est lu et jeté, sans coupure de la
 * connexion : le client reçoit ainsi la vraie réponse (413…) au lieu d'une connexion réinitialisée.
 */
function bodyStream(req: http.IncomingMessage, count: (n: number) => void): { stream: ReadableStream<Uint8Array>; discard: () => void } {
  let open = true
  let drained = 0
  const discard = () => {
    if (!open) return
    open = false
    req.removeAllListeners('data')
    req.on('data', (chunk: Buffer) => { count(chunk.length); drained += chunk.length; if (drained > DRAIN_MAX_BYTES) req.destroy() })
    req.resume()
  }
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      req.on('data', (chunk: Buffer) => {
        if (!open) return
        count(chunk.length)
        c.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
        if ((c.desiredSize ?? 0) <= 0) req.pause()
      })
      req.on('end', () => { if (open) { open = false; c.close() } })
      req.on('error', (e) => { if (open) { open = false; c.error(e) } })
    },
    pull() { if (open) req.resume() },
    cancel() { discard() },
  }, { highWaterMark: 4 })
  return { stream, discard }
}

export function createHttpServer(handle: (req: Request) => Promise<Response>): http.Server {
  return http.createServer(async (req, res) => {
    const start = Date.now()
    let size = 0
    let status = 500
    // Client parti avant la réponse : les exécutions en cours sont arrêtées (req.signal côté gestionnaire).
    const closed = new AbortController()
    res.on('close', () => { if (!res.writableFinished) closed.abort() })
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const body = hasBody ? bodyStream(req, (n) => { size += n }) : undefined
    try {
      const request = new Request(`http://service.local${req.url ?? '/'}`, {
        method: req.method,
        headers: Object.entries(req.headers).flatMap(([k, v]) => (v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((x): [string, string] => [k, x]))),
        body: body?.stream,
        signal: closed.signal,
        duplex: 'half',
      } as RequestInit)
      const response = await handle(request)
      status = response.status
      if (!req.readableEnded) body?.discard() // corps non lu en entier (401, 413…) : jeté
      const out = Buffer.from(await response.arrayBuffer())
      res.writeHead(status, { 'content-type': response.headers.get('content-type') ?? 'application/octet-stream', 'content-length': out.length })
      res.end(out)
    } catch {
      status = 500
      body?.discard()
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Erreur du service.' }))
    } finally {
      console.log(`${req.method} ${(req.url ?? '/').split('?')[0]} ${status} ${Date.now() - start} ms ${size} o`)
    }
  })
}
