import { z } from 'zod'
import { buildMessages, insightInput, parseInsight, PROMPT_VERSION, requestSchema, type InsightKind } from './prompt.ts'
import { baseUrlFrom, complete, DEFAULT_MODEL, type ProviderResult } from './provider.ts'

export type Deps = {
  env: (name: string) => string | undefined
  /** Resolve a bearer token to an Auth user ID, or null when invalid/expired. */
  getUserId: (token: string) => Promise<string | null>
  /** Call public.ai_gateway with the service role. */
  gateway: (request: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>
  fetch: typeof fetch
  log?: (message: string, detail?: Record<string, unknown>) => void
}

const insightRow = z.object({
  matchId: z.uuid(), kind: z.enum(['explanation', 'recommendations']), promptVersion: z.string(),
  model: z.string(), content: z.record(z.string(), z.unknown()), createdAt: z.string(),
})
const reserveOutcome = z.union([
  z.object({ cached: insightRow }).strict(),
  z.object({ reserved: z.literal(true), input: z.unknown() }).strict(),
  z.object({ consentRequired: z.object({ you: z.boolean(), them: z.boolean() }) }).strict(),
  z.object({ limited: z.literal(true), retryAfterSeconds: z.number().int().positive(), scope: z.enum(['user', 'global']).optional() }).strict(),
  z.object({ notFound: z.literal(true) }).strict(),
  z.object({ invalid: z.literal(true) }).strict(),
])
const savedOutcome = z.object({ saved: insightRow }).strict()

const MAX_ATTEMPTS = 2 // one retry, only for blank/invalid model output
const intFrom = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

export function createHandler(deps: Deps) {
  const log = deps.log ?? ((message, detail) => console.error(message, detail ?? ''))
  return async (request: Request): Promise<Response> => {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': deps.env('APP_ORIGIN') ?? 'http://127.0.0.1:5180',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    }
    const ok = (data: unknown) => new Response(JSON.stringify({ data, error: null }), { status: 200, headers })
    const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => {
      const retry: Record<string, string> = typeof extra.retryAfterSeconds === 'number' ? { 'Retry-After': String(extra.retryAfterSeconds) } : {}
      return new Response(JSON.stringify({ data: null, error: { code, message, ...extra } }), { status, headers: { ...headers, ...retry } })
    }
    const unavailable = (message = 'AI insights are unavailable right now. Your saved result is unchanged.') =>
      fail(503, 'AI_UNAVAILABLE', message)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return fail(405, 'VALIDATION_FAILED', 'Use POST.')

    // Kill switch and configuration are checked before anything else so a disabled feature costs nothing.
    if (deps.env('AI_ENABLED') !== 'true') return unavailable('AI insights are turned off.')
    const apiKey = deps.env('DEEPSEEK_API_KEY')
    let baseUrl: string
    try {
      baseUrl = baseUrlFrom(deps.env('AI_BASE_URL'))
    } catch {
      log('AI provider base URL is invalid')
      return unavailable()
    }
    if (!apiKey) {
      log('AI provider key is not configured')
      return unavailable()
    }

    const token = request.headers.get('authorization')?.replace(/^Bearer /i, '')
    if (!token) return fail(401, 'UNAUTHENTICATED', 'Please sign in.')
    const userId = await deps.getUserId(token)
    if (!userId) return fail(401, 'UNAUTHENTICATED', 'Your session expired. Please sign in again.')

    let raw: unknown
    try {
      const text = await request.text()
      if (new TextEncoder().encode(text).length > 1024) return fail(400, 'VALIDATION_FAILED', 'Request is too large.')
      raw = JSON.parse(text)
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      return fail(400, 'VALIDATION_FAILED', 'Invalid JSON.')
    }
    const parsedRequest = requestSchema.safeParse(raw)
    if (!parsedRequest.success) return fail(400, 'VALIDATION_FAILED', 'Choose a saved result and an insight type.')
    const { matchId, kind } = parsedRequest.data
    const key = { matchId, kind, promptVersion: PROMPT_VERSION }

    const reserved = await deps.gateway({
      action: 'reserve', userId, ...key,
      userCap: intFrom(deps.env('AI_USER_DAILY_CAP'), 10, 0, 1000),
      globalCap: intFrom(deps.env('AI_GLOBAL_DAILY_CAP'), 300, 0, 100000),
    })
    const outcome = reserveOutcome.safeParse(reserved.data)
    if (reserved.error || !outcome.success) {
      log('AI gateway reserve failed', { code: reserved.error?.code })
      return unavailable()
    }
    const result = outcome.data
    if ('invalid' in result) return fail(400, 'VALIDATION_FAILED', 'Invalid insight request.')
    if ('notFound' in result) return fail(404, 'NOT_FOUND', 'This result is unavailable.')
    if ('cached' in result) return ok(result.cached)
    if ('consentRequired' in result) {
      const { you, them } = result.consentRequired
      const message = !you
        ? 'Turn on AI insights in Settings to use this feature.'
        : 'The other person has not turned on AI insights.'
      return fail(403, 'AI_CONSENT_REQUIRED', message, { consent: { you, them } })
    }
    if ('limited' in result) {
      const message = result.scope === 'user'
        ? 'You have reached today’s AI insight limit. Try again tomorrow.'
        : result.scope === 'global'
          ? 'AI insights have reached today’s limit. Try again tomorrow.'
          : 'An insight is already being generated. Please wait a moment.'
      return fail(429, 'RATE_LIMITED', message, { retryAfterSeconds: result.retryAfterSeconds })
    }

    // A generation slot is reserved from here on; always release it on failure.
    const release = async () => {
      const released = await deps.gateway({ action: 'release', ...key })
      if (released.error) log('AI gateway release failed', { code: released.error.code })
    }
    try {
      const input = insightInput.safeParse(result.input)
      if (!input.success) {
        log('AI gateway returned an invalid comparison input')
        await release()
        return unavailable()
      }
      const config = {
        apiKey, baseUrl, fetch: deps.fetch,
        model: deps.env('AI_MODEL') || DEFAULT_MODEL,
        timeoutMs: intFrom(deps.env('AI_TIMEOUT_MS'), 20000, 1000, 60000),
        maxTokens: 800,
      }
      const messages = buildMessages(kind as InsightKind, input.data)
      let response: ProviderResult | null = null
      let insight = null
      const started = Date.now()
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        response = await complete(config, messages)
        if (response.ok) {
          insight = parseInsight(kind, response.json, input.data)
          if (insight) break
          response = { ok: false, reason: 'invalid_output' }
        }
        if (response.reason !== 'invalid_output') break
      }
      // Log outcome, status, latency and token counts only — never prompts, preferences, or keys.
      log('AI provider call finished', {
        kind, ok: !!insight, reason: response && !response.ok ? response.reason : undefined,
        status: response && !response.ok ? response.status : undefined, ms: Date.now() - started,
        inputTokens: response?.ok ? response.inputTokens : undefined,
        outputTokens: response?.ok ? response.outputTokens : undefined,
      })
      if (!insight || !response?.ok) {
        await release()
        return response && !response.ok && response.reason === 'rate_limited'
          ? unavailable('The AI provider is busy. Please try again shortly.')
          : unavailable()
      }
      const saved = await deps.gateway({
        action: 'save', ...key, model: response.model, content: insight.content,
        ...(response.inputTokens === null ? {} : { inputTokens: response.inputTokens }),
        ...(response.outputTokens === null ? {} : { outputTokens: response.outputTokens }),
      })
      const stored = savedOutcome.safeParse(saved.data)
      if (saved.error || !stored.success) {
        log('AI insight save failed', { code: saved.error?.code })
        await release()
        return unavailable()
      }
      return ok(stored.data.saved)
    } catch (error) {
      await release().catch(() => undefined)
      throw error
    }
  }
}
