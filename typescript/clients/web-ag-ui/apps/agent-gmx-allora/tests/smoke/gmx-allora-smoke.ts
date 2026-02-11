import crypto from 'node:crypto';

import { createPublicClient, erc20Abi, formatUnits, getAddress, http, type Address } from 'viem';
import { getDeleGatorEnvironment, ROOT_AUTHORITY, signDelegation } from '@metamask/delegation-toolkit';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

import { fetchAlloraInference } from '../../src/clients/allora.js';
import { OnchainActionsClient } from '../../src/clients/onchainActions.js';
import {
  ALLORA_TOPIC_IDS,
  ARBITRUM_CHAIN_ID,
  resolveAlloraApiBaseUrl,
  resolveAlloraApiKey,
  resolveAlloraChainId,
  resolveDelegationsBypass,
  resolveGmxAlloraTxExecutionMode,
  resolveAgentWalletAddress,
  resolveOnchainActionsApiUrl,
} from '../../src/config/constants.js';
import type { DelegationBundle, SignedDelegation } from '../../src/workflow/context.js';
import { executePerpetualPlan } from '../../src/workflow/execution.js';
import { getOnchainClients } from '../../src/workflow/clientFactory.js';
import type { ExecutionPlan } from '../../src/core/executionPlan.js';

const DEFAULT_SMOKE_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;
// 1.1 USDC in base units (6 decimals). 1.0 USDC can fail GMX simulation as "LiquidatablePosition"
// due to fees pushing remaining collateral below the min collateral threshold.
const DEFAULT_LONG_AMOUNT_BASE_UNITS = 1_100_000n;
const USDC_DECIMALS = 6;
const DEFAULT_STEP_TIMEOUT_MS = 15_000;
const CLOSE_RETRY_INTERVAL_MS = 5_000;
const CLOSE_RETRY_TIMEOUT_MS = 90_000;

const resolveArbitrumRpcUrl = (): string =>
  process.env['ARBITRUM_RPC_URL'] ?? process.env['ARBITRUM_ONE_RPC_URL'] ?? 'https://arbitrum.gateway.tenderly.co';

const resolveBaseUrl = (): string =>
  resolveOnchainActionsApiUrl({
    endpoint: process.env['ONCHAIN_ACTIONS_API_URL'],
    logger: (message, metadata) => {
      console.info(`[smoke] ${message}`, metadata);
    },
  });

const resolveWalletAddress = (): `0x${string}` | undefined => {
  const value = process.env['SMOKE_WALLET'];
  if (!value) {
    return undefined;
  }
  if (!value.startsWith('0x')) {
    throw new Error(`SMOKE_WALLET must be a hex address, got: ${value}`);
  }
  return value as `0x${string}`;
};

function resolveDelegatorPrivateKey(): `0x${string}` | undefined {
  const value = process.env['SMOKE_DELEGATOR_PRIVATE_KEY'];
  if (!value) {
    return undefined;
  }
  if (!value.startsWith('0x')) {
    throw new Error(`SMOKE_DELEGATOR_PRIVATE_KEY must be a hex string, got: ${value}`);
  }
  return value as `0x${string}`;
}

const resolveUsdcAddress = (): `0x${string}` | undefined => {
  const value = process.env['SMOKE_USDC_ADDRESS'];
  if (!value) {
    console.info('[smoke] SMOKE_USDC_ADDRESS not set; using default Arbitrum USDC', {
      address: DEFAULT_SMOKE_USDC_ADDRESS,
    });
    return DEFAULT_SMOKE_USDC_ADDRESS;
  }
  if (!value.startsWith('0x')) {
    throw new Error(`SMOKE_USDC_ADDRESS must be a hex address, got: ${value}`);
  }
  return value as `0x${string}`;
};

const baseUrl = resolveBaseUrl();
const delegationsBypassActive = resolveDelegationsBypass();
const txExecutionMode = resolveGmxAlloraTxExecutionMode();
const agentWalletAddress =
  delegationsBypassActive || txExecutionMode === 'execute' ? resolveAgentWalletAddress() : undefined;
