import { describe, expect, it } from 'vitest'
import { parseYoutubeId, youtubeEmbedUrl } from '@/lib/youtube'

describe('parseYoutubeId', () => {
  it.each([
    ['https://youtu.be/BSf_DNWz1i8', 'BSf_DNWz1i8'],
    ['https://www.youtube.com/watch?v=BSf_DNWz1i8&t=10s', 'BSf_DNWz1i8'],
    ['https://m.youtube.com/watch?v=BSf_DNWz1i8', 'BSf_DNWz1i8'],
    ['https://www.youtube.com/shorts/BSf_DNWz1i8', 'BSf_DNWz1i8'],
    ['https://www.youtube.com/embed/BSf_DNWz1i8', 'BSf_DNWz1i8'],
    ['https://www.youtube-nocookie.com/embed/BSf_DNWz1i8', 'BSf_DNWz1i8'],
    ['BSf_DNWz1i8', 'BSf_DNWz1i8'],
  ])('%s → %s', (input, id) => expect(parseYoutubeId(input)).toBe(id))

  it.each(['https://vimeo.com/123', 'pas une url', 'https://youtu.be/court', ''])('refuse %s', (input) =>
    expect(parseYoutubeId(input)).toBeNull(),
  )

  it('construit une URL sans cookies', () => {
    // hl=fr : sans ce paramètre, YouTube choisit la langue d'après l'IP (arabe au Maroc)
    expect(youtubeEmbedUrl('BSf_DNWz1i8')).toBe('https://www.youtube-nocookie.com/embed/BSf_DNWz1i8?hl=fr&cc_lang_pref=fr')
  })
})
