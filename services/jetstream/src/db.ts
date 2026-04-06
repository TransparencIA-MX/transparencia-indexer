/**
 * Database layer — PostgreSQL connection and record operations.
 */

import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export interface RecordRow {
  uri: string;
  did: string;
  collection: string;
  rkey: string;
  cid?: string;
  record: object;
}

export async function upsertRecord(row: RecordRow): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO atproto.records (uri, did, collection, rkey, cid, record, indexed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (uri) DO UPDATE SET
       cid = EXCLUDED.cid,
       record = EXCLUDED.record,
       indexed_at = NOW()`,
    [row.uri, row.did, row.collection, row.rkey, row.cid || null, JSON.stringify(row.record)]
  );
}

export async function deleteRecord(uri: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM atproto.records WHERE uri = $1", [uri]);
}

export async function getRecordCount(): Promise<Record<string, number>> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT collection, count(*)::int as count FROM atproto.records GROUP BY collection ORDER BY collection"
  );
  const counts: Record<string, number> = {};
  for (const row of res.rows) {
    counts[row.collection] = row.count;
  }
  return counts;
}
