import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, AudioLines, Disc3, Sparkles } from 'lucide-react'
import { Feedback, PageHeading } from '../../shared/ui'
import { authenticate, completeRecovery, requestRecovery } from './api'
import { useAuth } from './public'

export function Welcome() {
  const { user } = useAuth()
  if (user) return <Navigate to="/dashboard" replace />
  return <div className="welcome">
    <div className="hero-copy"><span className="eyebrow"><span className="dot" /> A LITTLE DIFFERENT. BETTER TOGETHER.</span>
      <h1>Your taste.<br />Their taste.<br /><span className="gradient-text">Common ground.</span></h1>
      <p>Find the music that brings you together. Compare your favorite artists, genres, and songs—no streaming account needed.</p>
      <div className="actions"><Link className="button primary" to="/signup">Find your harmony <ArrowRight size={18} /></Link><Link className="button subtle" to="/login">I have an account</Link></div>
      <div className="hero-note"><Sparkles size={16} /> Real overlap. No mysterious algorithms.</div>
    </div>
    <div className="hero-art" aria-label="Illustration of two music profiles finding common ground">
      <div className="orbit orbit-one" /><div className="orbit orbit-two" />
      <div className="record"><Disc3 size={156} strokeWidth={0.65} /><div className="record-center"><AudioLines size={30} /></div></div>
      <div className="floating-card card-left"><span className="mini-avatar coral">Y</span><div>Your rotation<strong>Indie · Jazz · Soul</strong></div></div>
      <div className="floating-card card-right"><span className="mini-avatar violet">T</span><div>Their rotation<strong>Jazz · Soul · Pop</strong></div></div>
      <div className="overlap-tag"><span className="dot" /> A shared love of jazz</div>
    </div>
    <div className="steps"><div><span>01</span><h2>Make it yours</h2><p>Add your favorites, from chart-toppers to hidden gems.</p></div><div><span>02</span><h2>Bring a friend</h2><p>Find their profile by handle. Sharing is always opt-in.</p></div><div><span>03</span><h2>Find the overlap</h2><p>See exactly what connects your musical worlds.</p></div></div>
  </div>
}

export function AuthScreen({ mode }: { mode: 'login' | 'signup' | 'recover' | 'reset' }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const titles = { login: 'Welcome back.', signup: 'Find your people.', recover: 'Back to your music.', reset: 'A fresh start.' }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    if (mode === 'reset' && !auth.recovery) { setError('Open a valid recovery link first.'); setBusy(false); return }
    const result = mode === 'recover' ? await requestRecovery(email) : mode === 'reset'
      ? await completeRecovery(password) : await authenticate(mode, email, password)
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    if (mode === 'recover') setMessage('If an eligible account exists, check its inbox for a recovery link.')
    else if (mode === 'reset') { auth.finishRecovery(); navigate('/dashboard', { replace: true }) }
    else if (result.data && result.data.confirmEmail) setMessage('Check your email to confirm your account, then sign in.')
    else navigate('/dashboard')
  }
  return <div className="narrow"><PageHeading eyebrow="YOUR MUSIC SPACE" title={titles[mode]}>{mode === 'signup' ? 'One account. A whole world of shared music.' : 'Pick up right where you left off.'}</PageHeading>
    <form className="panel stack" onSubmit={submit}>
      <Feedback>{error || auth.error}</Feedback><Feedback kind="success">{message}</Feedback>
      {mode === 'reset' && !auth.recovery && <Feedback>Open a valid, unused password-recovery link. An ordinary login cannot reset a password here. <Link to="/recover">Request a new link</Link>.</Feedback>}
      {mode !== 'reset' && <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {mode !== 'recover' && <label>{mode === 'reset' ? 'New password' : 'Password'}<input type="password" minLength={8} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /><small>At least 8 characters.</small></label>}
      <button className="primary" disabled={busy || (mode === 'reset' && !auth.recovery)}>{busy ? 'Please wait…' : ({ login: 'Sign in', signup: 'Create account', recover: 'Send recovery link', reset: 'Set new password' })[mode]}</button>
      <div className="auth-links"><Link to={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? 'Create an account' : 'Back to sign in'}</Link>{mode === 'login' && <Link to="/recover">Forgot password?</Link>}</div>
    </form>
  </div>
}
