// app/routes/app.orders-first-page.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

type LoaderData =
  | { ok: true; count: number; hasNextPage: boolean; endCursor: string | null }
  | { ok: false; message: string };

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const q = `processed_at:>=${since}`;

    const gql = /* GraphQL */ `
      query OrdersFirst($q: String!, $first: Int!) {
        orders(first: $first, query: $q, sortKey: PROCESSED_AT, reverse: false) {
          pageInfo { hasNextPage endCursor }
          edges { node { id } }
        }
      }
    `;

    // 1) Call Shopify → Response
    const resp = await admin.graphql(gql, { variables: { q, first: 25 } });

    // 2) Parse the Response → JSON body
    const body = await resp.json();

    // 3) Handle errors explicitly
    if (!body?.data) {
      return json<LoaderData>({ ok: false, message: JSON.stringify(body, null, 2) });
    }

    // 4) Extract the fields you need and return via json()
    const edges = (body.data.orders?.edges ?? []) as any[];
    const pi = body.data.orders?.pageInfo ?? {};
    return json<LoaderData>({
      ok: true,
      count: edges.length,
      hasNextPage: Boolean(pi.hasNextPage),
      endCursor: (pi.endCursor as string) ?? null,
    });
  } catch (err: any) {
    return json<LoaderData>({ ok: false, message: err?.message ?? String(err) });
  }
}

export default function OrdersFirstPage() {
  const data = useLoaderData<LoaderData>();

  return (
    <div style={{ padding: 16 }}>
      {"ok" in data && data.ok ? (
        <>
          <div>Fetched orders: {data.count}</div>
          <div>Has next page: {String(data.hasNextPage)}</div>
          <div>End cursor: {data.endCursor ?? "null"}</div>
        </>
      ) : (
        <pre style={{ whiteSpace: "pre-wrap" }}>{data.message}</pre>
      )}
    </div>
  );
}
