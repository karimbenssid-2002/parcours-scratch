import type { MetadataRoute } from 'next'
import { studentManifest } from '@/lib/pwa/manifests'

/** Web app élève (écran d'accueil Android et iPhone) : l'élève y suit ses défis et les retours du professeur. */
export default function manifest(): MetadataRoute.Manifest {
  return studentManifest
}
