import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { type Command, interrupt } from '@langchain/langgraph';
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit';
import {
  buildInterruptPauseTransition,
  requestInterruptPayload,
  shouldPersistInputRequiredCheckpoint,
} from 'pi-runtime-legacy-contracts';
import { z } from 'zod';

import {
  ARBITRUM_CHAIN_ID,
  resolveAgentWalletAddress,
  resolveGmxAlloraMode,
} from '../../config/constants.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  logInfo,
  logPauseSnapshot,
  logWarn,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type DelegationBundle,
  type DelegationSigningInterrupt,
  type OnboardingState,
  type SignedDelegation,
} from '../context.js';
import { createLangGraphCommand } from '../langGraphCommandFactory.js';
import {
  DELEGATION_DESCRIPTIONS,
  DELEGATION_INTENTS,
  DELEGATION_WARNINGS,
  buildDelegations,
} from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

const resolveDelegationOnboarding = (state: ClmmState): OnboardingState | undefined => {
  if (state.thread.operatorConfig || state.thread.onboardingFlow?.status === 'completed') {
    return state.thread.onboarding;
  }
  if (state.thread.delegationsBypassActive === true) {
    return { step: 2, key: FUNDING_STEP_KEY };
  }
  if (state.thread.onboarding?.key === FUNDING_STEP_KEY) {
    return { step: 3, key: DELEGATION_STEP_KEY };
  }
  if (state.thread.onboarding?.key === DELEGATION_STEP_KEY) {
    return state.thread.onboarding;
  }
  return { step: 2, key: DELEGATION_STEP_KEY };
};

