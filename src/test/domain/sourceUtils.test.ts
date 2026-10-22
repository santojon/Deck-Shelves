import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities } from '../../domain/sourceUtils'

describe('decodeHtmlEntities', () => {
  it('decodes the names Steam\'s store search sends HTML-encoded', () => {
    expect(decodeHtmlEntities('Popcorn &amp; Premieren - Ausgehviertel')).toBe('Popcorn & Premieren - Ausgehviertel')
    expect(decodeHtmlEntities('Tom Clancy&#39;s &quot;Ghost&quot; &lt;Recon&gt; &apos;x&apos;')).toBe('Tom Clancy\'s "Ghost" <Recon> \'x\'')
  })

  it('decodes decimal and hex character references', () => {
    expect(decodeHtmlEntities('Caf&#233; &#x2122; &#X1F3AE;')).toBe('Café ™ 🎮')
  })

  it('decodes once, so an encoded entity stays an entity', () => {
    expect(decodeHtmlEntities('&amp;lt; &amp;amp;')).toBe('&lt; &amp;')
  })

  it('leaves plain text, unknown names and invalid references alone', () => {
    const plain = 'Popcorn & Premieren'
    expect(decodeHtmlEntities(plain)).toBe(plain)
    expect(decodeHtmlEntities('A &nbsp; B &unknown; C')).toBe('A &nbsp; B &unknown; C')
    expect(decodeHtmlEntities('&#0; &#x110000; &amp')).toBe('&#0; &#x110000; &amp')
    expect(decodeHtmlEntities('')).toBe('')
  })
})
