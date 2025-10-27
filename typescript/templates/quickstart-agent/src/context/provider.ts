/**
 * Context Provider for Hello Quickstart Agent
 * Demonstrates loading context from MCP servers
 */

import type { HelloContext } from './types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export async function contextProvider(deps: { mcpClients: Record<string, Client> }): Promise<HelloContext> {
  console.error('[Context] Loading context from MCP servers...');

  const { mcpClients } = deps;
  let supportedLanguages: string[] = ['en']; // Default fallback

  // Try to load supported languages from the language MCP server
  try {
    // Look for the language MCP client
    const languageClient = Object.entries(mcpClients).find(([name]) => name.includes('language'))?.[1];

    if (languageClient) {
      console.error('[Context] Found language MCP client, fetching supported languages...');

      const response = await languageClient.callTool({
        name: 'getSupportedLanguages',
        arguments: {},
      });

      // Parse the response
      if (response.content && Array.isArray(response.content) && response.content.length > 0) {
        const firstContent = response.content[0];
        if (firstContent && 'type' in firstContent && firstContent.type === 'text' && 'text' in firstContent) {
          const data = JSON.parse(firstContent.text);
          supportedLanguages = data.languages.map((lang: any) => lang.code);
          console.error(`[Context] Loaded ${supportedLanguages.length} supported languages`);
        }
      }
    } else {
      console.error('[Context] No language MCP client found, using defaults');
    }
  } catch (error) {
    console.error('[Context] Error loading languages from MCP:', error);
    // Continue with defaults
  }

  // Create the context
  const context: HelloContext = {
    defaultLanguage: 'en',
    supportedLanguages,
    greetingPrefix: '👋',
    loadedAt: new Date(),
    metadata: {
      mcpServersConnected: Object.keys(mcpClients).length,
      environment: process.env['NODE_ENV'] || 'development',
    },
  };

  console.error('[Context] Context loaded successfully:', {
    defaultLanguage: context.defaultLanguage,
    supportedLanguages: context.supportedLanguages.length,
    mcpServersConnected: context.metadata.mcpServersConnected,
  });

  return context;
}
