import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Feedback, PageHeading } from '../../shared/ui'
import { ensureMyProfile, updateMyProfile } from './api'
import { useProfile } from './public'

export function Settings() {
  const { profile, setProfile, reload } = useProfile()
  const navigate = useNavigate()
  const [name, setName] = useState(profile?.displayName ?? '')
  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [enabled, setEnabled] = useState(profile?.comparisonEnabled ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const result = profile
      ? await updateMyProfile({ displayName: name, handle, comparisonEnabled: enabled, expectedRevision: profile.revision })
      : await ensureMyProfile({ displayName: name, handle, comparisonEnabled: enabled })
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    setProfile(result.data); setMessage('Your profile is saved.')
    if (!profile) navigate('/preferences')
  }
  return <div className="narrow"><PageHeading eyebrow="MAKE IT PERSONAL" title={profile ? 'Your profile.' : 'First, your introduction.'}>Your handle is how friends find you. Your email stays private.</PageHeading>
    <form className="panel stack" onSubmit={submit}>
      <Feedback>{error}</Feedback><Feedback kind="success">{message}</Feedback>
      <label>Display name<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" /></label>
      <label>Unique handle<input required pattern="[A-Za-z0-9_]{3,30}" value={handle} onChange={e => setHandle(e.target.value)} /><small>3–30 letters, digits or underscores. Not case sensitive.</small></label>
      <div className="consent"><label className="checkbox"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Allow comparisons with my profile</label><p>Your display name and handle are visible to signed-in users in the profile directory. Comparisons are on by default; anyone signed in can compare with you, and results show shared and unique preferences to both participants. Turn this off to block new comparisons. Existing participant-only results remain available.</p></div>
      <div className="actions"><button className="primary" disabled={busy}>{busy ? 'Saving…' : profile ? 'Save profile' : 'Create my profile'}</button>{profile && <button type="button" disabled={busy} onClick={() => void reload()}>Reload stored settings</button>}</div>
    </form>
  </div>
}
