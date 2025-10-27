#!/usr/bin/env node
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from multiple possible locations
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load .env from current directory, parent directories, and workspace root
dotenv.config({ path: join(__dirname, '.env') });
dotenv.config({ path: join(__dirname, '../.env') });
dotenv.config({ path: join(__dirname, '../../.env') });
dotenv.config({ path: join(__dirname, '../../../.env') });
dotenv.config({ path: join(__dirname, '../../../../.env') });
dotenv.config({ path: join(__dirname, '../../../../../.env') });
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  IndexDocumentationSchema,
  QueryDocumentationSchema,
  ClearIndexSchema,
  ListIndexedUrlsSchema,
  EvaluateDefiSafetySchema,
} from './tools.js';
import { DocumentationCrawler } from './scraper/index.js';
import type { PageContent } from './scraper/index.js';
import { DocumentChunker, EmbeddingsGenerator, VectorStore } from './embeddings/index.js';
import { handleEvaluateDefiSafety } from './defisafety/evaluator.js';

// Types
type IndexDocumentationParams = z.infer<typeof IndexDocumentationSchema>;
type QueryDocumentationParams = z.infer<typeof QueryDocumentationSchema>;
type EvaluateDefiSafetyParams = z.infer<typeof EvaluateDefiSafetySchema>;

// Initialize the MCP server using the high-level McpServer API
const server = new McpServer({
  name: 'doc-rag-mcp-server',
  version: '1.0.0',
});

// Register tools using the high-level API
server.tool(
  'index_documentation',
  'Scrape and index documentation from a website. Will only index pages within the provided base URL.',
  IndexDocumentationSchema.shape,
  async (params: IndexDocumentationParams) => {
    return await handleIndexDocumentation(params);
  }
);

server.tool(
  'query_documentation',
  'Query indexed documentation using natural language. Returns relevant documentation chunks with source citations.',
  QueryDocumentationSchema.shape,
  async (params: QueryDocumentationParams) => {
    return await handleQueryDocumentation(params);
  }
);

server.tool(
  'clear_index',
  'Clear the entire documentation index. Use with caution as this will remove all indexed content.',
  ClearIndexSchema.shape,
  async () => {
    return await handleClearIndex();
  }
);

server.tool(
  'list_indexed_urls',
  'List all URLs that have been indexed in the documentation store.',
  ListIndexedUrlsSchema.shape,
  async () => {
    return await handleListIndexedUrls();
  }
);

// Global storage for scraped pages (will be replaced with proper vector store later)
const indexedPages: Map<string, PageContent> = new Map();

// Global instances for embeddings functionality
const vectorStore = new VectorStore();
const embeddingsGenerator = new EmbeddingsGenerator();
const documentChunker = new DocumentChunker({
  maxChunkSize: 2000, // ~500 tokens
  overlapSize: 200, // ~50 tokens overlap
});

