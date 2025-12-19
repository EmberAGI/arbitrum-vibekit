import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { erc20Abi, formatUnits } from 'viem';
import { z } from 'zod';

import { fetchPoolSnapshot } from '../../clients/emberApi.js';
import { ARBITRUM_CHAIN_ID } from '../../config/constants.js';
import { FundingTokenInputSchema, type FundingTokenInput } from '../../domain/types.js';
import { getCamelotClient, getOnchainClients } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type FundingTokenInterrupt,
  type FundingTokenOption,
  type OnboardingState,
} from '../context.js';
import { estimateTokenAllocationsUsd } from '../planning/allocations.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const ONBOARDING: Pick<OnboardingState, 'key' | 'totalSteps'> = {
  totalSteps: 3,
};

const ARBITRUM_FUNDING_TOKEN_CANDIDATES: ReadonlyArray<{
  address: `0x${string}`;
  symbol: string;
  decimals: number;
}> = [
  { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', decimals: 6 },
  { address: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', symbol: 'USDC.e', decimals: 6 },
  { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', symbol: 'USDT', decimals: 6 },
  { address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', symbol: 'DAI', decimals: 18 },
  { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', symbol: 'WETH', decimals: 18 },
  { address: '0x912ce59144191c1204e64559fe8253a0e49e6548', symbol: 'ARB', decimals: 18 },
] as const;

function uniqByAddress<T extends { address: `0x${string}` }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = item.address.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function readErc20Balance(params: {
  publicClient: Awaited<ReturnType<typeof getOnchainClients>>['public'];
  tokenAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}): Promise<bigint> {
  return params.publicClient.readContract({
    address: params.tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [params.walletAddress],
  });
}

function tokenUsdValue(params: { balance: bigint; decimals: number; usdPrice: number | undefined }) {
  if (!params.usdPrice || params.usdPrice <= 0) {
    return 0;
  }
  const asNumber = Number(formatUnits(params.balance, params.decimals));
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return 0;
  }
  return asNumber * params.usdPrice;
}

export const collectFundingTokenInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectFundingTokenInput: entering node', {
    hasOperatorInput: Boolean(state.view.operatorInput),
    hasSelectedPool: Boolean(state.view.selectedPool),
    hasFundingTokenInput: Boolean(state.view.fundingTokenInput),
    delegationsBypassActive: state.view.delegationsBypassActive === true,
    onboardingStep: state.view.onboarding?.step,
  });

  const operatorInput = state.view.operatorInput;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Operator input missing before funding-token step';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: [] },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  if (state.view.delegationsBypassActive === true) {
    logInfo('collectFundingTokenInput: bypass active; skipping step');
    return {
      view: {
        selectedPool: state.view.selectedPool,
        fundingTokenInput: state.view.fundingTokenInput,
        onboarding: { ...ONBOARDING, step: 3 },
      },
    };
  }

  const camelotClient = getCamelotClient();
  const clients = await getOnchainClients();

  const selectedPoolAddress = normalizeHexAddress(operatorInput.poolAddress, 'pool address');
  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  const selectedPool =
    state.view.profile.allowedPools?.find(
      (pool) => pool.address.toLowerCase() === selectedPoolAddress.toLowerCase(),
    ) ??
    (await fetchPoolSnapshot(camelotClient, selectedPoolAddress, ARBITRUM_CHAIN_ID));

  if (!selectedPool) {
    const failureMessage = `ERROR: Pool ${selectedPoolAddress} not available from Ember API`;
    logInfo('collectFundingTokenInput: selected pool missing', { selectedPoolAddress, failureMessage });
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const baseContributionUsd = operatorInput.baseContributionUsd ?? 5_000;
  try {
    void estimateTokenAllocationsUsd(selectedPool, baseContributionUsd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logInfo('collectFundingTokenInput: unable to compute token allocations; skipping step2', {
      error: message,
    });
    const { task, statusEvent } = buildTaskStatus(
      state.view.task,
      'working',
      `WARNING: Unable to estimate required pool token balances (${message}). Skipping funding-token selection.`,
    );
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        selectedPool,
        onboarding: { ...ONBOARDING, step: 3 },
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    };
  }

  const [balance0, balance1] = await Promise.all([
    readErc20Balance({
      publicClient: clients.public,
      tokenAddress: selectedPool.token0.address,
      walletAddress: operatorWalletAddress,
    }),
    readErc20Balance({
      publicClient: clients.public,
      tokenAddress: selectedPool.token1.address,
      walletAddress: operatorWalletAddress,
    }),
  ]);

  const poolTokenUsdValue =
    tokenUsdValue({
      balance: balance0,
      decimals: selectedPool.token0.decimals,
      usdPrice: selectedPool.token0.usdPrice,
    }) +
    tokenUsdValue({
      balance: balance1,
      decimals: selectedPool.token1.decimals,
      usdPrice: selectedPool.token1.usdPrice,
    });

  // If the operator already has enough total value in the pool token pair, swaps can be performed
  // entirely within the pair (no external funding token selection needed).
  const requiresExternalFunding =
    Number.isFinite(poolTokenUsdValue) && poolTokenUsdValue > 0
      ? poolTokenUsdValue < baseContributionUsd * 0.98
      : true;

  if (!requiresExternalFunding) {
    logInfo('collectFundingTokenInput: external funding not required; skipping step2', {
      poolTokenUsdValue: poolTokenUsdValue.toFixed(4),
      baseContributionUsd,
    });
    return {
      view: {
        selectedPool,
        onboarding: { ...ONBOARDING, step: 3 },
      },
    };
  }

  logInfo('collectFundingTokenInput: external funding required; building options', {
    poolTokenUsdValue: Number.isFinite(poolTokenUsdValue) ? poolTokenUsdValue.toFixed(4) : poolTokenUsdValue,
    baseContributionUsd,
    poolAddress: selectedPool.address,
    operatorWalletAddress,
  });

  const candidateOptions = uniqByAddress([
    {
      address: selectedPool.token0.address,
      symbol: selectedPool.token0.symbol,
      decimals: selectedPool.token0.decimals,
    },
    {
      address: selectedPool.token1.address,
      symbol: selectedPool.token1.symbol,
      decimals: selectedPool.token1.decimals,
    },
    ...ARBITRUM_FUNDING_TOKEN_CANDIDATES,
  ]);

  const optionBalances = await Promise.all(
    candidateOptions.map(async (option): Promise<FundingTokenOption> => {
      const balance = await readErc20Balance({
        publicClient: clients.public,
        tokenAddress: option.address,
        walletAddress: operatorWalletAddress,
      });
      return {
        address: option.address,
        symbol: option.symbol,
        decimals: option.decimals,
        balance: balance.toString(),
      };
    }),
  );

  const request: FundingTokenInterrupt = {
    type: 'clmm-funding-token-request',
    message:
      'Your wallet does not appear to hold enough value in the pool token pair for the selected allocation. Select a funding token to swap from (no guessing).',
    payloadSchema: z.toJSONSchema(FundingTokenInputSchema),
    options: optionBalances,
  };

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'input-required',
    'Awaiting funding-token selection to plan required swaps.',
  );
  await copilotkitEmitState(config, {
    view: {
      onboarding: { ...ONBOARDING, step: 2 },
      task: awaitingInput.task,
      activity: { events: [awaitingInput.statusEvent], telemetry: state.view.activity.telemetry },
      selectedPool,
    },
  });

  logInfo('collectFundingTokenInput: calling interrupt() - awaiting funding token selection', {
    optionCount: optionBalances.length,
  });

  const incoming: unknown = await interrupt(request);
  logInfo('collectFundingTokenInput: interrupt resolved with input', {
    hasInput: incoming !== undefined,
    incomingType: typeof incoming,
    incoming: typeof incoming === 'string' ? incoming.slice(0, 120) : incoming,
  });

  let inputToParse: unknown = incoming;
  if (typeof incoming === 'string') {
    try {
      inputToParse = JSON.parse(incoming);
    } catch {
      // ignore
    }
  }

  const parsed = FundingTokenInputSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid funding-token input: ${issues}`;
    logInfo('collectFundingTokenInput: validation failed', { issues, failureMessage });
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    };
  }

  const normalizedFundingToken = normalizeHexAddress(
    parsed.data.fundingTokenAddress,
    'funding token address',
  );
  const isAllowed = optionBalances.some(
    (option) => option.address.toLowerCase() === normalizedFundingToken.toLowerCase(),
  );
  if (!isAllowed) {
    const failureMessage = `Invalid funding-token input: address ${normalizedFundingToken} not in allowed options`;
    logInfo('collectFundingTokenInput: funding token not allowed', { normalizedFundingToken, failureMessage });
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    };
  }

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Funding token selected. Preparing delegation request.',
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
  });

  const input: FundingTokenInput = {
    fundingTokenAddress: normalizedFundingToken,
  };

  return {
    view: {
      selectedPool,
      fundingTokenInput: input,
      onboarding: { ...ONBOARDING, step: 3 },
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    },
  };
};