function readConfigString(
  config: CopilotKitConfig,
  key: 'thread_id' | 'checkpoint_id' | 'checkpoint_ns',
): string | undefined {
  const root = config as { configurable?: unknown };
  if (!root.configurable || typeof root.configurable !== 'object') {
    return undefined;
  }
  const configurable = root.configurable as Record<string, unknown>;
  const value = configurable[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

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

function normalizeDelegationSignature(signature: `0x${string}`): `0x${string}` {
  const bytesLength = (signature.length - 2) / 2;
  if (bytesLength === 66) {
    const prefixByte = Number.parseInt(signature.slice(2, 4), 16);
    if (prefixByte === 65) {
      return `0x${signature.slice(4)}`;
    }
  }
  return signature;
}

export const collectDelegationsNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const runMetadata = {
    threadId: readConfigString(config, 'thread_id'),
    checkpointId: readConfigString(config, 'checkpoint_id'),
    checkpointNamespace: readConfigString(config, 'checkpoint_ns'),
  };
  const delegationOnboarding = resolveDelegationOnboarding(state);
  const taskState = state.thread.task?.taskStatus?.state;
  const taskMessage = state.thread.task?.taskStatus?.message?.content;
  const isAwaitingDelegationInput =
    taskState === 'input-required' &&
    typeof taskMessage === 'string' &&
    taskMessage.toLowerCase().includes('delegation approval');
  logInfo('collectDelegations: entering node', {
    ...runMetadata,
    delegationsBypassActive: state.thread.delegationsBypassActive === true,
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
  });
  logWarn('collectDelegations: node entered', {
    ...runMetadata,
    onboardingStatus: state.thread.onboardingFlow?.status,
    onboardingStep: state.thread.onboarding?.step,
    onboardingKey: state.thread.onboarding?.key,
    delegationsBypassActive: state.thread.delegationsBypassActive === true,
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
    hasOperatorInput: Boolean(state.thread.operatorInput),
    hasFundingTokenInput: Boolean(state.thread.fundingTokenInput),
    isAwaitingDelegationInput,
  });

  if (!delegationOnboarding) {
    logInfo('collectDelegations: onboarding already complete; skipping stale delegation update', {
      onboardingStatus: state.thread.onboardingFlow?.status,
      hasOperatorConfig: Boolean(state.thread.operatorConfig),
    });
    return {};
  }

  if (state.thread.delegationsBypassActive === true) {
    logInfo('collectDelegations: bypass active, skipping delegation collection', {
      onboardingStep: delegationOnboarding.step,
      onboardingKey: delegationOnboarding.key,
    });
    const bypassView = applyThreadPatch(state, {
      delegationsBypassActive: true,
      onboarding: delegationOnboarding,
    });
    return {
      thread: bypassView,
    };
  }

  if (state.thread.delegationBundle) {
    logInfo('collectDelegations: delegation bundle already present', {
      onboardingStep: delegationOnboarding.step,
      onboardingKey: delegationOnboarding.key,
      currentTaskState: state.thread.task?.taskStatus?.state,
      currentTaskMessage: state.thread.task?.taskStatus?.message?.content,
    });
    if (state.thread.task?.taskStatus.state === 'input-required') {
      const { task, statusEvent } = buildTaskStatus(
        state.thread.task,
        'working',
        'Delegation approvals received. Continuing onboarding.',
      );
      const resumedView = applyThreadPatch(state, {
        delegationBundle: state.thread.delegationBundle,
        onboarding: delegationOnboarding,
        task,
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      });
      return {
        thread: resumedView,
      };
    }

    const delegatedView = applyThreadPatch(state, {
      delegationBundle: state.thread.delegationBundle,
      onboarding: delegationOnboarding,
    });
    return {
      thread: delegatedView,
    };
  }

  const operatorInput = state.thread.operatorInput;
  if (!operatorInput) {
    logInfo('collectDelegations: setup input missing; rerouting to collectSetupInput');
    return {};
  }

  const delegatorAddress = normalizeHexAddress(
    operatorInput.walletAddress,
    'delegator wallet address',
  );
  const mode = state.private.mode ?? resolveGmxAlloraMode();
  const warnings = mode === 'debug' ? [...DELEGATION_WARNINGS] : [];
  const delegateeAddress = resolveAgentWalletAddress();
  const { DelegationManager } = getDeleGatorEnvironment(ARBITRUM_CHAIN_ID);
  const delegationManager = normalizeHexAddress(DelegationManager, 'delegation manager');

  const request: DelegationSigningInterrupt = {
    type: 'gmx-delegation-signing-request',
    message: 'Review and approve the permissions needed to manage your GMX perps.',
    payloadSchema: z.toJSONSchema(DelegationSigningResponseJsonSchema),
    chainId: ARBITRUM_CHAIN_ID,
    delegationManager,
    delegatorAddress,
    delegateeAddress,
    delegationsToSign: buildDelegations({ delegatorAddress, delegateeAddress }),
    descriptions: [...DELEGATION_DESCRIPTIONS],
    warnings,
  };

  const awaitingInput = buildTaskStatus(
    state.thread.task,
    'input-required',
    'Waiting for delegation approval to continue onboarding.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: delegationOnboarding,
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: state.thread.activity.telemetry },
  };
  const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
    currentTaskState: state.thread.task?.taskStatus?.state,
    currentTaskMessage: state.thread.task?.taskStatus?.message?.content,
    currentOnboardingKey: state.thread.onboarding?.key,
    nextOnboardingKey: delegationOnboarding.key,
    nextTaskMessage: awaitingMessage,
  });
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  logInfo('collectDelegations: pause transition prepared', {
    ...runMetadata,
    hasRunnableConfig,
    shouldPersistPendingState,
    isAwaitingDelegationInput,
    currentOnboardingStep: state.thread.onboarding?.step,
    currentOnboardingKey: state.thread.onboarding?.key,
    nextOnboardingStep: delegationOnboarding.step,
    nextOnboardingKey: delegationOnboarding.key,
  });
  const pauseSnapshotView = applyThreadPatch(state, pendingView);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = pauseSnapshotView;
    logPauseSnapshot({
      node: 'collectDelegations',
      reason: 'awaiting delegation signing',
      thread: mergedView,
      metadata: {
        pauseMechanism: 'checkpoint-and-interrupt',
        ...runMetadata,
        hasRunnableConfig,
        shouldPersistPendingState,
        isAwaitingDelegationInput,
      },
    });
    await copilotkitEmitState(config, {
      thread: mergedView,
    });
    return buildInterruptPauseTransition({
      node: 'collectDelegations',
      update: {
        thread: {
          ...pendingView,
          onboardingFlow: mergedView.onboardingFlow,
        },
      },
      createCommand: createLangGraphCommand,
    });
  }
  if (shouldPersistPendingState) {
    const mergedView = pauseSnapshotView;
    await copilotkitEmitState(config, {
      thread: mergedView,
    });
  }
  logPauseSnapshot({
    node: 'collectDelegations',
    reason: 'awaiting delegation signing',
    thread: pauseSnapshotView,
    metadata: {
      pauseMechanism: 'interrupt',
      ...runMetadata,
      hasRunnableConfig,
      checkpointPersisted: shouldPersistPendingState,
      isAwaitingDelegationInput,
    },
  });

  const interruptResult = await requestInterruptPayload({
    request,
    interrupt,
  });
  logInfo('collectDelegations: interrupt payload received', {
    ...runMetadata,
    rawPayloadType: typeof interruptResult.raw,
    hasDecodedPayload: interruptResult.decoded !== undefined,
  });
  const parsed = DelegationSigningResponseSchema.safeParse(interruptResult.decoded);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid delegation signing response: ${issues}`;
    logWarn('collectDelegations: invalid delegation signing payload', {
      ...runMetadata,
      issues,
    });
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
      onboarding: delegationOnboarding,
    });
    return {
      thread: haltedView,
    };
  }

  if (parsed.data.outcome === 'rejected') {
    logWarn('collectDelegations: delegation signing rejected by user', {
      ...runMetadata,
    });
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
    return {
      thread: haltedView,
    };
  }

  const signedDelegations = parsed.data.signedDelegations.map((delegation) => ({
    ...delegation,
    signature: normalizeDelegationSignature(delegation.signature),
  })) as unknown as SignedDelegation[];

  const delegationBundle: DelegationBundle = {
    chainId: ARBITRUM_CHAIN_ID,
    delegationManager,
    delegatorAddress,
    delegateeAddress,
    delegations: signedDelegations,
    intents: [...DELEGATION_INTENTS],
    descriptions: [...DELEGATION_DESCRIPTIONS],
    warnings,
  };
  logInfo('collectDelegations: delegation signing accepted', {
    ...runMetadata,
    signedDelegationCount: delegationBundle.delegations.length,
  });

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
    onboarding: delegationOnboarding,
  });
  return {
    thread: completedView,
  };
};
