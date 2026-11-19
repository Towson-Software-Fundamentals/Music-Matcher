import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GENRE_SYNONYMS, POPULAR_GENRES, rankGenres } from '../src/features/catalog/genre-search'
import type { CatalogItem } from '../src/shared/contracts'

// Build the catalog from the real migration so the tests track the imported MusicBrainz names.
const migration = readFileSync('supabase/migrations/20261119120000_musicbrainz_genres.sql', 'utf8')
const genres: CatalogItem[] = [...migration.matchAll(/^ {2}\('([0-9a-f-]{36})','((?:[^']|'')*)',/gm)].map(([, id, name]) => ({
  id, type: 'genre', displayValue: name.replace(/''/g, "'"), subtitle: null, provider: 'musicbrainz',
  externalId: id, sourceUrl: `https://musicbrainz.org/genre/${id}`, attribution: 'MusicBrainz',
}))
const names = (query: string, limit?: number) => rankGenres(genres, query, limit).map(g => g.displayValue)

describe('genre search', () => {
  it('imports the full MusicBrainz genre list', () => {
    expect(genres).toHaveLength(2227)
    expect(new Set(genres.map(g => g.id)).size).toBe(2227)
  })

  it('only points synonyms and popular picks at genres that exist', () => {
    const known = new Set(genres.map(g => g.displayValue))
    for (const target of [...POPULAR_GENRES, ...Object.values(GENRE_SYNONYMS).flat()]) expect(known, target).toContain(target)
  })

  it('shows popular genres before anything is typed', () => {
    expect(names('').slice(0, 5)).toEqual(['hip hop', 'r&b', 'rock', 'pop', 'country'])
  })

  it('puts the exact genre first, then names that start with the query', () => {
    expect(names('rock')[0]).toBe('rock')
    expect(names('rock').slice(1, 3).every(n => n.startsWith('rock'))).toBe(true)
    expect(names('Pop ')[0]).toBe('pop')
    expect(names('jazz')[0]).toBe('jazz')
  })

  it('finds everyday words that MusicBrainz files under another name', () => {
    expect(names('rap')[0]).toBe('hip hop')
    expect(names('rap')).toContain('cloud rap')
    expect(names('RAP')[0]).toBe('hip hop')
    expect(names('bollywood').slice(0, 2)).toEqual(['filmi', 'indian pop'])
    expect(names('hip-hop')[0]).toBe('hip hop')
  })

  it('ranks word starts above plain substrings and respects the limit', () => {
    const house = names('house', 200)
    expect(house[0]).toBe('house')
    expect(house.indexOf('deep house')).toBeLessThan(house.findIndex(n => !n.split(/[\s\-/&]+/).some(w => w.startsWith('house'))) >>> 0)
    expect(names('o')).toHaveLength(40)
    expect(names('zzzz')).toEqual([])
  })
})
