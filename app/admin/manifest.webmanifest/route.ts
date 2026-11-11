import { teacherManifest } from '@/lib/pwa/manifests'

/** Web app enseignant : son icône (le prof au stylo rouge) et son démarrage sur /admin. */
export function GET() {
  return Response.json(teacherManifest, { headers: { 'Content-Type': 'application/manifest+json' } })
}
