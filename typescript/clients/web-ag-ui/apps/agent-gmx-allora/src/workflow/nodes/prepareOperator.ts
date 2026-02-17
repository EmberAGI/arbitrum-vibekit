import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { resolveAgentWalletAddress } from '../../config/constants.js';
import { type ResolvedGmxConfig } from '../../domain/types.js';
import {
  buildTaskStatus,
  logInfo,
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
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const { operatorInput } = state.view;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Setup input missing';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
  }

  const fundingTokenInput = state.view.fundingTokenInput;
  if (!fundingTokenInput) {
    const failureMessage = 'ERROR: Funding token input missing before strategy setup';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
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
    const message = 'Waiting for delegation approval to continue onboarding.';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'input-required', message);
    const configuredTotalSteps = state.view.onboarding?.totalSteps;
    const totalSteps =
      typeof configuredTotalSteps === 'number' && configuredTotalSteps > 0
        ? configuredTotalSteps
        : 3;
    const onboardingStep = totalSteps <= 2 ? 2 : 3;
    const pendingView = {
      onboarding: { step: onboardingStep, totalSteps },
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    };
    const mergedView = { ...state.view, ...pendingView };
    await copilotkitEmitState(config, {
      view: mergedView,
    });
    return new Command({
      update: {
        view: mergedView,
      },
      goto: 'collectDelegations',
    });
  }

  const targetMarket = MARKETS.find((market) => market.baseSymbol === operatorInput.targetMarket);

  if (!targetMarket) {
    const failureMessage = `ERROR: Unsupported GMX market ${operatorInput.targetMarket}`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
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
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
  });

  const events: ClmmEvent[] = [statusEvent];

  return {
    view: {
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
    },
    private: {
      cronScheduled: false,
    },
  };
};
