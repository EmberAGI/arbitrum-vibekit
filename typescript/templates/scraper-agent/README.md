# Documentation RAG Agent (Scraper Agent)

An AI agent for indexing and querying documentation using RAG (Retrieval Augmented Generation). Built with the Arbitrum Vibekit Core framework.

## Features

- **Web Scraping**: Automatically scrapes and indexes documentation from any website
- **Semantic Search**: Query indexed documentation using natural language
- **Citations**: Returns sources with every query response for accurate attribution
- **LLM Orchestration**: Uses AI to understand intent and route to appropriate tools
- **MCP Integration**: Leverages the doc-rag-mcp-server for core functionality

## Architecture

This agent follows the Vibekit Templates pattern with:

- **3 Skills**: Documentation Indexing, Query, and Management
- **4 Tools**: Wrapping the MCP server's index, query, clear, and list capabilities
- **LLM Orchestration**: OpenRouter integration for natural language understanding

## Setup

1. Copy the environment template:

```bash
cp env.example .env
```

2. Configure your environment variables:

- `OPENROUTER_API_KEY`: Required for LLM orchestration
- `OPENAI_API_KEY`: Optional, enables embeddings for better search
- `PORT`: Default is 3008 (required for UI integration)

3. Install dependencies:

```bash
pnpm install
```

4. Build the agent:

```bash
pnpm build
```

## Running the Agent

### Development Mode

```bash
pnpm dev
```

### Production Mode

```bash
pnpm start
```

### Docker

```bash
docker build -t scraper-agent .
docker run -p 3008:3008 --env-file .env scraper-agent
```

## Usage Examples

### Index Documentation

```
"Index the React documentation from https://react.dev"
"Scrape the Next.js docs at https://nextjs.org/docs with max 50 pages"
```

### Query Documentation

```
"How do React hooks work?"
"What is the useEffect cleanup function?"
"Explain Next.js server components"
```

### Manage Index

```
"Show me all indexed documentation"
"Clear the documentation index"
```

## API Endpoints

- `GET /` - Agent information
- `GET /.well-known/agent.json` - Agent card
- `GET /sse` - Server-Sent Events for MCP connection
- `POST /messages` - MCP message handling

## Skills

### Documentation Indexing

- **ID**: `documentation-indexing`
- **Tools**: `index-documentation`
- **Purpose**: Scrape and index documentation websites

### Documentation Query

- **ID**: `documentation-query`
- **Tools**: `query-documentation`
- **Purpose**: Search indexed documentation with natural language

### Documentation Management

- **ID**: `documentation-management`
- **Tools**: `list-indexed-urls`, `clear-index`
- **Purpose**: Manage the documentation index

## Development

### Project Structure

```
scraper-agent/
├── src/
│   ├── index.ts          # Agent entry point
│   ├── skills/           # Skill definitions
│   │   ├── documentationIndexing.ts
│   │   ├── documentationQuery.ts
│   │   └── documentationManagement.ts
│   └── tools/            # Tool implementations
│       ├── indexDocumentation.ts
│       ├── queryDocumentation.ts
│       ├── clearIndex.ts
│       └── listIndexedUrls.ts
├── Dockerfile            # Container configuration
├── package.json          # Dependencies
└── README.md            # This file
```

### Testing

```bash
pnpm test
```

## Troubleshooting

### MCP Server Not Found

Ensure the doc-rag-mcp-server is built:

```bash
cd ../../lib/mcp-tools/doc-rag-mcp-server
pnpm build
```

### OpenAI API Key Issues

The agent works without OpenAI API key but with limited search capabilities. For best results, set `OPENAI_API_KEY` in your `.env` file.

### Port Already in Use

The UI expects port 3008. If it's in use, stop the conflicting service or update the compose.yml file.

## License

MIT
