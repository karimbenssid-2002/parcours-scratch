import { cache } from 'react'
import { getDb } from '@/lib/db/client'
import { closeOverdue } from './close'

/**
 * Rend les échéances passées, une fois par requête (cache de React).
 * À appeler en tête de chaque page qui lit des statuts ou des alertes : les layouts s'exécutent en parallèle
 * des pages et ne sont pas réexécutés lors d'une navigation par lien.
 */
export const ensureClosed = cache(async (): Promise<void> => {
  await closeOverdue(getDb())
})
