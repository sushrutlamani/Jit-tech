import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function _query(text: string, params: unknown[] = []) {
  return pool.query(text, params as any[]);
}

export const query = _query;             // named export
export default { query: _query };        // default export too
