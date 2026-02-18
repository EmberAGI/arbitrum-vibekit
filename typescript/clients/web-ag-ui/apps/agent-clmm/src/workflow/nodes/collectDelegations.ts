import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { decodeFunctionData, encodeFunctionData, erc20Abi, parseUnits } from 'viem';
import { z } from 'zod';

import {
  EmberApiRequestError,
  formatEmberApiError,
  type ClmmRebalanceRequest,
  type ClmmSwapRequest,
  type TransactionInformation,
} from '../../clients/emberApi.js';
import {
  ARBITRUM_CHAIN_ID,
  CAMELOT_POSITION_MANAGER_ADDRESS,
  DEFAULT_TICK_BANDWIDTH_BPS,
} from '../../config/constants.js';
import { buildRange, deriveMidPrice } from '../../core/decision-engine.js';
import {
  buildDelegationRequestBundle,
  decodeFundAndRunMulticallFunding,
  type DelegationIntent,
  EmberEvmTransactionSchema,
  type EmberEvmTransaction,
} from '../../delegations/emberDelegations.js';
import { getCamelotClient } from '../clientFactory.js';
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
  type UnsignedDelegation,
} from '../context.js';
import { estimateTokenAllocationsUsd } from '../planning/allocations.js';
import { loadBootstrapContext } from '../store.js';

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

const MAX_UINT256 = 2n ** 256n - 1n;

const HexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/u)
  .transform((value) => value.toLowerCase() as `0x${string}`);

// NOTE: CopilotKit expects `payloadSchema` to be representable as JSON Schema.
// Zod transforms cannot be represented in JSON Schema, so we provide a parallel schema
// without transforms for the UI metadata.
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

function isDelegationsBypassActive(): boolean {
  return process.env['DELEGATIONS_BYPASS'] === 'true';
}

function minNonZero(value: bigint): bigint {
  return value > 0n ? value : 1n;
}

function asEmberTransactions(transactions: TransactionInformation[]): EmberEvmTransaction[] {
  return z.array(EmberEvmTransactionSchema).parse(transactions);
}

function stableTokenDecimals(address: `0x${string}`): number | null {
  const normalized = address.toLowerCase();
  switch (normalized) {
    case '0xaf88d065e77c8cc2239327c5edb3a432268e5831': // USDC
    case '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': // USDC.e
    case '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': // USDT
      return 6;
    case '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': // DAI
      return 18;
    default:
      return null;
  }
}

function buildApproveTransaction(params: {
  tokenAddress: `0x${string}`;
  spender: `0x${string}`;
  chainId: string;
}): TransactionInformation {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.spender, MAX_UINT256],
  });
  return {
    type: 'EVM_TX',
    to: params.tokenAddress,
    data,
    value: '0',
    chainId: params.chainId,
  };
}

function hasApproveTransaction(params: {
  transactions: readonly TransactionInformation[];
  tokenAddress: `0x${string}`;
  spender: `0x${string}`;
}): boolean {
  const token = params.tokenAddress.toLowerCase();
  const spender = params.spender.toLowerCase();
  return params.transactions.some((tx) => {
    if (tx.to.toLowerCase() !== token) {
      return false;
    }
    if (!tx.data.startsWith('0x095ea7b3')) {
      return false;
    }
    try {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
      if (decoded.functionName !== 'approve') {
        return false;
      }
      const decodedSpender = decoded.args?.[0];
      return (
        typeof decodedSpender === 'string' &&
        decodedSpender.toLowerCase() === spender
      );
    } catch {
      return false;
    }
  });
}

