# Image du service d'exécution des programmes Scratch (Cloud Run), construite depuis la racine du dépôt :
#   docker build --platform linux/amd64 -f runner-service/Dockerfile -t <image> .
# Ce qui entre dans le contexte est listé dans .dockerignore. Voir runner-service/README.md.
# Node (Debian bookworm, version légère) et seulement le Chromium « headless shell » de la version de playwright-core
# du projet, avec ses bibliothèques système : ni Firefox, ni WebKit, ni Chromium complet.
FROM node:24-bookworm-slim

ENV NODE_ENV=production PORT=8080 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

COPY runner-service/package.json runner-service/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
  && node node_modules/playwright-core/cli.js install --with-deps --only-shell --no-progress chromium \
  && npm cache clean --force && rm -rf /var/lib/apt/lists/* /tmp/*

# Le code de l'exécuteur du site, tel quel, la page d'exécution et l'éditeur Scratch construit (lus depuis
# <dossier courant>/public/scratch-editor par lib/autograde/runner/browser.ts).
COPY lib/http/body.ts lib/http/body.ts
COPY lib/autograde/runner/ lib/autograde/runner/
COPY runner-service/server.ts runner-service/handler.ts runner-service/http.ts runner-service/
COPY public/scratch-editor/ public/scratch-editor/

# Utilisateur sans droits (fourni par l'image node, uid 1000).
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "--conditions=react-server", "runner-service/server.ts"]
