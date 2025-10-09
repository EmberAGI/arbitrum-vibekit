import { z } from 'zod';
import { createArtifact, createSuccessTask, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { findPregenWallet } from '../store/pregenWalletStore.js';
import { getParaServerClient } from '../utils/paraServer.js';

import { createParaAccount, createParaViemClient } from '@getpara/viem-v2-integration';
import { http, parseEther } from 'viem';
import { arbitrumSepolia, baseSepolia, holesky, sepolia } from 'viem/chains';

const networkSchema = z
  .enum(['base-sepolia', 'ethereum-sepolia', 'ethereum-holesky', 'arbitrum-sepolia'])
  .describe('EVM test network for the transfer');

export const TransferEthParams = z.object({
  email: z.string().email('Valid email is required').describe('Email address for pregenerated wallet'),
  recipientAddress: z
    .string()
    .min(1, 'Recipient address is required')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
    .describe('Recipient Ethereum address'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .describe('Amount to transfer in ETH (e.g., "0.001" for 0.001 ETH, "0.00001" for 0.00001 ETH)'),
  network: networkSchema.default('base-sepolia'),
});

// Chain IDs mapping
const CHAIN_IDS: Record<string, string> = {
  'base-sepolia': '84532',
  'ethereum-sepolia': '11155111',
  'ethereum-holesky': '17000',
  'arbitrum-sepolia': '421614',
};

// Default RPC URLs per supported network (used if args.rpcUrl is not provided)
const DEFAULT_RPC_URLS: Record<keyof typeof CHAIN_IDS, string> = {
  'base-sepolia': 'https://sepolia.base.org',
  'ethereum-sepolia': 'https://ethereum-sepolia-rpc.publicnode.com',
  'ethereum-holesky': 'https://ethereum-holesky-rpc.publicnode.com',
  'arbitrum-sepolia': 'https://sepolia-rollup.arbitrum.io/rpc',
};

export const transferEthTool: VibkitToolDefinition<typeof TransferEthParams, Task> = {
  name: 'transfer-eth',
  description:
    'Transfer ETH from a pregenerated wallet to another address on Base Sepolia or other supported EVM test networks. ' +
    'Looks up the wallet by email, loads the userShare, and executes the transfer. ' +
    'Amount should be specified in ETH (e.g., "0.001" for 0.001 ETH).',
  parameters: TransferEthParams,
  execute: async (args: z.infer<typeof TransferEthParams>) => {
    // Convert ETH amount to wei
    let amountInWei: string;
    try {
      const ethAmount = parseFloat(args.amount);
      if (isNaN(ethAmount) || ethAmount <= 0) {
        throw new Error('Invalid amount: must be a positive number');
      }
      // Convert to wei (multiply by 10^18)
      const weiValue = BigInt(Math.floor(ethAmount * 1e18));
      amountInWei = weiValue.toString();
    } catch (error) {
      const errorPayload = {
        error: 'InvalidAmount',
        code: -32011,
        message: `Invalid amount format: ${(error as Error).message}. Amount should be in ETH (e.g., "0.001")`,
        amount: args.amount,
      };
      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(errorPayload, null, 2) }],
        'InvalidAmount',
        'Invalid amount format',
      );
      return createSuccessTask(
        'transfer-eth',
        [artifact],
        `Invalid amount format: ${args.amount}`,
      );
    }

    // Find the wallet entry in memory
    const entry = findPregenWallet(args.email);
    if (!entry) {
      const errorPayload = {
        error: 'PregenWalletNotFound',
        code: -32001,
        message: `No pregenerated wallet found for email:${args.email}`,
        email: args.email,
      };
      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(errorPayload, null, 2) }],
        'PregenWalletNotFound',
        'No pregenerated wallet found',
      );
      return createSuccessTask(
        'transfer-eth',
        [artifact],
        `No pregenerated wallet found for email:${args.email}`,
      );
    }

    // Check if we have a valid userShare
    if (!entry.userShareJson || entry.userShareJson === 'Unavailable - wallet already existed before caching') {
      const errorPayload = {
        error: 'UserShareUnavailable',
        code: -32008,
        message: `User share is not available for this pregenerated wallet. Cannot perform transfer.`,
        email: args.email,
        walletId: entry.walletId,
      };
      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(errorPayload, null, 2) }],
        'UserShareUnavailable',
        'User share not available for transfer',
      );
      return createSuccessTask(
        'transfer-eth',
        [artifact],
        `User share unavailable for email:${args.email}`,
      );
    }

    // Parse the user share
    let userShare: unknown;
    try {
      userShare = JSON.parse(entry.userShareJson);
    } catch (error) {
      const errorPayload = {
        error: 'InvalidUserShare',
        code: -32009,
        message: `Failed to parse user share: ${(error as Error).message}`,
        email: args.email,
      };
      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(errorPayload, null, 2) }],
        'InvalidUserShare',
        'Failed to parse user share',
      );
      return createSuccessTask(
        'transfer-eth',
        [artifact],
        `Failed to parse user share for email:${args.email}`,
      );
    }

    try {
      const para = await getParaServerClient();

      // Load the user share into the Para client
      await para.setUserShare(userShare);

      // Get the chain ID for the network
      const chainId = CHAIN_IDS[args.network];
      if (!chainId) {
        throw new Error(`Unsupported network: ${args.network}`);
      }

      // Build and send the transaction using Viem + Para
      const viemChain = (
        {
          'base-sepolia': baseSepolia,
          'ethereum-sepolia': sepolia,
          'ethereum-holesky': holesky,
          'arbitrum-sepolia': arbitrumSepolia,
        } as const
      )[args.network];

      if (!viemChain) {
        throw new Error(`Unsupported network: ${args.network}`);
      }

      // Cast to any to satisfy types; viem integration supports Para server instances
      const viemParaAccount = createParaAccount(para as any);
      const rpcUrl = DEFAULT_RPC_URLS[args.network as keyof typeof DEFAULT_RPC_URLS];

      const viemClient = createParaViemClient(para as any, {
        account: viemParaAccount,
        chain: viemChain,
        transport: http(rpcUrl),
      });

      const request = await viemClient.prepareTransactionRequest({
        account: viemParaAccount,
        to: args.recipientAddress as `0x${string}`,
        value: parseEther(args.amount),
        // chain is inferred from viemClient
      });

      const signedTxRlp = await viemClient.signTransaction(request);

      const hash = await viemClient.sendRawTransaction({
        serializedTransaction: signedTxRlp,
      });

      // Success response
      const successPayload = {
        success: true,
        transactionHash: hash,
        from: viemParaAccount.address,
        to: args.recipientAddress,
        amountEth: args.amount,
        amountWei: amountInWei,
        chainId: chainId,
        network: args.network,
        explorerLink: getExplorerLink(args.network, hash),
        note: 'ETH transfer completed successfully. Transaction may take a few moments to confirm on-chain.',
      };

      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(successPayload, null, 2) }],
        'TransferSuccess',
        'ETH transferred successfully',
      );

      return createSuccessTask(
        'transfer-eth',
        [artifact],
        `Successfully transferred ${args.amount} ETH from ${entry.address || entry.walletId} to ${args.recipientAddress}. TX: ${hash}`,
      );
    } catch (error) {
      const errorPayload = {
        error: 'TransferFailed',
        code: -32010,
        message: `Failed to transfer ETH: ${(error as Error).message}`,
        email: args.email,
        recipientAddress: args.recipientAddress,
        amount: args.amount,
        network: args.network,
      };
      const artifact = createArtifact(
        [{ kind: 'text', text: JSON.stringify(errorPayload, null, 2) }],
        'TransferFailed',
        'Failed to transfer ETH',
      );
      return createSuccessTask(
        'transfer-eth',
        [artifact],
        `Transfer failed: ${(error as Error).message}`,
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
    'arbitrum-sepolia': 'https://sepolia.arbiscan.io/tx',
  };

  const baseUrl = explorers[network] || 'https://sepolia.basescan.org/tx';
  return `${baseUrl}/${txHash}`;
}

