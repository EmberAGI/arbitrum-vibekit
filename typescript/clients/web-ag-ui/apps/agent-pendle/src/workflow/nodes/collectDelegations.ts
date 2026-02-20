import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { createDelegation, getDeleGatorEnvironment } from '@metamask/delegation-toolkit';
import { z } from 'zod';

import type { Token, TokenizedYieldMarket } from '../../clients/onchainActions.js';
import {
  ARBITRUM_CHAIN_ID,
  resolvePendleChainIds,
  resolveStablecoinWhitelist,
} from '../../config/constants.js';
import { getAgentWalletAddress, getOnchainActionsClient } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type DelegationBundle,
  type DelegationIntentSummary,
  type DelegationSigningInterrupt,
  type OnboardingState,
  type SignedDelegation,
} from '../context.js';

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

const ERC20_APPROVE_SELECTOR = '0x095ea7b3' as const;
const PENDLE_ROUTER_TARGET_BY_CHAIN: Record<number, `0x${string}`> = {
  [ARBITRUM_CHAIN_ID]: '0x888888888889758f76e7103c6cbf23abbf58f946',
};

const PENDLE_FULL_LIFECYCLE_SELECTORS = {
  buyPt: '0xc81f847a',
  sellPt: '0x594a88cc',
  redeemPt: '0x47f1de22',
  claimRewards: '0x0741a803',
} as const;

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

type FunctionIntent = {
  target: `0x${string}`;
  selector: `0x${string}`;
};

const intentKey = (intent: FunctionIntent): string =>
  `${intent.target.toLowerCase()}:${intent.selector.toLowerCase()}`;

const resolvePendleRouterTarget = (chainId: number): `0x${string}` => {
  const target = PENDLE_ROUTER_TARGET_BY_CHAIN[chainId];
  if (!target) {
    throw new Error(`No Pendle router target configured for chain ${chainId}`);
  }
  return target;
};

const appendUniqueIntent = (unique: Map<string, FunctionIntent>, intent: FunctionIntent): void => {
  unique.set(intentKey(intent), intent);
};

