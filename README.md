# transparencia-indexer

AT Protocol indexer + GraphQL API for [TransparencIA](https://transparencia.tech).

Indexes records from an AT Protocol PDS into PostgreSQL using [Tap](https://github.com/bluesky-social/indigo/tree/main/cmd/tap) and serves them via an auto-generated GraphQL API using [lex-gql](https://tangled.org/chadtmiller.com/lex-gql).

## Architecture

```
PDS (pds.transparencia.tech)
  │
  │ com.atproto.sync.subscribeRepos
  ▼
┌─────────────────────────────────────┐
│  Tap (official AT Protocol sync)    │
│  Backfill + live streaming          │
│  JSON events via WebSocket          │
└──────────────┬──────────────────────┘
               │ ws://tap:2480/channel
               ▼
┌─────────────────────────────────────┐
│  Indexer (Node.js)                  │
│  Consumes events → UPSERT to DB    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  PostgreSQL (Supabase)              │
│  Schema: atproto.records            │
│  JSONB + Full-text search ES/EN     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  GraphQL API (lex-gql)              │
│  Auto-generated from lexicons       │
│  Filtering, joins, pagination       │
└─────────────────────────────────────┘
```

## Quick Start

```bash
# Clone
git clone --recurse-submodules https://github.com/TransparencIA-MX/transparencia-indexer.git
cd transparencia-indexer

# Configure
cp .env.example .env
# Edit .env with your Supabase and AT Protocol credentials

# Run migration (creates atproto schema + tables + indexes)
docker compose run --rm migrate

# Start all services (Tap + Indexer + GraphQL)
docker compose up -d

# Seed Tap with your DID (triggers backfill from PDS)
docker compose --profile tools run --rm seed

# Check health
curl http://localhost:2480/health          # Tap
curl http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query": "{ health }"}'            # GraphQL

# Monitor
docker compose logs -f
```

## Services

### Tap
Official [AT Protocol sync utility](https://github.com/bluesky-social/indigo/tree/main/cmd/tap) from Bluesky. Handles firehose connection, backfill, verification, and filtering. Outputs simple JSON events.

### Indexer
Node.js service that consumes Tap events via WebSocket and upserts records into PostgreSQL (`atproto.records` table with JSONB).

### GraphQL API
Auto-generated GraphQL endpoint from AT Protocol lexicons via [lex-gql](https://tangled.org/chadtmiller.com/lex-gql). Supports filtering, sorting, pagination, joins via strongRef, and full-text search.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Supabase) |
| `ATPROTO_DID` | Yes | DID to track and index |
| `TAP_RELAY_URL` | No | AT Protocol relay (default: bsky.network) |
| `TAP_COLLECTION_FILTERS` | No | Collections to index (comma-separated) |
| `TAP_DISABLE_ACKS` | No | Fire-and-forget mode (default: true) |
| `GRAPHQL_PORT` | No | GraphQL server port (default: 4000) |
| `GRAPHQL_API_KEY` | No | API key for authenticated access |
| `TAP_WS_URL` | No | Tap WebSocket URL (default: ws://tap:2480/channel) |

## Using with your own lexicons

1. Replace the `lexicons/` submodule with your own
2. Update `TAP_COLLECTION_FILTERS` in `.env`
3. Update `ATPROTO_DID` to your identity
4. `docker compose up -d`

## License

AGPL-3.0
