import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { interrupt } from '@langchain/langgraph';
import { requestInterruptPayload } from 'agent-workflow-core';
import { parseUnits } from 'viem';
import { z } from 'zod';

import type { PerpetualMarket } from '../../clients/onchainActions.js';
import { ARBITRUM_CHAIN_ID, ONCHAIN_ACTIONS_API_URL } from '../../config/constants.js';
import { selectGmxPerpetualMarket } from '../../core/marketSelection.js';
import { FundingTokenInputSchema, type FundingTokenInput } from '../../domain/types.js';
import { getOnchainActionsClient } from '../clientFactory.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  logInfo,
  logWarn,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type OnboardingState,
} from '../context.js';

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
  return state.thread.onboarding?.key === FUNDING_STEP_KEY
    ? { step: 3, key: DELEGATION_STEP_KEY }
    : { step: 2, key: DELEGATION_STEP_KEY };
};

function resolveUsdcTokenAddressFromMarket(market: PerpetualMarket): `0x${string}` {
  const longToken = market.longToken;
  const shortToken = market.shortToken;
  if (!longToken || !shortToken) {
    throw new Error('Selected GMX market is missing long/short token metadata.');
  }

  const candidates = [shortToken, longToken];
  const usdcToken = candidates.find((token) => token.symbol.toUpperCase() === 'USDC');
  if (!usdcToken) {
    throw new Error('Selected GMX market does not provide USDC collateral.');
  }

  return normalizeHexAddress(usdcToken.tokenUid.address, 'funding token address');
}

function resolveUsdcDecimalsFromMarket(market: PerpetualMarket): number {
  const longToken = market.longToken;
  const shortToken = market.shortToken;
  if (!longToken || !shortToken) {
    throw new Error('Selected GMX market is missing long/short token metadata.');
  }

  const candidates = [shortToken, longToken];
  const usdcToken = candidates.find((token) => token.symbol.toUpperCase() === 'USDC');
  if (!usdcToken) {
    throw new Error('Selected GMX market does not provide USDC collateral.');
  }

  return usdcToken.decimals;
}

function hasSufficientUsdcBalance(params: {
  walletBalances:
    | Array<{
        tokenUid: { address: string };
        amount: string;
      }>
    | undefined;
  usdcTokenAddress: `0x${string}`;
  requiredCollateralUsd: number;
  usdcDecimals: number;
}): boolean {
  const usdcBalance = params.walletBalances?.find(
    (balance) => balance.tokenUid.address.toLowerCase() === params.usdcTokenAddress.toLowerCase(),
  );
  if (!usdcBalance) {
    return false;
  }

  let availableAmount: bigint;
  try {
    availableAmount = BigInt(usdcBalance.amount);
  } catch {
    return false;
  }

  let requiredAmount: bigint;
  try {
    requiredAmount = parseUnits(params.requiredCollateralUsd.toFixed(params.usdcDecimals), params.usdcDecimals);
  } catch {
    return false;
  }

  return availableAmount >= requiredAmount;
}

function buildSwapSourceOptions(params: {
  walletBalances:
    | Array<{
        tokenUid: { chainId: string; address: string };
        amount: string;
        symbol?: string;
        decimals?: number;
        valueUsd?: number;
      }>
    | undefined;
  collateralTokenAddress: `0x${string}`;
}): Array<{
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  balance: string;
}> {
  return (params.walletBalances ?? [])
    .filter((balance) => balance.tokenUid.chainId === ARBITRUM_CHAIN_ID.toString())
    .filter((balance) => balance.tokenUid.address.toLowerCase() !== params.collateralTokenAddress.toLowerCase())
    .filter((balance) => typeof balance.symbol === 'string' && balance.symbol.trim().length > 0)
    .filter((balance) => typeof balance.decimals === 'number')
    .filter((balance) => balance.symbol?.toUpperCase() !== 'ETH')
    .filter((balance) => {
      try {
        return BigInt(balance.amount) > 0n;
      } catch {
        return false;
      }
    })
    .sort((left, right) => {
      const leftValue = left.valueUsd ?? 0;
      const rightValue = right.valueUsd ?? 0;
      if (rightValue !== leftValue) {
        return rightValue - leftValue;
      }
      const symbolCompare = (left.symbol ?? '').localeCompare(right.symbol ?? '');
      if (symbolCompare !== 0) {
        return symbolCompare;
      }
      return left.tokenUid.address.localeCompare(right.tokenUid.address);
    })
    .map((balance) => ({
      address: normalizeHexAddress(balance.tokenUid.address, 'funding token option address'),
      symbol: balance.symbol?.trim() ?? 'UNKNOWN',
      decimals: balance.decimals ?? 0,
      balance: balance.amount,
    }));
}