const buildFullLifecycleDelegationIntents = (params: {
  markets: readonly TokenizedYieldMarket[];
  tokens: readonly Token[];
  fundingTokenAddress: `0x${string}`;
}): DelegationIntentSummary[] => {
  const unique = new Map<string, FunctionIntent>();
  const routerTarget = resolvePendleRouterTarget(ARBITRUM_CHAIN_ID);

  for (const selector of Object.values(PENDLE_FULL_LIFECYCLE_SELECTORS)) {
    appendUniqueIntent(unique, { target: routerTarget, selector });
  }

  const stablecoinSymbols = new Set(resolveStablecoinWhitelist().map((symbol) => symbol.toLowerCase()));
  const stablecoinTargets = params.tokens
    .filter((token) => stablecoinSymbols.has(token.symbol.toLowerCase()))
    .map((token) => normalizeHexAddress(token.tokenUid.address, 'stablecoin token address'));
  for (const target of stablecoinTargets) {
    appendUniqueIntent(unique, { target, selector: ERC20_APPROVE_SELECTOR });
  }

  appendUniqueIntent(unique, {
    target: params.fundingTokenAddress,
    selector: ERC20_APPROVE_SELECTOR,
  });

  for (const market of params.markets) {
    const ptTokenAddress = normalizeHexAddress(market.ptToken.tokenUid.address, 'pt token address');
    appendUniqueIntent(unique, { target: ptTokenAddress, selector: ERC20_APPROVE_SELECTOR });
  }

  const routerSelectorSet = new Set(
    [...unique.values()]
      .filter((intent) => intent.target.toLowerCase() === routerTarget.toLowerCase())
      .map((intent) => intent.selector.toLowerCase()),
  );
  const missingCapabilities = Object.entries(PENDLE_FULL_LIFECYCLE_SELECTORS).flatMap(([capability, selector]) =>
    routerSelectorSet.has(selector.toLowerCase()) ? [] : [capability],
  );
  if (missingCapabilities.length > 0) {
    throw new Error(
      `Missing required delegation capabilities: ${missingCapabilities.join(', ')}`,
    );
  }

  return [...unique.values()].map((intent) => ({
    target: intent.target,
    selector: intent.selector,
    allowedCalldata: [],
  }));
};

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
  const fundingTokenInput = state.view.fundingTokenInput;
  if (!fundingTokenInput) {
    logInfo('collectDelegations: funding token input missing; rerouting to collectFundingTokenInput');
    return new Command({ goto: 'collectFundingTokenInput' });
  }

  const delegatorAddress = normalizeHexAddress(operatorInput.walletAddress, 'delegator wallet address');
  let delegateeAddress: `0x${string}`;
  try {
    delegateeAddress = getAgentWalletAddress();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Unable to resolve agent wallet address: ${message}`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
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

  const request: DelegationSigningInterrupt = {
    type: 'pendle-delegation-signing-request',
    message: 'Review and approve the permissions needed to manage your Pendle position.',
    payloadSchema: z.toJSONSchema(DelegationSigningResponseJsonSchema),
    chainId: ARBITRUM_CHAIN_ID,
    delegationManager: '0x0000000000000000000000000000000000000000',
    delegatorAddress,
    delegateeAddress,
    delegationsToSign: [],
    descriptions: [],
    warnings: [],
  };

  const onchainActionsClient = getOnchainActionsClient();
  let delegationIntents: DelegationIntentSummary[] = [];
  let delegationToSign;
  let delegationManager: `0x${string}` | undefined;
  try {
    const chainIds = resolvePendleChainIds();
    const [markets, tokens] = await Promise.all([
      onchainActionsClient.listTokenizedYieldMarkets({ chainIds }),
      onchainActionsClient.listTokens({ chainIds }),
    ]);
    if (markets.length === 0) {
      throw new Error('No tokenized yield markets available for delegation planning');
    }

    const fundingTokenAddress = normalizeHexAddress(
      fundingTokenInput.fundingTokenAddress,
      'funding token address',
    );
    delegationIntents = buildFullLifecycleDelegationIntents({
      markets,
      tokens,
      fundingTokenAddress,
    });

    if (delegationIntents.length === 0) {
      throw new Error('No delegation intents generated for Pendle');
    }

    const environment = getDeleGatorEnvironment(ARBITRUM_CHAIN_ID);
    delegationManager = environment.DelegationManager;

    const targets = [...new Set(delegationIntents.map((intent) => intent.target))];
    const selectors = [...new Set(delegationIntents.map((intent) => intent.selector))];

    const unsignedDelegation = createDelegation({
      scope: {
        type: 'functionCall',
        targets,
        selectors,
      },
      to: delegateeAddress,
      from: delegatorAddress,
      environment,
    });

    delegationToSign = {
      delegate: unsignedDelegation.delegate,
      delegator: unsignedDelegation.delegator,
      authority: unsignedDelegation.authority,
      caveats: unsignedDelegation.caveats,
      salt: unsignedDelegation.salt,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Unable to prepare delegation request: ${message}`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          onboarding: delegationOnboarding,
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  request.delegationManager = delegationManager ?? request.delegationManager;
  request.delegationsToSign = delegationToSign ? [delegationToSign] : [];
  request.descriptions = [
    'Allow the agent to approve stablecoins and execute Pendle strategy transactions on your behalf.',
  ];

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
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          onboarding: delegationOnboarding,
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  if (parsed.data.outcome === 'rejected') {
    const { task, statusEvent } = buildTaskStatus(
      awaitingInput.task,
      'failed',
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
  if (signedDelegations.length !== 1) {
    const failureMessage = `Delegation signing returned unexpected count (expected=1, got=${signedDelegations.length})`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          onboarding: delegationOnboarding,
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const delegationBundle: DelegationBundle = {
    chainId: ARBITRUM_CHAIN_ID,
    delegationManager: request.delegationManager,
    delegatorAddress,
    delegateeAddress,
    delegations: signedDelegations,
    intents: delegationIntents,
    descriptions: [...request.descriptions],
    warnings: [...request.warnings],
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
