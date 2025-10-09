import { z } from 'zod';
import { createArtifact, createSuccessTask, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';

const tokenSchema = z
  .string()
  .transform((val) => val.toLowerCase())
  .pipe(z.enum(['eth', 'usdc', 'eurc', 'cbbtc']))
  .describe('Token to request from faucet (eth, usdc, eurc, or cbbtc). Case-insensitive.');

const networkSchema = z
  .enum(['base-sepolia', 'ethereum-sepolia', 'ethereum-holesky'])
  .describe('EVM test network to request faucet from');

export const RequestFaucetParams = z.object({
  address: z
    .string()
    .min(1, 'Address is required')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
    .describe('Ethereum address to receive faucet funds'),
  token: tokenSchema.default('eth'),
  network: networkSchema.default('base-sepolia'),
});

export const requestFaucetTool: VibkitToolDefinition<typeof RequestFaucetParams, Task> = {
  name: 'request-faucet',
  description:
    'Request testnet faucet funds from Coinbase CDP for Base Sepolia or other supported EVM test networks. ' +
    'Returns transaction hash and explorer link. Rate limits apply: ETH (0.1/24h), USDC/EURC (10/24h), cbBTC (0.001/24h).',
  parameters: RequestFaucetParams,
  execute: async (args: z.infer<typeof RequestFaucetParams>) => {
    // Check for required environment variables
    const cdpApiKeyId = process.env.CDP_API_KEY_ID;
    const cdpApiKeySecret = process.env.CDP_API_KEY_SECRET;

    if (!cdpApiKeyId || !cdpApiKeySecret) {
      const errorPayload = {
        error: 'MissingCredentials',
        code: -32005,
        message: 'CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables are required for faucet requests',
        address: args.address,
        network: args.network,
        token: args.token,
      };
      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(errorPayload, null, 2) }],
        'MissingCredentials',
        'CDP API credentials not configured',
      );
      return createSuccessTask(
        'faucet-request',
        [artifact],
        'Failed: CDP API credentials not configured. Set CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables.',
      );
    }

    try {
      // Use CDP SDK for faucet requests
      const { CdpClient } = await import('@coinbase/cdp-sdk');
      
      // Initialize CDP client
      const cdp = new CdpClient();

      // Request faucet funds for external address
      const faucetResponse = await cdp.evm.requestFaucet({
        address: args.address,
        network: args.network,
        token: args.token,
      });

      // Success response
      const successPayload = {
        success: true,
        transactionHash: faucetResponse.transactionHash,
        address: args.address,
        network: args.network,
        token: args.token,
        explorerLink: getExplorerLink(args.network, faucetResponse.transactionHash),
        note: 'Faucet funds requested successfully. Transaction may take a few moments to confirm on-chain.',
      };

      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(successPayload, null, 2) }],
        'FaucetRequestSuccess',
        'Faucet funds requested successfully',
      );

      return createSuccessTask(
        'faucet-request',
        [artifact],
        `Successfully requested ${args.token.toUpperCase()} faucet funds on ${args.network} for ${args.address}. TX: ${faucetResponse.transactionHash}`,
      );
    } catch (error) {
      const errorPayload = {
        error: 'FaucetRequestFailed',
        code: -32007,
        message: `Failed to request faucet: ${(error as Error).message}`,
        address: args.address,
        network: args.network,
        token: args.token,
      };
      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(errorPayload, null, 2) }],
        'FaucetRequestFailed',
        'Failed to request faucet funds',
      );
      return createSuccessTask(
        'faucet-request',
        [artifact],
        `Faucet request failed: ${(error as Error).message}`,
      );
    }
  },
};

/**
 * Helper function to generate block explorer link based on network
 */
function getExplorerLink(network: string, txHash: string): string {
  const explorers: Record<string, string> = {
    'base-sepolia': 'https://sepolia.basescan.org/tx',
    'ethereum-sepolia': 'https://sepolia.etherscan.io/tx',
    'ethereum-holesky': 'https://holesky.etherscan.io/tx',
  };

  const baseUrl = explorers[network] || 'https://sepolia.basescan.org/tx';
  return `${baseUrl}/${txHash}`;
}

