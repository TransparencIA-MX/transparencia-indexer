# TransparencIA Indexer — Agent Guide

This document tells an AI agent everything it needs to query the TransparencIA news index.

## What is this?

A GraphQL API over a real-time index of Mexican news articles published to the AT Protocol. The index contains:

- **~31,000 articles** from ~143 sources
- **~3,000 AI-generated enrichments** per article (political orientation, topics, entities, clickbait score, etc.)
- Updated in real time as new articles are published

## Endpoint

```
POST http://100.81.242.36:4000/graphql
Content-Type: application/json
X-API-Key: <api-key>
```

All queries are POST requests with a JSON body `{ "query": "..." }`.

---

## Data model

### Article (`techTransparenciaNewsArticle`)

A news article as published by a source.

| Field | Type | Description |
|---|---|---|
| `uri` | String | AT Protocol record URI |
| `title` | String | Article headline |
| `url` | String | Original URL |
| `author` | String | Byline |
| `description` | String | Summary/lede |
| `publishedAt` | String | ISO 8601 publish date |
| `language` | String | `es`, `en`, etc. |
| `feedCategory` | String | RSS category |
| `imageUrl` | String | Hero image |
| `indexedAt` | String | When indexed |

### Source (`techTransparenciaNewsSource`)

A news outlet.

| Field | Type | Description |
|---|---|---|
| `name` | String | Internal identifier |
| `displayName` | String | Human-readable name |
| `baseUrl` | String | Homepage URL |
| `country` | String | Country code |
| `language` | String | Primary language |
| `cms` | String | CMS platform |
| `description` | String | About the outlet |

### Enrichment (`techTransparenciaNewsEnrichment`)

AI-generated analysis of an article. One enrichment per article.

| Field | Type | Description |
|---|---|---|
| `summary` | String | Neutral summary |
| `neutralHeadline` | String | Rewritten headline without bias |
| `politicalOrientation` | String | `left`, `center-left`, `center`, `center-right`, `right` |
| `orientationConfidence` | String | Confidence score (0–1) |
| `orientationReasoning` | String | Explanation of orientation |
| `emotionalTone` | String | `neutral`, `alarming`, `hopeful`, `outraged`, etc. |
| `impactLevel` | Int | 1–5 civic impact score |
| `impactReasoning` | String | Why this impact level |
| `eventType` | String | `political`, `economic`, `crime`, `social`, etc. |
| `readingLevel` | String | `basic`, `intermediate`, `advanced` |
| `factCheckability` | Int | 1–5 (5 = highly verifiable) |
| `clickbaitScore` | Int | 1–5 (5 = very clickbait) |
| `clickbaitReasoning` | String | Why this score |
| `topics` | Array | Topic tags |
| `people` | Array | Named people mentioned |
| `organizationEntities` | Array | Organizations mentioned |
| `locations` | Array | Geographic locations |
| `claims` | Array | Factual claims made |
| `relatedKeywords` | Array | Keywords |
| `region` | String | Geographic region |
| `contentDomain` | String | Subject domain |
| `modelUsed` | String | AI model that generated this |
| `costUsd` | String | Cost to generate |

---

## Queries

### 1. List articles

