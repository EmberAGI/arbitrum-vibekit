import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { type Command, interrupt } from '@langchain/langgraph';
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit';
import { buildInterruptPauseTransition, shouldPersistInputRequiredCheckpoint } from 'agent-workflow-core';
import { z } from 'zod';

import {
  ARBITRUM_CHAIN_ID,
  resolveAgentWalletAddress,
  resolveGmxAlloraMode,
} from '../../config/constants.js';
import {
  applyViewPatch,
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

const resolveDelegationOnboarding = (state: ClmmState): OnboardingState => {
  if (state.view.delegationsBypassActive === true) {
    return { step: 2, key: FUNDING_STEP_KEY };
  }
  if (state.view.onboarding?.key === FUNDING_STEP_KEY) {
    return { step: 3, key: DELEGATION_STEP_KEY };
  }
  if (state.view.onboarding?.key === DELEGATION_STEP_KEY) {
    return state.view.onboarding;
  }
  return { step: 2, key: DELEGATION_STEP_KEY };
};

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
  const delegationOnboarding = resolveDelegationOnboarding(state);
  logInfo('collectDelegations: entering node', {
    delegationsBypassActive: state.view.delegationsBypassActive === true,
    hasDelegationBundle: Boolean(state.view.delegationBundle),
  });
  logWarn('collectDelegations: node entered', {
    onboardingStatus: state.view.onboardingFlow?.status,
    onboardingStep: state.view.onboarding?.step,
    onboardingKey: state.view.onboarding?.key,
    delegationsBypassActive: state.view.delegationsBypassActive === true,
    hasDelegationBundle: Boolean(state.view.delegationBundle),
    hasOperatorInput: Boolean(state.view.operatorInput),
    hasFundingTokenInput: Boolean(state.view.fundingTokenInput),
  });

  if (state.view.delegationsBypassActive === true) {
    logInfo('collectDelegations: bypass active, skipping delegation collection', {
      onboardingStep: delegationOnboarding.step,
      onboardingKey: delegationOnboarding.key,
    });
    const bypassView = applyViewPatch(state, {
      delegationsBypassActive: true,
      onboarding: delegationOnboarding,
    });
    return {
      view: bypassView,
    };
  }

  if (state.view.delegationBundle) {
    logInfo('collectDelegations: delegation bundle already present', {
      onboardingStep: delegationOnboarding.step,
      onboardingKey: delegationOnboarding.key,
      currentTaskState: state.view.task?.taskStatus?.state,
      currentTaskMessage: state.view.task?.taskStatus?.message?.content,
    });
    if (state.view.task?.taskStatus.state === 'input-required') {
      const { task, statusEvent } = buildTaskStatus(
        state.view.task,
        'working',
        'Delegation approvals received. Continuing onboarding.',
      );
      const resumedView = applyViewPatch(state, {
        delegationBundle: state.view.delegationBundle,
        onboarding: delegationOnboarding,
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      });
      return {
        view: resumedView,
      };
    }

    const delegatedView = applyViewPatch(state, {
      delegationBundle: state.view.delegationBundle,
      onboarding: delegationOnboarding,
    });
    return {
      view: delegatedView,
    };
  }

  const operatorInput = state.view.operatorInput;
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
    state.view.task,
    'input-required',
    'Waiting for delegation approval to continue onboarding.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: delegationOnboarding,
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: state.view.activity.telemetry },
  };
  const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
    currentTaskState: state.view.task?.taskStatus?.state,
    currentTaskMessage: state.view.task?.taskStatus?.message?.content,
    currentOnboardingKey: state.view.onboarding?.key,
    nextOnboardingKey: delegationOnboarding.key,
    nextTaskMessage: awaitingMessage,
  });
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  const pauseSnapshotView = applyViewPatch(state, pendingView);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = pauseSnapshotView;
    logPauseSnapshot({
      node: 'collectDelegations',
      reason: 'awaiting delegation signing',
      view: mergedView,
      metadata: {
        pauseMechanism: 'checkpoint-and-interrupt',
      },
    });
    await copilotkitEmitState(config, {
      view: mergedView,
    });
    return buildInterruptPauseTransition({
      node: 'collectDelegations',
      update: {
        view: mergedView,
      },
      createCommand: createLangGraphCommand,
    });
  }
  if (shouldPersistPendingState) {
    const mergedView = pauseSnapshotView;
    await copilotkitEmitState(config, {
      view: mergedView,
    });
  }
  logPauseSnapshot({
    node: 'collectDelegations',
    reason: 'awaiting delegation signing',
    view: pauseSnapshotView,
    metadata: {
      pauseMechanism: 'interrupt',
      checkpointPersisted: shouldPersistPendingState,
    },
  });

  const incoming: unknown = await interrupt(request);

  let inputToParse: unknown = incoming;
  if (typeof incoming === 'string') {
    try {
      inputToParse = JSON.parse(incoming);
    } catch {
      // ignore
    }
  }

  const parsed = DelegationSigningResponseSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid delegation signing response: ${issues}`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    const failedView = applyViewPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      view: failedView,
    });
    const haltedView = applyViewPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      onboarding: delegationOnboarding,
    });
    return {
      view: haltedView,
    };
  }

  if (parsed.data.outcome === 'rejected') {
    const { task, statusEvent } = buildTaskStatus(
      awaitingInput.task,
      'failed',
      'Delegation signing was rejected. The agent will not proceed.',
    );
    const failedView = applyViewPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      view: failedView,
    });
    const haltedView = applyViewPatch(state, {
      haltReason: 'Delegation signing rejected by user.',
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      profile: state.view.profile,
      metrics: state.view.metrics,
      transactionHistory: state.view.transactionHistory,
    });
    return {
      view: haltedView,
    };
  }

  const signedDelegations = parsed.data.signedDelegations as unknown as SignedDelegation[];

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

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Delegations signed. Continuing onboarding.',
  );
  const workingView = applyViewPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
  });
  await copilotkitEmitState(config, {
    view: workingView,
  });

  const completedView = applyViewPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    delegationBundle,
    onboarding: delegationOnboarding,
  });
  return {
    view: completedView,
  };
};
