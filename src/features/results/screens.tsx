import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Disc3, Music2, Users } from 'lucide-react'
import { z } from 'zod'
import { getComparison, listMyComparisons } from './api'
import { useProfile } from '../profiles/public'
import { getMyPreferences } from '../preferences/public'
import { type ComparisonSnapshot, type HistoryCursor, historySchema } from '../../shared/contracts'
import { Feedback, Loading, PageHeading } from '../../shared/ui'

type History = z.infer<typeof historySchema>
export function Dashboard() {
  const { profile } = useProfile()
  const [history, setHistory] = useState<History | null>(null)
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState('')
  const [countError, setCountError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void listMyComparisons().then(result => {
      if (!active) return
      if (result.error) setError(result.error.message); else { setHistory(result.data); setError('') }
    })
    void getMyPreferences().then(result => {
      if (!active) return
      if (result.error) setCountError(result.error.message)
      else {
        const next: Record<string, number> = { artist: 0, genre: 0, song: 0 }
        result.data.items.forEach(item => next[item.type]++)
        setCounts(next); setCountError('')
      }
    })
    return () => { active = false }
  }, [attempt])
  async function more(cursor: HistoryCursor) {
    setBusy(true)
    const result = await listMyComparisons(cursor)
    setBusy(false)
    if (result.error) setError(result.error.message)
    else { setHistory(old => ({ items: [...(old?.items ?? []), ...result.data.items], nextCursor: result.data.nextCursor })); setError('') }
  }
  return <><PageHeading eyebrow="YOUR MUSIC SPACE" title={`Hey, ${profile?.displayName}.`}>Good music is better when you find someone to share it with.</PageHeading>
    <section className="dashboard-hero panel"><div><span className="eyebrow">TWO TASTES. ONE CONNECTION.</span><h2>Who’s on your wavelength?</h2><p>Pick a profile and discover what’s playing in both your worlds.</p><Link className="button primary" to="/compare">Compare with someone <ArrowRight size={18} /></Link></div><div className="wave-art" aria-hidden="true"><Users size={92} strokeWidth={1} /></div></section>
    <Feedback>{countError}</Feedback>
    <div className="stats">{[{ key: 'artist', label: 'Favorite artists', icon: Music2 }, { key: 'genre', label: 'Favorite genres', icon: Disc3 }, { key: 'song', label: 'Songs on repeat', icon: Music2 }].map(({ key, label, icon: Icon }) => <Link className="panel stat" to="/preferences" key={key}><Icon size={20} /><strong>{counts ? counts[key] : '—'}</strong><span>{label}</span><ArrowRight size={16} /></Link>)}</div>
    <section className="panel"><div className="section-title"><div><span className="eyebrow">THE CONNECTIONS YOU’VE FOUND</span><h2>Recent comparisons</h2></div><Link to="/preferences">Edit your rotation</Link></div><Feedback>{error}</Feedback>
      {(error || countError) && <button onClick={() => setAttempt(n => n + 1)}>Retry dashboard</button>}
      {!history && !error && <Loading />}
      {history?.items.length === 0 && <div className="empty"><Users size={36} /><h3>No comparisons just yet.</h3><p>Your first common ground is waiting.</p><Link to="/compare">Make a connection <ArrowRight size={15} /></Link></div>}
      <div className="history">{history?.items.map(item => <Link to={`/comparisons/${item.id}`} key={item.id}><span className="avatar">{item.otherParticipant.displayName[0]}</span><span className="history-name"><strong>{item.otherParticipant.displayName}</strong><small>@{item.otherParticipant.handle} · {new Date(item.createdAt).toLocaleDateString()}</small></span><strong className="score-small">{(item.score * 100).toFixed(1)}%</strong><ArrowRight size={17} /></Link>)}</div>
      {history?.nextCursor && <button disabled={busy} onClick={() => { if (history.nextCursor) void more(history.nextCursor) }}>{busy ? 'Loading…' : 'Load more'}</button>}
    </section>
  </>
}

export function ResultScreen() {
  const { id = '' } = useParams()
  const { profile } = useProfile()
  const [result, setResult] = useState<ComparisonSnapshot | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setResult(null); setError('')
    void getComparison(id).then(response => {
      if (!active) return
      if (response.error) setError(response.error.message); else setResult(response.data)
    })
    return () => { active = false }
  }, [id, attempt])
  if (error) return <div className="panel"><Feedback>{error}</Feedback><button onClick={() => setAttempt(n => n + 1)}>Retry result</button><Link to="/dashboard">Back to dashboard</Link></div>
  if (!result) return <Loading />
  const isA = profile?.id === result.participantA.profileId
  const me = isA ? result.participantA : result.participantB
  const them = isA ? result.participantB : result.participantA
  const onlyMe = isA ? result.onlyA : result.onlyB
  const onlyThem = isA ? result.onlyB : result.onlyA
  return <><PageHeading eyebrow="YOUR COMMON GROUND" title={`${me.displayName} & ${them.displayName}`}>Two music worlds. Here’s where they meet.</PageHeading>
    <section className="result-hero panel"><div className="score-ring"><strong>{(result.score * 100).toFixed(1)}<span>%</span></strong><small>EXACT OVERLAP</small></div><div><span className="eyebrow">THE MUSIC BETWEEN YOU</span><h2>{result.intersectionCount ? 'You’ve got something in common.' : 'Different sounds. New discoveries.'}</h2><p>{result.intersectionCount} shared {result.intersectionCount === 1 ? 'favorite' : 'favorites'} across {result.unionCount} unique preferences.</p><p className="muted">Saved {new Date(result.createdAt).toLocaleString()}. This is a historical snapshot, not a relationship prediction.</p></div></section>
    <section className="panel"><div className="section-title"><h2>On both your playlists</h2><span className="count">{result.shared.length} shared</span></div><div className="chips">{result.shared.map(item => <span className="chip shared" key={`${item.type}:${item.normalizedValue}`}><span>{isA ? item.displayValueA : item.displayValueB}<small>{item.type}</small></span></span>)}</div>{!result.shared.length && <p className="muted">No exact matches this time. Compare spellings or explore each other’s favorites.</p>}</section>
    <div className="two-columns">{[{ name: 'Only in your rotation', items: onlyMe }, { name: `Only in ${them.displayName}’s rotation`, items: onlyThem }].map(group => <section className="panel" key={group.name}><h2>{group.name}</h2><div className="chips">{group.items.map(item => <span className="chip" key={`${item.type}:${item.normalizedValue}`}><span>{item.displayValue}<small>{item.type}</small></span></span>)}</div>{!group.items.length && <p className="muted">Every favorite here is shared.</p>}</section>)}</div>
    <div className="result-footer"><small>Algorithm: {result.algorithmVersion}. Equal-weight text matching; aliases and spelling variants are not resolved.</small><Link className="button" to="/compare">Compare again <ArrowRight size={16} /></Link></div>
  </>
}