// Register DeFiSafety evaluation tool after dependencies are initialized
server.tool(
  'evaluate_defisafety_criteria',
  'Evaluate a DeFi protocol against DeFiSafety criteria by scraping and analyzing its documentation.',
  EvaluateDefiSafetySchema.shape,
  async (params: EvaluateDefiSafetyParams) => {
    // Create a wrapper function that returns the expected format
    const indexFunction = async (indexParams: { baseUrl: string; maxPages: number; selector: string }) => {
      const result = await handleIndexDocumentation(indexParams);
      // Extract the stats from the MCP response format
      const content = result.content?.[0];
      if (!content || content.type !== 'text') {
        throw new Error('Invalid response from indexing');
      }
      const parsed = JSON.parse(content.text);
      return {
        totalPagesScraped: parsed.totalPagesScraped,
        totalErrors: parsed.totalErrors,
        embeddings: parsed.embeddings
      };
    };

    const result = await handleEvaluateDefiSafety(
      params,
      vectorStore,
      embeddingsGenerator,
      indexFunction
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

// Tool handlers
async function handleIndexDocumentation(params: IndexDocumentationParams) {
  try {
    console.error(`Starting documentation indexing from ${params.baseUrl}`);

    // Create crawler instance
    const crawler = new DocumentationCrawler({
      baseUrl: params.baseUrl,
      maxPages: params.maxPages,
      selector: params.selector,
    });

    // Crawl the documentation site
    const { pages, errors } = await crawler.crawl(progress => {
      console.error(
        `Progress: ${progress.scrapedPages}/${progress.totalPages} - Currently scraping: ${progress.currentUrl}`
      );
    });

    // Store scraped pages in memory for now
    pages.forEach(page => {
      indexedPages.set(page.url, page);
    });

    // Generate embeddings if OpenAI API key is available
    let embeddingStats = { chunksCreated: 0, embeddingsGenerated: 0, estimatedCost: 0 };

    const apiKeyAvailable = await embeddingsGenerator.initialize();

    if (apiKeyAvailable) {
      try {
        // Clear any existing embeddings for these URLs
        pages.forEach(page => vectorStore.clearByUrl(page.url));

        // Create chunks for all pages
        const allChunks: Array<{ chunk: any; pageUrl: string }> = [];
        for (const page of pages) {
          const chunks = documentChunker.chunk(page.text, {
            url: page.url,
            title: page.title,
          });
          chunks.forEach(chunk => allChunks.push({ chunk, pageUrl: page.url }));
        }

        embeddingStats.chunksCreated = allChunks.length;

        // Estimate cost before proceeding
        const costEstimate = embeddingsGenerator.estimateCost(allChunks.map(item => item.chunk));
        embeddingStats.estimatedCost = costEstimate.estimatedCost;

        // Generate embeddings
        const embeddings = await embeddingsGenerator.generateEmbeddings(
          allChunks.map(item => item.chunk)
        );
        embeddingStats.embeddingsGenerated = embeddings.size;

        // Store in vector store
        vectorStore.addBatch(
          allChunks.map(item => item.chunk),
          embeddings
        );

        console.error(
          `Embedding generation completed: ${embeddingStats.embeddingsGenerated}/${embeddingStats.chunksCreated} embeddings created`
        );
      } catch (error) {
        console.error(
          `Embedding generation failed:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Prepare summary
    const summary = {
      totalPagesScraped: pages.length,
      totalErrors: errors.length,
      baseUrl: params.baseUrl,
      urls: pages.map(p => p.url),
      errors: errors.map(e => ({ url: e.url, error: e.error })),
      embeddings: embeddingStats,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error(`Index documentation error:`, error);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
    };
  }
}

async function handleQueryDocumentation(params: QueryDocumentationParams) {
  try {
    // Check if OpenAI API key is available
    const initialized = await embeddingsGenerator.initialize();
    if (!initialized) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Error: OPENAI_API_KEY environment variable is not set. Please set it to use the query functionality.',
          },
        ],
      };
    }

    // Check if we have any indexed documents
    const stats = vectorStore.getStats();
    if (stats.totalDocuments === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No documents have been indexed yet. Please use the index_documentation tool first to index some documentation.',
          },
        ],
      };
    }

    // Generate embedding for the query
    const queryEmbedding = await embeddingsGenerator.generateSingleEmbedding(params.query);

    if (!queryEmbedding) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: 'Failed to generate embedding for the query.' }],
      };
    }

    // Search for similar documents
    const searchResults = vectorStore.search(queryEmbedding, params.topK || 5);

    if (searchResults.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No relevant documentation found for your query.',
          },
        ],
      };
    }

    // Format the results with citations
    const formattedResults = searchResults.map((result, index) => {
      const chunk = result.document.chunk;
      return {
        rank: index + 1,
        content: chunk.content,
        source: chunk.metadata.url,
        title: chunk.metadata.title,
        score: result.score.toFixed(4),
        chunkInfo: `Chunk ${chunk.metadata.chunkIndex + 1} of ${chunk.metadata.totalChunks}`,
      };
    });

    // Create a comprehensive response
    const response = {
      query: params.query,
      totalResults: searchResults.length,
      indexStats: {
        totalDocuments: stats.totalDocuments,
        totalUrls: stats.totalUrls,
        memoryUsageMB: stats.memoryUsageMB,
      },
      results: formattedResults,
      ragInstruction:
        'Use ONLY the documentation chunks provided above to answer questions. Always cite the source URL when referencing information.',
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error(`Query documentation error:`, error);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
    };
  }
}

async function handleClearIndex() {
  try {
    console.error('Clearing documentation index');

    const previousSize = indexedPages.size;
    const previousVectorStats = vectorStore.getStats();

    indexedPages.clear();
    vectorStore.clear();

    return {
      content: [
        {
          type: 'text' as const,
          text: `Index cleared successfully. Removed ${previousSize} pages and ${previousVectorStats.totalDocuments} vector embeddings from index.`,
        },
      ],
    };
  } catch (error) {
    console.error(`Clear index error:`, error);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
    };
  }
}

async function handleListIndexedUrls() {
  try {
    console.error('Listing indexed URLs');

    const urls = Array.from(indexedPages.keys());
    const vectorStats = vectorStore.getStats();

    const response = {
      totalIndexedPages: urls.length,
      urls: urls,
      summary:
        urls.length > 0 && urls[0]
          ? `${urls.length} pages indexed from ${new URL(urls[0]).origin}`
          : 'No pages indexed yet',
      vectorStore: {
        totalDocuments: vectorStats.totalDocuments,
        totalUrls: vectorStats.totalUrls,
        memoryUsageMB: vectorStats.memoryUsageMB,
        embeddingsReady: vectorStats.totalDocuments > 0,
      },
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error(`List URLs error:`, error);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
    };
  }
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();

  try {
    console.error('Initializing Documentation RAG MCP server...');
    console.error(
      `Environment check - OPENAI_API_KEY: ${process.env['OPENAI_API_KEY'] ? 'SET' : 'NOT SET'}`
    );
    await server.connect(transport);
    console.error('Documentation RAG MCP server started and connected.');
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Run the server
main();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down...');
  try {
    await server.close();
  } catch (e) {
    console.error('Error closing server:', e);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down...');
  try {
    await server.close();
  } catch (e) {
    console.error('Error closing server:', e);
  }
  process.exit(0);
});
