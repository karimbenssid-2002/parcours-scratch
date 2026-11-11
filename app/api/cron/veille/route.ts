import { createHash, timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'

// Tâche planifiée quotidienne (vercel.json, « crons ») : une requête triviale garde la base Supabase active
// (l'offre gratuite met en pause un projet resté une semaine sans activité). Vercel envoie
// `Authorization: Bearer ${CRON_SECRET}` ; sans CRON_SECRET, la route n'existe pas.

/** Comparaison en temps constant (empreintes de même longueur, quelle que soit la valeur reçue). */
const sameSecret = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return new NextResponse(null, { status: 404 })
  if (!sameSecret(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }
  await getDb().execute(sql`select 1`)
  return NextResponse.json({ ok: true })
}
