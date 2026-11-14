import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import type { InventoryItem } from '../api/schemas'
import { inventoryState } from '../lib/inventory'
import { ErrorNotice, formatDate, Loading } from './ui'

export function Inventory({ items, loading, error, reload }: { items?: InventoryItem[]; loading: boolean; error: string; reload: () => Promise<void> }) {
  const [pending,setPending] = useState<string | null>(null)
  const [saveError,setSaveError] = useState('')
  const [message,setMessage] = useState('')
  async function adjust(item: InventoryItem, delta: number) {
    if (pending) return
    setPending(item.id); setSaveError(''); setMessage('')
    try { const saved = await api.saveInventory({ ...item, quantity: item.quantity+delta }); await reload(); setMessage(`${saved.name} quantity updated to ${saved.quantity}.`) }
    catch(cause) { setSaveError(errorMessage(cause)) }
    finally { setPending(null) }
  }
  const flagged = items?.filter((item) => { const state=inventoryState(item); return state.expired || state.low }).length ?? 0
  return <section id="inventory" className="inventory-section section page-width" aria-labelledby="inventory-title"><div className="section-heading"><div><span className="section-number">05 / RESOURCES</span><h2 id="inventory-title">Medical inventory</h2><p>Your kit, accounted for.</p></div>{items ? <span className={`inventory-summary mono ${flagged ? 'warning-text' : ''}`}><span className="status-dot" />{flagged ? `${flagged} ITEM${flagged === 1 ? '' : 'S'} NEED${flagged === 1 ? 'S' : ''} REVIEW` : 'STOCK REVIEW COMPLETE'}</span> : null}</div><ErrorNotice error={error} retry={() => void reload()} /><ErrorNotice error={saveError} />{loading && !items ? <Loading /> : null}
    {items?.length === 0 ? <p>No kit items reported by the API.</p> : items ? <div className="inventory-table"><div className="inventory-head"><span>ITEM</span><span>STOCK STATUS</span><span>EXPIRY (UTC)</span><span>QUANTITY</span></div>{items.map((item) => { const state=inventoryState(item); return <div className="inventory-row" key={item.id}><div className="inventory-name"><h3>{item.name}</h3><span>{item.unit}</span></div><span className={state.low || state.expired ? 'warning-text' : 'nominal-text'}>{state.expired ? 'Expired' : state.low ? 'Low stock' : 'Available'}{state.expired && state.low ? ' · low stock' : ''}</span><span className={state.expired ? 'warning-text expiry' : 'expiry'}>{item.expires_on ? formatDate(`${item.expires_on}T00:00:00Z`) : 'Not applicable'}</span><div className="quantity-control" aria-label={`${item.name} quantity`}><button type="button" aria-label={`Decrease ${item.name}`} disabled={pending !== null || item.quantity === 0} onClick={() => void adjust(item,-1)}><Minus size={15} aria-hidden="true" /></button><output aria-label={`${item.name} count`}>{pending === item.id ? '…' : item.quantity}</output><button type="button" aria-label={`Increase ${item.name}`} disabled={pending !== null || item.quantity === 999} onClick={() => void adjust(item,1)}><Plus size={15} aria-hidden="true" /></button></div></div> })}</div> : null}
    <div className="inventory-footer"><p className="fine-print">Stock changes do not clear expiry warnings. Review flagged items before use.</p><p className="success-message" role="status">{message}</p></div>
  </section>
}
