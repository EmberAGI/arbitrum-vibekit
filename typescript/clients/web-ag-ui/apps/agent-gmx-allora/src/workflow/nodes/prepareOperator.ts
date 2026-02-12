import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { type ResolvedGmxConfig } from '../../domain/types.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { AGENT_WALLET_ADDRESS, MARKETS } from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const DEFAULT_ALLOCATION_USD = 100;

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

  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

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
  if (!delegationsBypassActive && !state.view.delegationBundle) {
    const failureMessage =
      'ERROR: Delegation bundle missing. Complete delegation signing before continuing.';
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

  const targetMarket = MARKETS.find(
    (market) => market.baseSymbol === operatorInput.targetMarket,
  );

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

  const operatorConfig: ResolvedGmxConfig = {
    walletAddress: delegationsBypassActive ? AGENT_WALLET_ADDRESS : operatorWalletAddress,
    baseContributionUsd: operatorInput.baseContributionUsd ?? DEFAULT_ALLOCATION_USD,
    fundingTokenAddress,
    targetMarket,
    maxLeverage: targetMarket.maxLeverage,
  };

  logInfo('GMX Allora strategy configuration established', {
    operatorWalletAddress,
    baseContributionUsd: operatorConfig.baseContributionUsd,
    fundingToken: fundingTokenAddress,
    market: `${targetMarket.baseSymbol}/${targetMarket.quoteSymbol}`,
    maxLeverage: targetMarket.maxLeverage,
  });

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Preparing ${targetMarket.baseSymbol} GMX strategy from agent wallet.`
      : `Delegations active. Preparing ${targetMarket.baseSymbol} GMX strategy from user wallet ${operatorWalletAddress}.`,
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
