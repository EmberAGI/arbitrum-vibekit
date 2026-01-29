import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { resolveTickBandwidthBps } from '../../config/constants.js';
import { type ResolvedOperatorConfig } from '../../domain/types.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { MOCK_AGENT_WALLET_ADDRESS } from '../mockData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const prepareOperatorNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const { operatorInput, profile } = state.view;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Operator input missing';
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

  const selectedPoolAddress = normalizeHexAddress(operatorInput.poolAddress, 'pool address');
  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  const selectedPool =
    state.view.selectedPool && state.view.selectedPool.address.toLowerCase() === selectedPoolAddress.toLowerCase()
      ? state.view.selectedPool
      : profile.allowedPools?.find((pool) => pool.address.toLowerCase() === selectedPoolAddress.toLowerCase());

  if (!selectedPool) {
    const failureMessage = `ERROR: Pool ${selectedPoolAddress} not available during operator setup`;
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

  const operatorConfig: ResolvedOperatorConfig = {
    walletAddress: delegationsBypassActive ? MOCK_AGENT_WALLET_ADDRESS : operatorWalletAddress,
    baseContributionUsd: operatorInput.baseContributionUsd ?? 10,
    manualBandwidthBps: resolveTickBandwidthBps(),
    autoCompoundFees: true,
  };

  logInfo('Operator configuration established', {
    poolAddress: selectedPoolAddress,
    operatorWalletAddress,
    baseContributionUsd: operatorConfig.baseContributionUsd,
  });

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Managing ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from agent wallet.`
      : `Delegations active. Managing ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from user wallet ${operatorWalletAddress}.`,
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
  });

  const events: ClmmEvent[] = [statusEvent];

  return {
    view: {
      operatorConfig,
      selectedPool,
      metrics: {
        lastSnapshot: selectedPool,
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
