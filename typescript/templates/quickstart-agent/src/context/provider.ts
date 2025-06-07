/**
 * Context Provider for Hello Quickstart Agent
 * Demonstrates loading context from MCP servers
 */

import type { HelloContext } from './types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export async function contextProvider(deps: { mcpClients: Record<string, Client> }): Promise<HelloContext> {
  console.error('[Context] Loading context from MCP servers...');

  const { mcpClients } = deps;
  let availableTopics: any[] = [];

  // Try to load available topics from the Allora MCP server
  try {
    // Look for the Allora MCP client
    const alloraClient = Object.entries(mcpClients).find(([name]) => name.includes('allora'))?.[1];

    if (alloraClient) {
      console.error('[Context] Found Allora MCP client, fetching available topics...');

      const response = await alloraClient.callTool({
        name: 'list_all_topics',
        arguments: {},
      });

      // Parse the response
      if (response.content && Array.isArray(response.content) && response.content.length > 0) {
        const firstContent = response.content[0];
        if (firstContent && 'type' in firstContent && firstContent.type === 'text' && 'text' in firstContent) {
          const data = JSON.parse(firstContent.text);
          availableTopics = data;
          console.error(`[Context] Loaded ${availableTopics.length} prediction topics`);
        }
      }
    } else {
      console.error('[Context] No Allora MCP client found, continuing without topics');
    }
  } catch (error) {
    console.error('[Context] Error loading topics from Allora MCP:', error);
    // Continue without topics
  }

  // Create the context
  const context: HelloContext = {
    defaultLanguage: 'en',
    supportedLanguages: ['en'], // Keep for backward compatibility
    greetingPrefix: '👋',
    loadedAt: new Date(),
    availableTopics, // Add Allora topics
    metadata: {
      mcpServersConnected: Object.keys(mcpClients).length,
      environment: process.env.NODE_ENV || 'development',
      hasAlloraConnection: availableTopics.length > 0,
    },
  };

  console.error('[Context] Context loaded successfully:', {
    defaultLanguage: context.defaultLanguage,
    availableTopics: context.availableTopics.length,
    mcpServersConnected: context.metadata.mcpServersConnected,
  });

  return context;
}
