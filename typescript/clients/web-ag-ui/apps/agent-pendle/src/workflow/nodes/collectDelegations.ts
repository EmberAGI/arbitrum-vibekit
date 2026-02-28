import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { createDelegation, getDeleGatorEnvironment } from '@metamask/delegation-toolkit';
import { requestInterruptPayload, shouldPersistInputRequiredCheckpoint } from 'agent-workflow-core';
import { z } from 'zod';

import type { Token, TokenizedYieldMarket } from '../../clients/onchainActions.js';
import {
  ARBITRUM_CHAIN_ID,
  resolvePendleChainIds,
  resolveStablecoinWhitelist,
} from '../../config/constants.js';
import { getAgentWalletAddress, getOnchainActionsClient } from '../clientFactory.js';
import {
  applyThreadPatch,
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

const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

const resolveDelegationOnboarding = (state: ClmmState): OnboardingState => {
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

const ERC20_APPROVE_SELECTOR = '0x095ea7b3' as const;
const PENDLE_ROUTER_TARGET_BY_CHAIN: Record<number, `0x${string}`> = {
  [ARBITRUM_CHAIN_ID]: '0x888888888889758f76e7103c6cbf23abbf58f946',
};

const PENDLE_FULL_LIFECYCLE_SELECTORS = {
  buyPt: '0xc81f847a',
  sellPt: '0x594a88cc',
  redeemPt: '0x47f1de22',
  redeemPtPostExpiry: '0xf06a07a0',
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
    delegationsBypassActive: state.thread.delegationsBypassActive === true,
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
  });

  if (state.thread.delegationsBypassActive === true) {
    const bypassView = applyThreadPatch(state, {
      delegationsBypassActive: true,
      onboarding: delegationOnboarding,
    });
    return {
      thread: bypassView,
    };
  }

  if (state.thread.delegationBundle) {
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
    return new Command({ goto: 'collectSetupInput' });
  }
  const fundingTokenInput = state.thread.fundingTokenInput;
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
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
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
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
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

  request.delegationManager = delegationManager ?? request.delegationManager;
  request.delegationsToSign = delegationToSign ? [delegationToSign] : [];
  request.descriptions = [
    'Allow the agent to approve stablecoins and execute Pendle strategy transactions on your behalf.',
  ];

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
      onboarding: delegationOnboarding,
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
  if (signedDelegations.length !== 1) {
    const failureMessage = `Delegation signing returned unexpected count (expected=1, got=${signedDelegations.length})`;
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
