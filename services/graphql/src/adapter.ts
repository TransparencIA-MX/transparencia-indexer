/**
 * lex-gql adapter — connects lexicons to PostgreSQL via Supabase.
 *
 * Translates GraphQL operations into SQL queries against atproto.records.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// lex-gql imports — uncomment when package is installed
// import { parseLexicon, createAdapter as createLexGqlAdapter } from "lex-gql";

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadLexicons() {
  const lexiconDir = join(__dirname, "..", "lexicons", "lexicons", "tech", "transparencia");
  const files = [
    join(lexiconDir, "defs.json"),
    join(lexiconDir, "news", "article.json"),
    join(lexiconDir, "news", "source.json"),
    join(lexiconDir, "news", "enrichment.json"),
  ];

  return files.map((f) => {
    console.log(`Loading lexicon: ${f}`);
    return JSON.parse(readFileSync(f, "utf-8"));
  });
}

export async function createAdapter() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  // Verify connection
  const res = await pool.query("SELECT count(*)::int as count FROM atproto.records");
  console.log(`Database connected. Records: ${res.rows[0].count}`);

  const lexicons = loadLexicons();
  console.log(`Loaded ${lexicons.length} lexicons`);

  // TODO: Wire up lex-gql when installed
  // const parsedLexicons = lexicons.map(parseLexicon);
  // return createLexGqlAdapter(parsedLexicons, {
  //   query: async (operation) => { ... },
  //   search: async (operation) => { ... },
  // });

  // Placeholder: return a minimal GraphQL schema
  const { buildSchema } = await import("graphql");
  const schema = buildSchema(`
    type Query {
      health: String!
      recordCount: RecordCount!
    }
    type RecordCount {
      sources: Int!
      articles: Int!
      enrichments: Int!
      total: Int!
    }
  `);

  const rootValue = {
    health: () => "ok",
    recordCount: async () => {
      const r = await pool.query(
        "SELECT collection, count(*)::int as count FROM atproto.records GROUP BY collection"
      );
      const counts: Record<string, number> = {};
      for (const row of r.rows) {
        const short = row.collection.split(".").pop();
        counts[short] = row.count;
      }
      return {
        sources: counts["source"] || 0,
        articles: counts["article"] || 0,
        enrichments: counts["enrichment"] || 0,
        total: Object.values(counts).reduce((a: number, b: number) => a + b, 0),
      };
    },
  };

  return { schema, rootValue, execute: null };
}
