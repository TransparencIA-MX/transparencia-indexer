/**
 * Backfill — fetches all existing records from the PDS and indexes them.
 * Run once: docker compose run --rm backfill
 */

import { getPool, upsertRecord, getRecordCount } from "./db.js";

const PDS_URL = process.env.ATPROTO_PDS_URL || "https://pds.transparencia.tech";
const DID = process.env.ATPROTO_DID || "";
const COLLECTIONS = (process.env.JETSTREAM_COLLECTIONS || "").split(",").filter(Boolean);

async function fetchAllRecords(collection: string): Promise<any[]> {
  const records: any[] = [];
  let cursor: string | undefined;

  while (true) {
    const params = new URLSearchParams({
      repo: DID,
      collection,
      limit: "100",
    });
    if (cursor) params.set("cursor", cursor);

    const url = `${PDS_URL}/xrpc/com.atproto.repo.listRecords?${params}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch ${collection}: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    records.push(...(data.records || []));
    cursor = data.cursor;

    console.log(`  Fetched ${records.length} ${collection.split(".").pop()} records...`);

    if (!cursor) break;
  }

  return records;
}

async function main() {
  console.log("Backfill starting...");
  console.log(`PDS: ${PDS_URL}`);
  console.log(`DID: ${DID}`);
  console.log(`Collections: ${COLLECTIONS.join(", ")}`);

  const pool = getPool();

  for (const collection of COLLECTIONS) {
    console.log(`\nFetching ${collection}...`);
    const records = await fetchAllRecords(collection);

    console.log(`Indexing ${records.length} records...`);
    let indexed = 0;
    for (const record of records) {
      const uri = record.uri;
      const rkey = uri.split("/").pop()!;
      const cid = record.cid;
      const value = record.value;

      await upsertRecord({ uri, did: DID, collection, rkey, cid, record: value });
      indexed++;
      if (indexed % 100 === 0) {
        console.log(`  Indexed ${indexed}/${records.length}`);
      }
    }
    console.log(`  Done: ${indexed} records indexed`);
  }

  const counts = await getRecordCount();
  console.log("\nBackfill complete. Record counts:");
  for (const [col, count] of Object.entries(counts)) {
    console.log(`  ${col}: ${count}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
