import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SwapTokensResponse } from '@emberai/sdk-typescript';
import { SwapTokensArgs } from './agent.js';

export type TokenInfo = {
  chainId: string;
  address: string;
};

// Define swap schema to match the MCP tool server
export const SwapTokensParamsSchema = z.object({
  fromTokenAddress: z.string().describe("The contract address of the token to swap from."),
  fromTokenChainId: z.string().describe("The chain ID where the fromToken contract resides."),
  toTokenAddress: z.string().describe("The contract address of the token to swap to."),
  toTokenChainId: z.string().describe("The chain ID where the toToken contract resides."),
  amount: z.string().describe("The amount of the fromToken to swap (atomic, non-human readable format)."),
  userAddress: z.string().describe("The wallet address initiating the swap."),
});

export type SwapTokensParams = z.infer<typeof SwapTokensParamsSchema>;

export const TransactionPlanSchema = z
  .object({
    to: z.string(),
    data: z.string(),
    value: z.string().optional(),
    chainId: z.string(),
  })
  .passthrough();

export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, TokenInfo[]>;
  userAddress: string;
  executeAction: (actionName: string, transactions: TransactionPlan[]) => Promise<string>;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

function findTokensCaseInsensitive(
  tokenMap: Record<string, TokenInfo[]>,
  tokenName: string
): TokenInfo[] {
  const lowerCaseTokenName = tokenName.toLowerCase();
  for (const key in tokenMap) {
    if (key.toLowerCase() === lowerCaseTokenName) {
      return tokenMap[key];
    }
  }
  return [];
}

const chainMappings = [
  { id: '1', name: 'Ethereum', aliases: ['mainnet'] },
  { id: '42161', name: 'Arbitrum One', aliases: [] },
  { id: '10', name: 'Optimism', aliases: [] },
  { id: '137', name: 'Polygon', aliases: ['matic'] },
  { id: '8453', name: 'Base', aliases: [] },
];

function mapChainNameToId(chainName: string): string | undefined {
  const normalized = chainName.toLowerCase();
  const found = chainMappings.find(
    mapping => mapping.name.toLowerCase() === normalized || mapping.aliases.includes(normalized)
  );
  return found?.id;
}

function mapChainIdToName(chainId: string): string {
  const found = chainMappings.find(mapping => mapping.id === chainId);
  return found?.name || chainId;
}

function findTokenDetail(
  tokenName: string,
  optionalChainName: string | undefined,
  tokenMap: Record<string, TokenInfo[]>,
): TokenInfo | string {
  const tokens = findTokensCaseInsensitive(tokenMap, tokenName);
  if (tokens.length === 0) {
    throw new Error(`Token ${tokenName} not supported.`);
  }

  let tokenDetail: TokenInfo | undefined;

  if (optionalChainName) {
    const chainId = mapChainNameToId(optionalChainName);
    if (!chainId) {
      throw new Error(`Chain name ${optionalChainName} is not recognized.`);
    }
    tokenDetail = tokens.find(token => token.chainId === chainId);
    if (!tokenDetail) {
      throw new Error(
        `Token ${tokenName} not supported on chain ${optionalChainName}. Available chains: ${tokens.map(t => mapChainIdToName(t.chainId)).join(', ')}`
      );
    }
  } else {
    if (tokens.length > 1) {
      const chainList = tokens
        .map((t, idx) => `${idx + 1}. ${mapChainIdToName(t.chainId)}`)
        .join('\n');
      return `Multiple chains supported for ${tokenName}:\n${chainList}\nPlease specify the 'chain' parameter.`;
    }
    tokenDetail = tokens[0];
  }

  if (!tokenDetail) {
    throw new Error(
      `Could not resolve token details for ${tokenName} ${optionalChainName ? 'on chain ' + optionalChainName : ''}.`
    );
  }

  return tokenDetail;
}

