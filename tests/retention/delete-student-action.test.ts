import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/session', () => ({ requireTeacher: vi.fn(async () => ({ id: 'admin', role: 'admin' })) }))
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }))
const erase = vi.hoisted(() => ({
  eraseStudent: vi.fn<(...args: unknown[]) => Promise<{ found: boolean; files: number; filesPending: boolean }>>(),
}))
vi.mock('@/lib/retention/erase', () => erase)

const { deleteStudent } = await import('@/app/admin/(espace)/eleves/actions')

afterEach(() => { erase.eraseStudent.mockReset(); cache.revalidatePath.mockClear() })

describe('action « supprimer l’élève »', () => {
  it('tout est effacé : aucun message, liste rechargée', async () => {
    erase.eraseStudent.mockResolvedValueOnce({ found: true, files: 3, filesPending: false })
    expect(await deleteStudent('s1')).toEqual({})
    expect(cache.revalidatePath).toHaveBeenCalledWith('/admin/eleves')
  })

  it('fichiers pas encore effacés : le dit honnêtement, sans erreur', async () => {
    erase.eraseStudent.mockResolvedValueOnce({ found: true, files: 0, filesPending: true })
    expect(await deleteStudent('s1')).toEqual({ notice: 'L’élève a été supprimé. Ses fichiers seront effacés automatiquement cette nuit.' })
    expect(cache.revalidatePath).toHaveBeenCalledWith('/admin/eleves')
  })

  it('élève introuvable : erreur', async () => {
    erase.eraseStudent.mockResolvedValueOnce({ found: false, files: 0, filesPending: false })
    expect(await deleteStudent('s1')).toEqual({ error: 'Élève introuvable.' })
    expect(cache.revalidatePath).not.toHaveBeenCalled()
  })

  it('erreur de la base (rien n’est effacé) : message d’échec, journal sans l’adresse de l’élève', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    erase.eraseStudent.mockRejectedValueOnce(new Error('Failed query: delete from "class_students"\nparams: alice.exemple@malraux-rabat.org',
      { cause: new Error('base indisponible pour alice.exemple@malraux-rabat.org') }))
    expect(await deleteStudent('s1')).toEqual({ error: 'La suppression a échoué. Rechargez la page.' })
    expect(cache.revalidatePath).not.toHaveBeenCalled()
    const logged = JSON.stringify(log.mock.calls)
    expect(logged).toContain('base indisponible')
    expect(logged).not.toContain('@')
    log.mockRestore()
  })
})
