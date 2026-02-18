import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { getDeleGatorEnvironment } from '@metamask/delegation-toolkit';
import { z } from 'zod';

import {
  ARBITRUM_CHAIN_ID,
  resolveAgentWalletAddress,
  resolveGmxAlloraMode,
} from '../../config/constants.js';
import {
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
  DELEGATION_DESCRIPTIONS,
  DELEGATION_INTENTS,
  DELEGATION_WARNINGS,
  buildDelegations,
} from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FULL_ONBOARDING_TOTAL_STEPS = 3;

const resolveDelegationOnboarding = (state: ClmmState): OnboardingState => {
  const configuredTotalSteps = state.view.onboarding?.totalSteps;
  const totalSteps =
    typeof configuredTotalSteps === 'number' && configuredTotalSteps > 0
      ? configuredTotalSteps
      : FULL_ONBOARDING_TOTAL_STEPS;
  const step = totalSteps <= 2 ? 2 : 3;
  return { step, totalSteps };
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

  if (state.view.delegationsBypassActive === true) {
    return {
      view: {
        delegationsBypassActive: true,
        onboarding: delegationOnboarding,
      },
    };
  }

  if (state.view.delegationBundle) {
    if (state.view.task?.taskStatus.state === 'input-required') {
      const { task, statusEvent } = buildTaskStatus(
        state.view.task,
        'working',
        'Delegation approvals received. Continuing onboarding.',
      );
      return {
        view: {
          delegationBundle: state.view.delegationBundle,
          onboarding: delegationOnboarding,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        },
      };
    }

    return {
      view: {
        delegationBundle: state.view.delegationBundle,
        onboarding: delegationOnboarding,
      },
    };
  }

  const operatorInput = state.view.operatorInput;
  if (!operatorInput) {
    logInfo('collectDelegations: setup input missing; rerouting to collectSetupInput');
    return new Command({ goto: 'collectSetupInput' });
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
  const currentTaskState = state.view.task?.taskStatus?.state;
  const currentTaskMessage = state.view.task?.taskStatus?.message?.content;
  const shouldPersistPendingState =
    currentTaskState !== 'input-required' || currentTaskMessage !== awaitingMessage;
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = { ...state.view, ...pendingView };
    state.view = mergedView;
    await copilotkitEmitState(config, {
      view: mergedView,
    });
    return new Command({
      update: {
        view: mergedView,
      },
      goto: 'collectDelegations',
    });
  }

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
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        onboarding: delegationOnboarding,
      },
    };
  }

  if (parsed.data.outcome === 'rejected') {
    const { task, statusEvent } = buildTaskStatus(
      awaitingInput.task,
      'rejected',
      'Delegation signing was rejected. The agent will not proceed.',
    );
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: 'Delegation signing rejected by user.',
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
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
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
  });

  return {
    view: {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      delegationBundle,
      onboarding: delegationOnboarding,
    },
  };
};
