import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  GetTokensResponseSchema,
  type GetTokensResponse,
  type Token,
} from 'ember-api';
import * as fs from 'fs/promises';
import * as path from 'path';

const CACHE_FILE_PATH = '.cache/liquidation-prevention-tokens.json';

export interface TokenInfo {
  chainId: string;
  address: string;
  decimals: number;
}

export async function loadTokenMapFromMcp(
  mcpClient: Client
): Promise<Record<string, Array<TokenInfo>>> {
  const useCache = process.env['AGENT_CACHE_TOKENS'] === 'true';
  let tokensResponse: GetTokensResponse | undefined;

  // Try to load from cache first
  if (useCache) {
    try {
      await fs.access(CACHE_FILE_PATH);
      console.log('Loading tokens from cache...');
      const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
      const parsedJson = JSON.parse(cachedData);
      const validationResult = GetTokensResponseSchema.safeParse(parsedJson);
      if (validationResult.success) {
        tokensResponse = validationResult.data;
        console.log('Cached tokens loaded and validated successfully.');
      } else {
        console.error('Cached tokens validation failed:', validationResult.error);
        console.log('Proceeding to fetch fresh tokens...');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        console.log('Cache not found, fetching fresh tokens...');
      } else {
        console.error('Error reading or parsing cache file:', error);
      }
    }
  }

  // Fetch from MCP if not cached
  if (!tokensResponse) {
    console.log('Fetching tokens via MCP tool call...');
    try {
      const mcpTimeoutMs = parseInt(process.env['MCP_TOOL_TIMEOUT_MS'] || '30000', 10);
      console.log(`Using MCP tool timeout: ${mcpTimeoutMs}ms`);

      const tokensResult = await mcpClient.callTool(
        {
          name: 'getTokens',
          arguments: { chainIds: ['42161'] }, // Arbitrum chain ID
        },
        undefined,
        { timeout: mcpTimeoutMs }
      );

      console.log('Raw tokensResult received from MCP tool call.');

      // Check if the response has structuredContent directly (new format)
      if (
        tokensResult &&
        typeof tokensResult === 'object' &&
        'structuredContent' in tokensResult
      ) {
        const parsedData = (tokensResult as { structuredContent: unknown }).structuredContent;

        const tokensValidationResult = GetTokensResponseSchema.safeParse(parsedData);

        if (!tokensValidationResult.success) {
          console.error(
            'Parsed MCP getTokens response validation failed:',
            tokensValidationResult.error
          );
          throw new Error(
            `Failed to validate the parsed tokens data from MCP server tool. Complete response: ${JSON.stringify(tokensResult, null, 2)}`
          );
        }

        tokensResponse = tokensValidationResult.data;
        console.log(`Validated ${tokensResponse.tokens.length} tokens.`);

        // Debug: Log first few tokens to understand the actual structure
        console.log('🔍 DEBUG - First 2 tokens structure:');
        tokensResponse.tokens.slice(0, 2).forEach((token: Token, index: number) => {
          console.log(`Token ${index}:`, JSON.stringify(token, null, 2));
        });

        console.log('✅ Tokens Loaded:');
        console.log('Total tokens:', tokensResponse.tokens.length);
        tokensResponse.tokens.slice(0, 10).forEach((token: Token) => {
          console.log(`📊 ${token.symbol} (${token.name}) - ${token.tokenUid.address} on chain ${token.tokenUid.chainId}: decimals=${token.decimals}, isNative=${token.isNative}, isVetted=${token.isVetted}`);
        });
        if (tokensResponse.tokens.length > 10) {
          console.log(`... and ${tokensResponse.tokens.length - 10} more tokens`);
        }
      } else {
        // If no structuredContent, throw error
        throw new Error(
          `MCP getTokens tool returned an unexpected structure. Expected { structuredContent: { tokens: [...] } }. Complete response: ${JSON.stringify(tokensResult, null, 2)}`
        );
      }

      // Cache the response
      if (useCache) {
        try {
          await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
          await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(tokensResponse, null, 2));
          console.log('Cached validated tokens response to', CACHE_FILE_PATH);
        } catch (err) {
          console.error('Failed to cache tokens response:', err);
        }
      }
    } catch (error) {
      console.error('Error calling getTokens tool or processing response:', error);
      // Return empty token map on error instead of throwing
      console.warn('Token map will be empty due to token fetch error.');
      return {};
    }
  }

  // Build the token map from tokens
  const tokenMap: Record<string, Array<TokenInfo>> = {};
  let loadedTokenCount = 0;

  if (tokensResponse?.tokens) {
    console.log(`Processing ${tokensResponse.tokens.length} token entries...`);

    tokensResponse.tokens.forEach((token: Token) => {
      if (token.symbol && token.tokenUid?.chainId && token.tokenUid?.address) {
        const symbol = token.symbol.toUpperCase(); // Normalize to uppercase
        const tokenInfo: TokenInfo = {
          chainId: token.tokenUid.chainId,
          address: token.tokenUid.address,
          decimals: token.decimals,
        };

        if (!tokenMap[symbol]) {
          tokenMap[symbol] = [tokenInfo];
          loadedTokenCount++;
        } else {
          // Check if this token/chain combo already exists
          const exists = tokenMap[symbol].some(
            t =>
              t.chainId === tokenInfo.chainId &&
              t.address.toLowerCase() === tokenInfo.address.toLowerCase()
          );
          if (!exists) {
            tokenMap[symbol].push(tokenInfo);
          }
        }
      }
    });

    console.log(
      `Finished processing tokens. Found ${loadedTokenCount} unique token symbols.`
    );
  }

  if (Object.keys(tokenMap).length === 0) {
    console.warn('Warning: Token map is empty after processing tokens.');
  } else {
    console.log('Available tokens:', Object.keys(tokenMap).join(', '));
  }

  return tokenMap;
}
