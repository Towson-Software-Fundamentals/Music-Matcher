import type { CatalogItem } from '../../shared/contracts'

/**
 * Everyday words that MusicBrainz files under another genre name (it has no aliases for these).
 * Each maps to the MusicBrainz genres to show first.
 */
export const GENRE_SYNONYMS: Record<string, string[]> = {
  rap: ['hip hop'],
  'hip-hop': ['hip hop'],
  hiphop: ['hip hop'],
  rnb: ['r&b'],
  'r and b': ['r&b'],
  bollywood: ['filmi', 'indian pop'],
  desi: ['filmi', 'indian pop', 'bhangra'],
  punjabi: ['bhangra'],
  'electronic dance music': ['edm'],
  dance: ['dance', 'edm'],
  christian: ['gospel', 'christian hip hop'],
  worship: ['gospel'],
  lofi: ['lo-fi', 'lo-fi hip hop'],
  'lo fi': ['lo-fi', 'lo-fi hip hop'],
  kpop: ['k-pop'],
  jpop: ['j-pop'],
  afrobeat: ['afrobeats', 'afrobeat'],
  latin: ['latin', 'reggaeton', 'latin pop'],
  'video game': ['chiptune'],
  game: ['chiptune'],
  soundtrack: ['cinematic classical', 'orchestral'],
  'film score': ['cinematic classical', 'orchestral'],
}

/** Shown before the user types: the broad genres most US listeners pick, plus the app's audience. */
export const POPULAR_GENRES = [
  'hip hop', 'r&b', 'rock', 'pop', 'country', 'latin', 'electronic', 'edm', 'indie rock', 'alternative rock',
  'jazz', 'soul', 'funk', 'afrobeats', 'reggaeton', 'k-pop', 'filmi', 'indian pop', 'classical', 'metal',
]

const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Rank genres for a query: synonyms and exact names first, then names starting with the query,
 * then names with a word starting with it, then any other substring match. Ties stay alphabetical.
 */
export function rankGenres(items: CatalogItem[], query: string, limit = 40): CatalogItem[] {
  const q = fold(query)
  const byName = new Map(items.map(item => [fold(item.displayValue), item]))
  if (!q) return POPULAR_GENRES.flatMap(name => byName.get(name) ?? []).slice(0, limit)

  const preferred = (GENRE_SYNONYMS[q] ?? []).flatMap(name => byName.get(name) ?? [])
  const seen = new Set(preferred.map(item => item.id))
  const scored: { item: CatalogItem; score: number }[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    const name = fold(item.displayValue)
    const score = name === q ? 0
      : name.startsWith(q) ? 1
        : name.split(/[\s\-/&]+/).some(word => word.startsWith(q)) ? 2
          : name.includes(q) ? 3 : -1
    if (score >= 0) scored.push({ item, score })
  }
  scored.sort((a, b) => a.score - b.score || a.item.displayValue.localeCompare(b.item.displayValue))
  return [...preferred, ...scored.map(s => s.item)].slice(0, limit)
}
