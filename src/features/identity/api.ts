import { supabase } from '../../shared/client'
import { failure, success, type ApiResult } from '../../shared/contracts'
import type { AuthError } from '@supabase/supabase-js'

const recoveryRequestKey = 'music-matcher-recovery-requested-at'
const recoveryRequestMaxAge = 60 * 60 * 1000

export function hasRecentRecoveryRequest() {
  const requestedAt = Number(localStorage.getItem(recoveryRequestKey))
  const age = Date.now() - requestedAt
  if (!Number.isFinite(requestedAt) || requestedAt <= 0 || age < 0 || age > recoveryRequestMaxAge) {
    localStorage.removeItem(recoveryRequestKey)
    return false
  }
  return true
}

export function clearRecoveryRequest() {
  localStorage.removeItem(recoveryRequestKey)
}

function authFailure(error: AuthError) {
  console.error('Authentication request failed', { code: error.code, status: error.status })
  if (error.name === 'AuthRetryableFetchError') return failure('NETWORK_ERROR', 'The authentication service is unreachable. Please check your connection and try again.')
  return failure(error.status === 429 ? 'RATE_LIMITED' : 'VALIDATION_FAILED',
    error.status === 429 ? 'Too many attempts. Please wait before trying again.'
      : error.code === 'invalid_credentials' ? 'Email or password is incorrect.'
        : error.code === 'email_not_confirmed' ? 'Confirm your email before signing in.'
          : 'Authentication could not be completed. Check your details or request a new recovery link.')
}

export async function authenticate(mode: 'login' | 'signup', email: string, password: string): Promise<ApiResult<{ confirmEmail: boolean }>> {
  if (!supabase) return failure('INTERNAL_ERROR', 'Supabase is not configured.')
  const { data, error } = mode === 'login'
    ? await supabase.auth.signInWithPassword({ email, password })
    : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/login` } })
  if (error) return authFailure(error)
  if (mode === 'login') clearRecoveryRequest()
  return success({ confirmEmail: !data.session })
}
export async function requestRecovery(email: string): Promise<ApiResult<null>> {
  if (!supabase) return failure('INTERNAL_ERROR', 'Supabase is not configured.')
  clearRecoveryRequest()
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` })
  if (error) return authFailure(error)
  localStorage.setItem(recoveryRequestKey, String(Date.now()))
  return success(null)
}
export async function completeRecovery(password: string): Promise<ApiResult<null>> {
  if (!supabase) return failure('INTERNAL_ERROR', 'Supabase is not configured.')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return authFailure(error)
  clearRecoveryRequest()
  return success(null)
}
export async function signOut(): Promise<ApiResult<null>> {
  if (!supabase) return failure('INTERNAL_ERROR', 'Supabase is not configured.')
  const { error } = await supabase.auth.signOut()
  if (error) return authFailure(error)
  clearRecoveryRequest()
  return success(null)
}