function buildFundingApprovalsFromSwapPlan(params: {
  transactions: readonly TransactionInformation[];
  chainId: string;
}): TransactionInformation[] {
  const approvals: TransactionInformation[] = [];
  const seen = new Set<string>();

  for (const tx of params.transactions) {
    const data = tx.data;
    const funding = decodeFundAndRunMulticallFunding(data);
    if (!funding) {
      continue;
    }
    const spender = tx.to.toLowerCase() as `0x${string}`;
    const token = funding.fundingToken.toLowerCase() as `0x${string}`;
    const key = `${token}:${spender}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (hasApproveTransaction({ transactions: params.transactions, tokenAddress: token, spender })) {
      continue;
    }
    approvals.push(buildApproveTransaction({ tokenAddress: token, spender, chainId: params.chainId }));
  }

  return approvals;
}

function stableTokenLabel(address: string): string | null {
  const normalized = address.toLowerCase();
  switch (normalized) {
    case '0xaf88d065e77c8cc2239327c5edb3a432268e5831':
    case '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8':
      return 'USDC';
    case '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9':
      return 'USDT';
    case '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1':
      return 'DAI';
    default:
      return null;
  }
}

function tokenLabelForUser(params: {
  address: string;
  selectedPool: { token0: { address: string; symbol?: string }; token1: { address: string; symbol?: string } };
}): string {
  const normalized = params.address.toLowerCase();
  const token0 = params.selectedPool.token0.address.toLowerCase();
  const token1 = params.selectedPool.token1.address.toLowerCase();
  if (normalized === token0) {
    return params.selectedPool.token0.symbol ?? 'the first pool token';
  }
  if (normalized === token1) {
    return params.selectedPool.token1.symbol ?? 'the second pool token';
  }
  return stableTokenLabel(params.address) ?? 'a token';
}

function isKnownEmberSwapUpstream400Error(error: unknown): boolean {
  if (error instanceof EmberApiRequestError) {
    return error.status === 500 && /AxiosError:\s*Request failed with status code 400/i.test(error.bodyText);
  }
  if (error instanceof Error) {
    return (
      /Ember API request failed \(500\)/i.test(error.message) &&
      /AxiosError:\s*Request failed with status code 400/i.test(error.message)
    );
  }
  return false;
}

function toAbiWordAddress(address: `0x${string}`): `0x${string}` {
  const raw = address.toLowerCase().slice(2);
  return `0x${'0'.repeat(24)}${raw}` as `0x${string}`;
}

function buildDeterministicWithdrawIntents(params: {
  delegatorAddress: `0x${string}`;
}): DelegationIntent[] {
  const positionManager = CAMELOT_POSITION_MANAGER_ADDRESS.toLowerCase() as `0x${string}`;
  const recipientWord = toAbiWordAddress(params.delegatorAddress);
  return [
    { target: positionManager, selector: '0x0c49ccbe', allowedCalldata: [] },
    {
      target: positionManager,
      selector: '0xfc6f7865',
      allowedCalldata: [{ startIndex: 36, value: recipientWord }],
    },
    { target: positionManager, selector: '0x42966c68', allowedCalldata: [] },
  ];
}

function basesMatchUnsigned(params: { expected: UnsignedDelegation; received: SignedDelegation }): boolean {
  const normalizeCaveats = (caveats: UnsignedDelegation['caveats']) =>
    caveats.map((caveat) => ({
      enforcer: caveat.enforcer.toLowerCase(),
      terms: caveat.terms.toLowerCase(),
      args: caveat.args.toLowerCase(),
    }));

  return (
    params.expected.delegate.toLowerCase() === params.received.delegate.toLowerCase() &&
    params.expected.delegator.toLowerCase() === params.received.delegator.toLowerCase() &&
    params.expected.authority.toLowerCase() === params.received.authority.toLowerCase() &&
    params.expected.salt.toLowerCase() === params.received.salt.toLowerCase() &&
    JSON.stringify(normalizeCaveats(params.expected.caveats)) ===
      JSON.stringify(normalizeCaveats(params.received.caveats))
  );
}

export const collectDelegationsNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const delegationOnboarding = resolveDelegationOnboarding(state);
  logInfo('collectDelegations: entering node', {
    delegationsBypassActive: isDelegationsBypassActive(),
    hasDelegationBundle: Boolean(state.view.delegationBundle),
    hasOperatorInput: Boolean(state.view.operatorInput),
    hasSelectedPool: Boolean(state.view.selectedPool),
    hasFundingTokenInput: Boolean(state.view.fundingTokenInput),
    onboardingStep: state.view.onboarding?.step,
  });

  if (isDelegationsBypassActive()) {
    logInfo('collectDelegations: bypass active; skipping delegation onboarding');
    return {
      view: {
        delegationsBypassActive: true,
        onboarding: delegationOnboarding,
      },
    };
  }

  if (state.view.delegationBundle) {
    logInfo('collectDelegations: delegation bundle already present; skipping step');
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
    logInfo('collectDelegations: operator input missing; rerouting to collectOperatorInput');
    return new Command({ goto: 'collectOperatorInput' });
  }

  const selectedPool = state.view.selectedPool;
  if (!selectedPool) {
    logInfo('collectDelegations: selected pool missing; rerouting to collectOperatorInput');
    return new Command({ goto: 'collectOperatorInput' });
  }

  const camelotClient = getCamelotClient();
  const { agentWalletAddress } = await loadBootstrapContext();

  const delegatorAddress = normalizeHexAddress(operatorInput.walletAddress, 'delegator wallet address');
  const delegateeAddress = normalizeHexAddress(agentWalletAddress, 'delegatee wallet address');
  const baseContributionUsd = operatorInput.baseContributionUsd;
  const decimalsDiff = selectedPool.token0.decimals - selectedPool.token1.decimals;
  const midPrice = deriveMidPrice(selectedPool);
  const targetRange = buildRange(
    midPrice,
    DEFAULT_TICK_BANDWIDTH_BPS,
    selectedPool.tickSpacing ?? 10,
    decimalsDiff,
  );

  const warnings: string[] = [];

  const chainIdString = ARBITRUM_CHAIN_ID.toString();
  const poolIdentifier = { chainId: chainIdString, address: normalizeHexAddress(selectedPool.address, 'pool address') };

  let desired: { token0: bigint; token1: bigint };
  try {
    desired = estimateTokenAllocationsUsd(selectedPool, baseContributionUsd, targetRange);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failureMessage = `ERROR: Unable to estimate initial token allocations for delegation planning: ${message}`;
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

  const plannedTransactions: EmberEvmTransaction[] = [];

  const fundingToken = state.view.fundingTokenInput?.fundingTokenAddress
    ? normalizeHexAddress(state.view.fundingTokenInput.fundingTokenAddress, 'funding token address')
    : undefined;

  if (fundingToken) {
    const swapTargets: Array<{ toToken: `0x${string}`; amountOut: bigint }> = [];
    if (fundingToken.toLowerCase() !== selectedPool.token0.address.toLowerCase()) {
      swapTargets.push({ toToken: selectedPool.token0.address, amountOut: desired.token0 });
    }
    if (fundingToken.toLowerCase() !== selectedPool.token1.address.toLowerCase()) {
      swapTargets.push({ toToken: selectedPool.token1.address, amountOut: desired.token1 });
    }

    for (const target of swapTargets) {
      const fundingDecimals = stableTokenDecimals(fundingToken);
      const request: ClmmSwapRequest =
        fundingDecimals !== null
          ? {
              walletAddress: delegatorAddress,
              amount: parseUnits(
                Math.max(1, Math.min(10, baseContributionUsd / 2)).toFixed(fundingDecimals),
                fundingDecimals,
              ).toString(),
              amountType: 'exactIn',
              fromTokenUid: { chainId: chainIdString, address: fundingToken },
              toTokenUid: { chainId: chainIdString, address: target.toToken },
            }
          : {
              walletAddress: delegatorAddress,
              amount: target.amountOut.toString(),
              amountType: 'exactOut',
              fromTokenUid: { chainId: chainIdString, address: fundingToken },
              toTokenUid: { chainId: chainIdString, address: target.toToken },
            };

      try {
        const response = await camelotClient.requestSwap(request);
        const approvals = buildFundingApprovalsFromSwapPlan({
          transactions: response.transactions,
          chainId: chainIdString,
        });
        plannedTransactions.push(...asEmberTransactions([...approvals, ...response.transactions]));
      } catch (error) {
        if (isKnownEmberSwapUpstream400Error(error)) {
          const fromLabel = tokenLabelForUser({ address: fundingToken, selectedPool });
          const toLabel = tokenLabelForUser({ address: target.toToken, selectedPool });
          warnings.push(
            `We couldn’t prepare a swap from ${fromLabel} to ${toLabel}. Try again with a slightly larger amount.`,
          );
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        logInfo('collectDelegations: failed to request swap plan (funding token)', {
          request,
          fundingToken,
          toToken: target.toToken,
          message,
          emberError: formatEmberApiError(error),
        });
        const fromLabel = tokenLabelForUser({ address: fundingToken, selectedPool });
        const toLabel = tokenLabelForUser({ address: target.toToken, selectedPool });
        warnings.push(
          `We couldn’t prepare a swap from ${fromLabel} to ${toLabel}. Please try again.`,
        );
      }
    }
  }

  // Include a small swap in each direction for ongoing rebalance needs (best effort).
  const sampleSwapAmount0 = minNonZero(desired.token0 / 100n);
  const sampleSwapAmount1 = minNonZero(desired.token1 / 100n);
  try {
    const request: ClmmSwapRequest = {
      walletAddress: delegatorAddress,
      amount: sampleSwapAmount0.toString(),
      amountType: 'exactIn',
      fromTokenUid: { chainId: chainIdString, address: selectedPool.token0.address },
      toTokenUid: { chainId: chainIdString, address: selectedPool.token1.address },
    };
    const response = await camelotClient.requestSwap(request);
    {
      const approvals = buildFundingApprovalsFromSwapPlan({
        transactions: response.transactions,
        chainId: chainIdString,
      });
      plannedTransactions.push(...asEmberTransactions([...approvals, ...response.transactions]));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fromLabel = tokenLabelForUser({ address: selectedPool.token0.address, selectedPool });
    const toLabel = tokenLabelForUser({ address: selectedPool.token1.address, selectedPool });
    logInfo('collectDelegations: failed to request swap plan token0→token1', {
      request: {
        walletAddress: delegatorAddress,
        amount: sampleSwapAmount0.toString(),
        amountType: 'exactIn',
        fromTokenUid: { chainId: chainIdString, address: selectedPool.token0.address },
        toTokenUid: { chainId: chainIdString, address: selectedPool.token1.address },
      } satisfies ClmmSwapRequest,
      message,
      emberError: formatEmberApiError(error),
    });
    warnings.push(`We couldn’t prepare a swap from ${fromLabel} to ${toLabel}. Please try again.`);
  }
  try {
    const request: ClmmSwapRequest = {
      walletAddress: delegatorAddress,
      amount: sampleSwapAmount1.toString(),
      amountType: 'exactIn',
      fromTokenUid: { chainId: chainIdString, address: selectedPool.token1.address },
      toTokenUid: { chainId: chainIdString, address: selectedPool.token0.address },
    };
    const response = await camelotClient.requestSwap(request);
    {
      const approvals = buildFundingApprovalsFromSwapPlan({
        transactions: response.transactions,
        chainId: chainIdString,
      });
      plannedTransactions.push(...asEmberTransactions([...approvals, ...response.transactions]));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fromLabel = tokenLabelForUser({ address: selectedPool.token1.address, selectedPool });
    const toLabel = tokenLabelForUser({ address: selectedPool.token0.address, selectedPool });
    logInfo('collectDelegations: failed to request swap plan token1→token0', {
      request: {
        walletAddress: delegatorAddress,
        amount: sampleSwapAmount1.toString(),
        amountType: 'exactIn',
        fromTokenUid: { chainId: chainIdString, address: selectedPool.token1.address },
        toTokenUid: { chainId: chainIdString, address: selectedPool.token0.address },
      } satisfies ClmmSwapRequest,
      message,
      emberError: formatEmberApiError(error),
    });
    warnings.push(`We couldn’t prepare a swap from ${fromLabel} to ${toLabel}. Please try again.`);
  }

  try {
    const request: ClmmRebalanceRequest = {
      walletAddress: delegatorAddress,
      supplyChain: chainIdString,
      poolIdentifier,
      range: {
        type: 'limited',
        minPrice: targetRange.lowerPrice.toString(),
        maxPrice: targetRange.upperPrice.toString(),
      },
      payableTokens: [
        { tokenUid: { chainId: chainIdString, address: selectedPool.token0.address }, amount: desired.token0.toString() },
        { tokenUid: { chainId: chainIdString, address: selectedPool.token1.address }, amount: desired.token1.toString() },
      ],
    };
    const response = await camelotClient.requestRebalance(request);
    {
      const approvals = buildFundingApprovalsFromSwapPlan({
        transactions: response.transactions,
        chainId: chainIdString,
      });
      plannedTransactions.push(...asEmberTransactions([...approvals, ...response.transactions]));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logInfo('collectDelegations: failed to request supply plan', {
      message,
      emberError: formatEmberApiError(error),
    });
    warnings.push('We couldn’t prepare the liquidity steps right now. Please try again.');
  }

  if (plannedTransactions.length === 0) {
    const failureMessage = 'We couldn’t prepare the steps needed to continue. Please try again.';
    logInfo('collectDelegations: no planned transactions', { failureMessage });
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

  const delegationRequest = buildDelegationRequestBundle({
    delegatorAddress,
    delegateeAddress,
    transactions: plannedTransactions,
    extraIntents: buildDeterministicWithdrawIntents({ delegatorAddress }),
  });

  warnings.push(...delegationRequest.warnings);

  const request: DelegationSigningInterrupt = {
    type: 'clmm-delegation-signing-request',
    message:
      'Review and approve the permissions needed to manage your liquidity position. If anything looks unfamiliar, cancel and ask for help.',
    payloadSchema: z.toJSONSchema(DelegationSigningResponseJsonSchema),
    chainId: delegationRequest.chainId,
    delegationManager: delegationRequest.environment.DelegationManager,
    delegatorAddress,
    delegateeAddress,
    delegationsToSign: [...delegationRequest.delegationsToSign],
    descriptions: [...delegationRequest.delegationDescriptions],
    warnings: [...warnings],
  };

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'input-required',
    'Waiting for you to approve the required permissions to continue setup.',
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

  logInfo('collectDelegations: calling interrupt() - awaiting delegation signatures', {
    chainId: request.chainId,
    delegationManager: request.delegationManager,
    delegatorAddress: request.delegatorAddress,
    delegateeAddress: request.delegateeAddress,
    delegationCount: request.delegationsToSign.length,
    warningsCount: request.warnings.length,
  });

  const incoming: unknown = await interrupt(request);
  logInfo('collectDelegations: interrupt resolved with input', {
    hasInput: incoming !== undefined,
    incomingType: typeof incoming,
    incoming: typeof incoming === 'string' ? incoming.slice(0, 120) : incoming,
  });

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
    logInfo('collectDelegations: validation failed', { issues, failureMessage });
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
      'failed',
      'Delegation signing was rejected. The agent will not proceed.',
    );
    logInfo('collectDelegations: user rejected delegation signing', {
      delegatorAddress: request.delegatorAddress,
      delegateeAddress: request.delegateeAddress,
      delegationCount: request.delegationsToSign.length,
    });
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
  if (signedDelegations.length !== delegationRequest.delegationsToSign.length) {
    const failureMessage = `Delegation signing returned unexpected count (expected=${delegationRequest.delegationsToSign.length}, got=${signedDelegations.length})`;
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

  for (let index = 0; index < signedDelegations.length; index += 1) {
    const expected = delegationRequest.delegationsToSign[index];
    const received = signedDelegations[index];
    if (!expected || !received) {
      continue;
    }
    if (!basesMatchUnsigned({ expected, received })) {
      const failureMessage = `Delegation signing returned a mismatched delegation at index ${index}`;
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
  }

  const delegationBundle: DelegationBundle = {
    chainId: delegationRequest.chainId,
    delegationManager: delegationRequest.environment.DelegationManager,
    delegatorAddress,
    delegateeAddress,
    delegations: signedDelegations,
    intents: delegationRequest.delegationIntents.map((intent) => ({
      target: intent.target,
      selector: intent.selector,
      allowedCalldata: [...intent.allowedCalldata],
    })),
    descriptions: [...delegationRequest.delegationDescriptions],
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
