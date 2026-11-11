import { NextResponse, type NextRequest } from 'next/server'
import { thumbnailFile } from '@/lib/activities/thumbnail'
import { readStored } from '@/lib/storage/files'

type Ctx = { params: Promise<{ file: string }> }

/** Vignette d'un défi (publique : une simple image, déjà normalisée en WebP). Le nom change à chaque envoi. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { file } = await params
  const rel = thumbnailFile(`/api/vignettes/${file}`)
  const bytes = rel ? await readStored(rel) : null
  if (!bytes) return NextResponse.json({ error: 'Vignette introuvable.' }, { status: 404 })
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
