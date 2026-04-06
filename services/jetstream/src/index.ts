/**
 * Jetstream consumer — indexes AT Protocol records into PostgreSQL.
 *
 * Connects to a Jetstream relay via WebSocket, listens for create/update/delete
 * events for configured collections, and upserts them into the atproto.records table.
 */

import { WebSocket } from "ws";
import { getPool, upsertRecord, deleteRecord } from "./db.js";
import { loadCursor, saveCursor } from "./cursor.js";

const JETSTREAM_URL = process.env.JETSTREAM_URL || "wss://jetstream1.us-east.bsky.network/subscribe";
const ATPROTO_DID = process.env.ATPROTO_DID || "";
const COLLECTIONS = (process.env.JETSTREAM_COLLECTIONS || "").split(",").filter(Boolean);

if (!ATPROTO_DID) {
  console.error("ATPROTO_DID is required");
  process.exit(1);
}

if (COLLECTIONS.length === 0) {
  console.error("JETSTREAM_COLLECTIONS is required");
  process.exit(1);
}

let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 60000;
let messageCount = 0;

async function connect() {
  const cursor = await loadCursor();

  const params = new URLSearchParams();
  params.set("wantedDids", ATPROTO_DID);
  for (const col of COLLECTIONS) {
    params.append("wantedCollections", col);
  }
  if (cursor) {
    params.set("cursor", cursor.toString());
    console.log(`Resuming from cursor: ${cursor}`);
  }

  const url = `${JETSTREAM_URL}?${params.toString()}`;
  console.log(`Connecting to Jetstream: ${url.substring(0, 100)}...`);

  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("Connected to Jetstream");
    reconnectDelay = 1000;
  });

  ws.on("message", async (data: Buffer) => {
    try {
      const event = JSON.parse(data.toString());

      if (event.kind !== "commit") return;

      const { did, commit } = event;
      const { collection, rkey, operation, record, cid } = commit;

      if (operation === "create" || operation === "update") {
        const uri = `at://${did}/${collection}/${rkey}`;
        await upsertRecord({ uri, did, collection, rkey, cid, record });
        messageCount++;
        if (messageCount % 100 === 0) {
          console.log(`Indexed ${messageCount} records`);
        }
      } else if (operation === "delete") {
        const uri = `at://${did}/${collection}/${rkey}`;
        await deleteRecord(uri);
      }

      // Persist cursor periodically
      if (event.time_us && messageCount % 50 === 0) {
        await saveCursor(event.time_us);
      }
    } catch (err) {
      console.error("Error processing message:", err);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`Disconnected (${code}): ${reason}. Reconnecting in ${reconnectDelay}ms...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
}

async function main() {
  console.log("TransparencIA Jetstream Indexer starting...");
  console.log(`DID: ${ATPROTO_DID}`);
  console.log(`Collections: ${COLLECTIONS.join(", ")}`);

  const pool = getPool();
  // Verify DB connection
  const res = await pool.query("SELECT count(*) FROM atproto.records");
  console.log(`Database connected. Current records: ${res.rows[0].count}`);

  await connect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
