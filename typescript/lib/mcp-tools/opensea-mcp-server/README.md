# OpenSea MCP Server (Read-only)

MCP server exposing read-only OpenSea marketplace endpoints, optimized for Arbitrum by default.

## Features

- get_wallet_nfts: Fetch NFTs owned by wallet on a chain (default arbitrum)
- get_collection: Fetch collection metadata by slug
- search_collections: Search collections
- get_listings_by_collection: Fetch active listings for a collection on a chain

## Setup

1. Add env:

```bash
OPENSEA_API_KEY=your_key_here
# Optional
OPENSEA_BASE_URL=https://api.opensea.io
PORT=3011
```

2. Build and run:

```bash
pnpm -w build
pnpm -F @vibekit/opensea-mcp-server dev
```

3. Inspect with MCP Inspector:

```bash
npx -y @modelcontextprotocol/inspector node ./dist/index.js
```

## Tool Schemas

- get_wallet_nfts({ address, chain='arbitrum', cursor? })
- get_collection({ collection_slug })
- search_collections({ q, chain?, page?, limit? })
- get_listings_by_collection({ collection_slug, chain='arbitrum', limit? })

## Notes

- Requires OPENSEA_API_KEY
- Read-only only. For write flows (list/buy), integrate wallet signing via an agent skill, not this server.


