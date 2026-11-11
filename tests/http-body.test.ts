import { describe, expect, it } from 'vitest'
import { readBodyLimited } from '@/lib/http/body'

const streamOf = (chunks: number[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of chunks) controller.enqueue(new Uint8Array(size))
      controller.close()
    },
  })

const req = (chunks: number[]) =>
  new Request('http://local/api', { method: 'PUT', body: streamOf(chunks), duplex: 'half' } as RequestInit & { duplex: 'half' })

describe('readBodyLimited', () => {
  it('lit un corps envoyé par morceaux sous la limite', async () => {
    expect((await readBodyLimited(req([10, 20, 30]), 100))?.length).toBe(60)
  })
  it("s'arrête dès que la limite est dépassée, même sans content-length", async () => {
    expect(await readBodyLimited(req([60, 60, 60]), 100)).toBeNull()
  })
})
