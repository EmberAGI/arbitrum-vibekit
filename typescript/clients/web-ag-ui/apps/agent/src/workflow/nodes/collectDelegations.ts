import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { requestInterruptPayload, shouldPersistInputRequiredCheckpoint } from 'agent-workflow-core';
import { z } from 'zod';

import { ARBITRUM_CHAIN_ID } from '../../config/constants.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type DelegationBundle,
  type DelegationSigningInterrupt,
  type OnboardingState,
  type SignedDelegation,
} from '../context.js';
import {
  buildMockDelegations,
  MOCK_AGENT_WALLET_ADDRESS,
  MOCK_DELEGATION_DESCRIPTIONS,
  MOCK_DELEGATION_MANAGER,
  MOCK_DELEGATION_WARNINGS,
  MOCK_INTENTS,
} from '../mockData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

const HexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/u)
  .transform((value) => value.toLowerCase() as `0x${string}`);

const HexJsonSchema = z.string().regex(/^0x[0-9a-fA-F]*$/u);

const DelegationCaveatSchema = z.object({
  enforcer: HexSchema,
  terms: HexSchema,
  args: HexSchema,
});

const DelegationCaveatJsonSchema = z.object({
  enforcer: HexJsonSchema,
  terms: HexJsonSchema,
  args: HexJsonSchema,
});

const SignedDelegationSchema = z.object({
  delegate: HexSchema,
  delegator: HexSchema,
  authority: HexSchema,
  caveats: z.array(DelegationCaveatSchema),
  salt: HexSchema,
  signature: HexSchema,
});

const SignedDelegationJsonSchema = z.object({
  delegate: HexJsonSchema,
  delegator: HexJsonSchema,
  authority: HexJsonSchema,
  caveats: z.array(DelegationCaveatJsonSchema),
  salt: HexJsonSchema,
  signature: HexJsonSchema,
});

const DelegationSigningResponseSchema = z.union([
  z.object({
    outcome: z.literal('signed'),
    signedDelegations: z.array(SignedDelegationSchema).min(1),
  }),
  z.object({
    outcome: z.literal('rejected'),
  }),
]);

const DelegationSigningResponseJsonSchema = z.union([
  z.object({
    outcome: z.literal('signed'),
    signedDelegations: z.array(SignedDelegationJsonSchema).min(1),
  }),
  z.object({
    outcome: z.literal('rejected'),
  }),
]);

export const collectDelegationsNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectDelegations: entering node', {
    delegationsBypassActive: state.thread.delegationsBypassActive === true,
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
  });

  if (state.thread.delegationsBypassActive === true) {
    return {
      thread: {
        delegationsBypassActive: true,
        onboarding: { step: 2, key: FUNDING_STEP_KEY },
      },
    };
  }

  if (state.thread.delegationBundle) {
    if (state.thread.task?.taskStatus.state === 'input-required') {
      const { task, statusEvent } = buildTaskStatus(
        state.thread.task,
        'working',
        'Delegation approvals received. Continuing onboarding.',
      );
      return {
        thread: {
          delegationBundle: state.thread.delegationBundle,
          onboarding: { step: 3, key: DELEGATION_STEP_KEY },
          task,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        },
      };
    }

    return {
      thread: {
        delegationBundle: state.thread.delegationBundle,
        onboarding: { step: 3, key: DELEGATION_STEP_KEY },
      },
    };
  }

  const operatorInput = state.thread.operatorInput;
  if (!operatorInput) {
    logInfo('collectDelegations: operator input missing; rerouting to collectOperatorInput');
    return new Command({ goto: 'collectOperatorInput' });
  }

  const selectedPool = state.thread.selectedPool;
  if (!selectedPool) {
    logInfo('collectDelegations: selected pool missing; rerouting to collectOperatorInput');
    return new Command({ goto: 'collectOperatorInput' });
  }

  const delegatorAddress = normalizeHexAddress(operatorInput.walletAddress, 'delegator wallet address');
  const delegateeAddress = MOCK_AGENT_WALLET_ADDRESS;

  const request: DelegationSigningInterrupt = {
    type: 'clmm-delegation-signing-request',
    message:
      'Review and approve the permissions needed to manage your mock liquidity position.',
    payloadSchema: z.toJSONSchema(DelegationSigningResponseJsonSchema),
    chainId: ARBITRUM_CHAIN_ID,
    delegationManager: MOCK_DELEGATION_MANAGER,
    delegatorAddress,
    delegateeAddress,
    delegationsToSign: buildMockDelegations(delegatorAddress),
    descriptions: [...MOCK_DELEGATION_DESCRIPTIONS],
    warnings: [...MOCK_DELEGATION_WARNINGS],
  };

  const awaitingInput = buildTaskStatus(
    state.thread.task,
    'input-required',
    'Waiting for delegation approval to continue onboarding.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: { step: 3, key: DELEGATION_STEP_KEY },
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: state.thread.activity.telemetry },
  };
  const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
    currentTaskState: state.thread.task?.taskStatus?.state,
    currentTaskMessage: state.thread.task?.taskStatus?.message?.content,
    currentOnboardingKey: state.thread.onboarding?.key,
    nextOnboardingKey: pendingView.onboarding.key,
    nextTaskMessage: awaitingMessage,
  });
  if (shouldPersistPendingState) {
    const mergedView = applyThreadPatch(state, pendingView);
    await copilotkitEmitState(config, {
      thread: mergedView,
    });
  }

  const interruptResult = await requestInterruptPayload({
    request,
    interrupt,
  });
  const parsed = DelegationSigningResponseSchema.safeParse(interruptResult.decoded);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid delegation signing response: ${issues}`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedView = applyThreadPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      onboarding: { step: 3, key: DELEGATION_STEP_KEY },
    });
    return {
      thread: haltedView,
    };
  }

  if (parsed.data.outcome === 'rejected') {
    const { task, statusEvent } = buildTaskStatus(
      awaitingInput.task,
      'failed',
      'Delegation signing was rejected. The agent will not proceed.',
    );
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedView = applyThreadPatch(state, {
      haltReason: 'Delegation signing rejected by user.',
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      profile: state.thread.profile,
      metrics: state.thread.metrics,
      transactionHistory: state.thread.transactionHistory,
    });
    return new Command({
      update: {
        thread: haltedView,
      },
      goto: 'summarize',
    });
  }

  const signedDelegations = parsed.data.signedDelegations as unknown as SignedDelegation[];

  const delegationBundle: DelegationBundle = {
    chainId: ARBITRUM_CHAIN_ID,
    delegationManager: MOCK_DELEGATION_MANAGER,
    delegatorAddress,
    delegateeAddress,
    delegations: signedDelegations,
    intents: [...MOCK_INTENTS],
    descriptions: [...MOCK_DELEGATION_DESCRIPTIONS],
    warnings: [...MOCK_DELEGATION_WARNINGS],
  };

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Delegations signed. Continuing onboarding.',
  );
  const workingView = applyThreadPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
  });
  await copilotkitEmitState(config, {
    thread: workingView,
  });

  const completedView = applyThreadPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    delegationBundle,
    onboarding: { step: 3, key: DELEGATION_STEP_KEY },
  });
  return {
    thread: completedView,
  };
};
