import { z } from 'zod'

// OpenAI-compatible chat completions adapter. Defaults target DeepSeek; any compatible
// provider can be swapped in with AI_BASE_URL / AI_MODEL without touching callers.
export const DEFAULT_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_MODEL = 'deepseek-flash'

export type ChatMessage = { role: 'system' | 'user'; content: string }
export type ProviderConfig = {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  maxTokens: number
  fetch: typeof fetch
}
export type ProviderResult =
  | { ok: true; json: unknown; model: string; inputTokens: number | null; outputTokens: number | null }
  | { ok: false; reason: 'timeout' | 'network' | 'http' | 'rate_limited' | 'invalid_output'; status?: number }

const completion = z.object({
  model: z.string().min(1).max(100).optional(),
  choices: z.array(z.object({
    finish_reason: z.string().nullable().optional(),
    message: z.object({ content: z.string().nullable().optional() }),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
})

export function baseUrlFrom(value: string | undefined) {
  const url = new URL(value || DEFAULT_BASE_URL)
  if (url.protocol !== 'https:') throw new Error('AI_BASE_URL must use https')
  return url.origin + url.pathname.replace(/\/+$/, '')
}

export async function complete(config: ProviderConfig, messages: ChatMessage[]): Promise<ProviderResult> {
  let response: Response
  try {
    response = await config.fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' }, // DeepSeek reasons by default; off keeps latency and cost low.
        max_tokens: config.maxTokens,
        temperature: 0.7,
        stream: false,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) return { ok: false, reason: 'timeout' }
    if (error instanceof TypeError) return { ok: false, reason: 'network' }
    throw error
  }
  if (response.status === 429) return { ok: false, reason: 'rate_limited', status: 429 }
  if (!response.ok) return { ok: false, reason: 'http', status: response.status }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, reason: 'invalid_output' }
  }
  const parsed = completion.safeParse(body)
  if (!parsed.success) return { ok: false, reason: 'invalid_output' }
  const choice = parsed.data.choices[0]
  const content = choice.message.content?.trim()
  // DeepSeek JSON mode may return blank content instead of invalid JSON; a length cut-off is truncated JSON.
  if (!content || choice.finish_reason === 'length') return { ok: false, reason: 'invalid_output' }
  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    return { ok: false, reason: 'invalid_output' }
  }
  return {
    ok: true, json, model: parsed.data.model ?? config.model,
    inputTokens: parsed.data.usage?.prompt_tokens ?? null,
    outputTokens: parsed.data.usage?.completion_tokens ?? null,
  }
}
