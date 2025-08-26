import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { mapOrdersToEvents } from "../backfill/mapOrdersToEvents.server";
import { writeEventsBatch } from "../backfill/writeEvents.server";

// --- GraphQL response types (only what we use) ---
type OrdersPageData = {
  orders: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    edges: Array<{
      node: {
        id: string;
        processedAt: string;
        createdAt: string;
        lineItems: {
          edges: Array<{
            node: {
              id: string;
              quantity: number;
              variant: { id: string | null } | null;
            };
          }>;
        };
      };
    }>;
  };
};

type OrdersPageEnvelope = { data: OrdersPageData };

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const q = `processed_at:>=${since}`;
  const shopId = `shopify://${session.shop}`;

  const gql = /* GraphQL */ `
    query OrdersPage($q: String!, $after: String) {
      orders(first: 100, after: $after, query: $q, sortKey: PROCESSED_AT, reverse: false) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            processedAt
            createdAt
            lineItems(first: 100) { edges { node { id quantity variant { id } } } }
          }
        }
      }
    }
  `;

  let after: string | null = null;
  let totalAttempted = 0, totalInserted = 0, totalSkipped = 0, pages = 0;

  do {
    // admin.graphql returns a WHATWG Response
    const resp: Response = await admin.graphql(gql, { variables: { q, after } });
    const { data } = (await resp.json()) as OrdersPageEnvelope;

    const edges = data.orders.edges;
    const orders = edges.map((e) => e.node);
    const events = mapOrdersToEvents(orders, shopId);
    const { attempted, inserted, skipped } = await writeEventsBatch(events);

    totalAttempted += attempted;
    totalInserted += inserted;
    totalSkipped += skipped;
    pages++;

    const pi = data.orders.pageInfo;
    after = pi.hasNextPage ? pi.endCursor : null;
  } while (after);

  return { pages, attempted: totalAttempted, inserted: totalInserted, skipped: totalSkipped };
}

export default function Backfill() {
  const result = useActionData<typeof action>();
  return (
    <div style={{ padding: 16 }}>
      <Form method="post">
        <button type="submit">Run 90-day backfill</button>
      </Form>
      {result && (
        <div style={{ marginTop: 12 }}>
          <div>Pages: {result.pages}</div>
          <div>Attempted: {result.attempted}</div>
          <div>Inserted: {result.inserted}</div>
          <div>Skipped: {result.skipped}</div>
        </div>
      )}
    </div>
  );
}
