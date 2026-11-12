import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { autogradeEffort, autogradeModel, quotaState } from '@/lib/db/autograde'
import { now } from '@/lib/clock'
import { monthlyUsage, type MonthlyUsage } from '@/lib/autograde/usage'
import { isAiConfigured } from '@/lib/autograde/ai'
import { autogradeEnabled } from '@/lib/autograde/enabled'
import { Alert } from '@/components/ui/Alert'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { setModelAction } from './actions'
import { CapForm, EffortForm } from './SettingsForms'

export const metadata = { title: 'Correction automatique' }

const MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (rapide, recommandé)', hint: 'Rapide et très économique.' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (plus précis, plus cher)', hint: 'Plus précis sur les programmes complexes, environ vingt fois plus cher.' },
] as const

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(s % 60).padStart(2, '0')} s`
}

const nf = new Intl.NumberFormat('fr-FR')
const usd = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

function monthKey(offset: number): string {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + offset)
  return d.toISOString().slice(0, 7)
}

function UsageColumn({ title, u }: { title: string; u: MonthlyUsage }) {
  return (
    <div className="rounded-xl bg-surface p-4">
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt>Corrections lancées</dt><dd className="text-right font-semibold">{nf.format(u.corrections)}</dd>
        <dt>Tranchées sans IA</dt><dd className="text-right font-semibold">{nf.format(u.withoutAi)}</dd>
        <dt>Appels à l’IA</dt><dd className="text-right font-semibold">{nf.format(u.aiCalls)}</dd>
        <dt>Tokens (entrée / cache / sortie)</dt>
        <dd className="text-right font-semibold">{nf.format(u.inputTokens)} / {nf.format(u.cacheReadTokens + u.cacheWriteTokens)} / {nf.format(u.outputTokens)}</dd>
        <dt>Coût estimé</dt><dd className="text-right font-semibold">{usd.format(u.costUsd)}</dd>
      </dl>
    </div>
  )
}

export default async function AutogradeSettingsPage() {
  await requireTeacher({ role: 'admin' })
  if (!autogradeEnabled()) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Correction automatique</h1>
        <Alert tone="info">La correction automatique n’est pas disponible sur ce site : vous validez les défis à la main.</Alert>
      </div>
    )
  }
  const db = getDb()
  const model = await autogradeModel(db)
  const effort = await autogradeEffort(db)
  const runs = await quotaState(db, now())
  const current = await monthlyUsage(db, monthKey(0))
  const previous = await monthlyUsage(db, monthKey(-1))
  const hasKey = isAiConfigured()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Correction automatique</h1>
      {hasKey
        ? <Alert tone="success">Clé d’API configurée.</Alert>
        : <Alert tone="warning">Clé d’API absente : ajoutez ANTHROPIC_API_KEY dans le fichier .env.local du serveur. Sans clé, seules les corrections tranchées sans IA fonctionnent.</Alert>}
      <form action={setModelAction} className="glass space-y-3 p-6">
        <fieldset className="space-y-2">
          <legend className="text-xl font-semibold">Modèle utilisé</legend>
          {MODELS.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-surface">
              <input type="radio" name="model" value={m.id} defaultChecked={model === m.id} className="mt-1 accent-primary" />
              <span><span className="block font-semibold">{m.label}</span><span className="text-sm text-muted">{m.hint}</span></span>
            </label>
          ))}
        </fieldset>
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
      </form>
      <EffortForm effort={effort} />
      <CapForm cap={runs.cap} />
      <section aria-labelledby="conso" className="glass space-y-3 p-6">
        <h2 id="conso" className="text-xl font-semibold">Consommation</h2>
        <div className="rounded-xl bg-surface p-4">
          <h3 className="font-semibold">Exécutions du mois (service Cloud Run)</h3>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            <dt>Exécutions utilisées / plafond</dt><dd className="text-right font-semibold">{nf.format(runs.used)} / {nf.format(runs.cap)}</dd>
            <dt>Copies en file (pas encore exécutées)</dt><dd className="text-right font-semibold">{nf.format(runs.active)}</dd>
            <dt>Durée totale d’exécution</dt><dd className="text-right font-semibold">{formatDuration(runs.durationMs)}</dd>
          </dl>
          {runs.remaining <= 0 && <p role="status" className="mt-2 text-sm font-semibold text-st-almost">Plafond atteint : les nouvelles corrections automatiques sont refusées jusqu’au mois prochain.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <UsageColumn title="Ce mois-ci" u={current} />
          <UsageColumn title="Mois précédent" u={previous} />
        </div>
        <p className="text-sm text-muted">Estimation d’après les tarifs publics d’Anthropic ; les corrections tranchées sans IA ne coûtent rien.</p>
      </section>
    </div>
  )
}
