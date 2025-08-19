import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import db from "app/db/index.server";              // default import
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  // quick sanity check
  if (typeof db.query !== "function") {
    throw new Error("DB query export not found");
  }
  const { rows } = await db.query("SELECT now()");
  return { now: rows[0].now as string };
}

export default function DbTest() {
  const { now } = useLoaderData<typeof loader>();
  return <div style={{ padding: 16 }}>Database says time is: {now}</div>;
}
