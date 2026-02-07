import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { z } from 'zod';

import { ARBITRUM_CHAIN_ID } from '../../config/constants.js';
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
  AGENT_WALLET_ADDRESS,
  DELEGATION_DESCRIPTIONS,
  DELEGATION_INTENTS,
  DELEGATION_MANAGER,
  DELEGATION_WARNINGS,
  buildDelegations,
} from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const ONBOARDING: Pick<OnboardingState, 'key' | 'totalSteps'> = {
  totalSteps: 3,
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
  logInfo('collectDelegations: entering node', {
    delegationsBypassActive: state.view.delegationsBypassActive === true,
    hasDelegationBundle: Boolean(state.view.delegationBundle),
  });

  if (state.view.delegationsBypassActive === true) {
    return {
      view: {
        delegationsBypassActive: true,
        onboarding: { ...ONBOARDING, step: 3 },
      },
    };
  }

  if (state.view.delegationBundle) {
    return {
      view: {
        delegationBundle: state.view.delegationBundle,
        onboarding: { ...ONBOARDING, step: 3 },
      },
    };
  }

  const operatorInput = state.view.operatorInput;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Setup input missing before delegation step';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: [] },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const delegatorAddress = normalizeHexAddress(
    operatorInput.walletAddress,
    'delegator wallet address',
  );
  const delegateeAddress = AGENT_WALLET_ADDRESS;

  const request: DelegationSigningInterrupt = {
    type: 'gmx-delegation-signing-request',
    message: 'Review and approve the permissions needed to manage your GMX perps.',
    payloadSchema: z.toJSONSchema(DelegationSigningResponseJsonSchema),
    chainId: ARBITRUM_CHAIN_ID,
    delegationManager: DELEGATION_MANAGER,
    delegatorAddress,
    delegateeAddress,
    delegationsToSign: buildDelegations(delegatorAddress),
    descriptions: [...DELEGATION_DESCRIPTIONS],
    warnings: [...DELEGATION_WARNINGS],
  };

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'input-required',
    'Waiting for delegation approval to continue onboarding.',
  );
  await copilotkitEmitState(config, {
    view: {
      onboarding: { ...ONBOARDING, step: 3 },
      task: awaitingInput.task,
      activity: { events: [awaitingInput.statusEvent], telemetry: state.view.activity.telemetry },
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
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        onboarding: { ...ONBOARDING, step: 3 },
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
    delegationManager: DELEGATION_MANAGER,
    delegatorAddress,
    delegateeAddress,
    delegations: signedDelegations,
    intents: [...DELEGATION_INTENTS],
    descriptions: [...DELEGATION_DESCRIPTIONS],
    warnings: [...DELEGATION_WARNINGS],
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
      onboarding: { ...ONBOARDING, step: 3 },
    },
  };
};
