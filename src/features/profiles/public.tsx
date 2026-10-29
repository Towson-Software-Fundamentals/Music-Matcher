import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getMyProfile } from './api'
import type { OwnProfile } from '../../shared/contracts'
export { getMyProfile, ensureMyProfile, updateMyProfile, lookupComparisonProfile } from './api'
export { Settings } from './screen'

type ProfileState = {
  profile: OwnProfile | null; loading: boolean; error: string;
  setProfile: (profile: OwnProfile) => void; reload: () => Promise<void>;
}
const Context = createContext<ProfileState | null>(null)
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<OwnProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  async function reload() {
    setLoading(true); setError('')
    const result = await getMyProfile()
    if (result.error) setError(result.error.message)
    else setProfile(result.data)
    setLoading(false)
  }
  useEffect(() => {
    let active = true
    void getMyProfile().then(result => {
      if (!active) return
      if (result.error) setError(result.error.message)
      else setProfile(result.data)
      setLoading(false)
    })
    return () => { active = false }
  }, [])
  return <Context.Provider value={{ profile, loading, error, setProfile, reload }}>{children}</Context.Provider>
}
export function useProfile() {
  const value = useContext(Context)
  if (!value) throw new Error('ProfileProvider is required.')
  return value
}
