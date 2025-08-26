import { insertInventoryEvent } from "../db/inventoryEvents.server";
import type { InventoryEvent } from "../db/inventoryEvents.server";

export async function writeEventsBatch(list: InventoryEvent[]) {
  let attempted = 0, inserted = 0, skipped = 0;
  for (const e of list) {
    attempted++;
    const id = await insertInventoryEvent(e); // returns null if deduped
    if (id) inserted++; else skipped++;
  }
  return { attempted, inserted, skipped };
}
