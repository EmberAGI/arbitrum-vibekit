/**
 * Context types for Ember Agent
 * Shared context for DeFi operations across all skills
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { LanguageModel } from 'ai';
import type { Address } from 'viem';

/**
 * Token information for DeFi operations
 */
export interface TokenInfo {
  chainId: number;
  address: string;
  decimals: number;
  symbol?: string;
  name?: string;
}

/**
 * Main context shared across all Ember Agent skills
 */
export interface EmberContext {
  // Shared across all skills
  mcpClient: Client | null;
  tokenMap: Record<string, TokenInfo[]>;
  userAddress?: Address;

  // AI provider for LLM operations
  llmModel: LanguageModel;

  // Environment configuration
  config: {
    arbitrumRpcUrl: string;
    emberMcpServerUrl: string;
    defaultUserAddress?: Address;
    enableCaching: boolean;
  };

  // Context metadata
  metadata: {
    loadedAt: Date;
    mcpConnected: boolean;
    tokenCount: number;
    availableSkills: string[];
    environment: string;
  };
}

/**
 * Dependencies provided by the framework when creating context
 */
export interface ContextDependencies {
  mcpClients: Record<string, Client>;
}

/**
 * Protocol-specific documentation content
 */
export interface ProtocolDocs {
  protocol: string;
  content: string;
  lastUpdated: Date;
}

/**
 * Cached protocol documentation
 */
export interface DocsCache {
  camelot?: ProtocolDocs;
  aave?: ProtocolDocs;
  pendle?: ProtocolDocs;
}