```graphql
{
  techTransparenciaNewsArticle(first: 10) {
    edges {
      node {
        uri
        title
        url
        publishedAt
        language
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### 2. Filter articles

```graphql
{
  techTransparenciaNewsArticle(
    where: { language: { eq: "es" } }
    sortBy: [{ field: "publishedAt", dir: "desc" }]
    first: 20
  ) {
    edges {
      node { title url publishedAt }
    }
  }
}
```

### 3. Search articles by keyword

```graphql
{
  techTransparenciaNewsArticle(
    where: { title: { contains: "AMLO" } }
    first: 10
  ) {
    edges {
      node { title url publishedAt }
    }
  }
}
```

### 4. Get article with its enrichment

```graphql
{
  techTransparenciaNewsArticle(
    where: { title: { contains: "elecciones" } }
    first: 5
  ) {
    edges {
      node {
        title
        url
        publishedAt
        techTransparenciaNewsEnrichmentViaArticle {
          edges {
            node {
              summary
              neutralHeadline
              politicalOrientation
              orientationConfidence
              emotionalTone
              impactLevel
              clickbaitScore
              topics
              people
              locations
            }
          }
        }
      }
    }
  }
}
```

### 5. Get enrichments filtered by political orientation

```graphql
{
  techTransparenciaNewsEnrichment(
    where: { politicalOrientation: { eq: "right" } }
    sortBy: [{ field: "createdAt", dir: "desc" }]
    first: 10
  ) {
    edges {
      node {
        neutralHeadline
        politicalOrientation
        orientationConfidence
        orientationReasoning
        emotionalTone
        techTransparenciaNewsArticleByDid {
          title
          url
          publishedAt
        }
      }
    }
  }
}
```

### 6. Get high-impact articles

```graphql
{
  techTransparenciaNewsEnrichment(
    where: { impactLevel: { gte: 4 } }
    sortBy: [{ field: "createdAt", dir: "desc" }]
    first: 10
  ) {
    edges {
      node {
        impactLevel
        impactReasoning
        summary
        topics
        techTransparenciaNewsArticleByDid {
          title
          url
        }
      }
    }
  }
}
```

### 7. Get clickbait articles

```graphql
{
  techTransparenciaNewsEnrichment(
    where: { clickbaitScore: { gte: 4 } }
    first: 10
  ) {
    edges {
      node {
        clickbaitScore
        clickbaitReasoning
        neutralHeadline
        techTransparenciaNewsArticleByDid {
          title
          url
        }
      }
    }
  }
}
```

### 8. Aggregate — count articles by source

```graphql
{
  techTransparenciaNewsArticleAggregate(
    groupBy: [feedCategory]
    orderBy: COUNT_DESC
    limit: 20
  ) {
    count
    groups {
      feedCategory
      count
    }
  }
}
```

### 9. Aggregate — political orientation breakdown

```graphql
{
  techTransparenciaNewsEnrichmentAggregate(
    groupBy: [politicalOrientation]
    orderBy: COUNT_DESC
  ) {
    count
    groups {
      politicalOrientation
      count
    }
  }
}
```

### 10. List sources

```graphql
{
  techTransparenciaNewsSource(first: 50) {
    edges {
      node {
        displayName
        baseUrl
        country
        language
      }
    }
  }
}
```

---

## Pagination

The API uses cursor-based pagination.

```graphql
# First page
{
  techTransparenciaNewsArticle(first: 20) {
    edges { node { title } }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}

# Next page — pass endCursor as `after`
{
  techTransparenciaNewsArticle(first: 20, after: "<endCursor>") {
    edges { node { title } }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

---

## Filter operators

| Operator | Meaning |
|---|---|
| `eq` | Equals |
| `in` | In list |
| `contains` | ILIKE `%value%` |
| `gt` / `gte` | Greater than / or equal |
| `lt` / `lte` | Less than / or equal |

---

## Relationship traversal

Each type has reverse-join fields to navigate related records:

- `Article.techTransparenciaNewsEnrichmentViaArticle` → enrichments for this article
- `Enrichment.techTransparenciaNewsArticleByDid` → the article this enrichment belongs to
- `Source.techTransparenciaNewsArticleViaSource` → all articles from this source
- `Article.techTransparenciaNewsSourceByDid` → the source of this article

---

## Suggested agent workflows

**"What are the most important news stories today?"**
→ Query enrichments with `impactLevel >= 4`, sorted by `createdAt desc`, get `summary` and `topics`.

**"Is coverage of topic X biased?"**
→ Query enrichments where `topics contains X`, aggregate by `politicalOrientation`.

**"Find all articles about a person"**
→ Query enrichments where `people contains <name>`, traverse to articles for URLs.

**"Which sources publish the most clickbait?"**
→ Query enrichments with `clickbaitScore >= 4`, traverse to articles, then to sources, aggregate by `displayName`.

**"Summarize today's news on a topic"**
→ Query articles with `title contains <keyword>` and `publishedAt gte <today>`, get `summary` and `neutralHeadline` from enrichments.
