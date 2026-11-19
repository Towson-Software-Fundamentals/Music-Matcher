import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// F08A: AI consent, insight storage, and quota gate.
/* eslint-disable @typescript-eslint/no-explicit-any -- RPC results are untyped JSON in these SQL tests */
const db = new PGlite()
const users = [
  '40000000-0000-4000-8000-000000000001', // A: requester
  '40000000-0000-4000-8000-000000000002', // B: target
  '40000000-0000-4000-8000-000000000003', // C: outsider
]
const profiles: string[] = []
let match: string
const revisions: number[] = []
const version = 'insight-v1'

type Envelope = { data: any; error: { code: string } | null }
async function actor(index: number | null) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [index === null ? '' : users[index]])
}
async function rpc(name: string, request?: object): Promise<Envelope> {
  const { rows } = await db.query<{ result: Envelope }>(
    `select public.${name}(${request ? '$1::jsonb' : ''}) result`, request ? [JSON.stringify(request)] : [])
  return rows[0].result
}
async function gateway(request: object): Promise<any> {
  const { rows } = await db.query<{ result: unknown }>('select public.ai_gateway($1::jsonb) result', [JSON.stringify(request)])
  return rows[0].result
}
const reserve = (user: number, kind = 'explanation', caps = { userCap: 10, globalCap: 300 }) =>
  gateway({ action: 'reserve', userId: users[user], matchId: match, kind, promptVersion: version, ...caps })
async function consent(index: number, aiEnabled: boolean) {
  await actor(index)
  const result = await rpc('set_my_ai_consent', { aiEnabled, expectedRevision: revisions[index] })
  expect(result.error).toBeNull()
  revisions[index] = result.data.revision
  return result.data
}
async function usage(user: number) {
  const { rows } = await db.query<{ requests: number }>(
    'select coalesce(sum(requests),0)::int requests from private.ai_user_usage where owner_id=$1', [users[user]])
  return rows[0].requests
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
  for (const [i, prefs] of [['Jazz', 'Adele'], ['jazz', 'Drake'], ['Rock']].entries()) {
    await actor(i)
    const p = await rpc('ensure_my_profile', { displayName: `Secret Name ${i}`, handle: `secret_${i}` })
    profiles.push(p.data.id); revisions.push(p.data.revision)
    await rpc('save_my_preferences', { expectedRevision: 0, items: prefs.map((v, n) => ({ type: n ? 'artist' : 'genre', source: 'custom', displayValue: v })) })
  }
  await actor(0)
  const created = await rpc('create_comparison', { targetProfileId: profiles[1], requestId: '50000000-0000-4000-8000-000000000001' })
  match = created.data.id
}, 30000)
afterAll(() => db.close())