export const collectFundingTokenInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  logInfo('collectFundingTokenInput: entering node', {
    hasOperatorInput: Boolean(state.thread.operatorInput),
    onboardingStep: state.thread.onboarding?.step,
  });
  logWarn('collectFundingTokenInput: node entered', {
    hasOperatorInput: Boolean(state.thread.operatorInput),
    hasFundingTokenInput: Boolean(state.thread.fundingTokenInput),
    onboardingStatus: state.thread.onboardingFlow?.status,
    onboardingStep: state.thread.onboarding?.step,
    onboardingKey: state.thread.onboarding?.key,
  });

  const operatorInput = state.thread.operatorInput;
  if (!operatorInput) {
    logInfo('collectFundingTokenInput: setup input missing; rerouting to collectSetupInput');
    return {};
  }

  if (state.thread.fundingTokenInput) {
    logInfo('collectFundingTokenInput: funding token already present; skipping step');
    logWarn('collectFundingTokenInput: skipping funding token collection', {
      reason: 'funding-token-already-present-in-view',
      fundingTokenAddress: state.thread.fundingTokenInput.fundingTokenAddress,
      onboardingStatus: state.thread.onboardingFlow?.status,
      onboardingStep: state.thread.onboarding?.step,
      onboardingKey: state.thread.onboarding?.key,
    });
    const resumedOnboarding = resolveFundingResumeOnboarding(state);
    if (!resumedOnboarding) {
      return {};
    }
    const resumedView = applyThreadPatch(state, {
      onboarding: resumedOnboarding,
    });
    return {
      thread: resumedView,
    };
  }

  let normalizedFundingToken: `0x${string}`;
  let walletBalances:
    | Array<{
        tokenUid: { chainId: string; address: string };
        amount: string;
        symbol?: string;
        decimals?: number;
        valueUsd?: number;
      }>
    | undefined;
  try {
    const onchainActionsClient = getOnchainActionsClient();
    const markets = await onchainActionsClient.listPerpetualMarkets({
      chainIds: [ARBITRUM_CHAIN_ID.toString()],
    });
    const selectedMarket = selectGmxPerpetualMarket({
      markets,
      baseSymbol: operatorInput.targetMarket,
      quoteSymbol: 'USDC',
    });
    if (!selectedMarket) {
      throw new Error(`No GMX ${operatorInput.targetMarket}/USDC market available`);
    }

    normalizedFundingToken = resolveUsdcTokenAddressFromMarket(selectedMarket);
    const usdcDecimals = resolveUsdcDecimalsFromMarket(selectedMarket);
    walletBalances =
      'listWalletBalances' in onchainActionsClient &&
      typeof onchainActionsClient.listWalletBalances === 'function'
        ? await onchainActionsClient.listWalletBalances({
            walletAddress: normalizeHexAddress(operatorInput.walletAddress, 'wallet address'),
          })
        : undefined;
    if (
      hasSufficientUsdcBalance({
        walletBalances,
        usdcTokenAddress: normalizedFundingToken,
        requiredCollateralUsd: operatorInput.usdcAllocation,
        usdcDecimals,
      })
    ) {
      const input: FundingTokenInput = {
        fundingTokenAddress: normalizedFundingToken,
        collateralTokenAddress: normalizedFundingToken,
      };
      const completedView = applyThreadPatch(state, {
        fundingTokenInput: input,
        onboarding:
          state.thread.delegationsBypassActive === true
            ? { step: 2, key: FUNDING_STEP_KEY }
            : { step: 3, key: DELEGATION_STEP_KEY },
      });
      return {
        thread: completedView,
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Failed to resolve USDC funding token from ${ONCHAIN_ACTIONS_API_URL}: ${message}`;
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedView = applyThreadPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    return {
      thread: haltedView,
    };
  }

  const swapSourceOptions = buildSwapSourceOptions({
    walletBalances,
    collateralTokenAddress: normalizedFundingToken,
  });
  if (swapSourceOptions.length > 0) {
    const awaitingInput = buildTaskStatus(
      state.thread.task,
      'input-required',
      'Select a wallet token to swap into USDC collateral before opening the GMX position.',
    );
    const pendingView = applyThreadPatch(state, {
      onboarding: { step: 2, key: FUNDING_STEP_KEY },
      task: awaitingInput.task,
      activity: { events: [awaitingInput.statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: pendingView,
    });

    const interruptResult = await requestInterruptPayload({
      request: {
        type: 'gmx-funding-token-request',
        message: 'Select the wallet token to swap into USDC collateral for the GMX position.',
        payloadSchema: z.toJSONSchema(FundingTokenInputSchema),
        options: swapSourceOptions,
      },
      interrupt,
    });
    const parsed = FundingTokenInputSchema.safeParse(interruptResult.decoded);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
      const failureMessage = `Invalid funding-token input: ${issues}`;
      const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
      const failedView = applyThreadPatch(state, {
        task,
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      });
      await copilotkitEmitState(config, {
        thread: failedView,
      });
      const haltedView = applyThreadPatch(state, {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      });
      return {
        thread: haltedView,
      };
    }

    const selectedFundingToken = normalizeHexAddress(
      parsed.data.fundingTokenAddress,
      'funding token address',
    );
    const isEligible = swapSourceOptions.some(
      (option) => option.address.toLowerCase() === selectedFundingToken.toLowerCase(),
    );
    if (!isEligible) {
      const failureMessage = 'Selected funding token is not eligible for swap-to-USDC collateral.';
      const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
      const failedView = applyThreadPatch(state, {
        task,
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      });
      await copilotkitEmitState(config, {
        thread: failedView,
      });
      const haltedView = applyThreadPatch(state, {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      });
      return {
        thread: haltedView,
      };
    }

    const input: FundingTokenInput = {
      fundingTokenAddress: selectedFundingToken,
      collateralTokenAddress: normalizedFundingToken,
    };
    const { task, statusEvent } = buildTaskStatus(
      awaitingInput.task,
      'working',
      'Funding token selected. Preparing delegation request.',
    );
    const completedView = applyThreadPatch(state, {
      fundingTokenInput: input,
      onboarding:
        state.thread.delegationsBypassActive === true
          ? { step: 2, key: FUNDING_STEP_KEY }
          : { step: 3, key: DELEGATION_STEP_KEY },
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    return {
      thread: completedView,
    };
  }

  const awaitingInput = buildTaskStatus(
    state.thread.task,
    'working',
    'Using USDC as collateral for GMX perps.',
  );
  const pendingView = applyThreadPatch(state, {
    onboarding: { step: 2, key: FUNDING_STEP_KEY },
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: state.thread.activity.telemetry },
  });
  await copilotkitEmitState(config, {
    thread: pendingView,
  });

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'USDC collateral selected. Preparing delegation request.',
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
    collateralTokenAddress: normalizedFundingToken,
  };

  const completedView = applyThreadPatch(state, {
    fundingTokenInput: input,
    onboarding:
      state.thread.delegationsBypassActive === true
        ? { step: 2, key: FUNDING_STEP_KEY }
        : { step: 3, key: DELEGATION_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
  });
  return {
    thread: completedView,
  };
};
