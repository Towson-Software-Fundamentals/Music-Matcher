import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../shared/client'
export { AuthScreen, Welcome } from './screens'
export { authenticate, requestRecovery, completeRecovery, signOut } from './api'

type AuthState = { user: User | null; loading: boolean; recovery: boolean; error: string | null; finishRecovery: () => void }
const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    let active = true
    void supabase.auth.getSession().then(result => {
      if (!active) return
      if (result.error) setError('Your session could not be restored. Please sign in again.')
      setUser(result.data.session?.user ?? null)
      setLoading(false)
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [])
  return <AuthContext.Provider value={{ user, loading, recovery, error, finishRecovery: () => setRecovery(false) }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider is required.')
  return auth
}
