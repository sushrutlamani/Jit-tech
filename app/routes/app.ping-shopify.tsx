import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request); // session-aware client
  const resp = await admin.graphql(`{ shop { name } }`);
  const { data } = await resp.json();
  return { shopName: data.shop.name as string };
}

export default function PingShopify() {
  const { shopName } = useLoaderData<typeof loader>();
  return <div style={{ padding: 16 }}>Shopify connected: {shopName}</div>;
}
