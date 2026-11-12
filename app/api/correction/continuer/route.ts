import { createHash, timingSafeEqual } from 'node:crypto'
import { autogradeEnabled, relaunchSecret } from '@/lib/autograde/enabled'
import { scheduleDrain } from '@/lib/autograde/launch'

// Relance de la file des corrections automatiques : appelée par une fonction qui approche de sa durée maximale alors
// que des copies attendent encore. Sans session (le proxy ne s'applique pas à /api/) : protégée par
// `Authorization: Bearer ${AUTOGRADE_RELAUNCH_SECRET}`. Répond tout de suite ; le travail se fait après la réponse.
export const maxDuration = 300

/** Comparaison en temps constant (empreintes de même longueur, quelle que soit la valeur reçue). */
const sameSecret = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

export async function POST(request: Request) {
  const startedAt = Date.now()
  if (!autogradeEnabled()) return Response.json({ error: 'Correction automatique désactivée.' }, { status: 404 })
  const secret = relaunchSecret()
  if (!secret || !sameSecret(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return Response.json({ error: 'Non autorisé.' }, { status: 401 })
  }
  scheduleDrain(startedAt, request.headers)
  return Response.json({ ok: true }, { status: 202 })
}
