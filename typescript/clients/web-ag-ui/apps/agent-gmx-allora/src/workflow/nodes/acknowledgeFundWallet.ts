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

function buildFundWalletInterrupt(state: ClmmState): GmxFundWalletInterrupt {
  const walletAddress = state.view.operatorConfig?.delegatorWalletAddress;
  const requiredCollateralSymbol = state.view.selectedPool?.quoteSymbol ?? 'USDC';
  const message =
    state.view.task?.taskStatus.message?.content ??
    'GMX order simulation failed. Fund the wallet, then click Continue to retry the cycle.';

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
  const pendingMessage =
    state.view.executionError ??
    'GMX order simulation failed. Ensure the trading wallet has enough USDC collateral and a small amount of Arbitrum ETH for execution fees. After funding, click Continue in Agent Blockers to retry immediately.';
  const awaitingInput = buildTaskStatus(state.view.task, 'input-required', pendingMessage);
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const telemetry = state.view.activity?.telemetry ?? [];
  const onboardingStep = Math.max(state.view.onboarding?.step ?? 4, 4);
  const pendingView = {
    onboarding: {
      step: onboardingStep,
      key: 'fund-wallet',
    },
    haltReason: '',
    executionError: '',
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry },
  };
  const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
    currentTaskState: state.view.task?.taskStatus?.state,
    currentTaskMessage: state.view.task?.taskStatus?.message?.content,
    currentOnboardingKey: state.view.onboarding?.key,
    nextOnboardingKey: pendingView.onboarding.key,
    nextTaskMessage: awaitingMessage,
  });
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = applyViewPatch(state, pendingView);
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
    // Keep state unchanged and end the run; user can retry from the blocker UI.
    return buildTerminalTransition({
      createCommand: createLangGraphCommand,
    });
  }

  // This interrupt is an "ack + retry" flow.
  // We end here and let the UI trigger a new `cycle` run immediately.
  return buildTerminalTransition({
    createCommand: createLangGraphCommand,
  });
};
