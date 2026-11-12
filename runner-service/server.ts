// Point d'entrée du service d'exécution (conteneur Cloud Run, voir README.md) :
//   node --import tsx --conditions=react-server runner-service/server.ts
// Même exécuteur que le site (lib/autograde/runner/run.ts). Aucun secret sur Cloud Run : l'IAM filtre les appels.
import { closeBrowser, enableMinimalBrowserEnv } from '../lib/autograde/runner/browser'
import { runMany } from '../lib/autograde/runner/run'
import { createRunnerHandler, startupProblem, takeDevSecret } from './handler'
import { createHttpServer } from './http'

// Secret de développement (essais locaux) : retiré de l'environnement avant tout lancement de Chromium, qui ne reçoit
// de toute façon qu'un environnement réduit (projets non fiables, sans bac à sable).
const devSecret = takeDevSecret(process.env)
enableMinimalBrowserEnv()
const problem = startupProblem(process.env, devSecret)
if (problem) {
  console.error(`${problem} Arrêt.`)
  process.exit(1)
}
const port = Number(process.env.PORT) || 8080
const server = createHttpServer(createRunnerHandler({ run: runMany, devSecret }))

server.listen(port, () => console.log(`Service d’exécution à l’écoute sur le port ${port}${devSecret ? ' (secret de développement)' : ''}.`))

// Cloud Run envoie SIGTERM avant d'arrêter l'instance : Chromium est fermé proprement.
process.on('SIGTERM', () => {
  server.close()
  closeBrowser().catch(() => {}).finally(() => process.exit(0))
})
