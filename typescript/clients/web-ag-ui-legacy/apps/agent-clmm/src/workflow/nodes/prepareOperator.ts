import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { applyAccountingUpdate, createFlowEvent } from '../../accounting/state.js';
import { fetchPoolSnapshot } from '../../clients/emberApi.js';
import { ARBITRUM_CHAIN_ID, resolveTickBandwidthBps } from '../../config/constants.js';
import { type ResolvedOperatorConfig } from '../../domain/types.js';
import { resolveAccountingContextId } from '../accounting.js';
import { getCamelotClient } from '../clientFactory.js';
import {
  buildTaskStatus,
  type ClmmState,
  type ClmmUpdate,
  logInfo,
  normalizeHexAddress,
  type ClmmEvent,
} from '../context.js';
import { appendFlowLogHistory, loadFlowLogHistory } from '../historyStore.js';
import { loadBootstrapContext } from '../store.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

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

  // Create client on-demand (class instances don't survive LangGraph checkpointing)
  const camelotClient = getCamelotClient();
  const { agentWalletAddress } = await loadBootstrapContext();

  const selectedPoolAddress = normalizeHexAddress(operatorInput.poolAddress, 'pool address');
  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  const selectedPool =
    (state.view.selectedPool &&
    state.view.selectedPool.address.toLowerCase() === selectedPoolAddress.toLowerCase()
      ? state.view.selectedPool
      : profile.allowedPools?.find(
          (pool) => pool.address.toLowerCase() === selectedPoolAddress.toLowerCase(),
        )) ?? (await fetchPoolSnapshot(camelotClient, selectedPoolAddress, ARBITRUM_CHAIN_ID));

  if (!selectedPool) {
    const failureMessage = `ERROR: Pool ${selectedPoolAddress} not available from Ember API`;
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

  if (agentWalletAddress !== operatorWalletAddress) {
    logInfo('Operator wallet input differs from managed account', {
      operatorWalletAddress,
      agentWalletAddress,
    });
  }

  const delegationsBypassActive = state.view.delegationsBypassActive === true;
  if (!delegationsBypassActive) {
    const delegationBundle = state.view.delegationBundle;
    if (!delegationBundle) {
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

    if (delegationBundle.delegatorAddress.toLowerCase() !== operatorWalletAddress.toLowerCase()) {
      const failureMessage =
        `ERROR: Delegation bundle delegator ${delegationBundle.delegatorAddress} does not match selected operator wallet ${operatorWalletAddress}.`;
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

    if (delegationBundle.delegateeAddress.toLowerCase() !== agentWalletAddress.toLowerCase()) {
      const failureMessage =
        `ERROR: Delegation bundle delegatee ${delegationBundle.delegateeAddress} does not match agent wallet ${agentWalletAddress}.`;
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
  }

  const operatorConfig: ResolvedOperatorConfig = {
    walletAddress: delegationsBypassActive ? agentWalletAddress : operatorWalletAddress,
    baseContributionUsd: operatorInput.baseContributionUsd ?? 10,
    manualBandwidthBps: resolveTickBandwidthBps(),
    autoCompoundFees: true,
  };

  let accounting = state.view.accounting;
  const threadId = (config as Configurable).configurable?.thread_id;
  const storedFlowLog = threadId ? await loadFlowLogHistory({ threadId }) : [];
  if (storedFlowLog.length > 0) {
    accounting = { ...accounting, flowLog: storedFlowLog };
  }
  const contextId = resolveAccountingContextId({
    state,
    threadId,
  });
  if (!contextId) {
    logInfo('Accounting hire event skipped: missing threadId', {
      poolAddress: selectedPoolAddress,
    });
  } else if (!(accounting.lifecycleStart && !accounting.lifecycleEnd)) {
    const hireEvent = createFlowEvent({
      type: 'hire',
      contextId,
      chainId: ARBITRUM_CHAIN_ID,
      usdValue: operatorConfig.baseContributionUsd,
    });
    await appendFlowLogHistory({ threadId, events: [hireEvent] });
    accounting = applyAccountingUpdate({
      existing: accounting,
      flowEvents: [hireEvent],
    });
  }

  logInfo('Operator configuration established', {
    poolAddress: selectedPoolAddress,
    operatorWalletAddress,
    agentWalletAddress,
    baseContributionUsd: operatorConfig.baseContributionUsd,
  });

  // Note: Cron scheduling moved to pollCycle to ensure first cycle completes
  // before subsequent cron-triggered runs begin

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Managing pool ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from agent wallet ${agentWalletAddress}`
      : `Delegations active. Managing pool ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from user wallet ${operatorWalletAddress} (delegatee=${agentWalletAddress})`,
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
      accounting,
    },
    private: {
      cronScheduled: false, // Will be set to true in pollCycle after first cycle
    },
  };
};
