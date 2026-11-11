# Parcours Scratch — Lycée International André Malraux

Site des parcours Scratch par niveau (6e → 3e) pour les collégiens, avec un espace d'administration pour les enseignants :
défis avec éditeur Scratch intégré, progressions, classes, échéances, suivi et retours sur les travaux des élèves.

Application Next.js (App Router) et PostgreSQL via Drizzle : PGlite (PostgreSQL en WebAssembly) en local et en test,
Supabase (base et stockage des fichiers) en ligne.

## Installation locale

Prérequis : Node.js 22 ou plus récent. Rien d'autre à installer : la base locale est un dossier PGlite.

```bash
npm install
cp .env.example .env.local   # puis renseigner les deux secrets et le compte admin (DATABASE_URL=pglite:data/dev-pg)
npm run seed                 # crée la base (migrations) et le compte admin
npm run dev                  # http://localhost:3000 (élèves) et http://localhost:3000/admin (enseignants)
```

- La base PGlite ne s'ouvre que dans un processus à la fois : arrêter `npm run dev` avant `npm run seed`.
- Les e-mails (mots de passe provisoires, notifications) s'affichent dans la console du serveur tant que `RESEND_API_KEY` n'est pas défini.
- Un dépôt fraîchement cloné démarre **sans aucun défi** : ils se créent depuis l'espace admin (`/admin`).

## Variables d'environnement

Toutes sont décrites dans [`.env.example`](.env.example).

| Variable | Rôle |
| --- | --- |
| `AUTH_SECRET`, `STUDENT_AUTH_SECRET` | Secrets des sessions enseignants et élèves (32 caractères minimum, différents) |
| `DATABASE_URL` | `pglite:data/dev-pg` en local ; URL du pooler Supabase (mode transaction) en ligne |
| `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD` | Compte administrateur créé par `npm run seed` ; identifiant de connexion = partie de l'e-mail avant `@` ; mot de passe de 12 caractères minimum, différent de l'exemple (à changer à la 1re connexion) |
| `STUDENT_REGISTRATION_OPEN` | `1` ouvre l'inscription des élèves par mot de passe (local) ; **ne pas définir en ligne tant que la connexion Google n'est pas en place** |
| `CRON_SECRET` | En ligne : secret de la tâche quotidienne `/api/cron/veille` (voir plus bas) |
| `ADMIN_NOTIFY_EMAIL` | Destinataire des notifications (demandes de compte enseignant) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Envoi réel des e-mails via Resend (facultatif) |
| `STORAGE_DIR` | Dossier des fichiers en local (`storage/` par défaut) |
| `STORAGE_BACKEND`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | Stockage Supabase en ligne (bucket privé) |
| `AUTOGRADE_ENABLED` | `1` active la correction automatique (Chromium et serveur permanent requis) |
| `ANTHROPIC_API_KEY` | Propositions de note par l'IA pour la correction automatique (facultatif) |
| `NEXT_PUBLIC_SOURCE_URL` | Adresse du dépôt public, pour le lien « Code source » du pied de page |
| `EXPORT_SQLITE_FILE`, `EXPORT_STORAGE_DIR` | Source de `npm run export:contenu` (voir plus bas) |

## Éditeur Scratch

L'éditeur est l'éditeur officiel Scratch 3 (`@scratch/scratch-gui`, licence AGPL-3.0), installé dans le sous-paquet `scratch-editor/`
(il embarque son propre React 18) et copié dans `public/scratch-editor/` par `npm run editor:install`
(fait automatiquement avant `dev` et `build`). La page `scratch-editor/editor.html` l'affiche et expose `window.scratchBridge`
au site (iframe de même origine). Certains fichiers de l'éditeur sont demandés à la racine (`/chunks/…`, `/static/assets/…`) :
`next.config.ts` les redirige vers `public/scratch-editor/`.

## Tests

```bash
npm test     # tests unitaires et d'intégration (Vitest, base PGlite en mémoire)
```

Les tests créent des comptes fictifs uniquement dans cette base en mémoire. `tests/autograde/runner.test.ts` lance Chromium
(`npx playwright-core install chromium` au besoin).

## Mise en ligne (Vercel + Supabase)

