import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { type ResolvedPendleConfig } from '../../domain/types.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { AGENT_WALLET_ADDRESS, YIELD_TOKENS } from '../seedData.js';

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

  const bestYieldToken = [...YIELD_TOKENS].sort((a, b) => {
    if (b.apy !== a.apy) {
      return b.apy - a.apy;
    }
    return a.ytSymbol.localeCompare(b.ytSymbol);
  })[0];

  if (!bestYieldToken) {
    const failureMessage = 'ERROR: No Pendle YT markets available to select';
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

  const operatorConfig: ResolvedPendleConfig = {
    walletAddress: delegationsBypassActive ? AGENT_WALLET_ADDRESS : operatorWalletAddress,
    baseContributionUsd: operatorInput.baseContributionUsd ?? 10,
    fundingTokenAddress,
    targetYieldToken: bestYieldToken,
  };

  logInfo('Pendle strategy configuration established', {
    operatorWalletAddress,
    baseContributionUsd: operatorConfig.baseContributionUsd,
    fundingToken: fundingTokenAddress,
    ytToken: bestYieldToken.ytSymbol,
    apy: bestYieldToken.apy,
  });

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Allocating into ${bestYieldToken.ytSymbol} from agent wallet.`
      : `Delegations active. Allocating into ${bestYieldToken.ytSymbol} from user wallet ${operatorWalletAddress}.`,
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
  });

  const events: ClmmEvent[] = [statusEvent];

  return {
    view: {
      operatorConfig,
      selectedPool: bestYieldToken,
      metrics: {
        lastSnapshot: bestYieldToken,
        previousApy: undefined,
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
