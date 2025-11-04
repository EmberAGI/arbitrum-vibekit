import { resolve } from 'node:path';

import {
  createPublicClient,
  http,
  parseAbiItem,
  type Address,
  type Chain,
  type PublicClient,
} from 'viem';

import { loadAgentBase } from '../../config/loaders/agent-loader.js';
import { resolveConfigDirectory } from '../../config/runtime/config-dir.js';
import type { ERC8004RegistrationEntry } from '../../config/schemas/agent.schema.js';
import { ensureErc8004Config, updateAgentFrontmatter } from '../utils/frontmatter.js';
import { CONTRACT_ADDRESSES, isSupportedChain } from '../utils/registration.js';

/**
 * CLI command options for recovering agent ID.
 */
export type RecoverIdCommandOptions = {
  configDir?: string;
  chain?: string;
  txHash?: string;
};

/**
 * Get chain configuration for viem.
 */
function getChainConfig(chainId: number): Chain | undefined {
  const chainConfigs: Record<number, Chain> = {
    1: {
      id: 1,
      name: 'Ethereum Mainnet',
      network: 'mainnet',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: ['https://rpc.ankr.com/eth'] },
      },
    },
    11155111: {
      id: 11155111,
      name: 'Sepolia',
      network: 'sepolia',
      nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: ['https://rpc.sepolia.org'] },
      },
    },
    42161: {
      id: 42161,
      name: 'Arbitrum One',
      network: 'arbitrum',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: ['https://arb1.arbitrum.io/rpc'] },
      },
    },
    421614: {
      id: 421614,
      name: 'Arbitrum Sepolia',
      network: 'arbitrum-sepolia',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] },
      },
    },
  };

  return chainConfigs[chainId];
}

/**
 * Query historical logs for agent registration.
 */
async function queryAgentId(
  client: PublicClient,
  contractAddress: Address,
  owner: Address,
  txHash?: string,
): Promise<{ agentId: bigint; txHash?: string } | null> {
  try {
    // Parse the Registered event ABI
    const registeredEvent = parseAbiItem(
      'event Registered(uint256 indexed agentId, string tokenURI, address indexed owner)',
    );

    // If we have a txHash, first try to get the specific transaction receipt
    if (txHash) {
      console.log('Checking transaction receipt...');
      try {
        const receipt = await client.getTransactionReceipt({
          hash: txHash as `0x${string}`,
        });

        // Parse logs from this specific transaction
        const { parseEventLogs } = await import('viem');
        const parsedLogs = parseEventLogs({
          abi: [registeredEvent],
          logs: receipt.logs,
        });

        const registeredLog = parsedLogs.find((log) => log.eventName === 'Registered');
        if (registeredLog && registeredLog.args.agentId !== undefined) {
          return { agentId: BigInt(registeredLog.args.agentId), txHash };
        }
      } catch (error) {
        console.log('Could not retrieve transaction receipt:', error);
      }
    }

    // Query all historical logs for this owner
    console.log('Querying historical logs...');
    const logs = await client.getLogs({
      address: contractAddress,
      event: registeredEvent,
      args: {
        owner,
      },
      fromBlock: BigInt(0),
      toBlock: 'latest',
    });

    if (logs && logs.length > 0) {
      // Use the most recent registration
      const mostRecentLog = logs[logs.length - 1];
      if (!mostRecentLog || mostRecentLog.args.agentId === undefined) {
        return null;
      }
      const agentIdBigInt = BigInt(mostRecentLog.args.agentId);
      const foundTxHash = mostRecentLog.transactionHash;

      console.log(`Found ${logs.length} agent(s) for owner ${owner}`);
      if (logs.length > 1) {
        console.log('Using most recent registration');
      }

      return { agentId: agentIdBigInt, txHash: foundTxHash || undefined };
    }

    return null;
  } catch (error) {
    console.error('Error querying agent ID:', error);
    return null;
  }
}

/**
 * CLI command to recover agent ID.
 * Attempts to retrieve agent ID from blockchain for pending registrations.
 * @param options Command line options
 */
