import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import { safeErrorDetail } from '@/lib/db/safe-message'

/**
 * Corps d'une Server Action qui reçoit ou cherche une adresse e-mail. Une erreur imprévue (base indisponible, contrainte…)
 * n'atteint pas le gestionnaire d'erreurs de Next, qui journaliserait l'erreur entière : le message de Drizzle cite les
 * paramètres de la requête, donc l'adresse. Elle est journalisée en une ligne sans donnée personnelle (safeErrorDetail),
 * puis `onError` donne la réponse générique de l'action, ou lève une erreur générique (actionFailed) quand l'appelant
 * attend une exception. Les erreurs de contrôle de Next (redirect(), notFound()…) sont relancées telles quelles.
 */
export async function safeAction<T>(label: string, work: () => Promise<T>, onError: () => T): Promise<T> {
  try {
    return await work()
  } catch (e) {
    unstable_rethrow(e)
    console.error(`[${label}] ${safeErrorDetail(e)}`)
    return onError()
  }
}

/** Pour `onError` d'une action sans valeur de retour : une Error neuve, au message générique, sans cause. */
export function actionFailed(message: string): never {
  throw new Error(message)
}
