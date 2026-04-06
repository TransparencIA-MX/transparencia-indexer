/**
 * Database migration — creates the atproto schema and tables.
 * Run once: docker compose run --rm migrate
 */

import { getPool } from "./db.js";

const MIGRATION_SQL = `
CREATE SCHEMA IF NOT EXISTS atproto;

CREATE TABLE IF NOT EXISTS atproto.records (
  uri TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  collection TEXT NOT NULL,
  rkey TEXT NOT NULL,
  cid TEXT,
  record JSONB NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_records_collection ON atproto.records(collection);
CREATE INDEX IF NOT EXISTS idx_records_did ON atproto.records(did);
CREATE INDEX IF NOT EXISTS idx_records_collection_did ON atproto.records(collection, did);
CREATE INDEX IF NOT EXISTS idx_records_indexed_at ON atproto.records(indexed_at DESC);

CREATE INDEX IF NOT EXISTS idx_records_language ON atproto.records((record->>'language'))
  WHERE collection LIKE '%.enrichment';
CREATE INDEX IF NOT EXISTS idx_records_emotional_tone ON atproto.records((record->>'emotionalTone'))
  WHERE collection LIKE '%.enrichment';
CREATE INDEX IF NOT EXISTS idx_records_content_domain ON atproto.records((record->>'contentDomain'))
  WHERE collection LIKE '%.enrichment';
CREATE INDEX IF NOT EXISTS idx_records_published_at ON atproto.records((record->>'publishedAt'))
  WHERE collection LIKE '%.article';

CREATE INDEX IF NOT EXISTS idx_records_fts_es ON atproto.records
  USING gin(to_tsvector('spanish', COALESCE(record->>'summary', '')))
  WHERE collection LIKE '%.enrichment' AND record->>'language' = 'es';
CREATE INDEX IF NOT EXISTS idx_records_fts_en ON atproto.records
  USING gin(to_tsvector('english', COALESCE(record->>'summary', '')))
  WHERE collection LIKE '%.enrichment' AND record->>'language' = 'en';

CREATE TABLE IF NOT EXISTS atproto.actors (
  did TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS atproto.metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function main() {
  console.log("Running migration...");
  const pool = getPool();
  await pool.query(MIGRATION_SQL);
  console.log("Migration complete. Schema 'atproto' ready.");

  const res = await pool.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'atproto' ORDER BY indexname"
  );
  console.log(`Indexes created: ${res.rows.length}`);
  for (const row of res.rows) {
    console.log(`  - ${row.indexname}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
