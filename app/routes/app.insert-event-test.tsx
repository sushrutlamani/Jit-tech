import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { insertInventoryEvent } from "../db/inventoryEvents.server";

// Runs on GET so the page can load
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request); // required for embedded app routes
  return null;
}

// Runs on POST when you click the button
export async function action({ request }: ActionFunctionArgs) {
  await authenticate.admin(request);

  const id = await insertInventoryEvent({
    shop_id: "shopify://jit-inventory-test",
    variant_id: "gid://shopify/ProductVariant/TEST",
    location_id: null,
    event_type: "sale",
    quantity_delta: -1,
    event_ts: new Date().toISOString(),
    source_ref: "test-insert-1",
    meta: { note: "hello from /app/insert-event-test" },
  });

  return { insertedId: id as string | null };
}

export default function InsertEventTest() {
  const data = useActionData<typeof action>();
  return (
    <div style={{ padding: 16 }}>
      <Form method="post">
        <button type="submit">Insert one test event</button>
      </Form>
      {data && (
        <p style={{ marginTop: 12 }}>
          {data.insertedId ? `Inserted: ${data.insertedId}` : "No row inserted (likely duplicate)."}
        </p>
      )}
    </div>
  );
}
