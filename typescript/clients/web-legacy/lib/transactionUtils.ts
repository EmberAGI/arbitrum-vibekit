import {
  createPublicClient,
  http,
  parseUnits,
  type Hex,
  type Chain,
  BaseError,
  ExecutionRevertedError,
} from 'viem';
import * as allViemChains from 'viem/chains';

// === Type Definitions ===
export interface RawTransaction {
  to: Hex;
  data: Hex;
  value?: string | number | bigint;
  chainId?: string | number;
}

export type TxPlan = RawTransaction[];

// === Global Tuning Parameters ===
const GAS_LIMIT_BUFFER_PCT = 120n; // 120% → +20%
const LEGACY_GAS_PRICE_BUFFER_PCT = 120n; // 120% → +20%
const DEFAULT_PRIORITY_FEE_GWEI = '1.5'; // 1.5 gwei

/**
 * Finds a viem Chain object by its ID.
 * Note: Imports all chains, potentially increasing bundle size.
 */
export function getChainById(chainId: number): Chain | undefined {
  const chainsArray = Object.values(allViemChains);
  return chainsArray.find((chain) => chain.id === chainId);
}

/**
 * Converts various types to bigint, handling potential errors and scientific notation.
 */
export function toBigInt(
  value: string | number | boolean | bigint | undefined,
): bigint | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    if (typeof value === 'string' && value.toLowerCase().includes('e')) {
      const parts = value.toLowerCase().split('e');
      if (parts.length === 2) {
        const base = Number.parseFloat(parts[0]);
        const exponent = Number.parseInt(parts[1], 10);
        if (!Number.isNaN(base) && !Number.isNaN(exponent)) {
          // Use Math.pow carefully with large numbers, consider BigInt alternatives if needed
          return BigInt(Math.round(base * Math.pow(10, exponent)));
        }
      }
    }
    // Direct BigInt conversion for other types
    return BigInt(value);
  } catch (e) {
    console.error('[toBigInt] Failed to convert value to BigInt:', value, e);
    return undefined; // Return undefined on failure
  }
}

/**
 * Estimates gas and provides gas overrides with safe defaults for a transaction.
 * Handles both EIP-1559 and legacy chains.
 * Includes fallback logic if estimateGas itself reverts.
 */
export async function withSafeDefaults(
  chainId: number,
  tx: { to: Hex; data: Hex; value?: bigint },
  fromAddress?: Hex,
): Promise<Record<string, any>> {
  // Return type indicating gas overrides
  console.log(
    '[withSafeDefaults] ChainID:',
    chainId,
    'Tx:',
    tx,
    'From:',
    fromAddress,
  );

  const chain = getChainById(chainId);
  if (!chain) {
    console.error(`[withSafeDefaults] Chain ${chainId} not found.`);
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
  console.log('[withSafeDefaults] Using chain:', chain.name);

  const client = createPublicClient({
    chain: chain,
    transport: http(), // Consider allowing transport override for flexibility
  });

  // Prepare arguments for estimateGas
  const estimateArgs = {
    ...tx,
    ...(fromAddress ? { account: fromAddress } : {}),
  };
  console.log('[withSafeDefaults] Estimating gas with args:', estimateArgs);

  let estimatedGas: bigint;
  try {
    estimatedGas = await client.estimateGas(estimateArgs);
    console.log('[withSafeDefaults] Estimated gas:', estimatedGas.toString());
  } catch (error: unknown) {
    // Log detailed error info
    console.error('[withSafeDefaults] estimateGas failed:', error);
    if (error instanceof BaseError) {
      console.error('[withSafeDefaults] Viem Error Details:', error.details);
      console.error(
        '[withSafeDefaults] Viem Short Message:',
        error.shortMessage,
      );
      const revertCause = error.walk(
        (e) => e instanceof ExecutionRevertedError,
      );
      if (revertCause instanceof ExecutionRevertedError) {
        console.error(
          '[withSafeDefaults] ExecutionReverted Details:',
          revertCause.details,
        );
      }
    } else if (error instanceof Error) {
      console.error('[withSafeDefaults] Standard Error:', error.message);
    }
    // IMPORTANT: Re-throw the error so the caller (useTransactionExecutor)
    // knows estimation failed and can decide to proceed without overrides.
    throw error;
  }

  const gasLimit = (estimatedGas * GAS_LIMIT_BUFFER_PCT) / 100n;
  console.log(
    '[withSafeDefaults] Calculated gasLimit (buffered):',
    gasLimit.toString(),
  );

  // Fetch latest block for gas price strategy
  const block = await client.getBlock({ blockTag: 'latest' });
  console.log(
    '[withSafeDefaults] Latest block:',
    block.number,
    'BaseFee:',
    block.baseFeePerGas,
  );

  // Determine gas price strategy (EIP-1559 vs Legacy)
  if (block.baseFeePerGas !== null && block.baseFeePerGas !== undefined) {
    // EIP-1559
    const baseFee = block.baseFeePerGas;
    const priorityFee = parseUnits(DEFAULT_PRIORITY_FEE_GWEI, 9);
    const maxFee = baseFee * 2n + priorityFee; // Strategy: 2 * base + priority
    const overrides = {
      gas: gasLimit,
      maxPriorityFeePerGas: priorityFee,
      maxFeePerGas: maxFee,
    };
    console.log('[withSafeDefaults] EIP-1559 Overrides:', overrides);
    return overrides;
  } else {
    // Legacy
    const gasPrice = await client.getGasPrice();
    console.log(
      '[withSafeDefaults] Fetched legacy gasPrice:',
      gasPrice.toString(),
    );
    const bufferedGasPrice = (gasPrice * LEGACY_GAS_PRICE_BUFFER_PCT) / 100n;
    const overrides = {
      gas: gasLimit,
      gasPrice: bufferedGasPrice,
    };
    console.log('[withSafeDefaults] Legacy Overrides:', overrides);
    return overrides;
  }
}
