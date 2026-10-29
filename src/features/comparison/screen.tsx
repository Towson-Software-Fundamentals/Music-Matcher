import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Users } from 'lucide-react'
import { lookupComparisonProfile, useProfile } from '../profiles/public'
import type { ComparisonProfile } from '../../shared/contracts'
import { Feedback, PageHeading } from '../../shared/ui'
import { createComparison } from './api'

export function Compare() {
  const { profile } = useProfile()
  const [handle, setHandle] = useState('')
  const [target, setTarget] = useState<ComparisonProfile | null>(null)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  async function lookup(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setTarget(null)
    const result = await lookupComparisonProfile(handle)
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    setTarget(result.data); setRequestId(crypto.randomUUID())
  }
  async function compare() {
    if (!target) return
    setBusy(true); setError('')
    const result = await createComparison({ targetProfileId: target.id, requestId })
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    navigate(`/comparisons/${result.data.id}`)
  }
  return <div className="narrow"><PageHeading eyebrow="BETTER TOGETHER" title="Find your common ground.">Bring a friend, a date, or your most opinionated music critic.</PageHeading>
    <section className="panel stack"><div className="illustration-icon"><Users size={38} /></div>
      {!profile?.comparisonEnabled && <Feedback kind="info">Enable comparison sharing in <Link to="/settings">Settings</Link> before creating a comparison.</Feedback>}
      <form onSubmit={lookup} className="stack"><label>Their exact handle<input required pattern="[A-Za-z0-9_]{3,30}" placeholder="e.g. midnight_listener" value={handle} onChange={e => { setHandle(e.target.value); setTarget(null); setError('') }} /></label><button disabled={busy}>Find profile</button></form>
      <Feedback>{error}</Feedback>
      {target && <div className="target"><span className="avatar">{target.displayName[0]}</span><div><h2>{target.displayName}</h2><p>@{target.handle}</p></div></div>}
      {target && <button className="primary" disabled={busy || !profile?.comparisonEnabled} onClick={() => void compare()}>{busy ? 'Finding your overlap…' : 'Compare our music'}<ArrowRight size={18} /></button>}
      <small>Both profiles need favorites and sharing enabled. The score measures exact preference overlap—not relationship compatibility.</small>
    </section>
  </div>
}
