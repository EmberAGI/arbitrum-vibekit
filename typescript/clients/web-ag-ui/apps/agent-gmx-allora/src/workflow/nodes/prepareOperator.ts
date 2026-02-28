import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { resolveAgentWalletAddress } from '../../config/constants.js';
import { type ResolvedGmxConfig } from '../../domain/types.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  logInfo,
  logPauseSnapshot,
  logWarn,
  normalizeHexAddress,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { MARKETS } from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const prepareOperatorNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  logWarn('prepareOperator: node entered', {
    onboardingStatus: state.thread.onboardingFlow?.status,
    onboardingStep: state.thread.onboarding?.step,
    onboardingKey: state.thread.onboarding?.key,
    hasOperatorInput: Boolean(state.thread.operatorInput),
    hasFundingTokenInput: Boolean(state.thread.fundingTokenInput),
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
    hasOperatorConfig: Boolean(state.thread.operatorConfig),
  });
  const { operatorInput } = state.thread;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Setup input missing';
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
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      task,
      profile: state.thread.profile,
      transactionHistory: state.thread.transactionHistory,
      metrics: state.thread.metrics,
    });
    return {
      thread: haltedView,
    };
  }

  const fundingTokenInput = state.thread.fundingTokenInput;
  if (!fundingTokenInput) {
    const failureMessage = 'ERROR: Funding token input missing before strategy setup';
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
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      task,
      profile: state.thread.profile,
      transactionHistory: state.thread.transactionHistory,
      metrics: state.thread.metrics,
    });
    return {
      thread: haltedView,
    };
  }

  const fundingTokenAddress = normalizeHexAddress(
    fundingTokenInput.fundingTokenAddress,
    'funding token address',
  );

  const delegationsBypassActive = state.thread.delegationsBypassActive === true;
  const agentWalletAddress = resolveAgentWalletAddress();
  const delegatorWalletAddress = delegationsBypassActive
    ? agentWalletAddress
    : normalizeHexAddress(operatorInput.walletAddress, 'delegator wallet address');
  const delegatorInputWalletAddress = delegationsBypassActive ? undefined : delegatorWalletAddress;
  if (!delegationsBypassActive && !state.thread.delegationBundle) {
    logWarn('prepareOperator: cannot build operator config yet; delegation bundle missing', {
      delegationsBypassActive,
      hasDelegationBundle: false,
      onboardingStep: state.thread.onboarding?.step,
      onboardingKey: state.thread.onboarding?.key,
    });
    logInfo('prepareOperator: waiting for delegation bundle before strategy setup', {
      delegationsBypassActive,
      hasOperatorInput: Boolean(operatorInput),
      hasFundingTokenInput: Boolean(fundingTokenInput),
      onboardingKey: state.thread.onboarding?.key,
      onboardingStep: state.thread.onboarding?.step,
    });
    const message = 'Waiting for delegation approval to continue onboarding.';
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'input-required', message);
    const onboardingStep = state.thread.onboarding?.key === 'funding-token' ? 3 : 2;
    const pendingView = {
      onboarding: { step: onboardingStep, key: 'delegation-signing' as const },
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    };
    const mergedView = applyThreadPatch(state, pendingView);
    logPauseSnapshot({
      node: 'prepareOperator',
      reason: 'awaiting delegation bundle before strategy setup',
      thread: mergedView,
      metadata: {
        pauseMechanism: 'state-wait',
      },
    });
    await copilotkitEmitState(config, {
      thread: mergedView,
    });
    return {
      thread: mergedView,
    };
  }

  const targetMarket = MARKETS.find((market) => market.baseSymbol === operatorInput.targetMarket);

  if (!targetMarket) {
    const failureMessage = `ERROR: Unsupported GMX market ${operatorInput.targetMarket}`;
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
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      task,
      profile: state.thread.profile,
      transactionHistory: state.thread.transactionHistory,
      metrics: state.thread.metrics,
    });
    return {
      thread: haltedView,
    };
  }

  const delegateeWalletAddress = agentWalletAddress;

  const operatorConfig: ResolvedGmxConfig = {
    delegatorWalletAddress,
    delegateeWalletAddress,
    baseContributionUsd: operatorInput.usdcAllocation,
    fundingTokenAddress,
    targetMarket,
    maxLeverage: targetMarket.maxLeverage,
  };

  logInfo('GMX Allora strategy configuration established', {
    delegatorInputWalletAddress,
    delegatorWalletAddress,
    delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
    usdcAllocation: operatorConfig.baseContributionUsd,
    fundingToken: fundingTokenAddress,
    market: `${targetMarket.baseSymbol}/${targetMarket.quoteSymbol}`,
    maxLeverage: targetMarket.maxLeverage,
  });

  const { task, statusEvent } = buildTaskStatus(
    state.thread.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Preparing ${targetMarket.baseSymbol} GMX strategy from agent wallet.`
      : `Delegations active. Preparing ${targetMarket.baseSymbol} GMX strategy from user wallet ${delegatorInputWalletAddress}.`,
  );
  const workingView = applyThreadPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
  });
  await copilotkitEmitState(config, {
    thread: workingView,
  });

  const events: ClmmEvent[] = [statusEvent];

  const completedView = applyThreadPatch(state, {
    operatorConfig,
    selectedPool: targetMarket,
    metrics: {
      lastSnapshot: targetMarket,
      previousPrice: undefined,
      cyclesSinceRebalance: 0,
      staleCycles: 0,
      iteration: 0,
      latestCycle: undefined,
    },
    task,
    activity: { events, telemetry: state.thread.activity.telemetry },
    transactionHistory: state.thread.transactionHistory,
    profile: state.thread.profile,
  });
  return {
    thread: completedView,
    private: {
      cronScheduled: false,
    },
  };
};
