import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { resolveTickBandwidthBps } from '../../config/constants.js';
import { type ResolvedOperatorConfig } from '../../domain/types.js';
import {
  applyThreadPatch,
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
  const { operatorInput, profile } = state.thread;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Operator input missing';
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
    return new Command({
      update: {
        thread: haltedView,
      },
      goto: 'summarize',
    });
  }

  const selectedPoolAddress = normalizeHexAddress(operatorInput.poolAddress, 'pool address');
  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  const selectedPool =
    state.thread.selectedPool && state.thread.selectedPool.address.toLowerCase() === selectedPoolAddress.toLowerCase()
      ? state.thread.selectedPool
      : profile.allowedPools?.find((pool) => pool.address.toLowerCase() === selectedPoolAddress.toLowerCase());

  if (!selectedPool) {
    const failureMessage = `ERROR: Pool ${selectedPoolAddress} not available during operator setup`;
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
    return new Command({
      update: {
        thread: haltedView,
      },
      goto: 'summarize',
    });
  }

  const delegationsBypassActive = state.thread.delegationsBypassActive === true;
  if (!delegationsBypassActive && !state.thread.delegationBundle) {
    const failureMessage =
      'ERROR: Delegation bundle missing. Complete delegation signing before continuing.';
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
    return new Command({
      update: {
        thread: haltedView,
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
    state.thread.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Managing ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from agent wallet.`
      : `Delegations active. Managing ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from user wallet ${operatorWalletAddress}.`,
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