describe('F08A AI consent, storage, and quota', () => {
  it('defaults AI off, validates the setting, and uses settings revisions', async () => {
    await actor(0)
    expect((await rpc('get_my_profile')).data).toMatchObject({ aiEnabled: false })
    expect((await rpc('set_my_ai_consent', { aiEnabled: 'yes', expectedRevision: revisions[0] })).error?.code).toBe('VALIDATION_FAILED')
    expect((await rpc('set_my_ai_consent', { aiEnabled: true, expectedRevision: revisions[0], ownerId: users[1] })).error?.code).toBe('VALIDATION_FAILED')
    expect((await rpc('set_my_ai_consent', { aiEnabled: true, expectedRevision: revisions[0] + 5 })).error?.code).toBe('STALE_WRITE')
    const before = revisions[0]
    expect(await consent(0, true)).toMatchObject({ aiEnabled: true, revision: before + 1, comparisonEnabled: true })
    await actor(null)
    expect((await rpc('set_my_ai_consent', { aiEnabled: true, expectedRevision: 1 })).error?.code).toBe('UNAUTHENTICATED')
  })

  it('lets participants read consent state and hides the result from outsiders', async () => {
    await actor(1)
    expect((await rpc('get_comparison_insight', { matchId: match, kind: 'explanation' })).data)
      .toEqual({ insight: null, consent: { you: false, them: true } })
    await actor(2)
    expect((await rpc('get_comparison_insight', { matchId: match, kind: 'explanation' })).error?.code).toBe('NOT_FOUND')
    expect((await rpc('get_comparison_insight', { matchId: match, kind: 'poem' })).error?.code).toBe('VALIDATION_FAILED')
  })

  it('requires both participants to opt in before reserving anything', async () => {
    expect(await reserve(0)).toEqual({ consentRequired: { you: true, them: false } })
    expect(await reserve(1)).toEqual({ consentRequired: { you: false, them: true } })
    expect(await reserve(2)).toEqual({ notFound: true })
    expect(await gateway({ action: 'reserve', userId: users[0], matchId: match, kind: 'explanation', promptVersion: 'BAD VERSION', userCap: 1, globalCap: 1 }))
      .toEqual({ invalid: true })
    expect(await usage(0)).toBe(0)
  })

  it('reserves once, blocks a duplicate in-flight request, and sends no identities', async () => {
    await consent(1, true)
    const first = await reserve(0)
    expect(first.reserved).toBe(true)
    expect(first.input.requesterIs).toBe('A')
    expect(first.input.shared[0].normalizedValue).toBe('jazz')
    expect(JSON.stringify(first.input)).not.toMatch(/Secret Name|secret_|4000000|profileId/)
    expect(await reserve(1)).toMatchObject({ limited: true, retryAfterSeconds: 5 })
    expect(await gateway({ action: 'release', matchId: match, kind: 'explanation', promptVersion: version })).toEqual({ released: true })
    expect((await reserve(1)).input.requesterIs).toBe('B')
    expect(await usage(0)).toBe(1)
    expect(await usage(1)).toBe(1)
  })

  it('saves first-write-wins insights that both participants read without spending quota', async () => {
    const content = { summary: 'You both like jazz.', highlights: ['Jazz'] }
    const saved = await gateway({ action: 'save', matchId: match, kind: 'explanation', promptVersion: version,
      model: 'deepseek-flash', content, inputTokens: 300, outputTokens: 80 })
    expect(saved.saved).toMatchObject({ kind: 'explanation', model: 'deepseek-flash', content })
    const again = await gateway({ action: 'save', matchId: match, kind: 'explanation', promptVersion: version,
      model: 'other', content: { summary: 'Different' } })
    expect(again.saved.content).toEqual(content)
    expect((await reserve(0)).cached.content).toEqual(content)
    expect(await usage(0)).toBe(1)
    for (const i of [0, 1]) {
      await actor(i)
      expect((await rpc('get_comparison_insight', { matchId: match, kind: 'explanation' })).data.insight.content).toEqual(content)
    }
    const { rows } = await db.query('select 1 from private.ai_pending')
    expect(rows).toHaveLength(0)
  })

  it('enforces per-user and global daily caps', async () => {
    expect(await reserve(0, 'recommendations', { userCap: 1, globalCap: 300 })).toMatchObject({ limited: true, scope: 'user' })
    expect(await reserve(0, 'recommendations', { userCap: 10, globalCap: 2 })).toMatchObject({ limited: true, scope: 'global' })
    const limited = await reserve(0, 'recommendations', { userCap: 1, globalCap: 2 })
    expect(limited.retryAfterSeconds).toBeGreaterThan(0)
    expect(limited.retryAfterSeconds).toBeLessThanOrEqual(86400)
    expect((await reserve(0, 'recommendations')).reserved).toBe(true)
    expect(await usage(0)).toBe(2)
  })

  it('keeps existing insights readable but blocks new generation after opt-out', async () => {
    await gateway({ action: 'release', matchId: match, kind: 'recommendations', promptVersion: version })
    await consent(1, false)
    expect(await reserve(0, 'recommendations')).toEqual({ consentRequired: { you: true, them: false } })
    await actor(0)
    expect((await rpc('get_comparison_insight', { matchId: match, kind: 'explanation' })).data.insight).not.toBeNull()
  })

  it('denies direct writes and gateway access to browser roles', async () => {
    await actor(2)
    await db.exec('set role authenticated')
    expect((await db.query('select * from public.comparison_insights')).rows).toHaveLength(0)
    await expect(db.query("insert into public.comparison_insights(match_id,kind,prompt_version,model,content) values($1,'explanation','x','m','{}')", [match]))
      .rejects.toThrow('permission denied')
    await expect(db.query("select public.ai_gateway('{}')")).rejects.toThrow('permission denied')
    await expect(db.query('select * from private.ai_user_usage')).rejects.toThrow('permission denied')
    await db.exec('reset role')
    await actor(0)
    await db.exec('set role authenticated')
    expect((await db.query('select * from public.comparison_insights')).rows).toHaveLength(1)
    await expect(db.query('update public.comparison_insights set model=$1', ['forged'])).rejects.toThrow('permission denied')
    await db.exec('reset role; set role anon')
    await expect(db.query("select public.get_comparison_insight('{}')")).rejects.toThrow('permission denied')
    await expect(db.query("select public.set_my_ai_consent('{}')")).rejects.toThrow('permission denied')
    await db.exec('reset role')
  })
})
