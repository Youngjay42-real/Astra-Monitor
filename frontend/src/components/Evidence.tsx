import type { Evidence as EvidenceItem } from '../api/schemas'
import { ErrorNotice, ExternalLink, Loading } from './ui'

export function Evidence({ items, loading, error, retry }: { items?: EvidenceItem[]; loading: boolean; error: string; retry: () => void }) {
  return <section className="evidence-section section page-width" aria-labelledby="evidence-title"><div className="section-heading"><div><span className="section-number">06 / RESEARCH & CONTEXT</span><h2 id="evidence-title">Evidence behind the interface</h2></div><p className="fine-print">NASA open research resources.<br />Source collections, not validation of this demo.</p></div><ErrorNotice error={error} retry={retry} />{loading && !items ? <Loading /> : null}<div className="evidence-links">{items?.length === 0 ? <p>No references were returned by the API.</p> : items?.map((item) => <article key={item.id}><span className="mono">NASA / {item.source}</span><h3><ExternalLink href={item.url}>{item.title}</ExternalLink></h3><p>{item.description}</p></article>)}</div></section>
}
