import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { type Command, interrupt } from '@langchain/langgraph';
import {
  buildInterruptPauseTransition,
  buildNodeTransition,
  buildStateUpdate,
  requestInterruptPayload,
  shouldPersistInputRequiredCheckpoint,
} from 'agent-workflow-core';
import { erc20Abi, formatUnits } from 'viem';
import { z } from 'zod';

import { fetchPoolSnapshot } from '../../clients/emberApi.js';
import { ARBITRUM_CHAIN_ID, resolveTickBandwidthBps } from '../../config/constants.js';
import { buildRange, deriveMidPrice } from '../../core/decision-engine.js';
import { FundingTokenInputSchema, type FundingTokenInput } from '../../domain/types.js';
import { getCamelotClient, getOnchainActionsClient, getOnchainClients } from '../clientFactory.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type FundingTokenInterrupt,
  type FundingTokenOption,
  type OnboardingState,
} from '../context.js';
import { createLangGraphCommand } from '../langGraphCommandFactory.js';
import { estimateTokenAllocationsUsd } from '../planning/allocations.js';
import { loadBootstrapContext } from '../store.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

const resolveFundingResumeOnboarding = (state: ClmmState): OnboardingState | undefined => {
  if (state.thread.operatorConfig || state.thread.onboardingFlow?.status === 'completed') {
    return state.thread.onboarding;
  }
  if (state.thread.delegationsBypassActive === true) {
    return { step: 2, key: FUNDING_STEP_KEY };
  }
  if (state.thread.onboarding?.key === DELEGATION_STEP_KEY && state.thread.onboarding.step === 2) {
    return state.thread.onboarding;
  }
  return { step: 3, key: DELEGATION_STEP_KEY };
};

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

