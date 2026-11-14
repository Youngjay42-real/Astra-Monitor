import { ArrowUpRight, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export function Loading({ children = 'Loading mission data…' }: { children?: ReactNode }) {
  return <p className="loading-state" role="status"><LoaderCircle size={16} className="spinner" aria-hidden="true" />{children}</p>
}
export function ErrorNotice({ error, retry }: { error?: string; retry?: () => void }) {
  if (!error) return null
  return <div className="error-notice" role="alert"><span>{error}</span>{retry ? <button type="button" className="text-button" onClick={retry}>Retry</button> : null}</div>
}
export function ExternalLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return <a className={`external-link ${className}`} href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
}
export function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC', ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(new Date(value)) + (includeTime ? ' UTC' : '')
}
