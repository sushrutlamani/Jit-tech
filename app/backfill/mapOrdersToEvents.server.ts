import type { InventoryEvent } from "../db/inventoryEvents.server";

type OrderNode = {
  id: string;
  processedAt?: string | null;
  createdAt?: string | null;
  lineItems: { edges: { node: { id: string; quantity: number; variant?: { id?: string | null } | null } }[] };
};

export function mapOrdersToEvents(orders: OrderNode[], shopId: string): InventoryEvent[] {
  const events: InventoryEvent[] = [];
  for (const o of orders) {
    const when = o.processedAt ?? o.createdAt ?? new Date().toISOString();
    for (const { node: li } of o.lineItems.edges ?? []) {
      const qty = Number(li.quantity ?? 0);
      const variantId = li.variant?.id ?? null;
      if (!qty || !variantId) continue;

      events.push({
        shop_id: shopId,
        variant_id: variantId,
        location_id: null,                 // add per-fulfillment later
        event_type: "sale",
        quantity_delta: -Math.abs(qty),    // sales are outbound
        event_ts: when,
        source_ref: `shopify:order:${o.id}:line_item:${li.id}`,
        meta: {},
      });
    }
  }
  return events;
}