export async function recoverIdCommand(options: RecoverIdCommandOptions): Promise<void> {
  const { configDir } = resolveConfigDirectory(options.configDir);
  const agentPath = resolve(configDir, 'agent.md');
  const agentBase = loadAgentBase(agentPath);

  const fm = agentBase.frontmatter;
  const registrations = fm.erc8004?.registrations || {};

  // Find chains with pending agent IDs
  const pendingChains = Object.entries(registrations).filter(
    ([, reg]) => reg.pendingAgentId === true,
  );

  if (pendingChains.length === 0) {
    console.log('✅ No pending agent IDs to recover');
    return;
  }

  console.log(`Found ${pendingChains.length} chain(s) with pending agent IDs\n`);

  // If specific chain requested, filter to that chain
  let chainsToRecover = pendingChains;
  if (options.chain) {
    chainsToRecover = pendingChains.filter(([chainKey]) => chainKey === options.chain);
    if (chainsToRecover.length === 0) {
      console.log(`❌ No pending agent ID for chain ${options.chain}`);
      return;
    }
  }

  // Process each chain
  for (const [chainKey, registration] of chainsToRecover) {
    const chainId = parseInt(chainKey);
    if (!isSupportedChain(chainId)) {
      console.log(`⚠️  Skipping unsupported chain ${chainKey}`);
      continue;
    }

    console.log(`\n🔍 Recovering agent ID for chain ${chainKey}...`);

    // Get chain configuration
    const chainConfig = getChainConfig(chainId);
    if (!chainConfig) {
      console.log(`❌ No chain configuration for chain ID ${chainId}`);
      continue;
    }

    // Create public client
    const client = createPublicClient({
      chain: chainConfig,
      transport: http(),
    }) as PublicClient;

    // Get contract address
    const contractAddress = CONTRACT_ADDRESSES[chainId].identity as Address;

    // Try to determine the owner address
    // We'll need to get this from the transaction if available
    let ownerAddress: Address | null = null;

    if (registration.txHash) {
      try {
        const tx = await client.getTransaction({
          hash: registration.txHash as `0x${string}`,
        });
        ownerAddress = tx.from;
        console.log(`Using owner address from transaction: ${ownerAddress}`);
      } catch (error) {
        console.log('Could not retrieve transaction:', error);
      }
    }

    if (!ownerAddress) {
      console.log('❌ Could not determine owner address. Please check the transaction manually.');
      continue;
    }

    // Query for agent ID
    const result = await queryAgentId(
      client,
      contractAddress,
      ownerAddress,
      registration.txHash || options.txHash,
    );

    if (result) {
      const agentId = result.agentId.toString();
      console.log(`✅ Found agent ID: ${agentId}`);

      // Update configuration
      try {
        updateAgentFrontmatter(agentPath, (draft) => {
          const erc8004Config = ensureErc8004Config(draft);
          const existing: ERC8004RegistrationEntry = erc8004Config.registrations[chainKey] ?? {};
          const parsedAgentId = Number(agentId);

          if (Number.isSafeInteger(parsedAgentId) && parsedAgentId >= 0) {
            existing.agentId = parsedAgentId;
          } else {
            console.log(
              `⚠️  Agent ID ${agentId} exceeds JavaScript safe integer range. Storing as string.`,
            );
            existing.agentIdString = agentId;
          }

          // Update txHash if we found a different one
          if (result.txHash && result.txHash !== existing.txHash) {
            existing.txHash = result.txHash;
          }

          // Remove pending flag
          delete existing.pendingAgentId;

          erc8004Config.registrations[chainKey] = existing;
          return draft;
        });

        console.log(`📝 Updated agent.md with recovered agent ID`);
      } catch (err) {
        console.log(
          `❌ Failed to update configuration: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      console.log(`❌ Could not recover agent ID for chain ${chainKey}`);
      console.log(`   Transaction hash: ${registration.txHash || 'Not available'}`);
      console.log('   Please check the transaction on a block explorer');
    }
  }

  console.log('\n✨ Recovery process complete');
}
