import { createClient } from '@supabase/supabase-js'
import { createHandler } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL')
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const admin = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
const missing = { data: null, error: { code: 'SERVER_CONFIG' } }

Deno.serve(createHandler({
  env: name => Deno.env.get(name),
  getUserId: async token => {
    if (!admin) return null
    const { data, error } = await admin.auth.getUser(token)
    return error || !data.user ? null : data.user.id
  },
  gateway: async request => {
    if (!admin) return missing
    const { data, error } = await admin.rpc('ai_gateway', { p_request: request })
    return { data, error: error ? { code: error.code } : null }
  },
  fetch: (input, init) => fetch(input, init),
}))
