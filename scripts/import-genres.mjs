import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { setTimeout as sleep } from 'node:timers/promises'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MUSICBRAINZ_USER_AGENT } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MUSICBRAINZ_USER_AGENT) {
  throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and MUSICBRAINZ_USER_AGENT in your shell. Never use VITE_ for privileged keys.')
}
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const responseSchema = z.object({ 'genre-count': z.number().int(), genres: z.array(z.object({ id: z.uuid(), name: z.string().min(1).max(200), disambiguation: z.string().optional() })) })
// Run during maintenance with catalog search stopped: imports share the upstream IP quota.
for (let offset = 0, count = 1; offset < count; offset += 100) {
  const response = await fetch(`https://musicbrainz.org/ws/2/genre/all?fmt=json&limit=100&offset=${offset}`, { headers: { 'User-Agent': MUSICBRAINZ_USER_AGENT }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`MusicBrainz HTTP ${response.status}; import stopped. Rerunning is safe.`)
  const parsed = responseSchema.parse(await response.json())
  count = parsed['genre-count']
  const { error } = await admin.from('catalog_items').upsert(parsed.genres.map(genre => ({
    type: 'genre', external_id: genre.id, display_value: genre.name, subtitle: genre.disambiguation || null,
    source_url: `https://musicbrainz.org/genre/${genre.id}`, attribution: 'MusicBrainz',
  })), { onConflict: 'type,external_id' })
  if (error) throw new Error(`Genre persistence failed (${error.code}); import stopped.`)
  console.log(`Imported ${Math.min(offset + 100, count)} / ${count} genres.`)
  if (offset + 100 < count) await sleep(1100)
}
