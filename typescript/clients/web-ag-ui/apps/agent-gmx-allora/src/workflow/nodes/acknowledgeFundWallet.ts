import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { type Command, interrupt } from '@langchain/langgraph';
import {
  buildInterruptPauseTransition,
  buildTerminalTransition,
  shouldPersistInputRequiredCheckpoint,
} from 'agent-workflow-core';
import { z } from 'zod';

import {
  applyViewPatch,
  buildTaskStatus,
  logWarn,
  logPauseSnapshot,
  type ClmmState,
  type ClmmUpdate,
  type GmxFundWalletInterrupt,
} from '../context.js';
import { createLangGraphCommand } from '../langGraphCommandFactory.js';

const FundWalletAckSchema = z.object({
  acknowledged: z.literal(true),
});

const FundWalletAckJsonSchema = z.object({
  acknowledged: z.literal(true),
});

const DEFAULT_INTERRUPT_MESSAGE =
  'GMX order simulation failed. Fund the wallet, then click Continue to retry the cycle.';
const DEFAULT_PENDING_MESSAGE =
  'GMX order simulation failed. Ensure the trading wallet has enough USDC collateral and a small amount of Arbitrum ETH for execution fees. After funding, click Continue in Agent Blockers to retry immediately.';

type Configurable = {
  configurable?: {
    thread_id?: string;
    checkpoint_id?: string;
    checkpoint_ns?: string;
  };
};

const resolveNonEmptyMessage = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

function buildFundWalletInterrupt(state: ClmmState): GmxFundWalletInterrupt {
  const walletAddress = state.view.operatorConfig?.delegatorWalletAddress;
  const requiredCollateralSymbol = state.view.selectedPool?.quoteSymbol ?? 'USDC';
  const message = resolveNonEmptyMessage(
    state.view.task?.taskStatus.message?.content,
    DEFAULT_INTERRUPT_MESSAGE,
  );

  return {
    type: 'gmx-fund-wallet-request',
    message,
    payloadSchema: z.toJSONSchema(FundWalletAckJsonSchema),
    artifactId: `gmx-fund-wallet-${Date.now()}`,
    walletAddress,
    requiredCollateralSymbol,
  };
}

export const acknowledgeFundWalletNode = async (
  state: ClmmState,
  config: Parameters<typeof copilotkitEmitState>[0],
): Promise<Command<string, ClmmUpdate>> => {
  const runtimeConfig = (config as Configurable).configurable;
  const threadId = runtimeConfig?.thread_id;
  const checkpointId = runtimeConfig?.checkpoint_id;
  const checkpointNamespace = runtimeConfig?.checkpoint_ns;
  logWarn('acknowledgeFundWallet: node entered', {
    threadId,
    checkpointId,
    checkpointNamespace,
    command: state.view.command,
    taskState: state.view.task?.taskStatus?.state,
    taskMessage: state.view.task?.taskStatus?.message?.content,
    executionError: state.view.executionError,
    hasOperatorConfig: Boolean(state.view.operatorConfig),
    hasDelegationBundle: Boolean(state.view.delegationBundle),
    hasFundingTokenInput: Boolean(state.view.fundingTokenInput),
  });
  const pendingMessage = resolveNonEmptyMessage(state.view.executionError, DEFAULT_PENDING_MESSAGE);
  const awaitingInput = buildTaskStatus(state.view.task, 'input-required', pendingMessage);
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const telemetry = state.view.activity?.telemetry ?? [];
  const pendingView = {
    haltReason: '',
    executionError: '',
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry },
  };
  const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
    currentTaskState: state.view.task?.taskStatus?.state,
    currentTaskMessage: state.view.task?.taskStatus?.message?.content,
    currentOnboardingKey: state.view.onboarding?.key,
    nextOnboardingKey: state.view.onboarding?.key,
    nextTaskMessage: awaitingMessage,
  });
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  const pauseSnapshotView = applyViewPatch(state, pendingView);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = pauseSnapshotView;
    logPauseSnapshot({
      node: 'acknowledgeFundWallet',
      reason: 'awaiting wallet funding acknowledgement',
      view: mergedView,
      metadata: {
        threadId,
        checkpointId,
        checkpointNamespace,
        pauseMechanism: 'checkpoint-and-interrupt',
      },
    });
    await copilotkitEmitState(config, {
      view: mergedView,
    });
    return buildInterruptPauseTransition({
      node: 'acknowledgeFundWallet',
      update: {
        view: mergedView,
      },
      createCommand: createLangGraphCommand,
    });
  }
  logPauseSnapshot({
    node: 'acknowledgeFundWallet',
    reason: 'awaiting wallet funding acknowledgement',
    view: pauseSnapshotView,
    metadata: {
      threadId,
      checkpointId,
      checkpointNamespace,
      pauseMechanism: 'interrupt',
    },
  });

  const request = buildFundWalletInterrupt(state);
  const incoming: unknown = await interrupt(request);

  let inputToParse: unknown = incoming;
  if (typeof incoming === 'string') {
    try {
      inputToParse = JSON.parse(incoming);
    } catch {
      // ignore
    }
  }

  const parsedAck = FundWalletAckSchema.safeParse(inputToParse);
  if (!parsedAck.success) {
    logWarn('acknowledgeFundWallet: invalid acknowledgement payload; ending run', {
      threadId,
      checkpointId,
      checkpointNamespace,
      issues: parsedAck.error.issues.map((issue) => issue.message),
    });
    // Keep state unchanged and end the run; user can retry from the blocker UI.
    return buildTerminalTransition({
      createCommand: createLangGraphCommand,
    });
  }

  logWarn('acknowledgeFundWallet: valid acknowledgement received; ending run for immediate retry', {
    threadId,
    checkpointId,
    checkpointNamespace,
    acknowledged: true,
  });
  // This interrupt is an "ack + retry" flow.
  // We end here and let the UI trigger a new `cycle` run immediately.
  return buildTerminalTransition({
    createCommand: createLangGraphCommand,
  });
};
