// app/routes/app.inventory.tsx
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  TextField,
  Button,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useSearchParams, Form } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { useState } from "react";

/* =========================
   Types for GraphQL result
   ========================= */
type InventoryQuantity = { name: string; quantity: number };

type InventoryLevelNode = {
  quantities: InventoryQuantity[];
};

type InventoryLevelEdge = { node: InventoryLevelNode };

type VariantNode = {
  id: string;
  title: string;
  sku?: string | null;
  inventoryItem?: {
    inventoryLevels: { edges: InventoryLevelEdge[] };
  } | null;
};

type VariantEdge = { node: VariantNode };

type ProductNode = {
  id: string;
  title: string;
  status?: string;
  variants: { edges: VariantEdge[] };
};

type ProductEdge = { cursor: string; node: ProductNode };

type ProductsData = {
  edges: ProductEdge[];
  pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean };
};

type Row = {
  product: string;
  variant: string;
  sku?: string | null;
  available: number;
};

/* =============
   Loader
   ============= */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after");

  const query = `
    query InventoryPage($first:Int!, $after:String) {
      products(first:$first, after:$after) {
        edges {
          cursor
          node {
            id
            title
            variants(first:50) {
              edges {
                node {
                  id
                  title
                  sku
                  inventoryItem {
                    inventoryLevels(first: 10) {
                      edges {
                        node {
                          location { id name }
                          quantities(names: ["available","committed","on_hand"]) {
                            name
                            quantity
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        pageInfo { hasNextPage hasPreviousPage }
      }
    }
  `;

  try {
    const response = await admin.graphql(query, {
      variables: { first: 20, after },
    });
    const jsonBody = (await response.json()) as { data?: { products?: ProductsData } };
    if (!jsonBody?.data?.products) {
      throw new Error("No products field in GraphQL response");
    }
    return json(jsonBody.data.products);
  } catch (err) {
    console.error(err);
    throw new Response("Failed to load inventory", { status: 500 });
  }
}

/* =============
   Component
   ============= */
export default function InventoryPage() {
  const products = useLoaderData<typeof loader>() as ProductsData | undefined;
  const [search, setSearch] = useState<string>("");
  const [params] = useSearchParams();

  if (!products) {
    return (
      <Page title="Inventory">
        <Banner tone="critical">No inventory data found.</Banner>
      </Page>
    );
  }

  // Flatten to rows
  const rows: Row[] = products.edges.flatMap((edge: ProductEdge) =>
    edge.node.variants.edges.map((v: VariantEdge) => {
      const levels: InventoryLevelEdge[] =
        v.node.inventoryItem?.inventoryLevels.edges ?? [];

      // Sum the "available" quantity across all locations
      const totalAvailable = levels.reduce((sum: number, lvl: InventoryLevelEdge) => {
        const avail = lvl.node.quantities.find(q => q.name === "available")?.quantity ?? 0;
        return sum + avail;
      }, 0);

      return {
        product: edge.node.title,
        variant: v.node.title,
        sku: v.node.sku ?? undefined,
        available: totalAvailable,
      };
    })
  );

  // Client-side filter (current page)
  const filtered: Row[] = rows.filter((r: Row) => {
    const q = search.toLowerCase();
    return (
      r.product.toLowerCase().includes(q) ||
      (r.sku ? r.sku.toLowerCase().includes(q) : false)
    );
  });

  return (
    <Page title="Inventory">
      <Layout>
        <Layout.Section>
          <Card>
            <InlineStack gap="200" align="space-between" blockAlign="center">
              <TextField
                label="Search"
                labelHidden
                placeholder="Search by product or SKU"
                value={search}
                onChange={(val: string) => setSearch(val)}
                autoComplete="off"
              />
              <InlineStack gap="200">
                {products.pageInfo.hasNextPage && (
                  <Form method="get">
                    <input
                      type="hidden"
                      name="after"
                      value={products.edges[products.edges.length - 1]?.cursor}
                    />
                    <Button submit>Next</Button>
                  </Form>
                )}
              </InlineStack>
            </InlineStack>
          </Card>

          <Card>
            <IndexTable
              resourceName={{ singular: "variant", plural: "variants" }}
              itemCount={filtered.length}
              headings={[
                { title: "Product" },
                { title: "Variant" },
                { title: "SKU" },
                { title: "Available" },
              ]}
              selectable={false}
            >
              {filtered.map((row: Row, index: number) => (
                <IndexTable.Row id={String(index)} key={index} position={index}>
                  <IndexTable.Cell>
                    <Text as="span">{row.product}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{row.variant}</IndexTable.Cell>
                  <IndexTable.Cell>{row.sku ?? "-"}</IndexTable.Cell>
                  <IndexTable.Cell>{row.available}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
