import { z } from 'zod'

const artist = z.object({ id: z.uuid(), name: z.string().min(1).max(200), disambiguation: z.string().optional() })
const recording = z.object({
  id: z.uuid(), title: z.string().min(1).max(200), disambiguation: z.string().optional(),
  'artist-credit': z.array(z.object({ name: z.string().optional(), artist: z.object({ name: z.string() }).optional() })).optional(),
})
export const searchInput = z.object({ type: z.enum(['artist', 'song']), query: z.string().trim().min(2).max(100) }).strict()
export function providerUrl(type: 'artist' | 'song', query: string) {
  const entity = type === 'artist' ? 'artist' : 'recording'
  const url = new URL(`https://musicbrainz.org/ws/2/${entity}`)
  const escaped = query.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1')
  url.search = new URLSearchParams({ query: `${entity === 'artist' ? 'artist' : 'recording'}:"${escaped}"`, fmt: 'json', limit: '10' }).toString()
  return url
}
export function mapProvider(type: 'artist' | 'song', body: unknown) {
  if (type === 'artist') {
    return z.object({ artists: z.array(artist) }).parse(body).artists.map(a => ({
      type, external_id: a.id, display_value: a.name, subtitle: a.disambiguation || null,
      source_url: `https://musicbrainz.org/artist/${a.id}`, attribution: 'MusicBrainz',
    }))
  }
  return z.object({ recordings: z.array(recording) }).parse(body).recordings.map(r => ({
    type, external_id: r.id, display_value: r.title,
    subtitle: (r['artist-credit'] ?? []).map(c => c.name ?? c.artist?.name ?? '').filter(Boolean).join(', ') || r.disambiguation || null,
    source_url: `https://musicbrainz.org/recording/${r.id}`, attribution: 'MusicBrainz',
  }))
}
