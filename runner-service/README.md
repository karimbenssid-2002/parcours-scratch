# Service d'exécution (Cloud Run)

Exécute un projet Scratch dans Chromium avec le même code que le site (`lib/autograde/runner/`) et renvoie les relevés (`RunResult`) : `POST /run` ; `GET /` répond « ok ». Ni base, ni stockage, ni clé d'IA, **ni aucun secret** : l'accès est contrôlé par Cloud Run lui-même (IAM, rôle `roles/run.invoker`), qui vérifie le jeton d'identité Google avant que la requête n'atteigne le conteneur. **Ne jamais déployer avec `--allow-unauthenticated`** : le service serait ouvert à tous. Hors de Cloud Run (variable `K_SERVICE` absente), il refuse de démarrer sans `RUNNER_DEV_SECRET` (32 caractères au moins, essais locaux seulement : `Authorization: Bearer <RUNNER_DEV_SECRET>`).

Construction depuis la **racine du dépôt** (éditeur Scratch copié au préalable par `npm run editor:install`), puis déploiement (remplacer `PROJET`) :

    gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com iam.googleapis.com
    gcloud artifacts repositories create parcours --repository-format=docker --location=europe-west1
    docker build --platform linux/amd64 -f runner-service/Dockerfile -t europe-west1-docker.pkg.dev/PROJET/parcours/runner .
    gcloud auth configure-docker europe-west1-docker.pkg.dev && docker push europe-west1-docker.pkg.dev/PROJET/parcours/runner
    gcloud run deploy correction-runner --image=europe-west1-docker.pkg.dev/PROJET/parcours/runner --region=europe-west1 --execution-environment=gen2 --memory=2Gi --cpu=1 --concurrency=1 --min-instances=0 --max-instances=10 --timeout=300 --no-allow-unauthenticated

Côté site (Vercel) : un compte de service qui ne peut **qu'appeler ce service**, et sa clé JSON en base64 dans `AUTOGRADE_RUNNER_SA_KEY` (variable sensible), avec `AUTOGRADE_RUNNER_URL` = l'adresse `https://…run.app` du service :

    gcloud iam service-accounts create parcours-runner-invoker
    gcloud run services add-iam-policy-binding correction-runner --region=europe-west1 --member=serviceAccount:parcours-runner-invoker@PROJET.iam.gserviceaccount.com --role=roles/run.invoker
    gcloud iam service-accounts keys create %USERPROFILE%\cle-runner.json --iam-account=parcours-runner-invoker@PROJET.iam.gserviceaccount.com
    node -e "process.stdout.write(require('fs').readFileSync(process.env.USERPROFILE + '/cle-runner.json').toString('base64'))"   # valeur de AUTOGRADE_RUNNER_SA_KEY, puis supprimer cle-runner.json

Créer la clé **en dehors du dépôt** (ici dans le dossier personnel), ne jamais la copier dans le projet, et la supprimer dès que sa valeur est dans Vercel.

Ne pas utiliser `gcloud run deploy --source` : sans Dockerfile à la racine, il construirait le site, et l'éditeur (ignoré par git) manquerait. Essai local : `docker run --rm -p 8080:8080 -e RUNNER_DEV_SECRET=<secret> <image>`.
