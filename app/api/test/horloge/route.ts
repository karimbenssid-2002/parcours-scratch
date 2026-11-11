import { NextResponse } from 'next/server'
import { setClockOffset } from '@/lib/clock'

// Uniquement pour les tests e2e : avance l'horloge du serveur sans attendre de vraies échéances.
// Jamais sur Vercel (VERCEL y est toujours défini), même si E2E_CLOCK y était renseigné par erreur.
export async function POST(request: Request) {
  if (process.env.E2E_CLOCK !== '1' || process.env.VERCEL) return new NextResponse(null, { status: 404 })
  const { offsetMs } = (await request.json()) as { offsetMs?: unknown }
  if (typeof offsetMs !== 'number' || !Number.isFinite(offsetMs)) return NextResponse.json({ error: 'offsetMs' }, { status: 400 })
  setClockOffset(offsetMs)
  return NextResponse.json({ ok: true })
}
