import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';

const getWalletBalancesParametersSchema = z.object({
  walletAddress: z.string().describe('Wallet address to check balances for'),
  tokens: z
    .array(z.string())
    .optional()
    .describe('Specific tokens to check (symbols or addresses)'),
});

type GetWalletBalancesParams = z.infer<typeof getWalletBalancesParametersSchema>;

interface TokenBalance {
  symbol: string;
  address: string;
  balance: string;
  balanceFormatted: string;
  decimals: number;
  usdValue: number;
}

/**
 * Get wallet token balances
 */
export const getWalletBalancesTool: VibkitToolDefinition<
  typeof getWalletBalancesParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'getWalletBalances',
  description: 'Get token balances for a wallet address',
  parameters: getWalletBalancesParametersSchema,

  execute: async (params: GetWalletBalancesParams, context: { custom: RebalancerContext }) => {
    try {
      console.log(`🔍 Getting wallet balances for: ${params.walletAddress}`);

      // Setup viem clients
      const { createPublicClient, http } = await import('viem');
      const { arbitrum } = await import('viem/chains');

      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: http(context.custom.config.arbitrumRpcUrl),
      });

      const erc20Abi = [
        {
          type: 'function',
          name: 'decimals',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ type: 'uint8' }],
        },
        {
          type: 'function',
          name: 'balanceOf',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ type: 'uint256' }],
        },
        {
          type: 'function',
          name: 'symbol',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ type: 'string' }],
        },
      ] as const;

      const balances: TokenBalance[] = [];

      // If specific tokens are requested, check those
      if (params.tokens && params.tokens.length > 0) {
        for (const token of params.tokens) {
          try {
            // Try to determine if it's an address or symbol
            let tokenAddress: string;

            if (token.startsWith('0x') && token.length === 42) {
              // It's an address
              tokenAddress = token;
            } else {
              // It's a symbol - we need to map it to an address
              // For now, we'll use common token addresses
              const tokenMap: Record<string, string> = {
                ARB: '0x912ce59144191c1204e64559fe8253a0e49e6548',
                USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
                USDT: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
                WETH: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
                WBTC: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
              };

              const mappedAddress = tokenMap[token.toUpperCase()];
              if (!mappedAddress) {
                console.warn(`⚠️  Unknown token symbol: ${token}`);
                continue;
              }
              tokenAddress = mappedAddress;
            }

            const [balance, decimals, symbol] = await Promise.all([
              publicClient.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [params.walletAddress as `0x${string}`],
              }),
              publicClient.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'decimals',
              }),
              publicClient
                .readContract({
                  address: tokenAddress as `0x${string}`,
                  abi: erc20Abi,
                  functionName: 'symbol',
                })
                .catch(() => token), // Fallback to input if symbol() fails
            ]);

            const balanceFormatted = (Number(balance) / Math.pow(10, decimals)).toFixed(6);

            balances.push({
              symbol: symbol || token,
              address: tokenAddress,
              balance: balance.toString(),
              balanceFormatted,
              decimals,
              usdValue: 0, // Would need price data to calculate USD value
            });

            console.log(`   ${symbol || token}: ${balanceFormatted}`);
          } catch (tokenError) {
            console.warn(`⚠️  Error getting balance for ${token}:`, tokenError);
            continue;
          }
        }
      }

      return createSuccessTask(
        'getWalletBalances',
        [
          {
            artifactId: 'walletBalances-' + Date.now(),
            parts: [
              {
                kind: 'text',
                text: JSON.stringify({
                  walletAddress: params.walletAddress,
                  balances,
                  timestamp: new Date().toISOString(),
                }),
              },
            ],
          },
        ],
        'Wallet balances retrieved successfully'
      );
    } catch (error) {
      console.error('❌ Error getting wallet balances:', error);
      return createErrorTask(
        'getWalletBalances',
        error instanceof Error ? error : new Error(`Failed to get wallet balances: ${error}`)
      );
    }
  },
};