export function parseMcpToolResponse<T>(
  rawResponse: unknown,
  context: HandlerContext,
  toolName: string
): T {
  let dataToValidate: unknown;

  if (
    rawResponse &&
    typeof rawResponse === 'object' &&
    'content' in rawResponse &&
    Array.isArray((rawResponse as any).content) &&
    (rawResponse as any).content.length > 0 &&
    (rawResponse as any).content[0]?.type === 'text' &&
    typeof (rawResponse as any).content[0]?.text === 'string'
  ) {
    context.log(`Raw ${toolName} result appears nested, parsing inner text...`);
    try {
      const parsedData = JSON.parse((rawResponse as any).content[0].text);
      context.log('Parsed inner text content for validation:', parsedData);
      dataToValidate = parsedData;
    } catch (e) {
      context.log(`Error parsing inner text content from ${toolName} result:`, e);
      throw new Error(
        `Failed to parse nested JSON response from ${toolName}: ${(e as Error).message}`
      );
    }
  } else {
    context.log(
      `Raw ${toolName} result does not have expected nested structure, validating as is.`
    );
    dataToValidate = rawResponse;
  }

  return dataToValidate as T;
}

// Add a specialized version for SwapTokensResponse that validates the structure
export function parseSwapTokensResponse(
  rawResponse: unknown,
  context: HandlerContext
): SwapTokensResponse {
  const data = parseMcpToolResponse<unknown>(rawResponse, context, 'swapTokens');
  
  // Validate that the response has the expected structure
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response format: expected an object');
  }
  
  const response = data as any;
  
  // Check for required fields
  if (!response.transactions || !Array.isArray(response.transactions)) {
    throw new Error('Invalid response format: missing or invalid transactions array');
  }
  
  if (!response.chainId || typeof response.chainId !== 'string') {
    throw new Error('Invalid response format: missing or invalid chainId');
  }
  
  // Validate each transaction in the array
  response.transactions.forEach((tx: any, index: number) => {
    if (!tx || typeof tx !== 'object') {
      throw new Error(`Invalid transaction at index ${index}: not an object`);
    }
    
    if (!tx.to || typeof tx.to !== 'string') {
      throw new Error(`Invalid transaction at index ${index}: missing or invalid 'to' field`);
    }
    
    if (!tx.data || typeof tx.data !== 'string') {
      throw new Error(`Invalid transaction at index ${index}: missing or invalid 'data' field`);
    }
  });
  
  return response as SwapTokensResponse;
}

async function validateAndExecuteAction(
  actionName: string,
  transactions: TransactionPlan[],
  context: HandlerContext
): Promise<string> {
  return await context.executeAction(actionName, transactions);
}

export async function handleSwapTokens(
  params: SwapTokensArgs,
  context: HandlerContext
): Promise<string> {
  const { fromTokenName, toTokenName, humanReadableAmount, chainName } = params;
  
  // Get from token details and handle possible string response
  const fromTokenResult = findTokenDetail(fromTokenName, chainName, context.tokenMap);
  if (typeof fromTokenResult === 'string') {
    return fromTokenResult;
  }
  
  // Determine effective chain for to token lookup
  const effectiveChain = chainName || mapChainIdToName(fromTokenResult.chainId);
  
  // Get to token details and handle possible string response
  const toTokenResult = findTokenDetail(toTokenName, effectiveChain, context.tokenMap);
  if (typeof toTokenResult === 'string') {
    return toTokenResult;
  }
  
  // Assert that tokens are on the same chain
  if (fromTokenResult.chainId !== toTokenResult.chainId) {
    throw new Error(`Cannot swap tokens across different chains. From chain: ${fromTokenResult.chainId}, To chain: ${toTokenResult.chainId}`);
  }
  
  // Create properly typed swap params directly
  const swapParams: SwapTokensParams = {
    fromTokenAddress: fromTokenResult.address,
    fromTokenChainId: fromTokenResult.chainId,
    toTokenAddress: toTokenResult.address,
    toTokenChainId: toTokenResult.chainId,
    amount: humanReadableAmount,
    userAddress: context.userAddress,
  };
  
  const swapTokensResponse = await context.mcpClient.callTool({
    name: 'swapTokens',
    arguments: swapParams,
  });

  // Use the specialized parsing function for enhanced validation
  const response = parseSwapTokensResponse(swapTokensResponse, context);
  
  // Execute the swap and return the result
  const swapResult = await validateAndExecuteAction('swapTokens', response.transactions.map(t => ({...t, chainId: response.chainId})), context);
  return `Successfully executed swap of ${humanReadableAmount} ${fromTokenName} to ${toTokenName}. ${swapResult}`;
}