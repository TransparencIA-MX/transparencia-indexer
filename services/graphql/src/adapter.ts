/**
 * lex-gql adapter — translates GraphQL operations to SQL against atproto.records.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
// @ts-ignore
import { parseLexicon, createAdapter as createLexGqlAdapter, hydrateRecord } from "lex-gql";
import type { GraphQLSchema } from "graphql";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadLexicons(lexiconDir?: string) {
  const dir = lexiconDir ?? join(__dirname, "..", "lexicons", "lexicons", "tech", "transparencia");
  const files = [
    join(dir, "defs.json"),
    join(dir, "news", "article.json"),
    join(dir, "news", "source.json"),
    join(dir, "news", "enrichment.json"),
  ];

  return files.map((f) => {
    console.log(`Loading lexicon: ${f}`);
    return parseLexicon(JSON.parse(readFileSync(f, "utf-8")));
  });
}

/**
 * Build SQL WHERE clause from lex-gql where conditions.
 * Fields are stored in record JSONB, so we use record->>'fieldName'.
 * System fields (uri, did, collection, cid) are top-level columns.
 */
function buildWhereClause(
  where: any[],
  collection: string | null,
  params: any[]
): string {
  const conditions: string[] = [];

  // Collection filter (unless collection is '*' for cross-collection URI resolution)
  if (collection && collection !== "*") {
    params.push(collection);
    conditions.push(`collection = $${params.length}`);
  }

  for (const clause of where) {
    if (clause.op === "and" || clause.op === "or") {
      // Logical operator
      const subclauses = clause.conditions.map((group: any[]) => {
        const sub = buildWhereClause(group, null, params);
        return `(${sub})`;
      });
      conditions.push(`(${subclauses.join(` ${clause.op.toUpperCase()} `)})`);
      continue;
    }

    const { field, op, value } = clause;

    // System fields are top-level columns
    const isSystemField = ["uri", "did", "collection", "cid", "indexedAt"].includes(field);
    const column = isSystemField
      ? field === "indexedAt" ? "indexed_at" : field
      : `record->>'${field}'`;

    switch (op) {
      case "eq":
        params.push(value);
        conditions.push(`${column} = $${params.length}`);
        break;
      case "in":
        params.push(value);
        conditions.push(`${column} = ANY($${params.length})`);
        break;
      case "contains":
        params.push(`%${value}%`);
        conditions.push(`${column} ILIKE $${params.length}`);
        break;
      case "gt":
        params.push(value);
        conditions.push(`${column} > $${params.length}`);
        break;
      case "gte":
        params.push(value);
        conditions.push(`${column} >= $${params.length}`);
        break;
      case "lt":
        params.push(value);
        conditions.push(`${column} < $${params.length}`);
        break;
      case "lte":
        params.push(value);
        conditions.push(`${column} <= $${params.length}`);
        break;
    }
  }

  return conditions.length > 0 ? conditions.join(" AND ") : "TRUE";
}

/**
 * Build SQL ORDER BY from lex-gql sort clauses.
 */
function buildOrderBy(sort?: any[]): string {
  if (!sort || sort.length === 0) {
    return "ORDER BY indexed_at DESC";
  }

  const clauses = sort.map((s) => {
    const isSystemField = ["uri", "did", "collection", "cid", "indexedAt"].includes(s.field);
    const column = isSystemField
      ? s.field === "indexedAt" ? "indexed_at" : s.field
      : `record->>'${s.field}'`;
    return `${column} ${s.dir === "asc" ? "ASC" : "DESC"}`;
  });

  return `ORDER BY ${clauses.join(", ")}`;
}

/**
 * Transform a database row into the format lex-gql expects.
 * System fields at top level, record fields spread.
 */
function transformRow(row: any): any {
  const record = typeof row.record === "string" ? JSON.parse(row.record) : row.record;
  return {
    uri: row.uri,
    cid: row.cid,
    did: row.did,
    collection: row.collection,
    indexedAt: row.indexed_at,
    actorHandle: row.handle || null,
    ...record,
  };
}

export async function createAdapter(options?: { lexiconDir?: string }): Promise<{ schema: GraphQLSchema; execute: (query: string, variables?: any) => Promise<any> }> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  // Verify connection
  const res = await pool.query("SELECT count(*)::int as count FROM atproto.records");
  console.log(`Database connected. Records: ${res.rows[0].count}`);

  // Load and parse lexicons
  const lexicons = loadLexicons(options?.lexiconDir);
  console.log(`Loaded ${lexicons.length} lexicons`);

  // Create lex-gql adapter
  const adapter = createLexGqlAdapter(lexicons, {
    query: async (operation: any) => {
      const { type } = operation;

      if (type === "findMany") {
        const { collection, where = [], sort, pagination = {} } = operation;
        const params: any[] = [];

        // Build WHERE
        const whereClause = buildWhereClause(where, collection, params);

        // Build ORDER BY
        const orderBy = buildOrderBy(sort);

        // Build LIMIT/OFFSET from cursor pagination
        const limit = (pagination.first || pagination.last || 50) + 1; // +1 to detect hasNext
        params.push(limit);
        const limitClause = `LIMIT $${params.length}`;

        // Cursor-based pagination
        let cursorClause = "";
        if (pagination.after) {
          try {
            const decoded = Buffer.from(pagination.after, "base64").toString("utf-8");
            params.push(decoded);
            cursorClause = `AND uri > $${params.length}`;
          } catch {}
        }

        const sql = `
          SELECT r.*, a.handle
          FROM atproto.records r
          LEFT JOIN atproto.actors a ON r.did = a.did
          WHERE ${whereClause} ${cursorClause}
          ${orderBy}
          ${limitClause}
        `;

        const result = await pool.query(sql, params);
        const requestedCount = pagination.first || pagination.last || 50;
        const hasNext = result.rows.length > requestedCount;
        const rows = hasNext ? result.rows.slice(0, requestedCount) : result.rows;

        return {
          rows: rows.map(transformRow),
          hasNext,
          hasPrev: !!pagination.after,
          totalCount: undefined, // Skip count query for performance
        };
      }

      if (type === "findManyPartitioned") {
        // Used for reverse joins (N+1 prevention)
        // Return null to fall back to individual findMany queries
        return null;
      }

      if (type === "aggregate") {
        const { collection, where = [], groupBy } = operation;
        const params: any[] = [];
        const whereClause = buildWhereClause(where, collection, params);

        if (groupBy && groupBy.length > 0) {
          const groupField = `record->>'${groupBy[0]}'`;
          const sql = `
            SELECT ${groupField} as group_value, count(*)::int as count
            FROM atproto.records
            WHERE ${whereClause}
            GROUP BY ${groupField}
            ORDER BY count DESC
          `;
          const result = await pool.query(sql, params);

          // Get total count
          const countSql = `SELECT count(*)::int as count FROM atproto.records WHERE ${whereClause}`;
          const countResult = await pool.query(countSql, params);

          return {
            count: countResult.rows[0].count,
            groups: result.rows.map((r: any) => ({
              [groupBy[0]]: r.group_value,
              count: r.count,
            })),
          };
        }

        // Simple count
        const sql = `SELECT count(*)::int as count FROM atproto.records WHERE ${whereClause}`;
        const result = await pool.query(sql, params);
        return { count: result.rows[0].count, groups: [] };
      }

      console.warn(`Unhandled operation type: ${type}`, operation);
      return { rows: [], hasNext: false, hasPrev: false };
    },
  });

  return {
    schema: adapter.schema,
    execute: adapter.execute.bind(adapter),
  };
}
