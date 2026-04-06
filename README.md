# transparencia-indexer

AT Protocol indexer + GraphQL API for [TransparencIA](https://transparencia.tech).

Indexes records from an AT Protocol PDS into PostgreSQL and serves them via an auto-generated GraphQL API using [lex-gql](https://tangled.org/chadtmiller.com/lex-gql).

## Architecture

```
PDS (AT Protocol)
  │
  │ Jetstream (WebSocket)
  ▼
┌─────────────────────────────────┐
│  transparencia-indexer (this)   │
│                                 │
│  ┌───────────┐  ┌────────────┐  │
│  │ Jetstream │  │  GraphQL   │  │
│  │ Consumer  │  │  Server    │  │
│  │           │  │ (lex-gql)  │  │
│  └─────┬─────┘  └─────┬──────┘  │
│        │              │         │
│        ▼              ▼         │
│     PostgreSQL (Supabase)       │
└─────────────────────────────────┘
```

## Quick Start

```bash
# Clone
git clone --recurse-submodules https://github.com/TransparencIA-MX/transparencia-indexer.git
cd transparencia-indexer

# Configure
cp .env.example .env
# Edit .env with your Supabase and PDS credentials

# Run migration (creates schema + tables)
docker compose run --rm migrate

# Backfill existing PDS records
docker compose --profile tools run --rm backfill

# Start services
docker compose up -d

# Check status
curl http://localhost:4000/graphql -H 'Content-Type: application/json' \
  -d '{"query": "{ health recordCount { articles enrichments } }"}'
```

## Services

### Jetstream Consumer
Connects to a [Jetstream](https://github.com/bluesky-social/jetstream) relay via WebSocket and indexes AT Protocol records into PostgreSQL in real-time.

- Filters by DID and collection
- Handles create, update, and delete operations
- Persists cursor for resume after restart
- Auto-reconnects with exponential backoff

### GraphQL API
Serves a GraphQL endpoint auto-generated from AT Protocol lexicons via [lex-gql](https://tangled.org/chadtmiller.com/lex-gql).

- Relay-style pagination
- Automatic joins via strongRef (enrichment → article → source)
- Filtering, sorting, aggregations
- Full-text search in Spanish and English

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ATPROTO_PDS_URL` | Yes | PDS URL to backfill from |
| `ATPROTO_DID` | Yes | DID to filter Jetstream events |
| `JETSTREAM_URL` | No | Jetstream relay URL (default: public Bluesky relay) |
| `JETSTREAM_COLLECTIONS` | Yes | Comma-separated collection NSIDs to index |
| `GRAPHQL_PORT` | No | GraphQL server port (default: 4000) |
| `GRAPHQL_API_KEY` | No | API key for authenticated access |

## Using with your own lexicons

This indexer is designed to work with any AT Protocol lexicons, not just TransparencIA's:

1. Replace the `lexicons/` submodule with your own lexicon definitions
2. Update `JETSTREAM_COLLECTIONS` in `.env`
3. Update `ATPROTO_DID` to your PDS identity
4. Run migration + backfill + start

## License

AGPL-3.0
