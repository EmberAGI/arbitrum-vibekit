import { z } from 'zod';
import { createArtifact, createSuccessTask, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { createPublicClient, http, formatEther, type PublicClient } from 'viem';
import { baseSepolia, sepolia, holesky, arbitrumSepolia } from 'viem/chains';

const networkSchema = z
  .enum(['base-sepolia', 'ethereum-sepolia', 'ethereum-holesky', 'arbitrum-sepolia'])
  .describe('EVM test network to check balance on');

export const CheckBalanceParams = z.object({
  address: z
    .string()
    .min(1, 'Address is required')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
    .describe('Ethereum address to check balance for'),
  network: networkSchema.default('base-sepolia'),
});

// Chain configuration mapping
const CHAIN_CONFIGS = {
  'base-sepolia': baseSepolia,
  'ethereum-sepolia': sepolia,
  'ethereum-holesky': holesky,
  'arbitrum-sepolia': arbitrumSepolia,
};

// RPC URLs for each network
const DEFAULT_RPC_URLS: Record<string, string> = {
  'base-sepolia': 'https://sepolia.base.org',
  'ethereum-sepolia': 'https://rpc.sepolia.org',
  'ethereum-holesky': 'https://ethereum-holesky-rpc.publicnode.com',
  'arbitrum-sepolia': 'https://sepolia-rollup.arbitrum.io/rpc',
};

export const checkBalanceTool: VibkitToolDefinition<typeof CheckBalanceParams, Task> = {
  name: 'check-balance',
  description:
    'Check ETH balance of any Ethereum address on Base Sepolia or other supported EVM test networks. ' +
    'Returns balance in both ETH and wei formats.',
  parameters: CheckBalanceParams,
  execute: async (args: z.infer<typeof CheckBalanceParams>) => {
    try {
      // Get the chain configuration
      const chain = CHAIN_CONFIGS[args.network];
      if (!chain) {
        throw new Error(`Unsupported network: ${args.network}`);
      }

      // Create public client with custom RPC URL if provided
      const rpcUrl = DEFAULT_RPC_URLS[args.network];
      const client: PublicClient = createPublicClient({
        chain,
        transport: http(rpcUrl),
      });

      // Get the balance
      const balanceWei = await client.getBalance({
        address: args.address as `0x${string}`,
      });

      // Convert to ETH
      const balanceEth = formatEther(balanceWei);

      // Get block number for context
      const blockNumber = await client.getBlockNumber();

      // Success response
      const successPayload = {
        success: true,
        address: args.address,
        network: args.network,
        chainId: chain.id,
        balanceEth: balanceEth,
        balanceWei: balanceWei.toString(),
        blockNumber: blockNumber.toString(),
        explorerLink: getExplorerLink(args.network, args.address),
        note: 'Balance retrieved successfully at block ' + blockNumber.toString(),
      };

      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(successPayload, null, 2) }],
        'BalanceCheck',
        'Ethereum address balance',
      );

      return createSuccessTask(
        'balance-check',
        [artifact],
        `Balance for ${args.address} on ${args.network}: ${balanceEth} ETH`,
      );
    } catch (error) {
      const errorPayload = {
        error: 'BalanceCheckFailed',
        code: -32012,
        message: `Failed to check balance: ${(error as Error).message}`,
        address: args.address,
        network: args.network,
      };
      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(errorPayload, null, 2) }],
        'BalanceCheckFailed',
        'Failed to check balance',
      );
      return createSuccessTask(
        'balance-check',
        [artifact],
        `Failed to check balance: ${(error as Error).message}`,
      );
    }
  },
};

/**
 * Helper function to generate block explorer link based on network
 */
function getExplorerLink(network: string, address: string): string {
  const explorers: Record<string, string> = {
    'base-sepolia': 'https://sepolia.basescan.org/address',
    'ethereum-sepolia': 'https://sepolia.etherscan.io/address',
    'ethereum-holesky': 'https://holesky.etherscan.io/address',
    'arbitrum-sepolia': 'https://sepolia.arbiscan.io/address',
  };

  const baseUrl = explorers[network] || 'https://sepolia.basescan.org/address';
  return `${baseUrl}/${address}`;
}

