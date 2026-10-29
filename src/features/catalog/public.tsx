import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { getGenres, searchCatalog } from './api'
import type { CatalogItem, PreferenceType } from '../../shared/contracts'
import { Feedback } from '../../shared/ui'
export { getGenres, searchCatalog } from './api'

export function CatalogPicker({ type, onSelect }: { type: PreferenceType; onSelect: (item: CatalogItem) => void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<CatalogItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [searched, setSearched] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setItems([]); setError(''); setSearched(false)
    if (type !== 'genre' && query.trim().length < 2) { setBusy(false); return }
    setBusy(true)
    const timer = setTimeout(() => {
      const request = type === 'genre' ? getGenres() : searchCatalog(type, query.trim(), controller.signal)
      void request.then(result => {
        if (controller.signal.aborted) return
        setBusy(false); setSearched(true)
        if (result.error) { setError(result.error.message + (result.error.retryAfterSeconds ? ` Retry after ${result.error.retryAfterSeconds} seconds.` : '')); return }
        setItems(result.data.items)
      }).catch((reason: unknown) => {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === 'AbortError')) return
        console.error('Catalog search failed', reason)
        setBusy(false); setError('Catalog search failed. Please retry.')
      })
    }, type === 'genre' ? 0 : 400)
    return () => { clearTimeout(timer); controller.abort() }
  }, [type, query, attempt])
  const visible = type === 'genre' ? items.filter(i => i.displayValue.toLowerCase().includes(query.toLowerCase())) : items
  return <section className="catalog" aria-label="MusicBrainz catalog">
    <label className="search-label"><Search size={18} /><span className="sr-only">Search {type}s</span><input aria-label={`Search ${type}s`} placeholder={`Search ${type === 'song' ? 'songs' : `${type}s`} on MusicBrainz…`} maxLength={100} value={query} onChange={e => setQuery(e.target.value)} /></label>
    {busy && <p role="status">Searching the catalog…</p>}
    <Feedback>{error}</Feedback>
    {error && <button onClick={() => setAttempt(n => n + 1)}>Retry catalog</button>}
    {!busy && searched && !error && !visible.length && <p className="muted">{type === 'genre' && !items.length ? 'No imported genres yet. Ask the administrator to run the genre import, or add a custom genre.' : 'No matches. You can add a custom entry below.'}</p>}
    <div className="suggestions">{visible.slice(0, 40).map(item => <button key={item.id} className="suggestion" onClick={() => onSelect(item)}><span>{item.displayValue}<small>{item.subtitle || 'MusicBrainz'}</small></span><span aria-hidden="true">+</span></button>)}</div>
    <small>Metadata from <a href="https://musicbrainz.org" target="_blank" rel="noreferrer">MusicBrainz</a>. Search does not import listening history.</small>
  </section>
}
