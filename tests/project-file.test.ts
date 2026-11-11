import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { inspectScratchFile, MAX_PROJECT_BYTES } from '@/lib/scratch/project-file'

const read = (p: string) => new Uint8Array(fs.readFileSync(p))

describe('inspectScratchFile', () => {
  it('reconnaît un .sb3 (Capytale) et un .sb2 (breizh)', () => {
    expect(inspectScratchFile(read('tests/fixtures/defi1-capytale.sb3'))).toEqual({ ok: true, format: 'sb3' })
    expect(inspectScratchFile(read('tests/fixtures/le-serpent.sb2'))).toEqual({ ok: true, format: 'sb2' })
    expect(inspectScratchFile(read('scratch-editor/blank.sb3'))).toEqual({ ok: true, format: 'sb3' })
  })

  it('refuse ce qui n’est pas un projet Scratch', () => {
    expect(inspectScratchFile(strToU8('bonjour')).ok).toBe(false)
    expect(inspectScratchFile(zipSync({ 'autre.txt': strToU8('x') })).ok).toBe(false)
    expect(inspectScratchFile(zipSync({ 'project.json': strToU8('{pas du json') })).ok).toBe(false)
    expect(inspectScratchFile(zipSync({ 'project.json': strToU8('{"foo":1}') })).ok).toBe(false)
  })

  it("refuse une archive piégée dont l'en-tête ment sur la taille de project.json", () => {
    const zip = zipSync({ 'project.json': new Uint8Array(60 * 1024 * 1024) }) // 60 Mo de zéros, quelques dizaines de ko compressés
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    view.setUint32(22, 100, true) // taille décompressée annoncée dans l'en-tête local
    const cd = zip.byteLength - 22 - 46 - 'project.json'.length
    view.setUint32(cd + 24, 100, true) // et dans le répertoire central
    const before = process.memoryUsage().arrayBuffers
    expect(inspectScratchFile(zip).ok).toBe(false)
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(30 * 1024 * 1024)
  })

  it('refuse un project.json de plus de 10 Mo (archive très compressée envoyée en boucle)', () => {
    const json = strToU8(JSON.stringify({ targets: [], padding: ' '.repeat(11 * 1024 * 1024) }))
    const zip = zipSync({ 'project.json': json })
    expect(zip.byteLength).toBeLessThan(100 * 1024) // quelques dizaines de ko envoyés…
    expect(inspectScratchFile(zip).ok).toBe(false) // …ne doivent pas faire décompresser 11 Mo
  })

  it('refuse un fichier trop gros sans le décompresser', () => {
    const big = new Uint8Array(MAX_PROJECT_BYTES + 1)
    expect(inspectScratchFile(big)).toMatchObject({ ok: false, tooLarge: true })
  })
})
