# Documentation RAG MCP Server

An MCP (Model Context Protocol) server that enables AI agents to scrape, index, and query documentation websites using RAG (Retrieval Augmented Generation).

## Features

- **Web Scraping**: Automatically scrapes documentation from any website using Puppeteer
- **Smart Chunking**: Splits documents into semantic chunks with overlap for better retrieval
- **Vector Search**: Uses OpenAI embeddings for semantic similarity search
- **Citation Support**: Returns sources with every query response for accurate attribution
- **Domain Restriction**: Stays within the provided base URL to avoid crawling unrelated content

## Demonstration Agent

This MCP server is demonstrated by the **Scraper Agent** template located at `typescript/templates/scraper-agent/`. The scraper agent provides a complete working example of how to integrate this MCP tool into an AI agent that can:

- Index documentation from any website
- Answer questions based on the indexed content
- Manage the documentation index (clear, list indexed URLs)
- Provide citations for all responses

To try the demonstration:

```bash
cd typescript/templates/scraper-agent
pnpm install
pnpm dev
```

## Installation

```bash
pnpm install
```

## Configuration

Set the following environment variables:

```bash
# Required for generating embeddings (Task 3 - not yet implemented)
OPENAI_API_KEY=your-openai-api-key
```

You can get an OpenAI API key from: https://platform.openai.com/api-keys

### Setting Environment Variables

**Option 1: Use a .env file**
Create a `.env` file in the project directory:
```bash
OPENAI_API_KEY=sk-your-actual-api-key-here
```

**Option 2: Set inline when running**
```bash
OPENAI_API_KEY=sk-your-key-here pnpm dev
```

**Option 3: Export in your shell**
```bash
export OPENAI_API_KEY=sk-your-key-here
pnpm dev
```

## Usage

### Development Mode

```bash
pnpm dev
```

### Production Mode

```bash
pnpm build
pnpm start
```

## Available Tools

### 1. index_documentation
Scrapes and indexes documentation from a website.

**Parameters:**
- `baseUrl` (required): Base URL to scrape (will not go beyond this domain/path)
- `maxPages` (optional): Maximum pages to scrape (default: 100)
- `selector` (optional): CSS selector for main content (default: "main, article, .content, .documentation")

### 2. query_documentation
Queries indexed documentation using natural language.

**Parameters:**
- `query` (required): Natural language query
- `topK` (optional): Number of relevant chunks to retrieve (default: 5)

### 3. clear_index
Clears the entire documentation index.

**Parameters:** None

### 4. list_indexed_urls
Lists all URLs that have been indexed.

**Parameters:** None

## Example Usage

The following examples show how to use this MCP server directly, or you can see it in action with the [Scraper Agent](../../templates/scraper-agent/) template.

1. Index documentation:
```json
{
  "tool": "index_documentation",
  "arguments": {
    "baseUrl": "https://react.dev/learn",
    "maxPages": 50
  }
}
```

2. Query the documentation:
```json
{
  "tool": "query_documentation",
  "arguments": {
    "query": "How do React hooks work?",
    "topK": 3
  }
}
```

## Architecture

- **Scraper Module**: Handles web scraping with Puppeteer
- **Embeddings Module**: Manages document chunking and vector generation
- **Storage Module**: In-memory vector store with similarity search
- **MCP Server**: Exposes tools via the Model Context Protocol

## Testing

```bash
pnpm test
```

## License

MIT 