function formatTokenSymbol(params: { symbol?: string; address: `0x${string}` }): string {
  if (params.symbol && params.symbol.trim().length > 0) {
    return params.symbol.trim();
  }
  return `${params.address.slice(0, 6)}…${params.address.slice(-4)}`;
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
    hasOperatorInput: Boolean(state.thread.operatorInput),
    hasSelectedPool: Boolean(state.thread.selectedPool),
    hasFundingTokenInput: Boolean(state.thread.fundingTokenInput),
    delegationsBypassActive: state.thread.delegationsBypassActive === true,
    onboardingStep: state.thread.onboarding?.step,
  });

  const operatorInput = state.thread.operatorInput;
  if (!operatorInput) {
    logInfo('collectFundingTokenInput: operator input missing; rerouting to collectOperatorInput');
    return buildNodeTransition({
      node: 'collectOperatorInput',
      createCommand: createLangGraphCommand,
    });
  }

  if (state.thread.fundingTokenInput) {
    logInfo('collectFundingTokenInput: funding token already present; skipping step');
    const resumedOnboarding = resolveFundingResumeOnboarding(state);
    if (!resumedOnboarding) {
      return buildStateUpdate({});
    }
    const resumedPatch = {
      onboarding: resumedOnboarding,
    };
    applyThreadPatch(state, resumedPatch);
    return buildStateUpdate({
      thread: resumedPatch,
    });
  }

  if (state.thread.delegationsBypassActive === true) {
    logInfo('collectFundingTokenInput: bypass active; using agent wallet for funding');
  }

  const camelotClient = getCamelotClient();
  const clients = await getOnchainClients();

  const selectedPoolAddress = normalizeHexAddress(operatorInput.poolAddress, 'pool address');
  const delegationsBypassActive = state.thread.delegationsBypassActive === true;
  const walletAddressSource = delegationsBypassActive
    ? (await loadBootstrapContext()).agentWalletAddress
    : operatorInput.walletAddress;
  const operatorWalletAddress = normalizeHexAddress(
    walletAddressSource,
    delegationsBypassActive ? 'agent wallet address' : 'wallet address',
  );

  const selectedPool =
    state.thread.profile.allowedPools?.find(
      (pool) => pool.address.toLowerCase() === selectedPoolAddress.toLowerCase(),
    ) ??
    (await fetchPoolSnapshot(camelotClient, selectedPoolAddress, ARBITRUM_CHAIN_ID));

  if (!selectedPool) {
    const failureMessage = `ERROR: Pool ${selectedPoolAddress} not available from Ember API`;
    logInfo('collectFundingTokenInput: selected pool missing', { selectedPoolAddress, failureMessage });
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedPatch = {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      profile: state.thread.profile,
      metrics: state.thread.metrics,
      transactionHistory: state.thread.transactionHistory,
    };
    applyThreadPatch(state, haltedPatch);
    return buildNodeTransition({
      node: 'summarize',
      update: {
        thread: haltedPatch,
      },
      createCommand: createLangGraphCommand,
    });
  }

  const baseContributionUsd = operatorInput.baseContributionUsd;
  const decimalsDiff = selectedPool.token0.decimals - selectedPool.token1.decimals;
  const targetRange = buildRange(
    deriveMidPrice(selectedPool),
    resolveTickBandwidthBps(),
    selectedPool.tickSpacing ?? 10,
    decimalsDiff,
  );
  try {
    void estimateTokenAllocationsUsd(selectedPool, baseContributionUsd, targetRange);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logInfo('collectFundingTokenInput: unable to compute token allocations; skipping step2', {
      error: message,
    });
    const { task, statusEvent } = buildTaskStatus(
      state.thread.task,
      'working',
      `WARNING: Unable to estimate required pool token balances (${message}). Skipping funding-token selection.`,
    );
    const warningView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: warningView,
    });
    const skipPatch = {
      selectedPool,
      onboarding: { step: 2, key: DELEGATION_STEP_KEY },
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    };
    applyThreadPatch(state, skipPatch);
    return buildStateUpdate({
      thread: skipPatch,
    });
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
    const skipPatch = {
      selectedPool,
      onboarding: { step: 2, key: DELEGATION_STEP_KEY },
    };
    applyThreadPatch(state, skipPatch);
    return buildStateUpdate({
      thread: skipPatch,
    });
  }

  logInfo('collectFundingTokenInput: external funding required; building options', {
    poolTokenUsdValue: Number.isFinite(poolTokenUsdValue) ? poolTokenUsdValue.toFixed(4) : poolTokenUsdValue,
    baseContributionUsd,
    poolAddress: selectedPool.address,
    operatorWalletAddress,
  });

  const onchainActionsClient = getOnchainActionsClient();
  let walletBalances;
  try {
    walletBalances = await onchainActionsClient.listWalletBalances(operatorWalletAddress);
  } catch (error) {
    const failureMessage = 'Failed to fetch wallet balances for funding-token selection.';
    logInfo('collectFundingTokenInput: wallet balances lookup failed', {
      operatorWalletAddress,
      error: error instanceof Error ? error.message : String(error),
    });
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedPatch = {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    };
    applyThreadPatch(state, haltedPatch);
    return buildStateUpdate({
      thread: haltedPatch,
    });
  }
  walletBalances = walletBalances.filter(
    (balance) => balance.tokenUid.chainId === String(ARBITRUM_CHAIN_ID),
  );

  const optionBalances = walletBalances
    .map((balance): FundingTokenOption | null => {
      try {
        if (BigInt(balance.amount) <= 0n) {
          return null;
        }
      } catch {
        return null;
      }
      if (balance.decimals === undefined) {
        return null;
      }
      const address = normalizeHexAddress(balance.tokenUid.address, 'funding token address');
      return {
        address,
        symbol: formatTokenSymbol({ symbol: balance.symbol, address }),
        decimals: balance.decimals,
        balance: balance.amount,
        valueUsd: balance.valueUsd,
      };
    })
    .filter((option): option is FundingTokenOption => Boolean(option));

  const availableOptions = uniqByAddress(optionBalances).sort((a, b) => {
    const aValue = typeof a.valueUsd === 'number' && Number.isFinite(a.valueUsd) ? a.valueUsd : null;
    const bValue = typeof b.valueUsd === 'number' && Number.isFinite(b.valueUsd) ? b.valueUsd : null;
    if (aValue !== null && bValue !== null && aValue !== bValue) {
      return bValue - aValue;
    }
    if (aValue !== null && bValue === null) {
      return -1;
    }
    if (aValue === null && bValue !== null) {
      return 1;
    }
    return a.symbol.localeCompare(b.symbol);
  });

  const poolTokenAddresses = new Set([
    selectedPool.token0.address.toLowerCase(),
    selectedPool.token1.address.toLowerCase(),
  ]);
  const autoSelectedFundingToken = availableOptions.find((option) =>
    poolTokenAddresses.has(option.address.toLowerCase()),
  );
  if (autoSelectedFundingToken) {
    const { task, statusEvent } = buildTaskStatus(
      state.thread.task,
      'working',
      `Auto-selected ${autoSelectedFundingToken.symbol} as the funding token based on current pool-token holdings.`,
    );
    const autoSelectedPatch = {
      selectedPool,
      fundingTokenInput: { fundingTokenAddress: autoSelectedFundingToken.address },
      onboarding:
        delegationsBypassActive === true
          ? { step: 2, key: FUNDING_STEP_KEY }
          : { step: 3, key: DELEGATION_STEP_KEY },
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    };
    const autoSelectedView = applyThreadPatch(state, autoSelectedPatch);
    logInfo('collectFundingTokenInput: auto-selected funding token from pool token holdings', {
      fundingTokenAddress: autoSelectedFundingToken.address,
      fundingTokenSymbol: autoSelectedFundingToken.symbol,
      optionCount: availableOptions.length,
      onboardingStep: autoSelectedView.onboarding?.step,
    });
    await copilotkitEmitState(config, {
      thread: autoSelectedView,
    });
    return buildStateUpdate({
      thread: autoSelectedPatch,
    });
  }

  if (availableOptions.length === 0) {
    const walletLabel = delegationsBypassActive ? 'agent wallet' : 'wallet';
    const failureMessage = `No funding tokens available in the ${walletLabel} on Arbitrum. Fund the ${walletLabel} with tokens to continue.`;
    logInfo('collectFundingTokenInput: no funding token balances available', {
      operatorWalletAddress,
      candidateCount: optionBalances.length,
    });
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedPatch = {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    };
    applyThreadPatch(state, haltedPatch);
    return buildStateUpdate({
      thread: haltedPatch,
    });
  }

  const request: FundingTokenInterrupt = {
    type: 'clmm-funding-token-request',
    message:
      'Your wallet does not appear to hold enough value in the pool token pair for the selected allocation. Select a funding token to swap from (no guessing).',
    payloadSchema: z.toJSONSchema(FundingTokenInputSchema),
    options: availableOptions,
  };

  const awaitingInput = buildTaskStatus(
    state.thread.task,
    'input-required',
    'Awaiting funding-token selection to plan required swaps.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: { step: 2, key: FUNDING_STEP_KEY },
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: state.thread.activity.telemetry },
    selectedPool,
  };
  const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
    currentTaskState: state.thread.task?.taskStatus?.state,
    currentTaskMessage: state.thread.task?.taskStatus?.message?.content,
    currentOnboardingKey: state.thread.onboarding?.key,
    nextOnboardingKey: pendingView.onboarding.key,
    nextTaskMessage: awaitingMessage,
  });
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = applyThreadPatch(state, pendingView);
    await copilotkitEmitState(config, {
      thread: mergedView,
    });
    return buildInterruptPauseTransition({
      node: 'collectFundingTokenInput',
      update: {
        thread: pendingView,
      },
      createCommand: createLangGraphCommand,
    });
  }

  logInfo('collectFundingTokenInput: calling interrupt() - awaiting funding token selection', {
    candidateCount: optionBalances.length,
    optionCount: availableOptions.length,
  });

  const interruptResult = await requestInterruptPayload({
    request,
    interrupt,
  });
  const incoming: unknown = interruptResult.raw;
  logInfo('collectFundingTokenInput: interrupt resolved with input', {
    hasInput: incoming !== undefined,
    incomingType: typeof incoming,
    incoming: typeof incoming === 'string' ? incoming.slice(0, 120) : incoming,
  });

  const inputToParse = interruptResult.decoded;

  const parsed = FundingTokenInputSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid funding-token input: ${issues}`;
    logInfo('collectFundingTokenInput: validation failed', { issues, failureMessage });
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedPatch = {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    };
    applyThreadPatch(state, haltedPatch);
    return buildStateUpdate({
      thread: haltedPatch,
    });
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
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedPatch = {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    };
    applyThreadPatch(state, haltedPatch);
    return buildStateUpdate({
      thread: haltedPatch,
    });
  }

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Funding token selected. Preparing delegation request.',
  );
  const workingView = applyThreadPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
  });
  await copilotkitEmitState(config, {
    thread: workingView,
  });

  const input: FundingTokenInput = {
    fundingTokenAddress: normalizedFundingToken,
  };

  const completedPatch = {
    selectedPool,
    fundingTokenInput: input,
    onboarding:
      delegationsBypassActive === true
        ? { step: 2, key: FUNDING_STEP_KEY }
        : { step: 3, key: DELEGATION_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
  };
  applyThreadPatch(state, completedPatch);
  return buildStateUpdate({
    thread: completedPatch,
  });
};
