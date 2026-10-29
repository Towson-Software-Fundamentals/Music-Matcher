import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { mapProvider, providerUrl, searchInput } from './provider.ts'

const gateSchema = z.object({
  cached: z.array(z.unknown()).optional(), limited: z.boolean().optional(), retryAfterSeconds: z.number().optional(),
  reserved: z.boolean().optional(),
})
const rowSchema = z.object({
  id: z.uuid(), type: z.enum(['artist', 'song']), external_id: z.uuid(), display_value: z.string(),
  subtitle: z.string().nullable(), source_url: z.url(), attribution: z.string(),
})

Deno.serve(async (request: Request) => {
  const origin = Deno.env.get('APP_ORIGIN')
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin ?? 'http://127.0.0.1:5180',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  const fail = (status: number, code: string, message: string, retryAfterSeconds?: number) =>
    new Response(JSON.stringify({ data: null, error: { code, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) } }),
      { status, headers: { ...headers, ...(retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {}) } })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Use POST.')
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const agent = Deno.env.get('MUSICBRAINZ_USER_AGENT') ??
    'PartyMusicMatcher/0.1 (+https://github.com/Towson-Software-Fundamentals/Music-Matcher)'
  if (!url || !key || !agent) {
    console.error('Catalog server configuration is incomplete')
    return fail(503, 'CATALOG_UNAVAILABLE', 'Catalog search is not configured. Custom entry is still available.')
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const token = request.headers.get('authorization')?.replace(/^Bearer /i, '')
  if (!token) return fail(401, 'UNAUTHENTICATED', 'Please sign in.')
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user) return fail(401, 'UNAUTHENTICATED', 'Your session expired. Please sign in again.')
  let raw: unknown
  try {
    const text = await request.text()
    if (new TextEncoder().encode(text).length > 4096) return fail(400, 'VALIDATION_FAILED', 'Search request is too large.')
    raw = JSON.parse(text)
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return fail(400, 'VALIDATION_FAILED', 'Invalid JSON.')
  }
  const parsed = searchInput.safeParse(raw)
  if (!parsed.success) return fail(400, 'VALIDATION_FAILED', 'Choose artist or song and enter 2–100 characters.')
  const { type, query } = parsed.data
  const cacheKey = `${type}:${query.toLowerCase()}`
  const { data: gateData, error: gateError } = await admin.rpc('catalog_gateway', {
    p_request: { action: 'read', key: cacheKey, userId: auth.user.id },
  })
  const gate = gateSchema.safeParse(gateData)
  if (gateError || !gate.success) {
    console.error('Catalog request gate failed', gateError?.code)
    return fail(503, 'CATALOG_UNAVAILABLE', 'Catalog search could not be started. Please retry.')
  }
  if (gate.data.limited) return fail(429, 'RATE_LIMITED', 'Catalog search is busy. Please wait before retrying.', gate.data.retryAfterSeconds ?? 1)
  if (gate.data.cached) return new Response(JSON.stringify({ data: { items: gate.data.cached, cache: 'hit' }, error: null }), { headers })
  let response: Response
  try {
    response = await fetch(providerUrl(type, query), { headers: { 'User-Agent': agent, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  } catch (error) {
    if (!(error instanceof TypeError) && !(error instanceof DOMException)) throw error
    console.error('MusicBrainz request failed', error.name)
    return fail(503, 'CATALOG_UNAVAILABLE', 'MusicBrainz is unavailable. Retry or add a custom entry.')
  }
  if (!response.ok) {
    console.error('MusicBrainz HTTP error', response.status)
    return fail(503, 'CATALOG_UNAVAILABLE', 'MusicBrainz is busy. Retry later or add a custom entry.')
  }
  let mapped: ReturnType<typeof mapProvider>
  try {
    mapped = mapProvider(type, await response.json())
  } catch (error) {
    if (!(error instanceof z.ZodError) && !(error instanceof SyntaxError)) throw error
    console.error('Invalid MusicBrainz payload', error.name)
    return fail(503, 'CATALOG_UNAVAILABLE', 'The catalog returned invalid data. Please retry later.')
  }
  const unique = [...new Map(mapped.map(row => [row.external_id, row])).values()]
  let items: object[] = []
  if (unique.length) {
    const { data, error } = await admin.from('catalog_items').upsert(unique, { onConflict: 'type,external_id' }).select('*')
    const rows = z.array(rowSchema).safeParse(data)
    if (error || !rows.success) {
      console.error('Catalog persistence failed', error?.code)
      return fail(503, 'CATALOG_UNAVAILABLE', 'Catalog selections could not be stored. Please retry.')
    }
    items = rows.data.map(row => ({
      id: row.id, type: row.type, externalId: row.external_id, displayValue: row.display_value,
      subtitle: row.subtitle, provider: 'musicbrainz', sourceUrl: row.source_url, attribution: row.attribution,
    }))
  }
  const cached = await admin.rpc('catalog_gateway', { p_request: { action: 'cache', key: cacheKey, value: items } })
  if (cached.error) {
    console.error('Catalog cache persistence failed', cached.error.code)
    return fail(503, 'CATALOG_UNAVAILABLE', 'The catalog response could not be cached. Please retry.')
  }
  return new Response(JSON.stringify({ data: { items, cache: 'miss' }, error: null }), { headers })
})
