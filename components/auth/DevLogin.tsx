import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import type { DevAccount } from '@/lib/auth/dev-login'
import type { LoginKind } from '@/lib/auth/identity'

/** Remplace le bouton Google en local quand l'identifiant Google n'est pas configuré (jamais en ligne). */
export function DevLogin({ kind, accounts }: { kind: LoginKind; accounts: DevAccount[] }) {
  return (
    <div className="space-y-4">
      <Alert tone="warning">
        <p className="font-semibold">Connexion de développement</p>
        <p className="text-sm">En local seulement, sans Google : choisir un compte existant.</p>
      </Alert>
      {accounts.length === 0 ? (
        <p className="text-center text-sm text-muted">
          {kind === 'eleve' ? 'Aucun compte élève dans la base locale.' : 'Aucun compte enseignant actif dans la base locale (npm run seed).'}
        </p>
      ) : (
        <form method="post" action="/auth/dev" className="space-y-4">
          <input type="hidden" name="kind" value={kind} />
          <label className="block space-y-1.5">
            <span className="block text-sm font-semibold text-ink">Compte</span>
            <select name="id" required
              className="w-full rounded-[10px] border-2 border-line bg-tile px-4 py-2.5 text-base text-ink transition duration-200 focus:border-primary focus:outline-none">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.detail}</option>)}
            </select>
          </label>
          <Button type="submit" variant={kind === 'eleve' ? 'go' : 'primary'} className="min-h-12 w-full">Se connecter</Button>
        </form>
      )}
    </div>
  )
}
