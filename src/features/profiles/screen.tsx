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
  const [enabled, setEnabled] = useState(profile?.comparisonEnabled ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    const result = profile
      ? await updateMyProfile({ displayName: name, handle, comparisonEnabled: enabled, expectedRevision: profile.revision })
      : await ensureMyProfile({ displayName: name, handle })
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
      {profile && <div className="consent"><label className="checkbox"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Allow comparisons with my profile</label><p>Anyone signed in who knows your handle can compare with you. Results reveal your shared and unique preferences to both participants. Turning this off blocks new comparisons, but existing participant-only snapshots remain.</p></div>}
      <div className="actions"><button className="primary" disabled={busy}>{busy ? 'Saving…' : profile ? 'Save profile' : 'Create my profile'}</button>{profile && <button type="button" disabled={busy} onClick={() => void reload()}>Reload stored settings</button>}</div>
      {!profile && <small>Comparison sharing starts off. Enable it in Settings when you are ready.</small>}
    </form>
  </div>
}
