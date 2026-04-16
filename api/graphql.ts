/**
 * Vercel API route — GraphQL endpoint.
 * Reuses the same adapter as the Docker service.
 */

import { createYoga } from "graphql-yoga";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAdapter } from "../services/graphql/src/adapter.js";

const API_KEY = process.env.GRAPHQL_API_KEY;

// Lexicons are at the repo root — process.cwd() is the project root on Vercel
const lexiconDir = join(process.cwd(), "lexicons", "lexicons", "tech", "transparencia");

// Cache across warm invocations
let yoga: ReturnType<typeof createYoga> | null = null;

async function getYoga() {
  if (yoga) return yoga;
  const { schema } = await createAdapter({ lexiconDir });
  yoga = createYoga({
    schema,
    graphqlEndpoint: "/api/graphql",
    landingPage: true,
    cors: { origin: "*", methods: ["POST", "GET", "OPTIONS"] },
  });
  return yoga;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (API_KEY) {
    const key = req.headers["x-api-key"];
    if (key !== API_KEY) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }
  const y = await getYoga();
  return y(req, res);
}
