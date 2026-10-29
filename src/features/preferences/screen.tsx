import { useEffect, useState, type FormEvent } from 'react'
import { useBlocker } from 'react-router-dom'
import { Disc3, Guitar, Mic2, Plus, X } from 'lucide-react'
import { CatalogPicker } from '../catalog/public'
import { getMyPreferences, saveMyPreferences } from './api'
import { type CatalogItem, type PreferenceInput, type PreferenceSet, type PreferenceType, validatePreferences } from '../../shared/contracts'
import { Feedback, Loading, PageHeading } from '../../shared/ui'

type Draft = { key: string; input: PreferenceInput; label: string }
const kinds: { type: PreferenceType; label: string; icon: typeof Guitar }[] = [
  { type: 'artist', label: 'Artists', icon: Mic2 }, { type: 'genre', label: 'Genres', icon: Guitar }, { type: 'song', label: 'Songs', icon: Disc3 },
]
function drafts(set: PreferenceSet): Draft[] {
  return set.items.map(item => ({
    key: item.id, label: item.displayValue,
    input: item.catalogItem ? { type: item.type, source: 'catalog', catalogItemId: item.catalogItem.id }
      : { type: item.type, source: 'custom', displayValue: item.displayValue },
  }))
}

export function Preferences() {
  const [saved, setSaved] = useState<PreferenceSet | null>(null)
  const [draft, setDraft] = useState<Draft[]>([])
  const [type, setType] = useState<PreferenceType>('artist')
  const [custom, setCustom] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(drafts(saved))
  const blocker = useBlocker(dirty)
  async function load() {
    setError(''); setBusy(true)
    const result = await getMyPreferences()
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    setSaved(result.data); setDraft(drafts(result.data)); setUncertain(false)
  }
  useEffect(() => {
    let active = true
    void getMyPreferences().then(result => {
      if (!active) return
      if (result.error) setError(result.error.message)
      else { setSaved(result.data); setDraft(drafts(result.data)) }
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function add(input: PreferenceInput, label: string) {
    const next = [...draft, { key: crypto.randomUUID(), input, label }]
    const validation = validatePreferences(next.map(d => d.input))
    if (validation) { setError(validation); return }
    if (input.source === 'catalog' && draft.some(d => d.input.source === 'catalog' && d.input.catalogItemId === input.catalogItemId)) {
      setError('That catalog item is already selected.'); return
    }
    setDraft(next); setCustom(''); setError(''); setMessage('')
  }
  function addCatalog(item: CatalogItem) {
    add({ type: item.type, source: 'catalog', catalogItemId: item.id }, item.displayValue)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!saved) return
    setError(''); setMessage('')
    const validation = validatePreferences(draft.map(d => d.input))
    if (validation) { setError(validation); return }
    setBusy(true)
    const result = await saveMyPreferences({ expectedRevision: saved.revision, items: draft.map(d => d.input) })
    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      setUncertain(['STALE_WRITE', 'NETWORK_ERROR', 'INTERNAL_ERROR'].includes(result.error.code))
      return
    }
    setSaved(result.data); setDraft(drafts(result.data)); setMessage('Preferences saved. Your rotation is up to date.')
  }
  if (!saved && !error) return <Loading />
  return <><PageHeading eyebrow="YOUR ROTATION" title="What moves you?">Big names, niche genres, that song on repeat. Make this space sound like you.</PageHeading>
    <div className="editor-grid"><section className="panel">
      <div className="tabs" role="group" aria-label="Preference category">{kinds.map(({ type: kind, label, icon: Icon }) => <button key={kind} aria-pressed={kind === type} className={kind === type ? 'active' : ''} onClick={() => { setType(kind); setCustom('') }}><Icon size={17} />{label}</button>)}</div>
      <CatalogPicker key={type} type={type} onSelect={addCatalog} />
      <div className="divider"><span>OR GO OFF THE RECORD</span></div>
      <form className="stack" onSubmit={event => { event.preventDefault(); add({ type, source: 'custom', displayValue: custom }, custom.trim()) }}>
        <label>Custom {type}<input required maxLength={200} value={custom} onChange={e => setCustom(e.target.value)} placeholder={type === 'artist' ? 'Your favorite hidden gem…' : `Enter a ${type}…`} /></label>
        <button disabled={busy || !saved}><Plus size={16} />Add custom {type}</button>
      </form>
    </section>
    <form className="panel stack" onSubmit={save}><div className="section-title"><h2>Your favorites</h2><span className="count">{draft.length}/100</span></div>
      <Feedback>{error}</Feedback><Feedback kind="success">{message}</Feedback>
      {!draft.length && <div className="empty"><Disc3 size={38} /><h3>Your next favorite starts here.</h3><p>Search the catalog or add something custom.</p></div>}
      {kinds.map(({ type: kind, label }) => <div key={kind}>{draft.some(d => d.input.type === kind) && <h3 className="list-label">{label}</h3>}<div className="chips">{draft.filter(d => d.input.type === kind).map(item => <div className="chip" key={item.key}><span>{item.label}<small>{item.input.source === 'custom' ? 'Custom' : 'MusicBrainz'}</small></span><button type="button" aria-label={`Edit ${item.label}`} onClick={() => { setType(item.input.type); setCustom(item.label); setDraft(d => d.filter(i => i.key !== item.key)); setMessage('Edit the text and add it back as a custom entry, then Save.') }}>Edit</button><button type="button" aria-label={`Remove ${item.label}`} onClick={() => setDraft(d => d.filter(i => i.key !== item.key))}><X size={14} /></button></div>)}</div></div>)}
      <div className="save-bar"><small>{dirty ? 'Unsaved changes' : 'All changes saved'} · Exact text matching</small><div className="actions"><button type="button" disabled={busy || !saved} onClick={() => { if (saved) setDraft(drafts(saved)); setError(''); setMessage('Edits canceled.') }}>Cancel</button><button className="primary" disabled={busy || !dirty || uncertain}>{busy ? 'Saving…' : 'Save preferences'}</button></div></div>
      <button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm('Discard your draft and reload stored preferences?')) void load() }}>Reload stored preferences</button>
    </form></div>
    {blocker.state === 'blocked' && <div className="feedback info" role="alert"><p>You have unsaved preferences. Leave without saving?</p><div className="actions"><button onClick={() => blocker.reset()}>Keep editing</button><button onClick={() => blocker.proceed()}>Discard and leave</button></div></div>}
  </>
}
