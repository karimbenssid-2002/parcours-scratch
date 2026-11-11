import Link from 'next/link'
import { readTheme } from '@/lib/ui/theme-server'

export const metadata = { title: 'Confidentialité' }

// Responsable et contact : réglages de l'hébergeur (jamais dans le code public).
const NOM = process.env.PRIVACY_CONTACT_NAME?.trim() || ''
const CONTACT = process.env.PRIVACY_CONTACT_EMAIL?.trim() || ''

function Contact() {
  return CONTACT
    ? <a className="font-semibold text-primary-ink underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
    : <>l’administrateur du site, par l’intermédiaire d’un enseignant</>
}
const MISE_A_JOUR = '11 novembre 2026'

/** Règles de confidentialité : publique (lue aussi par Google pour l'écran de connexion). */
export default async function ConfidentialitePage() {
  return (
    <div data-area="eleve" data-theme={await readTheme()} className="min-h-dvh px-4 py-10">
      <article className="glass mx-auto max-w-2xl space-y-6 p-6 leading-relaxed md:p-8">
        <header className="space-y-1">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em]">Confidentialité</h1>
          <p className="text-sm text-muted">Parcours Scratch · mise à jour le {MISE_A_JOUR}</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Qui gère ce site</h2>
          <p>
            Parcours Scratch est un site de défis de programmation Scratch pour les élèves du Lycée Français International
            André-Malraux (Rabat). Il est géré par {NOM ? `${NOM}, enseignant au lycée` : 'un enseignant du lycée'}. Pour toute question sur vos données : <Contact />.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Ce que le site enregistre</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Élèves</strong> : l’adresse e-mail du lycée, le prénom et le nom (tirés de cette adresse), les classes, les projets Scratch enregistrés, l’état de chaque défi (en cours, rendu, validé…), les commentaires des enseignants et les dates de connexion et de rendu.</li>
            <li><strong>Enseignants</strong> : l’adresse e-mail du lycée, le prénom, le nom, les classes et les retours donnés aux élèves.</li>
          </ul>
          <p>
            La connexion passe par le compte Google du lycée. Le site ne reçoit de Google que l’adresse e-mail et la confirmation
            qu’elle est vérifiée : aucun mot de passe, et aucun accès à Gmail, Drive, Classroom ou aux contacts.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Pourquoi</h2>
          <p>
            Uniquement pour permettre aux élèves de faire les défis et aux enseignants de suivre leur travail. Pas de publicité,
            pas de mesure d’audience, pas de revente : les données ne servent à rien d’autre.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Qui peut les voir</h2>
          <p>
            L’élève voit son propre travail. Ses enseignants voient le travail des élèves de leurs classes. L’administrateur du
            site voit l’ensemble pour le faire fonctionner. Personne d’autre.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Où elles sont hébergées</h2>
          <p>
            La base de données et les projets sont hébergés par Supabase, sur des serveurs situés à Paris. Le site lui-même est
            servi par Vercel, depuis des serveurs situés à Paris.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Cookies</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>un cookie de session, pour rester connecté (30 jours pour les élèves, 7 jours pour les enseignants) ;</li>
            <li>un cookie temporaire pendant la connexion avec Google (10 minutes) ;</li>
            <li>un cookie qui retient le thème clair ou sombre.</li>
          </ul>
          <p>
            Aucun cookie publicitaire ni de mesure d’audience. Les vidéos d’aide sont lues depuis youtube-nocookie.com : YouTube
            peut enregistrer des informations seulement quand une vidéo est lancée.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Combien de temps</h2>
          <p>
            Les données sont gardées tant que le compte est utilisé. Elles sont supprimées sur simple demande de l’élève, de sa
            famille ou de son enseignant.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Vos droits</h2>
          <p>
            Vous pouvez demander à consulter, corriger ou supprimer les données d’un élève ou d’un enseignant en écrivant à <Contact />.
          </p>
        </section>

        <p className="text-sm text-muted">
          <Link href="/" className="underline">Retour au site</Link>
        </p>
      </article>
    </div>
  )
}
