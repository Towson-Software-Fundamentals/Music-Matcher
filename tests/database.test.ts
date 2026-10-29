import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { comparisonSchema, normalize, preferenceSetSchema } from '../src/shared/contracts'

const db = new PGlite()
const users = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003']
let a: string, b: string, match: string
const input = (displayValue: string, type = 'genre') => ({ type, source: 'custom', displayValue })
async function actor(index: number) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[index]])
}
async function rpc(name: string, request?: object) {
  const { rows } = await db.query<{ result: { data: unknown; error: { code: string } | null } }>(
    `select public.${name}(${request ? '$1::jsonb' : ''}) result`, request ? [JSON.stringify(request)] : [])
  return rows[0].result
}
async function profile(index: number) {
  await actor(index)
  const created = await rpc('ensure_my_profile', { displayName: `User ${index}`, handle: `user_${index}` })
  const p = created.data as { id: string }
  await rpc('update_my_profile', { displayName: `User ${index}`, handle: `user_${index}`, comparisonEnabled: true, expectedRevision: 1 })
  return p.id
}

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
  `)
  for (const id of users) await db.query('insert into auth.users values($1)', [id])
  for (const migration of readdirSync('supabase/migrations').sort()) {
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'))
  }
  a = await profile(0); b = await profile(1); await profile(2)
}, 30000)
afterAll(() => db.close())

describe('PostgreSQL application contracts', () => {
  it('creates profiles idempotently and protects handles and revisions', async () => {
    await actor(0)
    expect((await rpc('ensure_my_profile', { displayName: 'Ignored', handle: 'other' })).data).toMatchObject({ id: a, handle: 'user_0' })
    expect((await rpc('update_my_profile', { displayName: 'A', handle: 'user_1', comparisonEnabled: true, expectedRevision: 2 })).error?.code).toBe('HANDLE_TAKEN')
    expect((await rpc('update_my_profile', { displayName: 'A', handle: 'unique', comparisonEnabled: true, expectedRevision: 1 })).error?.code).toBe('STALE_WRITE')
    expect((await rpc('update_my_profile', { expectedRevision: 2 })).error?.code).toBe('VALIDATION_FAILED')
  })

  it('saves, replaces, clears, rejects duplicates, blanks, types and stale writes', async () => {
    await actor(0)
    expect(preferenceSetSchema.parse((await rpc('save_my_preferences', { expectedRevision: 0, items: [input('Jazz')] })).data).revision).toBe(1)
    for (const items of [[input(' Jazz '), input('jazz')], [input(' \t ')], [input('happy', 'mood')]]) {
      expect((await rpc('save_my_preferences', { expectedRevision: 1, items })).error?.code).toBe('VALIDATION_FAILED')
    }
    expect((await rpc('save_my_preferences', { expectedRevision: 0, items: [] })).error?.code).toBe('STALE_WRITE')
    expect((await rpc('save_my_preferences', { expectedRevision: 1, items: [], ownerId: users[1] })).error?.code).toBe('VALIDATION_FAILED')
    expect(preferenceSetSchema.parse((await rpc('save_my_preferences', { expectedRevision: 1, items: [] })).data).items).toEqual([])
    await rpc('save_my_preferences', { expectedRevision: 2, items: [input(' Jazz '), input('Adele', 'artist')] })
    await actor(1)
    await rpc('save_my_preferences', { expectedRevision: 0, items: [input('jazz'), input('Drake', 'artist')] })
  })

  it('rolls back a failure after deletion without partial replacement', async () => {
    await actor(0)
    await db.exec(`create function private.inject_failure() returns trigger language plpgsql as $$
      begin raise exception 'test failure'; end $$;
      create trigger test_failure before insert on public.music_preferences for each row execute function private.inject_failure();`)
    await expect(rpc('save_my_preferences', { expectedRevision: 3, items: [input('Rock')] })).rejects.toThrow('test failure')
    await db.exec('drop trigger test_failure on public.music_preferences')
    const saved = preferenceSetSchema.parse((await rpc('get_my_preferences')).data)
    expect(saved.revision).toBe(3)
    expect(saved.items.map(i => i.normalizedValue)).toEqual(['adele', 'jazz'])
  })

  it('normalizes the documented whitespace and Unicode fixtures consistently', async () => {
    for (const text of [' Jazz \t fusion\n', '\u00a0BjÖrk\u2003', '\uFEFFÉLECTRO\u202fPOP ', 'Beyoncé']) {
      const { rows } = await db.query<{ value: string }>('select private.normalize($1) value', [text])
      expect(rows[0].value).toBe(normalize(text))
    }
  })

  it('calculates 0, 1, and 1/3 and saves complete immutable results', async () => {
    const j = { type: 'genre', displayValue: 'Jazz', normalizedValue: 'jazz' }
    const rock = { ...j, displayValue: 'Rock', normalizedValue: 'rock' }
    for (const [other, score] of [[j, 1], [rock, 0]] as const) {
      const { rows } = await db.query<{ result: { score: number } }>('select private.calculate_overlap($1,$2) result', [JSON.stringify([j]), JSON.stringify([other])])
      expect(rows[0].result.score).toBe(score)
    }
    await actor(0)
    const result = await rpc('create_comparison', { targetProfileId: b, requestId: '20000000-0000-4000-8000-000000000001' })
    expect(result.error).toBeNull()
    match = (result.data as { id: string }).id
    const snapshot = comparisonSchema.parse((await rpc('get_comparison', { id: match })).data)
    expect(snapshot.score).toBeCloseTo(1 / 3)
    expect(snapshot.shared[0].normalizedValue).toBe('jazz')
    expect(snapshot.onlyA[0].normalizedValue).toBe('adele')
    expect(snapshot.onlyB[0].normalizedValue).toBe('drake')
    const retry = await rpc('create_comparison', { targetProfileId: b, requestId: '20000000-0000-4000-8000-000000000001' })
    expect(retry.data).toEqual(result.data)
    await rpc('save_my_preferences', { expectedRevision: 3, items: [] })
    expect((await rpc('get_comparison', { id: match })).data).toEqual(snapshot)
  })

  it('rejects same, empty, unavailable and nonconsenting profiles', async () => {
    await actor(0)
    const requestId = '20000000-0000-4000-8000-000000000002'
    expect((await rpc('create_comparison', { targetProfileId: a, requestId })).error?.code).toBe('SAME_PROFILE')
    expect((await rpc('create_comparison', { targetProfileId: b, requestId })).error?.code).toBe('INSUFFICIENT_PREFERENCES')
    expect((await rpc('create_comparison', { targetProfileId: requestId, requestId })).error?.code).toBe('PROFILE_UNAVAILABLE')
    await actor(1)
    await rpc('update_my_profile', { displayName: 'B', handle: 'user_1', comparisonEnabled: false, expectedRevision: 2 })
    await actor(0)
    expect((await rpc('lookup_comparison_profile', { handle: 'user_1' })).error?.code).toBe('PROFILE_UNAVAILABLE')
    expect((await rpc('create_comparison', { targetProfileId: b, requestId })).error?.code).toBe('PROFILE_UNAVAILABLE')
    expect((await rpc('create_comparison', { targetProfileId: b, requestId: '20000000-0000-4000-8000-000000000001' })).error).toBeNull()
  })

  it('enforces API grants, RLS and participant-only result access', async () => {
    await actor(2)
    expect((await rpc('get_comparison', { id: match })).error?.code).toBe('NOT_FOUND')
    await db.exec('set role authenticated')
    expect((await db.query('select * from public.matches')).rows).toHaveLength(0)
    expect((await db.query('select * from public.music_preferences')).rows).toHaveLength(0)
    await expect(db.query("delete from public.music_preferences")).rejects.toThrow('permission denied')
    await expect(db.query("select public.catalog_gateway('{}')")).rejects.toThrow('permission denied')
    await db.exec('reset role; set role anon')
    await expect(db.query('select public.get_my_preferences()')).rejects.toThrow('permission denied')
    await db.exec('reset role')
    await actor(1)
    expect((await rpc('get_comparison', { id: match })).error).toBeNull()
  })

  it('paginates history and returns no duplicate entries', async () => {
    await actor(0)
    await rpc('save_my_preferences', { expectedRevision: 4, items: [input('jazz')] })
    await actor(1)
    await rpc('update_my_profile', { displayName: 'B', handle: 'user_1', comparisonEnabled: true, expectedRevision: 3 })
    await actor(0)
    for (let i = 3; i <= 5; i++) await rpc('create_comparison', { targetProfileId: b, requestId: `20000000-0000-4000-8000-00000000000${i}` })
    const first = (await rpc('list_my_comparisons', { limit: 2 })).data as { items: { id: string }[]; nextCursor: object }
    const next = (await rpc('list_my_comparisons', { limit: 2, before: first.nextCursor })).data as { items: { id: string }[]; nextCursor: null }
    expect(first.items).toHaveLength(2); expect(next.items).toHaveLength(2)
    expect(new Set([...first.items, ...next.items].map(i => i.id)).size).toBe(4)
    expect(next.nextCursor).toBeNull()
  })

  it('resolves trusted catalog labels and rejects catalog spoofing', async () => {
    const id = '30000000-0000-4000-8000-000000000001'
    await db.query(`insert into public.catalog_items(id,type,external_id,display_value,source_url) values($1::uuid,'artist',$1::uuid,'Adele','https://musicbrainz.org/artist/'||$1::text)`, [id])
    await actor(2)
    const saved = await rpc('save_my_preferences', { expectedRevision: 0, items: [{ type: 'artist', source: 'catalog', catalogItemId: id }] })
    expect(preferenceSetSchema.parse(saved.data).items[0].displayValue).toBe('Adele')
    expect((await rpc('save_my_preferences', { expectedRevision: 1, items: [{ type: 'song', source: 'catalog', catalogItemId: id }] })).error?.code).toBe('VALIDATION_FAILED')
  })

  it('enforces the shared upstream gate and cache', async () => {
    const request = { action: 'read', key: 'artist:test', userId: users[0] }
    const { rows } = await db.query<{ result: { reserved?: boolean } }>('select public.catalog_gateway($1) result', [JSON.stringify(request)])
    expect(rows[0].result.reserved).toBe(true)
    const busy = await db.query<{ result: { limited: boolean } }>('select public.catalog_gateway($1) result', [JSON.stringify(request)])
    expect(busy.rows[0].result.limited).toBe(true)
    await db.query('select public.catalog_gateway($1)', [JSON.stringify({ action: 'cache', key: request.key, value: [] })])
    const cached = await db.query<{ result: { cached: unknown[] } }>('select public.catalog_gateway($1) result', [JSON.stringify(request)])
    expect(cached.rows[0].result.cached).toEqual([])
  })

  it('compares 100 preferences each within the two-second local target', async () => {
    for (const i of [0, 1]) {
      await actor(i)
      const set = preferenceSetSchema.parse((await rpc('get_my_preferences')).data)
      await rpc('save_my_preferences', { expectedRevision: set.revision, items: Array.from({ length: 100 }, (_, n) => input(`genre ${n}`)) })
    }
    await actor(0)
    const start = performance.now()
    const result = await rpc('create_comparison', { targetProfileId: b, requestId: '20000000-0000-4000-8000-000000000099' })
    const elapsed = performance.now() - start
    expect(result.error).toBeNull()
    expect(elapsed).toBeLessThan(2000)
    console.info(`100-preference SQL comparison + persistence: ${elapsed.toFixed(1)} ms (PGlite, Node ${process.version})`)
  })
})
