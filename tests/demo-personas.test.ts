import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const db = new PGlite()
const seed = readFileSync('supabase/seed.sql', 'utf8')
const visitor = '50000000-0000-4000-8000-000000000001'

type Persona = { id: string; handle: string; items: number; aiEnabled: boolean; comparisonEnabled: boolean }
async function personas() {
  const { rows } = await db.query<Persona>(`
    select p.id, p.handle, p.ai_enabled "aiEnabled", p.comparison_enabled "comparisonEnabled",
      (select count(*)::int from public.music_preferences m where m.profile_id = p.id) items
    from public.music_profiles p where p.handle like 'demo\\_%' order by p.handle`)
  return rows
}
async function rpc(name: string, request: object) {
  const { rows } = await db.query<{ result: { data: Record<string, unknown> | null; error: { code: string } | null } }>(
    `select public.${name}($1::jsonb) result`, [JSON.stringify(request)])
  return rows[0].result
}

beforeAll(async () => {
  // Mirror the auth.users columns the seed writes in a real Supabase project.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(instance_id uuid, id uuid primary key, aud text, role text, email text,
      encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
      created_at timestamptz, updated_at timestamptz, banned_until timestamptz, confirmation_token text,
      recovery_token text, email_change_token_new text, email_change text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
  `)
  for (const migration of readdirSync('supabase/migrations').sort()) {
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'))
  }
  await db.exec(seed)
}, 30000)
afterAll(() => db.close())

describe('demo listener personas seed', () => {
  it('creates twelve shareable, AI-enabled personas whose accounts cannot sign in', async () => {
    const rows = await personas()
    expect(rows).toHaveLength(12)
    for (const p of rows) {
      expect(p).toMatchObject({ comparisonEnabled: true, aiEnabled: true })
      expect(p.items).toBeGreaterThanOrEqual(15)
      expect(p.items).toBeLessThanOrEqual(100)
    }
    const { rows: users } = await db.query<{ locked: boolean }>(`
      select encrypted_password is null and banned_until > now() + interval '100 years'
        and email like '%@example.com' locked
      from auth.users where raw_user_meta_data->>'demo' = 'true'`)
    expect(users).toHaveLength(12)
    expect(users.every(u => u.locked)).toBe(true)
  })

  it('stores normalized values the same way the save RPC does', async () => {
    const { rows } = await db.query<{ bad: number }>(`
      select count(*)::int bad from public.music_preferences
      where normalized_value <> private.normalize(display_value) or char_length(display_value) not between 1 and 200`)
    expect(rows[0].bad).toBe(0)
  })

  it('keeps personas mostly distinct while each shares something with at least two others', async () => {
    const rows = await personas()
    const { rows: pairs } = await db.query<{ a: string; b: string; score: string; shared: number }>(`
      with sets as (select id, handle, private.preference_values(id) v from public.music_profiles where handle like 'demo\\_%'),
      o as (select a.handle a, b.handle b, private.calculate_overlap(a.v, b.v) r from sets a join sets b on a.handle < b.handle)
      select a, b, r->>'score' score, (r->>'intersectionCount')::int shared from o`)
    expect(pairs).toHaveLength(66)
    for (const pair of pairs) expect(Number(pair.score), `${pair.a} vs ${pair.b}`).toBeLessThan(0.2)
    for (const p of rows) {
      const neighbours = pairs.filter(x => (x.a === p.handle || x.b === p.handle) && x.shared > 0)
      expect(neighbours.length, p.handle).toBeGreaterThanOrEqual(2)
    }
  })

  it('is safe to re-run without duplicating anything', async () => {
    const before = await personas()
    await db.exec(seed)
    const after = await personas()
    expect(after.map(p => [p.id, p.items])).toEqual(before.map(p => [p.id, p.items]))
  })

  it('lets a real user find and compare against a persona by handle', async () => {
    await db.query('insert into auth.users(id) values($1)', [visitor])
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [visitor])
    await rpc('ensure_my_profile', { displayName: 'Visitor', handle: 'visitor_one' })
    await rpc('save_my_preferences', { expectedRevision: 0, items: [
      { type: 'artist', source: 'custom', displayValue: 'arijit singh' },
      { type: 'genre', source: 'custom', displayValue: 'Indie Rock' },
    ] })
    const found = await rpc('lookup_comparison_profile', { handle: 'demo_bollywood' })
    expect(found.error).toBeNull()
    const compared = await rpc('create_comparison', { targetProfileId: found.data!.id, requestId: crypto.randomUUID() })
    expect(compared.error).toBeNull()
    const result = await rpc('get_comparison', { id: compared.data!.id })
    expect(result.error).toBeNull()
    expect(JSON.stringify(result.data)).toContain('Arijit Singh')
    expect(JSON.stringify(result.data)).toContain('Indie Rock')
  })
})
