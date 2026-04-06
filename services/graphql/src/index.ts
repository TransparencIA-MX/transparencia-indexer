/**
 * GraphQL API server — auto-generated from AT Protocol lexicons via lex-gql.
 *
 * Serves a GraphQL endpoint with filtering, sorting, pagination, joins,
 * and full-text search over indexed AT Protocol records.
 */

import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";
import { createAdapter } from "./adapter.js";

const PORT = parseInt(process.env.GRAPHQL_PORT || "4000", 10);
const API_KEY = process.env.GRAPHQL_API_KEY;

async function main() {
  const adapter = await createAdapter();

  const yoga = createYoga({
    schema: adapter.schema,
    graphqlEndpoint: "/graphql",
    landingPage: true,
    cors: {
      origin: "*",
      methods: ["POST", "GET", "OPTIONS"],
    },
    plugins: API_KEY
      ? [
          {
            onRequest({ request, fetchAPI }) {
              const key = request.headers.get("x-api-key");
              if (key !== API_KEY) {
                return new fetchAPI.Response("Unauthorized", { status: 401 });
              }
            },
          },
        ]
      : [],
  });

  const server = createServer(yoga);

  server.listen(PORT, () => {
    console.log(`GraphQL API running at http://localhost:${PORT}/graphql`);
    console.log(`Auth: ${API_KEY ? "API key required" : "open (no auth)"}`);
  });
}

main().catch((err) => {
  console.error("Failed to start GraphQL server:", err);
  process.exit(1);
});
