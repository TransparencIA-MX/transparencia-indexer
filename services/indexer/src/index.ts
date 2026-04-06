/**
 * Indexer — consumes events from Tap and writes to PostgreSQL.
 *
 * Tap handles the firehose connection, backfill, and ordering.
 * This service just receives JSON events and upserts into atproto.records.
 */

import { WebSocket } from "ws";
import { getPool, upsertRecord, deleteRecord, getRecordCount } from "./db.js";

const TAP_WS_URL = process.env.TAP_WS_URL || "ws://localhost:2480/channel";

let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;
let messageCount = 0;
let lastLogTime = Date.now();

function connect() {
  console.log(`Connecting to Tap: ${TAP_WS_URL}`);

  const ws = new WebSocket(TAP_WS_URL);

  ws.on("open", () => {
    console.log("Connected to Tap");
    reconnectDelay = 1000;
  });

  ws.on("message", async (data: Buffer) => {
    try {
      const event = JSON.parse(data.toString());

      // Only process record events (skip identity events)
      if (event.type !== "record") return;

      const rec = event.record;
      if (!rec) return;

      const { did, collection, rkey, action, cid, record } = rec;

      if (action === "create" || action === "update") {
        const uri = `at://${did}/${collection}/${rkey}`;
        await upsertRecord({ uri, did, collection, rkey, cid, record });
        messageCount++;
      } else if (action === "delete") {
        const uri = `at://${did}/${collection}/${rkey}`;
        await deleteRecord(uri);
        messageCount++;
      }

      // Log progress every 10 seconds
      const now = Date.now();
      if (now - lastLogTime > 10000) {
        console.log(`Indexed ${messageCount} records total`);
        lastLogTime = now;
      }
    } catch (err) {
      console.error("Error processing event:", err);
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`Disconnected from Tap (${code}). Reconnecting in ${reconnectDelay}ms...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });
}

async function main() {
  console.log("TransparencIA Indexer starting...");
  console.log(`Tap URL: ${TAP_WS_URL}`);

  const pool = getPool();
  const counts = await getRecordCount();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Database connected. Current records: ${total}`);
  for (const [col, count] of Object.entries(counts)) {
    console.log(`  ${col}: ${count}`);
  }

  connect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
