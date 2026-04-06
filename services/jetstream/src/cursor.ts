/**
 * Cursor persistence — saves Jetstream cursor to DB so we can resume after restart.
 */

import { getPool } from "./db.js";

const CURSOR_KEY = "jetstream_cursor";

export async function loadCursor(): Promise<number | null> {
  const pool = getPool();
  // Use a simple key-value in a metadata table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atproto.metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const res = await pool.query(
    "SELECT value FROM atproto.metadata WHERE key = $1",
    [CURSOR_KEY]
  );

  if (res.rows.length > 0) {
    return parseInt(res.rows[0].value, 10);
  }
  return null;
}

export async function saveCursor(cursor: number): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO atproto.metadata (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [CURSOR_KEY, cursor.toString()]
  );
}
