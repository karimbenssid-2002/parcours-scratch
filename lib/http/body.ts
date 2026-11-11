/**
 * Lit le corps d'une requête (ou d'une réponse) en s'arrêtant dès que `max` octets sont dépassés.
 * Ne fait pas confiance à content-length (absent si le corps est envoyé par morceaux).
 * Renvoie null si la limite est dépassée.
 */
export async function readBodyLimited(request: { body: ReadableStream<Uint8Array> | null }, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}
