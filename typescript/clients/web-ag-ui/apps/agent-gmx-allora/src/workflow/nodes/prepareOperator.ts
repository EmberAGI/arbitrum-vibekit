import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { resolveAgentWalletAddress } from '../../config/constants.js';
import { type ResolvedGmxConfig } from '../../domain/types.js';
import {
  applyViewPatch,
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
    onboardingStatus: state.view.onboardingFlow?.status,
    onboardingStep: state.view.onboarding?.step,
    onboardingKey: state.view.onboarding?.key,
    hasOperatorInput: Boolean(state.view.operatorInput),
    hasFundingTokenInput: Boolean(state.view.fundingTokenInput),
    hasDelegationBundle: Boolean(state.view.delegationBundle),
    hasOperatorConfig: Boolean(state.view.operatorConfig),
  });
  const { operatorInput } = state.view;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Setup input missing';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    const failedView = applyViewPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      view: failedView,
    });
    const haltedView = applyViewPatch(state, {
      haltReason: failureMessage,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      task,
      profile: state.view.profile,
      transactionHistory: state.view.transactionHistory,
      metrics: state.view.metrics,
    });
    return {
      view: haltedView,
    };
  }

  const fundingTokenInput = state.view.fundingTokenInput;
  if (!fundingTokenInput) {
    const failureMessage = 'ERROR: Funding token input missing before strategy setup';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    const failedView = applyViewPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      view: failedView,
    });
    const haltedView = applyViewPatch(state, {
      haltReason: failureMessage,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      task,
      profile: state.view.profile,
      transactionHistory: state.view.transactionHistory,
      metrics: state.view.metrics,
    });
    return {
      view: haltedView,
    };
  }

  const fundingTokenAddress = normalizeHexAddress(
    fundingTokenInput.fundingTokenAddress,
    'funding token address',
  );

  const delegationsBypassActive = state.view.delegationsBypassActive === true;
  const agentWalletAddress = resolveAgentWalletAddress();
  const delegatorWalletAddress = delegationsBypassActive
    ? agentWalletAddress
    : normalizeHexAddress(operatorInput.walletAddress, 'delegator wallet address');
  const delegatorInputWalletAddress = delegationsBypassActive ? undefined : delegatorWalletAddress;
  if (!delegationsBypassActive && !state.view.delegationBundle) {
    logWarn('prepareOperator: cannot build operator config yet; delegation bundle missing', {
      delegationsBypassActive,
      hasDelegationBundle: false,
      onboardingStep: state.view.onboarding?.step,
      onboardingKey: state.view.onboarding?.key,
    });
    logInfo('prepareOperator: waiting for delegation bundle before strategy setup', {
      delegationsBypassActive,
      hasOperatorInput: Boolean(operatorInput),
      hasFundingTokenInput: Boolean(fundingTokenInput),
      onboardingKey: state.view.onboarding?.key,
      onboardingStep: state.view.onboarding?.step,
    });
    const message = 'Waiting for delegation approval to continue onboarding.';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'input-required', message);
    const onboardingStep = state.view.onboarding?.key === 'funding-token' ? 3 : 2;
    const pendingView = {
      onboarding: { step: onboardingStep, key: 'delegation-signing' as const },
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    };
    const mergedView = applyViewPatch(state, pendingView);
    logPauseSnapshot({
      node: 'prepareOperator',
      reason: 'awaiting delegation bundle before strategy setup',
      view: mergedView,
      metadata: {
        pauseMechanism: 'state-wait',
      },
    });
    await copilotkitEmitState(config, {
      view: mergedView,
    });
    return {
      view: mergedView,
    };
  }

  const targetMarket = MARKETS.find((market) => market.baseSymbol === operatorInput.targetMarket);

  if (!targetMarket) {
    const failureMessage = `ERROR: Unsupported GMX market ${operatorInput.targetMarket}`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    const failedView = applyViewPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      view: failedView,
    });
    const haltedView = applyViewPatch(state, {
      haltReason: failureMessage,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      task,
      profile: state.view.profile,
      transactionHistory: state.view.transactionHistory,
      metrics: state.view.metrics,
    });
    return {
      view: haltedView,
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
    state.view.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Preparing ${targetMarket.baseSymbol} GMX strategy from agent wallet.`
      : `Delegations active. Preparing ${targetMarket.baseSymbol} GMX strategy from user wallet ${delegatorInputWalletAddress}.`,
  );
  const workingView = applyViewPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
  });
  await copilotkitEmitState(config, {
    view: workingView,
  });

  const events: ClmmEvent[] = [statusEvent];

  const completedView = applyViewPatch(state, {
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
    activity: { events, telemetry: state.view.activity.telemetry },
    transactionHistory: state.view.transactionHistory,
    profile: state.view.profile,
  });
  return {
    view: completedView,
    private: {
      cronScheduled: false,
    },
  };
};
