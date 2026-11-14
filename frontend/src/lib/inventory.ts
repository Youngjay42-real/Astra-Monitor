import type { InventoryItem, Protocol } from '../api/schemas'

export function inventoryState(item: InventoryItem, today = new Date().toISOString().slice(0, 10)) {
  return { expired: item.expires_on !== null && item.expires_on < today, low: item.quantity <= item.low_threshold }
}
export function supplyWarnings(protocol: Protocol, inventory: InventoryItem[]) {
  return protocol.required_items.flatMap((required) => {
    const item = inventory.find((entry) => entry.id === required.item_id)
    if (!item) return [`Required item ${required.item_id} is missing from the kit.`]
    const state = inventoryState(item)
    const reasons = [state.expired && 'expired', state.low && 'low stock', item.quantity < required.quantity && 'insufficient quantity'].filter(Boolean)
    return reasons.length ? [`${item.name}: ${reasons.join(', ')}.`] : []
  })
}
