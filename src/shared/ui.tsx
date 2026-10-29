import type { ReactNode } from 'react'

export function Feedback({ children, kind = 'error' }: { children: ReactNode; kind?: 'error' | 'success' | 'info' }) {
  if (!children) return null
  return <div className={`feedback ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function PageHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <header className="page-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{children && <p>{children}</p>}</header>
}

export function Loading() {
  return <div className="loading" role="status">Loading your music space…</div>
}