1. **Supabase** : créer un projet dans une région européenne, puis un bucket de stockage **privé** (`parcours` par défaut)
   avec une **limite de taille de fichier de 20 Mo** et un seul type MIME autorisé, `application/octet-stream` (les projets
   Scratch y sont déposés directement par le navigateur : cette limite est la seule qui s'applique avant la vérification du serveur).
   Noter l'URL du pooler en mode transaction (port 6543), l'URL du projet et la clé `service_role`.
   Toutes les tables ont la sécurité au niveau des lignes (RLS) activée **sans aucune politique** : l'appli se connecte en
   propriétaire des tables, qui n'y est pas soumis, et la Data API de Supabase (clé publique) n'y voit rien. Désactiver aussi
   la Data API dans les réglages du projet (le site ne s'en sert pas).
2. **Fichier `.env.production.local`** (jamais versionné) : les scripts lancés vers la base en ligne le lisent —
   `npm run export:contenu` et `npm run db:migrate`. Y mettre `DATABASE_URL` (pooler Supabase), `ADMIN_EMAIL`,
   `ADMIN_INITIAL_PASSWORD`, `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_BUCKET`.
   `npm run seed`, lui, lit `.env.local` (base locale) ; pour l'appliquer à la base en ligne :
   `npx tsx --conditions=react-server --env-file=.env.production.local scripts/seed.ts`.
3. **Contenu** (facultatif) : `npm run export:contenu` est l'outil de migration du site d'origine. Il lit une base
   SQLite locale (`EXPORT_SQLITE_FILE`, `data/app.db` par défaut) et ses fichiers (`EXPORT_STORAGE_DIR`) ; sans cette base,
   le site en ligne démarre vide, comme en local, et l'étape se résume au seed vers la base en ligne (commande ci-dessus).
   Lancer `npm run export:contenu -- --dry-run` pour vérifier, puis `npm run export:contenu`. Le script applique les migrations,
   crée le compte admin et copie le contenu pédagogique (défis, progressions, corrections, fichiers associés) ;
   jamais de compte élève, de classe ni de travail d'élève.
4. **Vercel** : importer le dépôt. [`vercel.json`](vercel.json) place les fonctions à Paris (région `cdg1` : données d'élèves,
   latence) et déclare une tâche planifiée quotidienne (`/api/cron/veille`, 5 h UTC) qui fait une requête triviale pour que
   Supabase ne mette pas le projet en pause (offre gratuite : pause après une semaine sans activité).
   Renseigner les variables d'environnement `AUTH_SECRET`, `STUDENT_AUTH_SECRET`, `DATABASE_URL`, `ADMIN_NOTIFY_EMAIL`,
   `RESEND_API_KEY`, `EMAIL_FROM`, `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`
   et `CRON_SECRET` (longue chaîne aléatoire ; Vercel l'envoie à la tâche planifiée).
   **Ne pas définir en ligne** : `AUTOGRADE_ENABLED` (la correction automatique a besoin de Chromium et d'un serveur qui reste
   allumé), `ANTHROPIC_API_KEY`, `AUTOGRADE_FAKE_AI`, `E2E_CLOCK`, `STORAGE_DIR`, et `STUDENT_REGISTRATION_OPEN` tant que la
   connexion Google n'est pas en place.
5. **Changements de schéma** : après une nouvelle migration (`npm run db:generate`), `npm run db:migrate` l'applique à la
   base en ligne (`.env.production.local`).

## Architecture

- `app/(eleve)` : espace élève ; `app/admin` : espace enseignants et admin ; `app/api` : fichiers (projets, vignettes, corrigés).
- `lib/db/` : **seul** point d'accès à la base (Drizzle ; migrations dans `drizzle/`).
- `lib/auth/` : sessions JWT séparées (`admin_session`, `student_session`), routage (`routing.ts`, utilisé par `proxy.ts`),
  limitation des tentatives de connexion en base, revérification des droits côté serveur (`session.ts`).
- `lib/storage/` : fichiers en local ou dans Supabase Storage (envois directs par URL signée).
- `lib/autograde/` : correction automatique (exécution des projets dans Chromium, propositions de l'IA).
- `lib/email/` : envoi d'e-mails (Resend, ou console en local).

## Licences

Le code de ce site est distribué sous licence [GNU AGPL-3.0](LICENSE) : il intègre l'éditeur Scratch (scratch-gui / scratch-vm,
sous AGPL-3.0), dont la licence impose de publier le code source du site mis en ligne.

Contenus des défis inspirés des travaux de Christophe Béasse, CC BY-NC-SA 4.0).
Les illustrations des défis (`public/activities/`) sont sous la même licence CC BY-NC-SA 4.0.
