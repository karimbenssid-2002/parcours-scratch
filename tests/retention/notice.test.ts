import { describe, expect, it } from 'vitest'
import { retentionNoticeText } from '@/lib/retention/notice'

const ELEVE = 'Le 31 juillet, tous les projets seront effacés pour la nouvelle année. Télécharge ceux que tu veux garder avec le lien « Télécharger mon projet » de chaque défi.'
const ENSEIGNANT = 'Le 31 juillet, toutes les classes et les travaux des élèves seront effacés. Vous recréerez vos classes à la rentrée.'

describe('bandeau de conservation', () => {
  it('dans la période (15 juin - 30 juillet), le texte de l’audience', () => {
    expect(retentionNoticeText('eleve', Date.parse('2027-06-15T12:00:00Z'))).toBe(ELEVE)
    expect(retentionNoticeText('enseignant', Date.parse('2027-07-30T12:00:00Z'))).toBe(ENSEIGNANT)
  })
  it('hors période, rien', () => {
    expect(retentionNoticeText('eleve', Date.parse('2027-06-14T12:00:00Z'))).toBeNull()
    expect(retentionNoticeText('enseignant', Date.parse('2027-11-19T12:00:00Z'))).toBeNull()
  })
})
