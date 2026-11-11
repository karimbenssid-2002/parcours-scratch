// Installe le sous-paquet scratch-editor si besoin et copie l'éditeur dans public/scratch-editor/.
// --if-missing : ne recopie pas la build (17 Mo) si elle est déjà là, mais recopie toujours editor.html, runner.html et blank.sb3.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkgDir = path.join(root, 'scratch-editor')
const dist = path.join(pkgDir, 'node_modules', '@scratch', 'scratch-gui', 'dist')
const out = path.join(root, 'public', 'scratch-editor')
const ifMissing = process.argv.includes('--if-missing')
const alreadyCopied = fs.existsSync(path.join(out, 'scratch-gui-standalone.js'))

if (!(ifMissing && alreadyCopied)) {
  if (!fs.existsSync(dist)) execSync('npm install --no-audit --no-fund', { cwd: pkgDir, stdio: 'inherit' })
  fs.rmSync(out, { recursive: true, force: true })
  // scratch-gui.js (17 Mo) : version « bibliothèque » que rien ne charge, seule la version autonome sert.
  const unused = new Set(['scratch-gui.js', 'scratch-gui.js.LICENSE.txt'].map((f) => path.join(dist, f)))
  fs.cpSync(dist, out, { recursive: true, filter: (src) => !src.endsWith('.map') && !unused.has(src) })
  console.log('Éditeur Scratch copié dans public/scratch-editor/')
}
fs.mkdirSync(out, { recursive: true })
for (const file of ['editor.html', 'runner.html', 'blank.sb3']) fs.copyFileSync(path.join(pkgDir, file), path.join(out, file))
