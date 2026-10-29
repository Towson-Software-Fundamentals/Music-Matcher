import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { normalize, validatePreferences } from './contracts'
import { decode } from './client'
import { mapProvider, providerUrl, searchInput } from '../../supabase/functions/catalog-search/provider'

describe('shared and provider contracts', () => {
  it('rejects duplicate normalized custom values, blanks and excessive counts', () => {
    const item = { type: 'genre' as const, source: 'custom' as const, displayValue: 'Jazz' }
    expect(normalize('\u00a0Jazz\t Fusion ')).toBe('jazz fusion')
    expect(validatePreferences([item, { ...item, displayValue: ' JAZZ ' }])).toContain('Duplicate')
    expect(validatePreferences([{ ...item, displayValue: ' ' }])).toContain('1–200')
    expect(validatePreferences(Array(101).fill(item))).toContain('100')
    expect(validatePreferences([item, { ...item, type: 'artist' }])).toBeNull()
  })
  it('distinguishes malformed responses from successful empty arrays', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(decode(z.array(z.string()), { data: [], error: null })).toEqual({ data: [], error: null })
    expect(decode(z.array(z.string()), { data: 'invalid', error: null }).error?.code).toBe('INTERNAL_ERROR')
    log.mockRestore()
  })
  it('validates provider queries and fixes the upstream host', () => {
    expect(searchInput.safeParse({ type: 'genre', query: 'jazz' }).success).toBe(false)
    expect(searchInput.safeParse({ type: 'artist', query: 'a', url: 'https://other.invalid' }).success).toBe(false)
    const url = providerUrl('artist', 'Adele" OR *:*')
    expect(url.hostname).toBe('musicbrainz.org')
    expect(url.searchParams.get('query')).toContain('\\"')
    expect(url.searchParams.get('limit')).toBe('10')
  })
  it('maps recording credits and rejects invalid upstream payloads', () => {
    const id = '30000000-0000-4000-8000-000000000001'
    expect(mapProvider('song', { recordings: [{ id, title: 'Hello', 'artist-credit': [{ name: 'Adele' }] }] })[0]).toMatchObject({ type: 'song', subtitle: 'Adele', display_value: 'Hello' })
    expect(() => mapProvider('artist', { artists: [{ id: 'invalid', name: 'Adele' }] })).toThrow()
    expect(mapProvider('artist', { artists: [] })).toEqual([])
  })
})