const delegatorPrivateKey = resolveDelegatorPrivateKey();
const walletAddress =
  resolveWalletAddress() ??
  (delegationsBypassActive ? agentWalletAddress : undefined) ??
  (delegatorPrivateKey ? (privateKeyToAccount(delegatorPrivateKey).address as `0x${string}`) : undefined);
const usdcAddress = resolveUsdcAddress();
const client = new OnchainActionsClient(baseUrl);
const arbitrumClient = createPublicClient({
  chain: arbitrum,
  transport: http(resolveArbitrumRpcUrl(), { retryCount: 0 }),
});

const run = async () => {
  console.log('[smoke] Using onchain-actions base URL:', baseUrl);
  console.log('[smoke] Delegations bypass active:', delegationsBypassActive);
  console.log('[smoke] TX submission mode:', txExecutionMode);
  if (agentWalletAddress) {
    console.log('[smoke] Agent wallet address:', agentWalletAddress);
  }

  const markets = await client.listPerpetualMarkets({ chainIds: ['42161'] });
  if (markets.length === 0) {
    throw new Error('No perpetual markets returned.');
  }
  console.log(`[smoke] Perpetual markets: ${markets.length}`);

  if (!walletAddress) {
    throw new Error(
      'Missing delegator wallet configuration. Set SMOKE_WALLET, or set SMOKE_DELEGATOR_PRIVATE_KEY, or set DELEGATIONS_BYPASS=true with GMX_ALLORA_AGENT_WALLET_ADDRESS/A2A_TEST_AGENT_NODE_PRIVATE_KEY.',
    );
  }

  const positions = await client.listPerpetualPositions({ walletAddress, chainIds: ['42161'] });
  console.log(`[smoke] Positions for ${walletAddress}: ${positions.length}`);

  // Preflight balances: simulation requires collateral + gas.
  if (!usdcAddress) {
    throw new Error('SMOKE_USDC_ADDRESS resolved to empty value.');
  }

  const fetchBalancesViaRpc = async (address: `0x${string}`) => {
    const [eth, usdc] = await Promise.all([
      arbitrumClient.getBalance({ address: address as Address }),
      arbitrumClient.readContract({
        address: usdcAddress as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address as Address],
      }),
    ]);
    return { eth, usdc };
  };

  // These RPC reads are the source of truth for preflight (onchain-actions' wallet balances endpoint
  // can depend on third party APIs like Dune and may return empty results in local/dev).
  const delegatorRpcBalances = await fetchBalancesViaRpc(walletAddress);
  const agentRpcBalances =
    agentWalletAddress && agentWalletAddress.toLowerCase() !== walletAddress.toLowerCase()
      ? await fetchBalancesViaRpc(agentWalletAddress)
      : undefined;

  // Best-effort: still call onchain-actions balances for debugging (not gating).
  const onchainActionsDelegatorBalances = await client.listWalletBalances({ walletAddress });
  const onchainActionsAgentBalances =
    agentWalletAddress && agentWalletAddress.toLowerCase() !== walletAddress.toLowerCase()
      ? await client.listWalletBalances({ walletAddress: agentWalletAddress })
      : undefined;

  const findOnchainActionsBalance = (
    balances: typeof onchainActionsDelegatorBalances,
    params: { chainId: string; address: `0x${string}` },
  ) =>
    balances.find(
      (balance) =>
        balance.tokenUid.chainId === params.chainId &&
        balance.tokenUid.address.toLowerCase() === params.address.toLowerCase(),
    );

  const delegatorEthBalance = findOnchainActionsBalance(onchainActionsDelegatorBalances, {
    chainId: '42161',
    address: '0x0000000000000000000000000000000000000000',
  });
  const delegatorUsdcBalance = findOnchainActionsBalance(onchainActionsDelegatorBalances, {
    chainId: '42161',
    address: usdcAddress,
  });
  const agentEthBalance = onchainActionsAgentBalances
    ? findOnchainActionsBalance(onchainActionsAgentBalances, {
        chainId: '42161',
        address: '0x0000000000000000000000000000000000000000',
      })
    : undefined;

  const delegatorUsdcAmountBaseUnits = delegatorRpcBalances.usdc;

  console.log('[smoke] Wallet balances (chainId=42161)', {
    rpc: {
      delegator: {
        address: walletAddress,
        eth: {
          amount: delegatorRpcBalances.eth.toString(),
          decimals: 18,
          formatted: formatUnits(delegatorRpcBalances.eth, 18),
        },
        usdc: {
          address: usdcAddress,
          amount: delegatorRpcBalances.usdc.toString(),
          decimals: USDC_DECIMALS,
          formatted: formatUnits(delegatorRpcBalances.usdc, USDC_DECIMALS),
        },
      },
      agent: agentWalletAddress
        ? {
            address: agentWalletAddress,
            eth: agentRpcBalances
              ? {
                  amount: agentRpcBalances.eth.toString(),
                  decimals: 18,
                  formatted: formatUnits(agentRpcBalances.eth, 18),
                }
              : undefined,
          }
        : null,
    },
    onchainActions: {
    delegator: {
      address: walletAddress,
      eth: delegatorEthBalance
        ? {
            amount: delegatorEthBalance.amount,
            decimals: delegatorEthBalance.decimals,
            formatted:
              delegatorEthBalance.decimals === undefined
                ? undefined
                : formatUnits(BigInt(delegatorEthBalance.amount), delegatorEthBalance.decimals),
          }
        : null,
      usdc: delegatorUsdcBalance
        ? {
            address: usdcAddress,
            amount: delegatorUsdcBalance.amount,
            formatted:
              delegatorUsdcBalance.decimals === undefined
                ? undefined
                : formatUnits(BigInt(delegatorUsdcBalance.amount), delegatorUsdcBalance.decimals),
          }
        : { address: usdcAddress, amount: '0' },
    },
    agent: agentWalletAddress
      ? {
          address: agentWalletAddress,
          eth: agentEthBalance
            ? {
                amount: agentEthBalance.amount,
                decimals: agentEthBalance.decimals,
                formatted:
                  agentEthBalance.decimals === undefined
                    ? undefined
                    : formatUnits(BigInt(agentEthBalance.amount), agentEthBalance.decimals),
              }
            : null,
        }
      : null,
    },
  });

  if (txExecutionMode === 'execute' && delegationsBypassActive === false) {
    if (!agentWalletAddress) {
      throw new Error('Agent wallet address is required when executing with DELEGATIONS_BYPASS=false.');
    }
    const agentEthAmount = agentEthBalance ? BigInt(agentEthBalance.amount) : 0n;
    if (agentEthAmount === 0n) {
      throw new Error(
        [
          'GMX execute preflight failed: agent/delegatee wallet needs ETH on Arbitrum to pay gas for delegated execution.',
          `agentWalletAddress=${agentWalletAddress}`,
        ].join(' '),
      );
    }
  }

  console.log('[smoke] Preflight checks passed.');

  const btcMarket =
    markets.find(
      (market) =>
        market.indexToken.symbol.toUpperCase() === 'BTC' && market.name.includes('GMX'),
    ) ?? markets[0];
  if (!btcMarket) {
    throw new Error('No GMX market found for smoke test.');
  }

  const marketAddress = getAddress(btcMarket.marketToken.address);
  const normalizedMarketAddress = marketAddress.toLowerCase();
  const payTokenAddress = getAddress(usdcAddress);
  const matchingMarketPositions = positions.filter(
    (position) => position.marketAddress.toLowerCase() === normalizedMarketAddress,
  );
  const preexistingPosition = matchingMarketPositions.find((position) => position.positionSide === 'long');
  const preexistingMarketPosition = preexistingPosition ?? matchingMarketPositions[0];
  const shouldOpenLongPosition = !preexistingMarketPosition;
  let closePositionSide: 'long' | 'short' = preexistingMarketPosition?.positionSide ?? 'long';
  let openedPositionThisRun = false;

  if (preexistingMarketPosition) {
    console.log('[smoke] Preexisting market position found; skipping long open and moving to close.', {
      marketAddress,
      positionSide: preexistingMarketPosition.positionSide,
      key: preexistingMarketPosition.key,
    });
  }

  if (shouldOpenLongPosition && delegatorUsdcAmountBaseUnits < DEFAULT_LONG_AMOUNT_BASE_UNITS) {
    throw new Error(
      [
        'GMX long planning failed preflight: wallet has insufficient Arbitrum USDC for simulation.',
        `walletAddress=${walletAddress}`,
        `usdcAddress=${usdcAddress}`,
        `required>=${formatUnits(DEFAULT_LONG_AMOUNT_BASE_UNITS, USDC_DECIMALS)} USDC`,
        `found=${formatUnits(delegatorUsdcAmountBaseUnits, USDC_DECIMALS)} USDC`,
        'Fund this wallet with USDC on Arbitrum (chainId=42161) or lower the smoke amount.',
      ].join(' '),
    );
  }

  const inference = await fetchAlloraInference({
    baseUrl: resolveAlloraApiBaseUrl(),
    chainId: resolveAlloraChainId(),
    topicId: ALLORA_TOPIC_IDS.BTC,
    apiKey: resolveAlloraApiKey(),
  });
  console.log('[smoke] Allora inference fetched', { topicId: inference.topicId });

  const failures: string[] = [];
  const skips: string[] = [];

  const runStep = async (
    label: string,
    fn: () => Promise<void>,
    options?: {
      skipWhen?: (message: string) => string | null;
      timeoutMs?: number;
    },
  ) => {
    try {
      const timeoutMs = options?.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
      await Promise.race([
        fn(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      console.log(`[smoke] ${label}: ok`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const skipReason = options?.skipWhen ? options.skipWhen(message) : null;
      if (skipReason) {
        skips.push(`${label}: ${skipReason}`);
        console.warn(`[smoke] ${label}: skipped -> ${skipReason}`);
        return;
      }
      failures.push(`${label}: ${message}`);
      console.error(`[smoke] ${label}: failed -> ${message}`);
    }
  };

  const buildDelegationBundle = async (): Promise<DelegationBundle> => {
    if (delegationsBypassActive) {
      throw new Error('Delegation bundle requested while DELEGATIONS_BYPASS=true.');
    }
    if (!agentWalletAddress) {
      throw new Error('Agent wallet address is required to build a delegation bundle.');
    }
    if (!delegatorPrivateKey) {
      throw new Error(
        'SMOKE_DELEGATOR_PRIVATE_KEY is required when DELEGATIONS_BYPASS=false and broadcasting is enabled.',
      );
    }
    const derivedDelegator = privateKeyToAccount(delegatorPrivateKey).address.toLowerCase() as `0x${string}`;
    if (derivedDelegator !== walletAddress.toLowerCase()) {
      throw new Error(
        `Delegator private key address (${derivedDelegator}) does not match SMOKE_WALLET (${walletAddress}).`,
      );
    }

    const { DelegationManager } = getDeleGatorEnvironment(ARBITRUM_CHAIN_ID);
    const salt = (`0x${crypto.randomBytes(32).toString('hex')}` as const) satisfies `0x${string}`;

    const unsigned = {
      delegate: agentWalletAddress,
      delegator: walletAddress,
      authority: ROOT_AUTHORITY,
      caveats: [],
      salt,
    } satisfies Omit<SignedDelegation, 'signature'>;

    // Smoke uses an unrestricted delegation so the agent wallet can redeem onchain-actions plans.
    const signature = await signDelegation({
      privateKey: delegatorPrivateKey,
      delegation: unsigned,
      delegationManager: DelegationManager,
      chainId: ARBITRUM_CHAIN_ID,
      allowInsecureUnrestrictedDelegation: true,
    });

    const signed: SignedDelegation = { ...unsigned, signature };

    return {
      chainId: ARBITRUM_CHAIN_ID,
      delegationManager: DelegationManager,
      delegatorAddress: walletAddress,
      delegateeAddress: agentWalletAddress,
      delegations: [signed],
      intents: [],
      descriptions: [],
      warnings: [],
    };
  };

  const clients = txExecutionMode === 'execute' ? getOnchainClients() : undefined;
  const delegationBundle =
    txExecutionMode === 'execute' && delegationsBypassActive === false
      ? await buildDelegationBundle()
      : undefined;

  if (txExecutionMode === 'execute' && delegationsBypassActive) {
    if (!agentWalletAddress) {
      throw new Error('Agent wallet address is required for bypass execution mode.');
    }
    if (walletAddress.toLowerCase() !== agentWalletAddress.toLowerCase()) {
      throw new Error(
        `SMOKE_WALLET (${walletAddress}) must equal agent wallet (${agentWalletAddress}) when DELEGATIONS_BYPASS=true and broadcasting is enabled.`,
      );
    }
  }

  const runClosePlan = async (): Promise<void> => {
    const plan: ExecutionPlan = {
      action: 'close',
      request: {
        walletAddress,
        marketAddress,
        positionSide: closePositionSide,
        isLimit: false,
      },
    };

    const result = await executePerpetualPlan({
      client,
      clients,
      plan,
      txExecutionMode,
      delegationsBypassActive,
      delegationBundle,
      delegatorWalletAddress: walletAddress,
      delegateeWalletAddress: agentWalletAddress,
    });

    if (!result.ok) {
      throw new Error(result.error ?? 'unknown execution error');
    }
  };

  const closeWithRetry = async (): Promise<void> => {
    const closeMissingReason = 'No position or order found matching criteria';
    const deadline = Date.now() + CLOSE_RETRY_TIMEOUT_MS;
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        await runClosePlan();
        return;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const canRetry = message.includes(closeMissingReason) && Date.now() < deadline;
        if (!canRetry) {
          throw error;
        }
        console.warn(`[smoke] close attempt ${attempt} not ready yet; retrying in ${CLOSE_RETRY_INTERVAL_MS}ms`, {
          reason: message,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, CLOSE_RETRY_INTERVAL_MS));
      }
    }
  };

  await runStep(
    txExecutionMode === 'execute' ? 'perpetual long execute' : 'perpetual long planning',
    async () => {
      if (!shouldOpenLongPosition) {
        return;
      }

      const plan: ExecutionPlan = {
        action: 'long',
        request: {
          amount: DEFAULT_LONG_AMOUNT_BASE_UNITS.toString(),
          walletAddress,
          chainId: ARBITRUM_CHAIN_ID.toString(),
          marketAddress,
          payTokenAddress,
          collateralTokenAddress: payTokenAddress,
          leverage: '2',
        },
      };

      const result = await executePerpetualPlan({
        client,
        clients,
        plan,
        txExecutionMode,
        delegationsBypassActive,
        delegationBundle,
        delegatorWalletAddress: walletAddress,
        delegateeWalletAddress: agentWalletAddress,
      });

      if (!result.ok) {
        throw new Error(result.error ?? 'unknown execution error');
      }

      openedPositionThisRun = true;
      closePositionSide = 'long';
    },
  );

  const closeStepLabel = txExecutionMode === 'execute' ? 'perpetual close execute' : 'perpetual close planning';
  const shouldAttemptExecuteClose = txExecutionMode !== 'execute' || preexistingMarketPosition !== undefined || openedPositionThisRun;

  if (!shouldAttemptExecuteClose) {
    skips.push(`${closeStepLabel}: no opened/preexisting position to close`);
    console.warn(`[smoke] ${closeStepLabel}: skipped -> no opened/preexisting position to close`);
  } else {
    await runStep(
      closeStepLabel,
      async () => {
        if (txExecutionMode === 'execute') {
          await closeWithRetry();
          return;
        }
        await runClosePlan();
      },
      {
        timeoutMs: txExecutionMode === 'execute' ? CLOSE_RETRY_TIMEOUT_MS + DEFAULT_STEP_TIMEOUT_MS : DEFAULT_STEP_TIMEOUT_MS,
        skipWhen:
          txExecutionMode === 'execute'
            ? undefined
            : (message) => {
                if (message.includes('No position or order found')) {
                  return 'no closeable positions for wallet';
                }
                return null;
              },
      },
    );
  }

  if (failures.length > 0) {
    throw new Error(`Smoke checks failed:\n- ${failures.join('\n- ')}`);
  }

  if (skips.length > 0) {
    console.warn(`[smoke] Skipped checks:\n- ${skips.join('\n- ')}`);
  }

  console.log('[smoke] OK');
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[smoke] FAILED:', message);
  process.exitCode = 1;
});
