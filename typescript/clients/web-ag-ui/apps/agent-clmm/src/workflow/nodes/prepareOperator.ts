import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { type Command } from '@langchain/langgraph';
import { buildNodeTransition, buildStateUpdate } from 'agent-workflow-core';

import { applyAccountingUpdate, createFlowEvent } from '../../accounting/state.js';
import { fetchPoolSnapshot } from '../../clients/emberApi.js';
import { ARBITRUM_CHAIN_ID, resolveTickBandwidthBps } from '../../config/constants.js';
import { type ResolvedOperatorConfig } from '../../domain/types.js';
import { resolveAccountingContextId } from '../accounting.js';
import { getCamelotClient } from '../clientFactory.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  type ClmmState,
  type ClmmUpdate,
  logInfo,
  normalizeHexAddress,
  type ClmmEvent,
} from '../context.js';
import { appendFlowLogHistory, loadFlowLogHistory } from '../historyStore.js';
import { createLangGraphCommand } from '../langGraphCommandFactory.js';
import { loadBootstrapContext } from '../store.js';
import { applyAccountingToView } from '../viewMapping.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

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
    const haltedPatch = {
      haltReason: failureMessage,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      task,
      profile: state.thread.profile,
      transactionHistory: state.thread.transactionHistory,
      metrics: state.thread.metrics,
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

  // Create client on-demand (class instances don't survive LangGraph checkpointing)
  const camelotClient = getCamelotClient();
  const { agentWalletAddress } = await loadBootstrapContext();

  const selectedPoolAddress = normalizeHexAddress(operatorInput.poolAddress, 'pool address');
  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  const selectedPool =
    (state.thread.selectedPool &&
    state.thread.selectedPool.address.toLowerCase() === selectedPoolAddress.toLowerCase()
      ? state.thread.selectedPool
      : profile.allowedPools?.find(
          (pool) => pool.address.toLowerCase() === selectedPoolAddress.toLowerCase(),
        )) ?? (await fetchPoolSnapshot(camelotClient, selectedPoolAddress, ARBITRUM_CHAIN_ID));

  if (!selectedPool) {
    const failureMessage = `ERROR: Pool ${selectedPoolAddress} not available from Ember API`;
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
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      task,
      profile: state.thread.profile,
      transactionHistory: state.thread.transactionHistory,
      metrics: state.thread.metrics,
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

  if (agentWalletAddress !== operatorWalletAddress) {
    logInfo('Operator wallet input differs from managed account', {
      operatorWalletAddress,
      agentWalletAddress,
    });
  }

  const delegationsBypassActive = state.thread.delegationsBypassActive === true;
  if (!delegationsBypassActive) {
    const delegationBundle = state.thread.delegationBundle;
    if (!delegationBundle) {
      logInfo('prepareOperator: delegation bundle missing; rerouting to collectDelegations', {
        onboardingKey: state.thread.onboarding?.key,
        onboardingStep: state.thread.onboarding?.step,
      });
      return buildNodeTransition({
        node: 'collectDelegations',
        createCommand: createLangGraphCommand,
      });
    }

    if (delegationBundle.delegatorAddress.toLowerCase() !== operatorWalletAddress.toLowerCase()) {
      const failureMessage =
        `ERROR: Delegation bundle delegator ${delegationBundle.delegatorAddress} does not match selected operator wallet ${operatorWalletAddress}.`;
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
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        task,
        profile: state.thread.profile,
        transactionHistory: state.thread.transactionHistory,
        metrics: state.thread.metrics,
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

    if (delegationBundle.delegateeAddress.toLowerCase() !== agentWalletAddress.toLowerCase()) {
      const failureMessage =
        `ERROR: Delegation bundle delegatee ${delegationBundle.delegateeAddress} does not match agent wallet ${agentWalletAddress}.`;
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
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        task,
        profile: state.thread.profile,
        transactionHistory: state.thread.transactionHistory,
        metrics: state.thread.metrics,
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
  }

  const operatorConfig: ResolvedOperatorConfig = {
    walletAddress: delegationsBypassActive ? agentWalletAddress : operatorWalletAddress,
    baseContributionUsd: operatorInput.baseContributionUsd,
    manualBandwidthBps: resolveTickBandwidthBps(),
    autoCompoundFees: true,
  };

  let accounting = state.thread.accounting;
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
    state.thread.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Managing pool ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from agent wallet ${agentWalletAddress}`
      : `Delegations active. Managing pool ${selectedPool.token0.symbol}/${selectedPool.token1.symbol} from user wallet ${operatorWalletAddress} (delegatee=${agentWalletAddress})`,
  );
  const workingView = applyThreadPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
  });
  await copilotkitEmitState(config, {
    thread: workingView,
  });

  const events: ClmmEvent[] = [statusEvent];

  const { profile: nextProfile, metrics: nextMetrics } = applyAccountingToView({
    profile: state.thread.profile,
    metrics: {
      lastSnapshot: selectedPool,
      previousPrice: undefined,
      cyclesSinceRebalance: 0,
      staleCycles: 0,
      rebalanceCycles: 0,
      iteration: 0,
      latestCycle: undefined,
    },
    accounting,
  });

  const completedPatch = {
    operatorConfig,
    selectedPool,
    metrics: nextMetrics,
    task,
    activity: { events, telemetry: state.thread.activity.telemetry },
    transactionHistory: state.thread.transactionHistory,
    profile: nextProfile,
    accounting,
  };
  applyThreadPatch(state, completedPatch);
  return buildStateUpdate({
    thread: completedPatch,
    private: {
      cronScheduled: false, // Will be set to true in pollCycle after first cycle
    },
  });
};
