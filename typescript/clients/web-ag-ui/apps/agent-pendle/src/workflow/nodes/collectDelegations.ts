import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { createDelegation, getDeleGatorEnvironment } from '@metamask/delegation-toolkit';
import { parseUnits } from 'viem';
import { z } from 'zod';

import {
  ARBITRUM_CHAIN_ID,
  resolvePendleChainIds,
  resolveStablecoinWhitelist,
} from '../../config/constants.js';
import { buildEligibleYieldTokens } from '../../core/pendleMarkets.js';
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

const ONBOARDING: Pick<OnboardingState, 'key' | 'totalSteps'> = {
  totalSteps: 3,
};

const ERC20_APPROVE_SELECTOR = '0x095ea7b3' as const;

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

    const eligible = buildEligibleYieldTokens({
      markets,
      supportedTokens: tokens,
      whitelistSymbols: resolveStablecoinWhitelist(),
    });
    const selectedMarketAddress =
      eligible[0]?.marketAddress ??
      markets[0]?.marketIdentifier.address;
    const selectedMarket = selectedMarketAddress
      ? markets.find((market) => market.marketIdentifier.address.toLowerCase() === selectedMarketAddress.toLowerCase()) ??
        markets[0]
      : markets[0];
    if (!selectedMarket) {
      throw new Error('No tokenized yield markets available for delegation planning');
    }

    const stablecoinSymbols = new Set(resolveStablecoinWhitelist().map((symbol) => symbol.toLowerCase()));
    const stablecoinTargets = tokens
      .filter((token) => stablecoinSymbols.has(token.symbol.toLowerCase()))
      .map((token) => normalizeHexAddress(token.tokenUid.address, 'stablecoin token address'));

    const sampleWallet = delegatorAddress;
    const chainId = selectedMarket.marketIdentifier.chainId;
    // Use a realistic, non-dust amount; Pendle routing rejects tiny swaps/quotes.
    const baseContributionUsd =
      typeof operatorInput.baseContributionUsd === 'number' && Number.isFinite(operatorInput.baseContributionUsd)
        ? operatorInput.baseContributionUsd
        : 10;

    // Collect a representative set of transaction targets+selectors that the agent will use,
    // but generate *one* delegation signature that covers all of them.
    const fundingTokenInput = state.view.fundingTokenInput;
    if (!fundingTokenInput) {
      throw new Error('Funding token input missing before delegation planning');
    }
    const fundingTokenAddress = normalizeHexAddress(
      fundingTokenInput.fundingTokenAddress,
      'funding token address',
    );
    const fundingToken = tokens.find(
      (token) => token.tokenUid.address.toLowerCase() === fundingTokenAddress.toLowerCase(),
    );
    const sampleAmount = parseUnits(baseContributionUsd.toString(), fundingToken?.decimals ?? 18).toString();
    const onePtBaseUnits = parseUnits('1', selectedMarket.ptToken.decimals).toString();

    const plans = await Promise.all([
      onchainActionsClient.createTokenizedYieldBuyPt({
        walletAddress: sampleWallet,
        marketAddress: selectedMarket.marketIdentifier.address,
        inputTokenUid: { chainId, address: fundingTokenAddress },
        amount: sampleAmount,
        slippage: '0.01',
      }),
      onchainActionsClient.createTokenizedYieldSellPt({
        walletAddress: sampleWallet,
        ptTokenUid: selectedMarket.ptToken.tokenUid,
        amount: onePtBaseUnits,
        slippage: '0.01',
      }),
      onchainActionsClient.createTokenizedYieldRedeemPt({
        walletAddress: sampleWallet,
        ptTokenUid: selectedMarket.ptToken.tokenUid,
        amount: onePtBaseUnits,
      }),
      onchainActionsClient.createTokenizedYieldClaimRewards({
        walletAddress: sampleWallet,
        ytTokenUid: selectedMarket.ytToken.tokenUid,
      }),
    ]);

    const plannedTransactions = plans.flatMap((plan) => plan.transactions);
    const plannedIntents = plannedTransactions
      .map((tx) => ({
        target: normalizeHexAddress(tx.to, 'planned transaction target'),
        selector: tx.data.slice(0, 10).toLowerCase() as `0x${string}`,
      }))
      // Keep approvals: unwinds/rebalances frequently require approving PT (and other) tokens,
      // and filtering these out causes delegated execution to fail at runtime.

    const intentKey = (intent: { target: `0x${string}`; selector: `0x${string}` }) =>
      `${intent.target.toLowerCase()}:${intent.selector.toLowerCase()}`;
    const unique = new Map<string, { target: `0x${string}`; selector: `0x${string}` }>();
    for (const intent of plannedIntents) {
      unique.set(intentKey(intent), intent);
    }

    // Stablecoin approvals (covers funding token changes and rebalancing flows without re-signing).
    for (const tokenAddress of stablecoinTargets) {
      unique.set(intentKey({ target: tokenAddress, selector: ERC20_APPROVE_SELECTOR }), {
        target: tokenAddress,
        selector: ERC20_APPROVE_SELECTOR,
      });
    }

    delegationIntents = [...unique.values()].map((intent) => ({
      target: intent.target,
      selector: intent.selector,
      allowedCalldata: [],
    }));

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
          onboarding: { ...ONBOARDING, step: 3 },
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
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          onboarding: { ...ONBOARDING, step: 3 },
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
          onboarding: { ...ONBOARDING, step: 3 },
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
      onboarding: { ...ONBOARDING, step: 3 },
    },
  };
};
