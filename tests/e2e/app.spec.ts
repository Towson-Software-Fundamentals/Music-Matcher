import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const userId = '10000000-0000-4000-8000-000000000001'
const a = '20000000-0000-4000-8000-000000000001'
const b = '20000000-0000-4000-8000-000000000002'
const resultId = '40000000-0000-4000-8000-000000000001'
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'demo@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-28T00:00:00Z' }
const own = { id: a, displayName: 'Alex', handle: 'alex', comparisonEnabled: true, revision: 1 }
const value = { type: 'genre', displayValue: 'Jazz', normalizedValue: 'jazz' }
const createdAt = '2026-10-28T18:00:00Z'
const snapshot = {
  id: resultId, createdAt, algorithmVersion: 'jaccard-text-v1',
  participantA: { profileId: a, displayName: 'Alex', handle: 'alex', preferenceRevision: 1, preferences: [value] },
  participantB: { profileId: b, displayName: 'Sam', handle: 'sam', preferenceRevision: 1, preferences: [value] },
  score: 1, intersectionCount: 1, unionCount: 1,
  shared: [{ type: 'genre', normalizedValue: 'jazz', displayValueA: 'Jazz', displayValueB: 'Jazz' }], onlyA: [], onlyB: [],
}
async function mockBackend(page: Page, signedIn = true) {
  let preferences: { revision: number; items: object[] } = { revision: 0, items: [] }
  if (signedIn) {
    const expires = Math.floor(Date.now() / 1000) + 3600
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, exp: expires, role: 'authenticated' })).toString('base64url')}.test`
    await page.addInitScript(({ user, token, expires }) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user }))
    }, { user, token, expires })
  }
  await page.route('http://127.0.0.1:54321/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user })
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname.includes('/functions/')) return route.fulfill({ status: 503, json: { data: null, error: { code: 'CATALOG_UNAVAILABLE', message: 'Catalog unavailable. Add a custom entry or retry.' } } })
    const request = route.request().postDataJSON()?.p_request ?? {}
    let data: unknown = null
    switch (url.pathname.split('/').pop()) {
      case 'get_my_profile': data = own; break
      case 'get_my_preferences': data = preferences; break
      case 'save_my_preferences':
        preferences = { revision: preferences.revision + 1, items: request.items.map((item: { type: string; displayValue: string }, index: number) => ({
          id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          type: item.type, displayValue: item.displayValue.trim(), normalizedValue: item.displayValue.trim().toLowerCase(), catalogItem: null,
        })) }; data = preferences; break
      case 'list_my_comparisons': data = { items: [], nextCursor: null }; break
      case 'list_genres': data = { items: [] }; break
      case 'lookup_comparison_profile': data = { id: b, displayName: 'Sam', handle: 'sam' }; break
      case 'create_comparison':
        expect(request.targetProfileId).toBe(b)
        expect(request.requestId).toMatch(/^[a-f0-9-]{36}$/)
        data = { id: resultId, createdAt }; break
      case 'get_comparison': data = snapshot; break
      case 'update_my_profile': data = { ...own, ...request, revision: own.revision + 1 }; break
      default: throw new Error(`Unexpected mocked request: ${url.pathname}`)
    }
    return route.fulfill({ json: { data, error: null } })
  })
}

test('welcome is responsive and ordinary sessions cannot unlock recovery', async ({ page }) => {
  await mockBackend(page, false)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Your taste/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Find your harmony' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.screenshot({ path: `test-results/welcome-${test.info().project.name}.png`, fullPage: true })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await page.goto('/reset-password')
  await expect(page.getByRole('button', { name: 'Set new password' })).toBeDisabled()
})

test('edits custom preferences, saves, cancels and reloads without losing stored values', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/preferences')
  await page.getByLabel('Custom artist', { exact: true }).fill('Adele')
  await page.getByRole('button', { name: 'Add custom artist', exact: true }).click()
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(page.getByRole('status')).toContainText('Preferences saved')
  await page.getByRole('button', { name: 'Remove Adele' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Adele' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Remove Adele' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.screenshot({ path: `test-results/preferences-${test.info().project.name}.png`, fullPage: true })
})

test('catalog errors remain visible while explicit custom entry stays available', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/preferences')
  await page.getByRole('textbox', { name: 'Search artists' }).fill('Adele')
  await expect(page.getByRole('alert')).toContainText('Catalog unavailable')
  await expect(page.getByRole('button', { name: 'Retry catalog' })).toBeVisible()
  await page.getByLabel('Custom artist', { exact: true }).fill('My local band')
  await page.getByRole('button', { name: 'Add custom artist', exact: true }).click()
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(page.getByText('Preferences saved. Your rotation is up to date.')).toBeVisible()
})

test('looks up an eligible profile, compares and renders saved snapshot', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/compare')
  await page.getByLabel('Their exact handle').fill('sam')
  await page.getByRole('button', { name: 'Find profile' }).click()
  await page.getByRole('button', { name: 'Compare our music' }).click()
  await expect(page.getByRole('heading', { name: 'Alex & Sam' })).toBeVisible()
  await expect(page.getByText('EXACT OVERLAP', { exact: true })).toBeVisible()
  await expect(page.getByText('100.0', { exact: false }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.screenshot({ path: `test-results/result-${test.info().project.name}.png`, fullPage: true })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Alex & Sam' })).toBeVisible()
})

test('warns before discarding a draft and sign out hides protected data', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/preferences')
  await page.getByLabel('Custom artist', { exact: true }).fill('Unstored artist')
  await page.getByRole('button', { name: 'Add custom artist', exact: true }).click()
  await page.getByRole('link', { name: 'Compare', exact: true }).click()
  await expect(page.getByText('You have unsaved preferences. Leave without saving?')).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByRole('button', { name: 'Remove Unstored artist' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible()
  await expect(page.getByText('Unstored artist', { exact: true })).not.toBeVisible()
})
