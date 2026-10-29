import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { errorSchema, failure, type ApiResult } from './contracts'

const config = z.object({
  url: z.url(),
  key: z.string().min(20).refine(value => !value.includes('replace-with')),
}).safeParse({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY })

export const supabase = config.success
  ? createClient(config.data.url, config.data.key, {
    auth: { flowType: 'pkce', detectSessionInUrl: true },
  })
  : null

export function decode<T>(schema: z.ZodType<T>, input: unknown): ApiResult<T> {
  const envelope = z.union([
    z.object({ data: schema, error: z.null() }),
    z.object({ data: z.null(), error: errorSchema }),
  ]).safeParse(input)
  if (envelope.success) return envelope.data
  console.error('API response did not match its contract', envelope.error.issues.map(i => i.path))
  return failure('INTERNAL_ERROR', 'The server returned an unexpected response. Please reload and try again.')
}

export async function rpc<T>(name: string, schema: z.ZodType<T>, request?: object): Promise<ApiResult<T>> {
  if (!supabase) return failure('INTERNAL_ERROR', 'Supabase is not configured.')
  const { data, error } = await supabase.rpc(name, request ? { p_request: request } : {})
  if (error) {
    console.error('RPC failed', { operation: name, code: error.code })
    return failure(error.code === '42501' ? 'FORBIDDEN' : 'INTERNAL_ERROR',
      'The request could not be completed. Reload stored data before retrying a save.')
  }
  return decode(schema, data)
}
