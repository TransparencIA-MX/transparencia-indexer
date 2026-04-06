/**
 * GraphQL API server — auto-generated from AT Protocol lexicons via lex-gql.
 */

import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";
import { createAdapter } from "./adapter.js";

const PORT = parseInt(process.env.GRAPHQL_PORT || "4000", 10);
const API_KEY = process.env.GRAPHQL_API_KEY;

async function main() {
  const { schema, execute } = await createAdapter();

  const yoga = createYoga({
    schema,
    graphqlEndpoint: "/graphql",
    landingPage: true,
    cors: {
      origin: "*",
      methods: ["POST", "GET", "OPTIONS"],
    },
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
