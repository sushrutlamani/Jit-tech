// app/db/inventoryEvents.server.ts
import { query } from "./index.server";

export type InventoryEvent = {
  shop_id: string;
  variant_id: string;
  location_id?: string | null;
  event_type:
    | "sale" | "return" | "restock" | "adjustment"
    | "transfer_in" | "transfer_out"
    | "fulfillment_commit" | "fulfillment_release";
  quantity_delta: number;
  event_ts: string;
  source_ref?: string | null;
  meta?: Record<string, unknown>;
};

async function _insertInventoryEvent(e: InventoryEvent) {
  const sql = `
    INSERT INTO inventory_events
      (shop_id, variant_id, location_id, event_type, quantity_delta, event_ts, source_ref, meta)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT DO NOTHING
    RETURNING id;
  `;
  const params = [
    e.shop_id,
    e.variant_id,
    e.location_id ?? null,
    e.event_type,
    e.quantity_delta,
    e.event_ts,
    e.source_ref ?? null,
    JSON.stringify(e.meta ?? {}),
  ];
  const { rows } = await query(sql, params);
  return rows[0]?.id ?? null;
}

export { _insertInventoryEvent as insertInventoryEvent }; // named export
export default { insertInventoryEvent: _insertInventoryEvent }; // default export
