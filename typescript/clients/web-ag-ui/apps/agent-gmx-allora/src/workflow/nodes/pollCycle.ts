import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import type { TaskState } from 'agent-workflow-core';
import { formatUnits, parseUnits } from 'viem';

import { fetchAlloraInference, type AlloraInference } from '../../clients/allora.js';
import {
  type OnchainActionsClient,
  type OnchainActionsRequestError,
  type PerpetualLifecycleResponse,
  type PerpetualPosition,
  type TransactionPlan,
} from '../../clients/onchainActions.js';
import {
  ALLORA_HORIZON_HOURS,
  ALLORA_TOPIC_IDS,
  ALLORA_TOPIC_LABELS,
  ARBITRUM_CHAIN_ID,
  ONCHAIN_ACTIONS_API_URL,
  resolveAlloraApiBaseUrl,
  resolveAlloraApiKey,
  resolveAlloraChainId,
  resolveAllora8hInferenceCacheTtlMs,
  resolveGmxAlloraTxExecutionMode,
  resolvePollIntervalMs,
} from '../../config/constants.js';
import { buildAlloraPrediction } from '../../core/alloraPrediction.js';
import { buildCycleTelemetry } from '../../core/cycle.js';
import { buildPerpetualExecutionPlan, type ExecutionPlan } from '../../core/executionPlan.js';
import { applyExposureLimits } from '../../core/exposure.js';
import { selectGmxPerpetualMarket } from '../../core/marketSelection.js';
import type { AlloraPrediction } from '../../domain/types.js';
import {
  buildExecutionPlanArtifact,
  buildExecutionResultArtifact,
  buildTelemetryArtifact,
} from '../artifacts.js';
import { getOnchainActionsClient, getOnchainClients } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  logPauseSnapshot,
  logWarn,
  normalizeHexAddress,
  type ClmmEvent,
  type GmxLatestSnapshot,
  type ClmmState,
  type Task,
  type ClmmUpdate,
} from '../context.js';
import { ensureCronForThread } from '../cronScheduler.js';
import {
  executePerpetualPlan,
  executePreparedTransactions,
  type ExecutionResult,
} from '../execution.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';
import { resolvePlanBuilderWalletAddress } from '../planBuilderWallet.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = {
  configurable?: {
    thread_id?: string;
    checkpoint_id?: string;
    checkpoint_ns?: string;
  };
};

const DECISION_THRESHOLD = 0.62;
const CONNECT_DELAY_MS = 2500;
const CONNECT_DELAY_STEPS = 3;
const ALLORA_STALE_CYCLE_LIMIT = 3;
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';
const POSITION_SYNC_GUARD_WINDOW_MS = 90_000;
const GMX_PERPETUALS_PROVIDER_NAME = 'GMX Perpetuals' as const;
const EXECUTION_FEE_TOP_UP_EXECUTIONS_BUFFER_MULTIPLIER = 10;
const EXECUTION_FEE_TOP_UP_FALLBACK_PER_EXECUTION_USD = 0.5;
const EXECUTION_FEE_TOP_UP_MIN_USD = 1;
const EXECUTION_FEE_TOP_UP_MAX_USD = 25;
const EXECUTION_FEE_TOP_UP_SLIPPAGE_TOLERANCE_SEQUENCE = ['0.25', '0.5', '1'] as const;
const ERROR_LOG_STRING_MAX_CHARS = 1_000;
const DEFAULT_FLIP_CLOSE_VERIFY_ATTEMPTS = 15;
const DEFAULT_FLIP_CLOSE_VERIFY_INTERVAL_MS = 2_000;
const DEFAULT_LIFECYCLE_WATCH_ATTEMPTS = 12;
const DEFAULT_LIFECYCLE_WATCH_INTERVAL_MS = 5_000;
const DEFAULT_PENDING_LIFECYCLE_RECONCILE_POLL_INTERVAL_MS = 15_000;

type PositionSyncGuard = NonNullable<ClmmState['thread']['metrics']['pendingPositionSync']>;

function shouldDelayIteration(iteration: number): boolean {
  return iteration % 3 === 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTopicKey(symbol: string): 'BTC' | 'ETH' {
  return symbol === 'BTC' ? 'BTC' : 'ETH';
}

function buildInferenceSnapshotKey(inference: AlloraInference): string {
  return JSON.stringify({
    topicId: inference.topicId,
    combinedValue: inference.combinedValue,
    confidenceIntervalValues: inference.confidenceIntervalValues,
  });
}

function isTradePlanAction(action: 'none' | 'long' | 'short' | 'close' | 'reduce' | 'flip'): boolean {
  return action !== 'none';
}

function resolveFlipSide(positionSide: 'long' | 'short' | undefined): 'long' | 'short' {
  return positionSide === 'short' ? 'long' : 'short';
}

function resolveFlipCloseVerifyAttempts(): number {
  const raw = process.env['GMX_FIRE_CLOSE_VERIFY_ATTEMPTS'];
  if (!raw) {
    return DEFAULT_FLIP_CLOSE_VERIFY_ATTEMPTS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_FLIP_CLOSE_VERIFY_ATTEMPTS;
  }
  return Math.max(1, Math.trunc(parsed));
}

function resolveFlipCloseVerifyIntervalMs(): number {
  const raw = process.env['GMX_FIRE_CLOSE_VERIFY_INTERVAL_MS'];
  if (!raw) {
    return DEFAULT_FLIP_CLOSE_VERIFY_INTERVAL_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_FLIP_CLOSE_VERIFY_INTERVAL_MS;
  }
  return Math.max(0, Math.trunc(parsed));
}

function resolveLifecycleWatchAttempts(): number {
  const raw = process.env['GMX_ALLORA_LIFECYCLE_WATCH_ATTEMPTS'];
  if (!raw) {
    return DEFAULT_LIFECYCLE_WATCH_ATTEMPTS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIFECYCLE_WATCH_ATTEMPTS;
  }
  return Math.max(1, Math.trunc(parsed));
}

function resolveLifecycleWatchIntervalMs(): number {
  const raw = process.env['GMX_ALLORA_LIFECYCLE_WATCH_INTERVAL_MS'];
  if (!raw) {
    return DEFAULT_LIFECYCLE_WATCH_INTERVAL_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_LIFECYCLE_WATCH_INTERVAL_MS;
  }
  return Math.max(0, Math.trunc(parsed));
}

function resolvePendingLifecycleReconcilePollIntervalMs(defaultPollIntervalMs: number): number {
  const raw = process.env['GMX_ALLORA_PENDING_LIFECYCLE_RECONCILE_POLL_INTERVAL_MS'];
  if (!raw) {
    return Math.min(defaultPollIntervalMs, DEFAULT_PENDING_LIFECYCLE_RECONCILE_POLL_INTERVAL_MS);
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.min(defaultPollIntervalMs, DEFAULT_PENDING_LIFECYCLE_RECONCILE_POLL_INTERVAL_MS);
  }
  return Math.min(defaultPollIntervalMs, Math.trunc(parsed));
}

function hasOpenPosition(position: PerpetualPosition | undefined): position is PerpetualPosition {
  if (!position) {
    return false;
  }
  const size = position.sizeInUsd.trim();
  if (size.length === 0) {
    return false;
  }

  const parsed = Number(size);
  if (Number.isFinite(parsed)) {
    return Math.abs(parsed) > 0;
  }

  return size !== '0';
}

function parseUsdMetric(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (/^-?\d+\.\d+$/u.test(normalized)) {
    const value = Number(normalized);
    return Number.isFinite(value) ? value : undefined;
  }
  if (!/^-?\d+$/u.test(normalized)) {
    return undefined;
  }

  const sign = normalized.startsWith('-') ? -1 : 1;
  const digits = normalized.startsWith('-') ? normalized.slice(1) : normalized;
  if (digits.length > 18) {
    const scale = 10n ** 30n;
    const bigint = BigInt(normalized);
    const abs = bigint < 0n ? -bigint : bigint;
    const integerPart = abs / scale;
    const fractionPart = abs % scale;
    return sign * (Number(integerPart) + Number(fractionPart) / Number(scale));
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function parseBaseUnitAmount(raw: string | undefined, decimals: number): number | undefined {
  if (!raw) {
    return undefined;
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    return undefined;
  }
  const normalized = raw.trim();
  if (!/^-?\d+$/u.test(normalized)) {
    return undefined;
  }

  const base = 10n ** BigInt(decimals);
  const value = BigInt(normalized);
  const sign = value < 0n ? -1 : 1;
  const abs = value < 0n ? -value : value;
  const integerPart = abs / base;
  const fractionalPart = abs % base;
  return sign * (Number(integerPart) + Number(fractionalPart) / Number(base));
}

function parseEpochToIso(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/u.test(trimmed)) {
    return undefined;
  }
  const asNumber = Number(trimmed);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return undefined;
  }
  const millis = asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function getCallSelector(data: string): string | undefined {
  if (!data.startsWith('0x') || data.length < 10) {
    return undefined;
  }
  return data.slice(0, 10).toLowerCase();
}

function isApprovalOnlyTransactions(transactions: TransactionPlan[] | undefined): boolean {
  if (!transactions || transactions.length === 0) {
    return false;
  }
  return transactions.every((tx) => getCallSelector(tx.data) === ERC20_APPROVE_SELECTOR);
}

function resolveActivePositionSyncGuard(
  guard: ClmmState['thread']['metrics']['pendingPositionSync'],
  nowEpochMs: number,
): PositionSyncGuard | undefined {
  if (!guard) {
    return undefined;
  }
  if (guard.expiresAtEpochMs <= nowEpochMs) {
    return undefined;
  }
  return guard;
}

type ExecutionFailureSummary = {
  taskState: TaskState;
  statusMessage: string;
  detail: string;
  requiresFundingAcknowledgement: boolean;
};

type ExecutionFeeTopUpAttempt = {
  attempted: boolean;
  funded: boolean;
  error?: string;
};

type ExecutionFeeTopUpLogContext = {
  threadId?: string;
  checkpointId?: string;
  checkpointNamespace?: string;
  iteration: number;
};

export function estimateFundingTokenUsdPrice(params: {
  amountBaseUnits?: string;
  decimals?: number;
  valueUsd?: number;
  fallbackUsdPrice?: number;
}): number | undefined {
  if (
    typeof params.amountBaseUnits !== 'string' ||
    typeof params.decimals !== 'number' ||
    typeof params.valueUsd !== 'number' ||
    !Number.isFinite(params.valueUsd) ||
    params.valueUsd <= 0
  ) {
    return params.fallbackUsdPrice;
  }

  let amount: number;
  try {
    amount = Number(formatUnits(BigInt(params.amountBaseUnits), params.decimals));
  } catch {
    return params.fallbackUsdPrice;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return params.fallbackUsdPrice;
  }

  const usdPrice = params.valueUsd / amount;
  return Number.isFinite(usdPrice) && usdPrice > 0 ? usdPrice : params.fallbackUsdPrice;
}

export function estimateExecutionFeeTopUpExactInAmountBaseUnits(params: {
  targetFeeUsd: number;
  fundingTokenDecimals: number;
  fundingTokenUsdPrice: number;
}): string {
  if (!Number.isFinite(params.targetFeeUsd) || params.targetFeeUsd <= 0) {
    throw new Error('Execution-fee top-up target must be positive.');
  }
  if (!Number.isFinite(params.fundingTokenUsdPrice) || params.fundingTokenUsdPrice <= 0) {
    throw new Error('Funding token USD price is required to price the execution-fee top-up.');
  }

  const amountIn = params.targetFeeUsd / params.fundingTokenUsdPrice;
  let amountInBaseUnits = parseUnits(
    amountIn.toFixed(params.fundingTokenDecimals),
    params.fundingTokenDecimals,
  );
  if (amountInBaseUnits <= 0n) {
    amountInBaseUnits = 1n;
  }
  return amountInBaseUnits.toString();
}

function isExecutionFeeFundingShortfall(errorMessage: string | undefined): boolean {
  if (!errorMessage) {
    return false;
  }
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes('execution fee') ||
    normalized.includes('insufficient gas') ||
    normalized.includes('insufficient funds for gas')
  );
}

function isExecutionSimulationFailure(errorMessage: string | undefined): boolean {
  if (!errorMessage) {
    return false;
  }
  return errorMessage.toLowerCase().includes('execute order simulation failed');
}

function shouldAttemptExecutionFeeAutoTopUp(errorMessage: string | undefined): boolean {
  return (
    isExecutionFeeFundingShortfall(errorMessage) || isExecutionSimulationFailure(errorMessage)
  );
}

function isSwapSlippageLimitExceeded(errorMessage: string): boolean {
  return errorMessage.toLowerCase().includes('slippage limit exceeded');
}

function truncateForLogs(value: string): string {
  return value.length <= ERROR_LOG_STRING_MAX_CHARS
    ? value
    : `${value.slice(0, ERROR_LOG_STRING_MAX_CHARS)}... [truncated]`;
}

function appendOnchainErrorDiagnostics(error: unknown, baseMessage: string): string {
  if (!(error instanceof Error) || error.name !== 'OnchainActionsRequestError') {
    return baseMessage;
  }
  const requestError = error as OnchainActionsRequestError;
  const diagnostics = [
    `method=${requestError.method}`,
    `url=${requestError.url}`,
    `status=${requestError.status}`,
    requestError.bodyText ? `responseBody=${truncateForLogs(requestError.bodyText)}` : undefined,
    requestError.requestBody
      ? `requestBody=${truncateForLogs(requestError.requestBody)}`
      : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(' ');
  return diagnostics.length > 0 ? `${baseMessage} (${diagnostics})` : baseMessage;
}

async function executeConfirmedFlipPlan(params: {
  onchainActionsClient: Pick<
    OnchainActionsClient,
    | 'listPerpetualPositions'
    | 'getPerpetualLifecycle'
    | 'createSwap'
    | 'createPerpetualLong'
    | 'createPerpetualShort'
    | 'createPerpetualClose'
    | 'createPerpetualReduce'
  >;
  plan: Extract<ExecutionPlan, { action: 'flip' }>;
  txExecutionMode: 'plan' | 'execute';
  clients: ReturnType<typeof getOnchainClients> | undefined;
  delegationsBypassActive: boolean;
  delegationBundle: ClmmState['thread']['delegationBundle'];
  delegatorWalletAddress: `0x${string}`;
  delegateeWalletAddress: `0x${string}`;
  swapFundingEstimate?: {
    fromTokenDecimals?: number;
    fromTokenBalanceBaseUnits?: string;
    fromTokenUsdPrice?: number;
    toTokenDecimals?: number;
    toTokenUsdPrice?: number;
  };
  runtimeThreadId: string | undefined;
  runtimeCheckpointId: string | undefined;
  runtimeCheckpointNamespace: string | undefined;
  iteration: number;
}): Promise<ExecutionResult> {
  if (params.txExecutionMode !== 'execute') {
    return executePerpetualPlan({
      client: params.onchainActionsClient,
      clients: params.clients,
      plan: params.plan,
      txExecutionMode: params.txExecutionMode,
      delegationsBypassActive: params.delegationsBypassActive,
      delegationBundle: params.delegationBundle,
      delegatorWalletAddress: params.delegatorWalletAddress,
      delegateeWalletAddress: params.delegateeWalletAddress,
      swapFundingEstimate: params.swapFundingEstimate,
    });
  }

  const closePlan: ExecutionPlan = {
    action: 'close',
    request: params.plan.closeRequest,
  };
  const closeExecution = await executePerpetualPlan({
    client: params.onchainActionsClient,
    clients: params.clients,
    plan: closePlan,
    txExecutionMode: params.txExecutionMode,
    delegationsBypassActive: params.delegationsBypassActive,
    delegationBundle: params.delegationBundle,
    delegatorWalletAddress: params.delegatorWalletAddress,
    delegateeWalletAddress: params.delegateeWalletAddress,
    swapFundingEstimate: params.swapFundingEstimate,
  });

  if (!closeExecution.ok) {
    return { ...closeExecution, action: 'flip' };
  }

  const maxVerificationAttempts = resolveFlipCloseVerifyAttempts();
  const verificationIntervalMs = resolveFlipCloseVerifyIntervalMs();
  const normalizedTargetMarket = params.plan.closeRequest.marketAddress.toLowerCase();
  let closeConfirmationError: string | undefined;
  let closeCancelledError: string | undefined;
  let closeConfirmed = false;

  for (let attempt = 1; attempt <= maxVerificationAttempts; attempt += 1) {
    try {
      const postClosePositions = await params.onchainActionsClient.listPerpetualPositions({
        walletAddress: params.plan.closeRequest.walletAddress,
        chainIds: [ARBITRUM_CHAIN_ID.toString()],
      });
      const postClosePosition = postClosePositions.find(
        (position) => position.marketAddress.toLowerCase() === normalizedTargetMarket,
      );
      closeConfirmed = !hasOpenPosition(postClosePosition);
      logWarn('pollCycle: flip close verification snapshot', {
        threadId: params.runtimeThreadId,
        checkpointId: params.runtimeCheckpointId,
        checkpointNamespace: params.runtimeCheckpointNamespace,
        iteration: params.iteration,
        attempt,
        maxVerificationAttempts,
        targetMarketAddress: normalizedTargetMarket,
        closeConfirmed,
        matchedMarketPosition: Boolean(postClosePosition),
        matchedPositionSide: postClosePosition?.positionSide,
        matchedPositionSizeUsd: postClosePosition?.sizeInUsd,
      });
    } catch (error: unknown) {
      closeConfirmationError = error instanceof Error ? error.message : String(error);
      logWarn('pollCycle: flip close verification positions query failed', {
        threadId: params.runtimeThreadId,
        checkpointId: params.runtimeCheckpointId,
        checkpointNamespace: params.runtimeCheckpointNamespace,
        iteration: params.iteration,
        attempt,
        maxVerificationAttempts,
        error: closeConfirmationError,
      });
      break;
    }

    if (params.plan.closeRequest.walletAddress && closeExecution.lastTxHash) {
      try {
        const lifecycle = await params.onchainActionsClient.getPerpetualLifecycle({
          providerName: GMX_PERPETUALS_PROVIDER_NAME,
          chainId: ARBITRUM_CHAIN_ID.toString(),
          txHash: closeExecution.lastTxHash,
          walletAddress: params.plan.closeRequest.walletAddress,
        });
        if (
          lifecycle.needsDisambiguation !== true &&
          (lifecycle.status === 'cancelled' || lifecycle.status === 'failed')
        ) {
          closeCancelledError = formatLifecycleFailureDetail({
            status: lifecycle.status,
            reason: lifecycle.reason,
            reasonBytes: lifecycle.reasonBytes,
            requestedPrice: lifecycle.requestedPrice,
            observedPrice: lifecycle.observedPrice,
          });
          break;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn('pollCycle: flip close lifecycle query failed', {
          threadId: params.runtimeThreadId,
          checkpointId: params.runtimeCheckpointId,
          checkpointNamespace: params.runtimeCheckpointNamespace,
          iteration: params.iteration,
          attempt,
          txHash: closeExecution.lastTxHash,
          error: message,
        });
      }
    }

    if (closeConfirmed) {
      break;
    }

    if (attempt < maxVerificationAttempts) {
      await delay(verificationIntervalMs);
    }
  }

  if (!closeConfirmed) {
    return {
      action: 'flip',
      ok: false,
      transactions: closeExecution.transactions,
      txHashes: closeExecution.txHashes,
      lastTxHash: closeExecution.lastTxHash,
      error:
        closeCancelledError ??
        closeConfirmationError ??
        'Unable to confirm GMX close before reopening the opposite side.',
    };
  }

  const openSide = resolveFlipSide(params.plan.closeRequest.positionSide);
  const openPlan: ExecutionPlan =
    openSide === 'long'
      ? { action: 'long', request: params.plan.openRequest }
      : { action: 'short', request: params.plan.openRequest };
  const openExecution = await executePerpetualPlan({
    client: params.onchainActionsClient,
    clients: params.clients,
    plan: openPlan,
    txExecutionMode: params.txExecutionMode,
    delegationsBypassActive: params.delegationsBypassActive,
    delegationBundle: params.delegationBundle,
    delegatorWalletAddress: params.delegatorWalletAddress,
    delegateeWalletAddress: params.delegateeWalletAddress,
    swapFundingEstimate: params.swapFundingEstimate,
  });

  return {
    action: 'flip',
    ok: openExecution.ok,
    transactions: [...(closeExecution.transactions ?? []), ...(openExecution.transactions ?? [])],
    txHashes: [...(closeExecution.txHashes ?? []), ...(openExecution.txHashes ?? [])],
    lastTxHash: openExecution.lastTxHash ?? closeExecution.lastTxHash,
    error: openExecution.ok
      ? undefined
      : `GMX close succeeded but reopening the opposite side failed: ${openExecution.error ?? 'unknown error'}`,
  };
}

async function confirmFlipReopenedPosition(params: {
  onchainActionsClient: Pick<OnchainActionsClient, 'listPerpetualPositions'>;
  walletAddress: `0x${string}`;
  marketAddress: `0x${string}`;
  expectedSide: 'long' | 'short';
  runtimeThreadId: string | undefined;
  runtimeCheckpointId: string | undefined;
  runtimeCheckpointNamespace: string | undefined;
  iteration: number;
}): Promise<PerpetualPosition | undefined> {
  const maxVerificationAttempts = resolveFlipCloseVerifyAttempts();
  const verificationIntervalMs = resolveFlipCloseVerifyIntervalMs();
  const normalizedTargetMarket = params.marketAddress.toLowerCase();
  let reopenedPosition: PerpetualPosition | undefined;

  for (let attempt = 1; attempt <= maxVerificationAttempts; attempt += 1) {
    if (attempt > 1) {
      await delay(verificationIntervalMs);
    }

    try {
      const refreshedPositions = await params.onchainActionsClient.listPerpetualPositions({
        walletAddress: params.walletAddress,
        chainIds: [ARBITRUM_CHAIN_ID.toString()],
      });
      reopenedPosition = refreshedPositions.find(
        (position) => position.marketAddress.toLowerCase() === normalizedTargetMarket,
      );
      const reopenedConfirmed =
        hasOpenPosition(reopenedPosition) && reopenedPosition.positionSide === params.expectedSide;
      logWarn('pollCycle: flip reopen verification snapshot', {
        threadId: params.runtimeThreadId,
        checkpointId: params.runtimeCheckpointId,
        checkpointNamespace: params.runtimeCheckpointNamespace,
        iteration: params.iteration,
        attempt,
        maxVerificationAttempts,
        targetMarketAddress: normalizedTargetMarket,
        expectedSide: params.expectedSide,
        reopenedConfirmed,
        matchedMarketPosition: Boolean(reopenedPosition),
        matchedPositionSide: reopenedPosition?.positionSide,
        matchedPositionSizeUsd: reopenedPosition?.sizeInUsd,
      });
      if (reopenedConfirmed) {
        return reopenedPosition;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn('pollCycle: flip reopen verification positions query failed', {
        threadId: params.runtimeThreadId,
        checkpointId: params.runtimeCheckpointId,
        checkpointNamespace: params.runtimeCheckpointNamespace,
        iteration: params.iteration,
        attempt,
        maxVerificationAttempts,
        error: message,
      });
      break;
    }
  }

  return reopenedPosition;
}

async function maybeAutoFundExecutionFee(params: {
  onchainActionsClient: Pick<
    OnchainActionsClient,
    'listWalletBalances' | 'listTokens' | 'createSwap' | 'estimatePerpetualQuoteFeeUsd'
  >;
  txExecutionMode: 'plan' | 'execute';
  clients: ReturnType<typeof getOnchainClients> | undefined;
  delegationsBypassActive: boolean;
  delegationBundle: ClmmState['thread']['delegationBundle'];
  planBuilderWalletAddress: `0x${string}`;
  delegatorWalletAddress: `0x${string}`;
  delegateeWalletAddress: `0x${string}`;
  fundingTokenAddress: `0x${string}`;
  fundingTokenUsdPrice?: number;
  executionPlan: ExecutionPlan;
  logContext: ExecutionFeeTopUpLogContext;
}): Promise<ExecutionFeeTopUpAttempt> {
  if (params.txExecutionMode !== 'execute') {
    return { attempted: true, funded: false, error: 'Auto top-up requires execute mode.' };
  }
  if (!params.clients) {
    return { attempted: true, funded: false, error: 'Onchain clients are unavailable for auto top-up.' };
  }

  try {
    const chainId = ARBITRUM_CHAIN_ID.toString();
    const tokens = await params.onchainActionsClient.listTokens({ chainIds: [chainId] });
    const nativeEthToken = tokens.find(
      (token) =>
        token.isNative === true && token.symbol.toUpperCase() === 'ETH' && token.tokenUid.chainId === chainId,
    );
    if (!nativeEthToken) {
      return { attempted: true, funded: false, error: 'Unable to resolve Arbitrum ETH token for auto top-up.' };
    }

    const normalizedFundingToken = params.fundingTokenAddress.toLowerCase();
    const fundingToken = tokens.find(
      (token) =>
        token.tokenUid.chainId === chainId && token.tokenUid.address.toLowerCase() === normalizedFundingToken,
    );
    if (!fundingToken) {
      return { attempted: true, funded: false, error: 'Unable to resolve funding token for auto top-up swap.' };
    }
    if (params.executionPlan.action === 'none') {
      return { attempted: true, funded: false, error: 'No execution plan available for fee estimation.' };
    }
    const estimatedFeeUsdRaw = await (async (): Promise<number | undefined> => {
      if (params.executionPlan.action === 'flip') {
        const closeFeeUsd = await params.onchainActionsClient.estimatePerpetualQuoteFeeUsd({
          action: 'close',
          request: params.executionPlan.closeRequest,
        });
        const openFeeUsd = await params.onchainActionsClient.estimatePerpetualQuoteFeeUsd({
          action: resolveFlipSide(params.executionPlan.closeRequest.positionSide),
          request: params.executionPlan.openRequest,
        });
        if (closeFeeUsd === undefined && openFeeUsd === undefined) {
          return undefined;
        }
        return (closeFeeUsd ?? 0) + (openFeeUsd ?? 0);
      }
      if (params.executionPlan.action === 'long') {
        return params.onchainActionsClient.estimatePerpetualQuoteFeeUsd({
          action: 'long',
          request: params.executionPlan.request,
        });
      }
      if (params.executionPlan.action === 'short') {
        return params.onchainActionsClient.estimatePerpetualQuoteFeeUsd({
          action: 'short',
          request: params.executionPlan.request,
        });
      }
      if (params.executionPlan.action === 'close') {
        return params.onchainActionsClient.estimatePerpetualQuoteFeeUsd({
          action: 'close',
          request: params.executionPlan.request,
        });
      }
      if (params.executionPlan.action === 'reduce') {
        return params.onchainActionsClient.estimatePerpetualQuoteFeeUsd({
          action: 'reduce',
          request: params.executionPlan.request,
        });
      }
      return undefined;
    })();
    const perExecutionFeeUsd =
      estimatedFeeUsdRaw && estimatedFeeUsdRaw > 0
        ? estimatedFeeUsdRaw
        : EXECUTION_FEE_TOP_UP_FALLBACK_PER_EXECUTION_USD;
    const bufferedFeeUsd =
      perExecutionFeeUsd * EXECUTION_FEE_TOP_UP_EXECUTIONS_BUFFER_MULTIPLIER;
    const targetFeeUsd = Math.max(
      EXECUTION_FEE_TOP_UP_MIN_USD,
      Math.min(EXECUTION_FEE_TOP_UP_MAX_USD, bufferedFeeUsd),
    );
    const balances = await params.onchainActionsClient.listWalletBalances({
      walletAddress: params.planBuilderWalletAddress,
    });
    const nativeBalance = balances.find((balance) => {
      if (balance.tokenUid.chainId !== chainId) {
        return false;
      }
      return (
        balance.tokenUid.address.toLowerCase() === nativeEthToken.tokenUid.address.toLowerCase() ||
        balance.symbol?.toUpperCase() === 'ETH'
      );
    });
    const nativeBalanceUsd =
      typeof nativeBalance?.valueUsd === 'number' &&
      Number.isFinite(nativeBalance.valueUsd) &&
      nativeBalance.valueUsd >= 0
        ? nativeBalance.valueUsd
        : undefined;
    const fundingBalance = balances.find(
      (balance) =>
        balance.tokenUid.chainId === chainId &&
        balance.tokenUid.address.toLowerCase() === fundingToken.tokenUid.address.toLowerCase(),
    );
    const fundingTokenDecimals = fundingBalance?.decimals ?? fundingToken.decimals;
    const fundingTokenUsdPrice = estimateFundingTokenUsdPrice({
      amountBaseUnits: fundingBalance?.amount,
      decimals: fundingTokenDecimals,
      valueUsd: fundingBalance?.valueUsd,
      fallbackUsdPrice:
        fundingToken.symbol.toUpperCase() === 'USDC' ? 1 : params.fundingTokenUsdPrice,
    });
    if (fundingTokenUsdPrice === undefined) {
      return {
        attempted: true,
        funded: false,
        error: 'Unable to price the funding token for automatic execution-fee top-up.',
      };
    }
    const exactInAmountBaseUnits = estimateExecutionFeeTopUpExactInAmountBaseUnits({
      targetFeeUsd,
      fundingTokenDecimals,
      fundingTokenUsdPrice,
    });
    logWarn('pollCycle: execution-fee top-up preflight computed', {
      ...params.logContext,
      estimatedFeeUsdRaw,
      perExecutionFeeUsd,
      targetFeeUsd,
      fundingTokenDecimals,
      fundingTokenUsdPrice,
      exactInAmountBaseUnits,
      nativeBalanceAmount: nativeBalance?.amount,
      nativeBalanceUsd,
    });
    const hasReliableFeeEstimate =
      estimatedFeeUsdRaw !== undefined && Number.isFinite(estimatedFeeUsdRaw) && estimatedFeeUsdRaw > 0;
    if (nativeBalanceUsd !== undefined && nativeBalanceUsd >= targetFeeUsd) {
      logWarn('pollCycle: execution-fee top-up skipped; native balance appears sufficient', {
        ...params.logContext,
        hasReliableFeeEstimate,
        targetFeeUsd,
        nativeBalanceUsd,
      });
      return { attempted: false, funded: false };
    }
    if (fundingBalance && BigInt(fundingBalance.amount) < BigInt(exactInAmountBaseUnits)) {
      return {
        attempted: true,
        funded: false,
        error:
          'Insufficient funding token balance for automatic execution-fee top-up. Fund additional collateral and retry.',
      };
    }

    let lastSwapError: string | undefined;
    for (const slippageTolerance of EXECUTION_FEE_TOP_UP_SLIPPAGE_TOLERANCE_SEQUENCE) {
      let approvalOnlyPlanRetriesRemaining = 1;
      for (;;) {
        try {
          logWarn('pollCycle: requesting execution-fee top-up swap plan', {
            ...params.logContext,
            slippageTolerance,
            exactInAmountBaseUnits,
            approvalOnlyPlanRetriesRemaining,
          });
          const swapPlan = await params.onchainActionsClient.createSwap({
            walletAddress: params.planBuilderWalletAddress,
            amount: exactInAmountBaseUnits,
            amountType: 'exactIn',
            fromTokenUid: fundingToken.tokenUid,
            toTokenUid: nativeEthToken.tokenUid,
            slippageTolerance,
          });
          const approvalOnlyPlan = isApprovalOnlyTransactions(swapPlan.transactions);
          logWarn('pollCycle: execution-fee top-up swap plan received', {
            ...params.logContext,
            slippageTolerance,
            transactionCount: swapPlan.transactions.length,
            approvalOnlyPlan,
          });

          const swapExecution = await executePreparedTransactions({
            transactions: swapPlan.transactions,
            txExecutionMode: params.txExecutionMode,
            clients: params.clients,
            delegationsBypassActive: params.delegationsBypassActive,
            delegationBundle: params.delegationBundle,
            delegatorWalletAddress: params.delegatorWalletAddress,
            delegateeWalletAddress: params.delegateeWalletAddress,
          });
          logWarn('pollCycle: execution-fee top-up swap execution resolved', {
            ...params.logContext,
            slippageTolerance,
            ok: swapExecution.ok,
            txHash: swapExecution.lastTxHash,
            txHashes: swapExecution.txHashes,
            error: swapExecution.ok ? undefined : swapExecution.error,
          });
          if (!swapExecution.ok) {
            return {
              attempted: true,
              funded: false,
              error: swapExecution.error ?? 'Execution-fee auto top-up transaction failed.',
            };
          }

          if (approvalOnlyPlan) {
            if (approvalOnlyPlanRetriesRemaining <= 0) {
              return {
                attempted: true,
                funded: false,
                error:
                  'Execution-fee auto top-up only returned approval transactions and did not produce a swap transaction.',
              };
            }
            approvalOnlyPlanRetriesRemaining -= 1;
            continue;
          }

          return { attempted: true, funded: true };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          lastSwapError = appendOnchainErrorDiagnostics(error, message);
          logWarn('pollCycle: execution-fee top-up swap planning failed', {
            ...params.logContext,
            slippageTolerance,
            error: lastSwapError,
          });
          if (!isSwapSlippageLimitExceeded(message)) {
            return { attempted: true, funded: false, error: lastSwapError };
          }
          break;
        }
      }
    }

    return {
      attempted: true,
      funded: false,
      error:
        lastSwapError ??
        'Execution-fee auto top-up failed after trying configured slippage tolerances.',
    };
  } catch (error: unknown) {
    return {
      attempted: true,
      funded: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeExecutionFailure(params: {
  iteration: number;
  error?: string;
}): ExecutionFailureSummary {
  const rawError = params.error ?? 'Unknown error';
  const normalized = rawError.toLowerCase();
  const isSimulationFailure = normalized.includes('execute order simulation failed');
  const isLikelyFundingIssue =
    normalized.includes('insufficient') || normalized.includes('execution fee');

  if (isSimulationFailure || isLikelyFundingIssue) {
    const detail =
      'GMX order simulation failed. Ensure the trading wallet has enough USDC collateral and a small amount of Arbitrum ETH for execution fees. After funding, click Continue in Agent Blockers to retry immediately.';
    return {
      taskState: 'input-required',
      statusMessage: `[Cycle ${params.iteration}] trade paused: ${detail}`,
      detail,
      requiresFundingAcknowledgement: true,
    };
  }

  return {
    taskState: 'working',
    statusMessage: `[Cycle ${params.iteration}] execution failed: ${rawError}`,
    detail: rawError,
    requiresFundingAcknowledgement: false,
  };
}

function summarizePersistentSimulationFailureAfterTopUp(params: {
  iteration: number;
  error?: string;
}): ExecutionFailureSummary {
  const rawError = params.error ?? 'Unknown error';
  const detail =
    'GMX order simulation still failed after successful execution-fee top-up. This is likely an upstream planning/simulation issue rather than wallet funding. The agent will continue retrying on future cycles.';
  return {
    taskState: 'working',
    statusMessage: `[Cycle ${params.iteration}] execution failed: ${detail}`,
    detail: rawError,
    requiresFundingAcknowledgement: false,
  };
}

function isResolvedLifecycle(
  lifecycle: PerpetualLifecycleResponse,
): lifecycle is Extract<PerpetualLifecycleResponse, { orderKey: string }> {
  return lifecycle.needsDisambiguation !== true;
}

function asLifecycleTxHash(value: string | undefined): `0x${string}` | undefined {
  if (!value || !value.startsWith('0x')) {
    return undefined;
  }
  return value as `0x${string}`;
}

type LifecycleWatchResult = {
  task: Task;
  statusEvent: ClmmEvent;
  lifecycleFailure?: ExecutionFailureSummary;
  lifecycleStatus?: 'pending' | 'executed' | 'cancelled' | 'failed' | 'unknown';
  finalTxHash?: `0x${string}`;
  pendingAfterWatch: boolean;
};

async function watchLifecycleForExecutionHash(params: {
  client: OnchainActionsClient;
  config: CopilotKitConfig;
  task: Task;
  statusEvent: ClmmEvent;
  activityTelemetry: ClmmState['thread']['activity']['telemetry'];
  latestCycle: ClmmState['thread']['metrics']['latestCycle'];
  iteration: number;
  walletAddress: `0x${string}`;
  submissionTxHash: `0x${string}`;
  runtimeThreadId?: string;
  runtimeCheckpointId?: string;
  runtimeCheckpointNamespace?: string;
}): Promise<LifecycleWatchResult> {
  const maxAttempts = resolveLifecycleWatchAttempts();
  const intervalMs = resolveLifecycleWatchIntervalMs();
  let task = params.task;
  let statusEvent = params.statusEvent;
  let lifecycleStatus: LifecycleWatchResult['lifecycleStatus'];
  let lifecycleFailure: ExecutionFailureSummary | undefined;
  let finalTxHash: `0x${string}` | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const lifecycle = await params.client.getPerpetualLifecycle({
        providerName: GMX_PERPETUALS_PROVIDER_NAME,
        chainId: ARBITRUM_CHAIN_ID.toString(),
        txHash: params.submissionTxHash,
        walletAddress: params.walletAddress,
      });

      if (!isResolvedLifecycle(lifecycle)) {
        continue;
      }

      lifecycleStatus = lifecycle.status;
      const lifecycleTxHash = asLifecycleTxHash(
        lifecycle.executionTxHash ??
          lifecycle.cancellationTxHash ??
          lifecycle.createTxHash ??
          lifecycle.txHash,
      );
      logWarn('pollCycle: perpetual lifecycle status resolved', {
        threadId: params.runtimeThreadId,
        checkpointId: params.runtimeCheckpointId,
        checkpointNamespace: params.runtimeCheckpointNamespace,
        iteration: params.iteration,
        attempt,
        maxAttempts,
        lifecycleStatus: lifecycle.status,
        lifecycleOrderKey: lifecycle.orderKey,
        lifecycleTxHash,
        lifecycleReason: lifecycle.reason,
      });

      if (lifecycle.status === 'executed') {
        finalTxHash = asLifecycleTxHash(lifecycle.executionTxHash) ?? lifecycleTxHash;
        if (attempt > 1) {
          const confirmedStatus = buildTaskStatus(
            task,
            'working',
            `[Cycle ${params.iteration}] GMX order executed; reconciled final execution hash ${finalTxHash?.slice(0, 10) ?? params.submissionTxHash.slice(0, 10)}...`,
          );
          task = confirmedStatus.task;
          statusEvent = confirmedStatus.statusEvent;
          await copilotkitEmitState(params.config, {
            thread: {
              task,
              activity: { events: [statusEvent], telemetry: params.activityTelemetry },
              metrics: {
                latestCycle: params.latestCycle
                  ? { ...params.latestCycle, txHash: finalTxHash ?? params.submissionTxHash }
                  : undefined,
              },
            },
          });
        }
        return {
          task,
          statusEvent,
          lifecycleStatus,
          finalTxHash,
          pendingAfterWatch: false,
        };
      }

      if (lifecycle.status === 'cancelled' || lifecycle.status === 'failed') {
        lifecycleFailure = summarizeExecutionFailure({
          iteration: params.iteration,
          error: formatLifecycleFailureDetail({
            status: lifecycle.status,
            reason: lifecycle.reason,
            reasonBytes: lifecycle.reasonBytes,
            requestedPrice: lifecycle.requestedPrice,
            observedPrice: lifecycle.observedPrice,
          }),
        });
        return {
          task,
          statusEvent,
          lifecycleFailure,
          lifecycleStatus,
          finalTxHash: lifecycleTxHash,
          pendingAfterWatch: false,
        };
      }

      if (lifecycle.status !== 'pending' || attempt === maxAttempts) {
        return {
          task,
          statusEvent,
          lifecycleStatus,
          finalTxHash: lifecycleTxHash,
          pendingAfterWatch: lifecycle.status === 'pending',
        };
      }

      const waitingStatus = buildTaskStatus(
        task,
        'working',
        `[Cycle ${params.iteration}] GMX order pending; waiting for final execution hash (${attempt}/${maxAttempts}).`,
      );
      task = waitingStatus.task;
      statusEvent = waitingStatus.statusEvent;
      await copilotkitEmitState(params.config, {
        thread: {
          task,
          activity: { events: [statusEvent], telemetry: params.activityTelemetry },
          metrics: {
            latestCycle: params.latestCycle
              ? { ...params.latestCycle, txHash: params.submissionTxHash }
              : undefined,
          },
        },
      });
      if (intervalMs > 0) {
        await delay(intervalMs);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn('pollCycle: perpetual lifecycle status query failed', {
        threadId: params.runtimeThreadId,
        checkpointId: params.runtimeCheckpointId,
        checkpointNamespace: params.runtimeCheckpointNamespace,
        iteration: params.iteration,
        txHash: params.submissionTxHash,
        error: message,
      });
      lifecycleFailure = summarizeExecutionFailure({
        iteration: params.iteration,
        error: `Unable to verify onchain order lifecycle status: ${message}`,
      });
      return {
        task,
        statusEvent,
        lifecycleFailure,
        lifecycleStatus,
        pendingAfterWatch: false,
      };
    }
  }

  return {
    task,
    statusEvent,
    lifecycleStatus,
    finalTxHash,
    pendingAfterWatch: lifecycleStatus === 'pending',
  };
}

function formatLifecycleFailureDetail(params: {
  status: 'cancelled' | 'failed';
  reason?: string;
  reasonBytes?: string;
  requestedPrice?: string;
  observedPrice?: string;
}): string {
  const decodedReason = decodeLifecycleFailureReason(params);
  if (decodedReason) {
    return `Onchain order ${params.status}: ${decodedReason}`;
  }
  return `Onchain order ${params.status}.`;
}

function parseBigIntValue(raw: string | undefined): bigint | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim();
  if (!/^(0x[0-9a-f]+|\d+)$/iu.test(normalized)) {
    return undefined;
  }
  try {
    return BigInt(normalized);
  } catch {
    return undefined;
  }
}

function formatPercentFromBps(valueBps: bigint): string {
  const whole = valueBps / 100n;
  const fraction = valueBps % 100n;
  return `${whole.toString()}.${fraction.toString().padStart(2, '0')}%`;
}

function decodeLifecycleFailureReason(params: {
  reason?: string;
  reasonBytes?: string;
  requestedPrice?: string;
  observedPrice?: string;
}): string | undefined {
  const explicitReason = params.reason?.trim();
  if (explicitReason) {
    return explicitReason;
  }

  const reasonBytes = params.reasonBytes?.trim().toLowerCase();
  if (reasonBytes && /^0x[0-9a-f]+$/u.test(reasonBytes) && reasonBytes.length >= 10) {
    const selector = reasonBytes.slice(0, 10);
    if (selector === '0xe09ad0e9' && reasonBytes.length >= 10 + 64 * 2) {
      const orderPriceRaw = parseBigIntValue(`0x${reasonBytes.slice(10, 74)}`);
      const acceptablePriceRaw = parseBigIntValue(`0x${reasonBytes.slice(74, 138)}`);
      if (
        orderPriceRaw !== undefined &&
        acceptablePriceRaw !== undefined &&
        acceptablePriceRaw > 0n
      ) {
        const absDiff =
          orderPriceRaw >= acceptablePriceRaw
            ? orderPriceRaw - acceptablePriceRaw
            : acceptablePriceRaw - orderPriceRaw;
        const diffBps = (absDiff * 10_000n) / acceptablePriceRaw;
        const direction = orderPriceRaw > acceptablePriceRaw ? 'above' : 'below';
        return `OrderNotFulfillableAtAcceptablePrice (order price ${direction} acceptable bound by ~${formatPercentFromBps(diffBps)}).`;
      }
      return 'OrderNotFulfillableAtAcceptablePrice.';
    }
  }

  const requestedPriceRaw = parseBigIntValue(params.requestedPrice);
  const observedPriceRaw = parseBigIntValue(params.observedPrice);
  if (
    requestedPriceRaw !== undefined &&
    observedPriceRaw !== undefined &&
    requestedPriceRaw > 0n
  ) {
    const absDiff =
      observedPriceRaw >= requestedPriceRaw
        ? observedPriceRaw - requestedPriceRaw
        : requestedPriceRaw - observedPriceRaw;
    const diffBps = (absDiff * 10_000n) / requestedPriceRaw;
    const direction = observedPriceRaw > requestedPriceRaw ? 'above' : 'below';
    return `Price moved outside acceptable bounds (observed ${direction} requested by ~${formatPercentFromBps(diffBps)}).`;
  }

  return undefined;
}

function buildLatestSnapshot(params: {
  marketAddress: `0x${string}`;
  timestamp: string;
  position?: PerpetualPosition;
  fallbackSizeUsd?: number;
  fallbackLeverage?: number;
  fallbackOpenedAt?: string;
  previous?: GmxLatestSnapshot;
}): GmxLatestSnapshot {
  const positionSize = params.position ? parseUsdMetric(params.position.sizeInUsd) : undefined;
  const totalUsd = positionSize ?? params.fallbackSizeUsd;
  const collateralUsd = params.position
    ? parseBaseUnitAmount(params.position.collateralAmount, params.position.collateralToken.decimals)
    : undefined;
  const derivedLeverage =
    positionSize !== undefined && collateralUsd !== undefined && collateralUsd > 0
      ? positionSize / collateralUsd
      : undefined;
  const leverage = derivedLeverage ?? params.fallbackLeverage ?? params.previous?.leverage;

  const openedAt = params.position
    ? parseEpochToIso(params.position.increasedAtTime)
    : params.fallbackOpenedAt ?? params.previous?.positionOpenedAt;

  if (!params.position && totalUsd === undefined && params.previous) {
    return {
      ...params.previous,
      timestamp: params.timestamp,
    };
  }

  if (params.position) {
    const collateralAddress = normalizeHexAddress(
      params.position.collateralToken.tokenUid.address,
      'collateral token address',
    );
    return {
      poolAddress: normalizeHexAddress(params.position.marketAddress, 'market address'),
      totalUsd,
      leverage,
      timestamp: params.timestamp,
      positionOpenedAt: openedAt,
      positionTokens: [
        {
          address: collateralAddress,
          symbol: params.position.collateralToken.symbol,
          decimals: params.position.collateralToken.decimals,
          amountBaseUnits: params.position.collateralAmount,
          valueUsd: collateralUsd,
        },
      ],
    };
  }

  return {
    poolAddress: params.marketAddress,
    totalUsd,
    leverage,
    timestamp: params.timestamp,
    positionOpenedAt: openedAt,
    positionTokens: [],
  };
}

export const pollCycleNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const runtimeConfig = (config as Configurable).configurable;
  const runtimeThreadId = runtimeConfig?.thread_id;
  const runtimeCheckpointId = runtimeConfig?.checkpoint_id;
  const runtimeCheckpointNamespace = runtimeConfig?.checkpoint_ns;
  const { operatorConfig, selectedPool } = state.thread;
  const delegationsBypassActive = state.thread.delegationsBypassActive === true;

  if (!operatorConfig || !selectedPool) {
    const nextOnboardingNode = resolveNextOnboardingNode(state);
    if (nextOnboardingNode !== 'syncState') {
      const needsUserInput =
        nextOnboardingNode === 'collectSetupInput' ||
        nextOnboardingNode === 'collectFundingTokenInput' ||
        nextOnboardingNode === 'collectDelegations';
      const status = needsUserInput ? 'input-required' : 'working';
      const message = needsUserInput
        ? 'Cycle paused until onboarding input is complete.'
        : 'Cycle paused while onboarding prerequisites are prepared.';
      const { task, statusEvent } = buildTaskStatus(state.thread.task, status, message);
      const pendingView = {
        task,
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      };
      const mergedView = {
        ...state.thread,
        ...pendingView,
      };
      logInfo('pollCycle: onboarding incomplete; rerouting before polling', {
        nextOnboardingNode,
        hasOperatorConfig: Boolean(state.thread.operatorConfig),
        hasSelectedPool: Boolean(state.thread.selectedPool),
      });
      await copilotkitEmitState(config, {
        thread: mergedView,
      });
      if (needsUserInput) {
        logPauseSnapshot({
          node: 'pollCycle',
          reason: 'onboarding prerequisites incomplete',
          thread: mergedView,
          metadata: {
            pauseMechanism: 'state-wait',
            nextOnboardingNode,
          },
        });
      }
      return {
        thread: pendingView,
      };
    }

    const failureMessage = 'ERROR: Polling node missing GMX strategy configuration';
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry } },
    });
    return {
      thread: {
        haltReason: failureMessage,
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        metrics: state.thread.metrics,
        task,
        profile: state.thread.profile,
        transactionHistory: state.thread.transactionHistory,
      },
    };
  }

  logInfo('pollCycle: executing cycle with configured strategy', {
    threadId: runtimeThreadId,
    checkpointId: runtimeCheckpointId,
    checkpointNamespace: runtimeCheckpointNamespace,
    hasOperatorConfig: Boolean(operatorConfig),
    hasSelectedPool: Boolean(selectedPool),
    onboardingStatus: state.thread.onboardingFlow?.status,
    currentTaskState: state.thread.task?.taskStatus?.state,
    currentTaskMessage: state.thread.task?.taskStatus?.message?.content,
  });

  const iteration = (state.thread.metrics.iteration ?? 0) + 1;
  const planBuilderWalletAddress = resolvePlanBuilderWalletAddress({
    operatorConfig,
    delegationsBypassActive,
  });
  const topicKey = resolveTopicKey(selectedPool.baseSymbol);
  const topicId = ALLORA_TOPIC_IDS[topicKey];
  const topicLabel = ALLORA_TOPIC_LABELS[topicKey];

  let prediction: AlloraPrediction;
  let inferenceSnapshotKey = state.thread.metrics.lastInferenceSnapshotKey;
  let staleCycles = state.thread.metrics.staleCycles ?? 0;
  try {
    const inference = await fetchAlloraInference({
      baseUrl: resolveAlloraApiBaseUrl(),
      chainId: resolveAlloraChainId(),
      topicId,
      apiKey: resolveAlloraApiKey(),
      cacheTtlMs: resolveAllora8hInferenceCacheTtlMs(),
    });
    inferenceSnapshotKey = buildInferenceSnapshotKey(inference);
    staleCycles = 0;
    const currentPrice = state.thread.metrics.previousPrice ?? inference.combinedValue;
    prediction = buildAlloraPrediction({
      inference,
      currentPrice,
      topic: topicLabel,
      horizonHours: ALLORA_HORIZON_HOURS,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    staleCycles += 1;

    // Auth errors are configuration errors; surface them immediately.
    if (message.includes('(401)') || message.includes('(403)')) {
      const failureMessage = `ERROR: Failed to fetch Allora prediction: ${message}`;
      const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        thread: {
          task,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        },
      });
      return {
        thread: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
          metrics: { ...state.thread.metrics, staleCycles, iteration },
          task,
          profile: state.thread.profile,
          transactionHistory: state.thread.transactionHistory,
        },
      };
    }

    // Transient failures should not brick the agent; skip trades and retry on the next cycle.
    if (staleCycles > ALLORA_STALE_CYCLE_LIMIT) {
      const failureMessage = `ERROR: Abort: Allora API unreachable for ${staleCycles} consecutive cycles (last error: ${message})`;
      const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        thread: {
          task,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        },
      });
      return {
        thread: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
          metrics: { ...state.thread.metrics, staleCycles, iteration },
          task,
          profile: state.thread.profile,
          transactionHistory: state.thread.transactionHistory,
        },
      };
    }

    const warningMessage = `WARNING: Allora prediction unavailable (attempt ${staleCycles}/${ALLORA_STALE_CYCLE_LIMIT}); skipping trades this cycle.`;
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'working', warningMessage);
    await copilotkitEmitState(config, {
      thread: {
        task,
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      },
    });
    return {
      thread: {
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        metrics: { ...state.thread.metrics, staleCycles, iteration },
        task,
        profile: state.thread.profile,
        transactionHistory: state.thread.transactionHistory,
      },
    };
  }

  let gmxMarketAddress: string;
  let positions: PerpetualPosition[] = [];
  const onchainActionsClient = getOnchainActionsClient();
  try {
    const chainIds = [ARBITRUM_CHAIN_ID.toString()];
    const [markets, walletPositions] = await Promise.all([
      onchainActionsClient.listPerpetualMarkets({ chainIds }),
      onchainActionsClient.listPerpetualPositions({
        walletAddress: planBuilderWalletAddress,
        chainIds,
      }),
    ]);

    const selectedMarket = selectGmxPerpetualMarket({
      markets,
      baseSymbol: selectedPool.baseSymbol,
      quoteSymbol: selectedPool.quoteSymbol,
    });

    if (!selectedMarket) {
      const failureMessage = `ERROR: No GMX ${selectedPool.baseSymbol}/${selectedPool.quoteSymbol} market available`;
      const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        thread: {
          task,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        },
      });
      return {
        thread: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
          metrics: state.thread.metrics,
          task,
          profile: state.thread.profile,
          transactionHistory: state.thread.transactionHistory,
        },
      };
    }

    gmxMarketAddress = selectedMarket.marketToken.address;
    positions = walletPositions;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Failed to fetch GMX markets/positions from ${ONCHAIN_ACTIONS_API_URL}: ${message}`;
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry } },
    });
    return {
      thread: {
        haltReason: failureMessage,
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        metrics: state.thread.metrics,
        task,
        profile: state.thread.profile,
        transactionHistory: state.thread.transactionHistory,
      },
    };
  }

  const previousCycle = state.thread.metrics.latestCycle;
  const assumedPositionSide = state.thread.metrics.assumedPositionSide;
  let reconciledAssumedPositionSide = assumedPositionSide;
  const nowEpochMs = Date.now();
  let activePositionSyncGuard = resolveActivePositionSyncGuard(
    state.thread.metrics.pendingPositionSync,
    nowEpochMs,
  );
  const normalizedTargetMarket = gmxMarketAddress.toLowerCase();
  const currentMarketPosition = positions.find(
    (position) => position.marketAddress.toLowerCase() === normalizedTargetMarket,
  );
  let positionSyncGuardClearedFromLifecycle = false;
  if (activePositionSyncGuard && !currentMarketPosition && activePositionSyncGuard.sourceTxHash) {
    const guardSourceTxHash = normalizeHexAddress(
      activePositionSyncGuard.sourceTxHash,
      'position sync source tx hash',
    );
    const guardSourceAction = activePositionSyncGuard.sourceAction;
    try {
      const guardLifecycle = await onchainActionsClient.getPerpetualLifecycle({
        providerName: GMX_PERPETUALS_PROVIDER_NAME,
        chainId: ARBITRUM_CHAIN_ID.toString(),
        txHash: guardSourceTxHash,
        walletAddress: planBuilderWalletAddress,
      });
      if (
        isResolvedLifecycle(guardLifecycle) &&
        (guardLifecycle.status === 'cancelled' || guardLifecycle.status === 'failed')
      ) {
        logWarn('pollCycle: clearing stale position sync guard after terminal lifecycle', {
          threadId: runtimeThreadId,
          checkpointId: runtimeCheckpointId,
          checkpointNamespace: runtimeCheckpointNamespace,
          iteration,
          guardSourceTxHash,
          guardSourceAction,
          lifecycleStatus: guardLifecycle.status,
          lifecycleReason: guardLifecycle.reason,
        });
        activePositionSyncGuard = undefined;
        reconciledAssumedPositionSide = undefined;
        positionSyncGuardClearedFromLifecycle = true;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn('pollCycle: position sync guard lifecycle query failed', {
        threadId: runtimeThreadId,
        checkpointId: runtimeCheckpointId,
        checkpointNamespace: runtimeCheckpointNamespace,
        iteration,
        guardSourceTxHash,
        error: message,
      });
    }
  }
  logWarn('pollCycle: market position snapshot before decision', {
    threadId: runtimeThreadId,
    checkpointId: runtimeCheckpointId,
    checkpointNamespace: runtimeCheckpointNamespace,
    iteration,
    targetMarketAddress: normalizedTargetMarket,
    totalPositions: positions.length,
    matchedMarketPosition: Boolean(currentMarketPosition),
    matchedPositionSide: currentMarketPosition?.positionSide,
    matchedPositionSizeUsd: currentMarketPosition?.sizeInUsd,
    matchedPositionPnl: currentMarketPosition?.pnl,
    assumedPositionSide,
    reconciledAssumedPositionSide,
    activePositionSyncGuardExpectedSide: activePositionSyncGuard?.expectedSide,
    activePositionSyncGuardSourceAction: activePositionSyncGuard?.sourceAction,
    activePositionSyncGuardExpiresAtEpochMs: activePositionSyncGuard?.expiresAtEpochMs,
    positionSyncGuardClearedFromLifecycle,
  });
  const currentPositionSide = currentMarketPosition?.positionSide;
  // Only treat a prior position as open when it is backed by onchain state
  // (current position) or explicit local assumption from a successful prior trade.
  // Never infer open state from previous cycle telemetry alone.
  const decisionPreviousSide =
    currentPositionSide ?? reconciledAssumedPositionSide ?? activePositionSyncGuard?.expectedSide;
  const decisionPreviousAction = decisionPreviousSide ? 'open' : undefined;
  logWarn('pollCycle: decision context resolved', {
    threadId: runtimeThreadId,
    checkpointId: runtimeCheckpointId,
    checkpointNamespace: runtimeCheckpointNamespace,
    iteration,
    currentPositionSide,
    assumedPositionSide,
    reconciledAssumedPositionSide,
    previousCycleAction: previousCycle?.action,
    previousCycleSide: previousCycle?.side,
    activePositionSyncGuardExpectedSide: activePositionSyncGuard?.expectedSide,
    activePositionSyncGuardSourceAction: activePositionSyncGuard?.sourceAction,
    decisionPreviousAction,
    decisionPreviousSide,
  });
  const { telemetry, nextCyclesSinceTrade: initialCyclesSinceTrade } = buildCycleTelemetry({
    prediction,
    decisionThreshold: DECISION_THRESHOLD,
    cooldownCycles: 0,
    maxLeverage: operatorConfig.maxLeverage,
    baseContributionUsd: operatorConfig.baseContributionUsd,
    previousAction: decisionPreviousAction,
    previousSide: decisionPreviousSide,
    cyclesSinceTrade: state.thread.metrics.cyclesSinceRebalance ?? 0,
    isFirstCycle: iteration === 1,
    iteration,
    marketSymbol: `${selectedPool.baseSymbol}/${selectedPool.quoteSymbol}`,
  });

  const exposureAdjusted = applyExposureLimits({
    telemetry,
    positions,
    targetMarketAddress: gmxMarketAddress,
    maxMarketExposureUsd: operatorConfig.baseContributionUsd * operatorConfig.maxLeverage,
    maxTotalExposureUsd: operatorConfig.baseContributionUsd * operatorConfig.maxLeverage,
  });

  const positionForReduce =
    exposureAdjusted.action === 'reduce' && exposureAdjusted.side
      ? positions.find(
          (position) =>
            position.marketAddress.toLowerCase() === normalizedTargetMarket &&
            position.positionSide === exposureAdjusted.side,
        )
      : undefined;
  const txExecutionMode = resolveGmxAlloraTxExecutionMode();

  const plannedExecutionPlan = buildPerpetualExecutionPlan({
    telemetry: exposureAdjusted,
    txExecutionMode,
    chainId: ARBITRUM_CHAIN_ID.toString(),
    marketAddress: gmxMarketAddress as `0x${string}`,
    walletAddress: planBuilderWalletAddress,
    payTokenAddress: operatorConfig.fundingTokenAddress,
    collateralTokenAddress: operatorConfig.collateralTokenAddress,
    actualPositionSide: currentPositionSide,
    assumedPositionSide: reconciledAssumedPositionSide ?? activePositionSyncGuard?.expectedSide,
    positionContractKey: positionForReduce?.contractKey,
    positionSizeInUsd: positionForReduce?.sizeInUsd,
  });
  const fundingTokenAddress = operatorConfig.fundingTokenAddress;
  const collateralTokenAddress = operatorConfig.collateralTokenAddress;
  const collateralSwapFundingEstimate =
    typeof fundingTokenAddress !== 'string' ||
    typeof collateralTokenAddress !== 'string' ||
    fundingTokenAddress.toLowerCase() === collateralTokenAddress.toLowerCase()
      ? undefined
      : {
          fromTokenDecimals: operatorConfig.fundingTokenDecimals,
          fromTokenBalanceBaseUnits: operatorConfig.fundingTokenBalanceBaseUnits,
          fromTokenUsdPrice: operatorConfig.fundingTokenUsdPrice,
          toTokenDecimals: operatorConfig.collateralTokenDecimals,
          toTokenUsdPrice: 1,
        };

  const skipTradeForUnchangedInference =
    isTradePlanAction(plannedExecutionPlan.action) &&
    Boolean(inferenceSnapshotKey) &&
    state.thread.metrics.lastTradedInferenceSnapshotKey === inferenceSnapshotKey;

  let adjustedTelemetry = skipTradeForUnchangedInference
    ? {
        ...exposureAdjusted,
        action: 'hold' as const,
        reason: 'Inference metrics unchanged since last trade; skipping additional action.',
        side: undefined,
        leverage: undefined,
        sizeUsd: undefined,
        txHash: undefined,
      }
    : exposureAdjusted;

  let executionPlan = skipTradeForUnchangedInference
    ? ({ action: 'none' } as const)
    : plannedExecutionPlan;
  const shouldDeferTradeForPositionSync =
    txExecutionMode === 'execute' &&
    Boolean(activePositionSyncGuard) &&
    !currentMarketPosition &&
    executionPlan.action !== 'none';
  if (shouldDeferTradeForPositionSync) {
    const sourceTxHash = activePositionSyncGuard?.sourceTxHash;
    const sourceAction = activePositionSyncGuard?.sourceAction;
    adjustedTelemetry = {
      ...adjustedTelemetry,
      action: 'hold',
      side: undefined,
      leverage: undefined,
      sizeUsd: undefined,
      txHash: undefined,
      reason: sourceTxHash
        ? `Awaiting GMX position index sync after ${sourceAction} tx ${sourceTxHash.slice(0, 10)}... before next trade decision.`
        : `Awaiting GMX position index sync after ${sourceAction} action before next trade decision.`,
    };
    executionPlan = { action: 'none' } as const;
  }
  logWarn('pollCycle: decision and execution plan resolved', {
    threadId: runtimeThreadId,
    checkpointId: runtimeCheckpointId,
    checkpointNamespace: runtimeCheckpointNamespace,
    iteration,
    adjustedAction: adjustedTelemetry.action,
    adjustedReason: adjustedTelemetry.reason,
    decisionSide: adjustedTelemetry.side,
    decisionSizeUsd: adjustedTelemetry.sizeUsd,
    executionPlanAction: executionPlan.action,
    skipTradeForUnchangedInference,
    deferredForPositionSync: shouldDeferTradeForPositionSync,
    activePositionSyncGuardExpectedSide: activePositionSyncGuard?.expectedSide,
    activePositionSyncGuardSourceAction: activePositionSyncGuard?.sourceAction,
    inferenceSnapshotKey,
    lastTradedInferenceSnapshotKey: state.thread.metrics.lastTradedInferenceSnapshotKey,
    txExecutionMode: resolveGmxAlloraTxExecutionMode(),
  });

  const nextCyclesSinceTrade =
    adjustedTelemetry.action === 'hold' && telemetry.action === 'open'
      ? (state.thread.metrics.cyclesSinceRebalance ?? 0) + 1
      : initialCyclesSinceTrade;

  const action = adjustedTelemetry.action;
  const reason = adjustedTelemetry.reason;
  const txHash = adjustedTelemetry.txHash;

  const cycleStatusMessage = `[Cycle ${iteration}] ${action}: ${reason}${txHash ? ` (tx: ${txHash.slice(0, 10)}...)` : ''}`;
  let { task, statusEvent } = buildTaskStatus(state.thread.task, 'working', cycleStatusMessage);
  await copilotkitEmitState(config, {
    thread: {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      metrics: { latestCycle: adjustedTelemetry },
    },
  });

  if (shouldDelayIteration(iteration)) {
    const stepDelayMs = Math.max(1, Math.floor(CONNECT_DELAY_MS / CONNECT_DELAY_STEPS));
    for (let step = 1; step <= CONNECT_DELAY_STEPS; step += 1) {
      const waitMessage = `[Cycle ${iteration}] streaming... (${step}/${CONNECT_DELAY_STEPS})`;
      const updated = buildTaskStatus(task, 'working', waitMessage);
      task = updated.task;
      statusEvent = updated.statusEvent;
      await copilotkitEmitState(config, {
        thread: {
          task,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
          metrics: { latestCycle: adjustedTelemetry },
        },
      });
      await delay(stepDelayMs);
    }
  }

  const clients = txExecutionMode === 'execute' ? getOnchainClients() : undefined;
  if (executionPlan.action === 'none') {
    logWarn('pollCycle: execution plan is none; no order simulation/execution will be attempted', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      adjustedAction: adjustedTelemetry.action,
      adjustedReason: adjustedTelemetry.reason,
      txExecutionMode,
    });
  } else {
    logWarn('pollCycle: invoking executePerpetualPlan', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      executionPlanAction: executionPlan.action,
      txExecutionMode,
      delegationsBypassActive,
      hasDelegationBundle: Boolean(state.thread.delegationBundle),
      planBuilderWalletAddress,
      delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
      delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
    });
  }
  let executionResult =
    executionPlan.action === 'flip'
      ? await executeConfirmedFlipPlan({
          onchainActionsClient,
          plan: executionPlan,
          txExecutionMode,
          clients,
          delegationsBypassActive,
          delegationBundle: state.thread.delegationBundle,
          delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
          delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
          swapFundingEstimate: collateralSwapFundingEstimate,
          runtimeThreadId,
          runtimeCheckpointId,
          runtimeCheckpointNamespace,
          iteration,
        })
      : await executePerpetualPlan({
          client: onchainActionsClient,
          clients,
          plan: executionPlan,
          txExecutionMode,
          delegationsBypassActive,
          delegationBundle: state.thread.delegationBundle,
          delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
          delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
          swapFundingEstimate: collateralSwapFundingEstimate,
        });
  logWarn('pollCycle: executePerpetualPlan resolved', {
    threadId: runtimeThreadId,
    checkpointId: runtimeCheckpointId,
    checkpointNamespace: runtimeCheckpointNamespace,
    iteration,
    action: executionResult.action,
    ok: executionResult.ok,
    txHash: executionResult.lastTxHash,
    txHashes: executionResult.txHashes,
    error: executionResult.ok ? undefined : executionResult.error,
  });
  const initialExecutionFailure = executionResult.ok
    ? undefined
    : summarizeExecutionFailure({
        iteration,
        error: executionResult.error,
      });
  let executionFeeTopUpFunded = false;
  if (
    txExecutionMode === 'execute' &&
    initialExecutionFailure?.requiresFundingAcknowledgement === true &&
    shouldAttemptExecutionFeeAutoTopUp(executionResult.error)
  ) {
    logWarn('pollCycle: execution-fee shortfall detected; attempting USDC -> ETH top-up', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      walletAddress: planBuilderWalletAddress,
      fundingTokenAddress: operatorConfig.fundingTokenAddress,
      bufferedExecutions: EXECUTION_FEE_TOP_UP_EXECUTIONS_BUFFER_MULTIPLIER,
    });
    const topUpAttempt = await maybeAutoFundExecutionFee({
      onchainActionsClient,
      txExecutionMode,
      clients,
      delegationsBypassActive,
      delegationBundle: state.thread.delegationBundle,
      planBuilderWalletAddress,
      delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
      delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
      fundingTokenAddress: operatorConfig.fundingTokenAddress,
      fundingTokenUsdPrice: operatorConfig.fundingTokenUsdPrice,
      executionPlan,
      logContext: {
        threadId: runtimeThreadId,
        checkpointId: runtimeCheckpointId,
        checkpointNamespace: runtimeCheckpointNamespace,
        iteration,
      },
    });
    logWarn('pollCycle: execution-fee top-up preflight result', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      attempted: topUpAttempt.attempted,
      funded: topUpAttempt.funded,
      error: topUpAttempt.error,
    });
    if (topUpAttempt.funded) {
      executionFeeTopUpFunded = true;
      const fundingStatus = buildTaskStatus(
        task,
        'working',
        `[Cycle ${iteration}] execution fee top-up completed; retrying trade.`,
      );
      task = fundingStatus.task;
      statusEvent = fundingStatus.statusEvent;
      await copilotkitEmitState(config, {
        thread: {
          task,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
          metrics: { latestCycle: adjustedTelemetry },
        },
      });
      executionResult =
        executionPlan.action === 'flip'
          ? await executeConfirmedFlipPlan({
              onchainActionsClient,
              plan: executionPlan,
              txExecutionMode,
              clients,
              delegationsBypassActive,
              delegationBundle: state.thread.delegationBundle,
              delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
              delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
              swapFundingEstimate: collateralSwapFundingEstimate,
              runtimeThreadId,
              runtimeCheckpointId,
              runtimeCheckpointNamespace,
              iteration,
            })
          : await executePerpetualPlan({
              client: onchainActionsClient,
              clients,
              plan: executionPlan,
              txExecutionMode,
              delegationsBypassActive,
              delegationBundle: state.thread.delegationBundle,
              delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
              delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
              swapFundingEstimate: collateralSwapFundingEstimate,
            });
      logWarn('pollCycle: retry after execution-fee top-up resolved', {
        threadId: runtimeThreadId,
        checkpointId: runtimeCheckpointId,
        checkpointNamespace: runtimeCheckpointNamespace,
        iteration,
        action: executionResult.action,
        ok: executionResult.ok,
        txHash: executionResult.lastTxHash,
        txHashes: executionResult.txHashes,
        error: executionResult.ok ? undefined : executionResult.error,
      });
    } else if (topUpAttempt.attempted) {
      logWarn('pollCycle: execution-fee top-up attempt failed', {
        threadId: runtimeThreadId,
        checkpointId: runtimeCheckpointId,
        checkpointNamespace: runtimeCheckpointNamespace,
        iteration,
        error: topUpAttempt.error,
      });
      executionResult = {
        ...executionResult,
        error: topUpAttempt.error
          ? `${executionResult.error ?? 'Execution failed'} Auto top-up failed: ${topUpAttempt.error}`
          : executionResult.error,
      };
    }
  }
  const persistentSimulationFailureAfterTopUp =
    executionFeeTopUpFunded &&
    !executionResult.ok &&
    isExecutionSimulationFailure(executionResult.error);
  if (persistentSimulationFailureAfterTopUp) {
    logWarn('pollCycle: simulation failure persisted after successful execution-fee top-up', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      error: executionResult.error,
    });
  }
  const approvalOnlyExecution =
    executionResult.ok &&
    (executionPlan.action === 'long' || executionPlan.action === 'short' || executionPlan.action === 'flip') &&
    isApprovalOnlyTransactions(executionResult.transactions);
  let lifecycleFailure: ExecutionFailureSummary | undefined;
  let lifecycleStatus: 'pending' | 'executed' | 'cancelled' | 'failed' | 'unknown' | undefined;
  let reconciledLifecycleTxHash: `0x${string}` | undefined;
  let lifecyclePendingAfterWatch = false;
  if (
    executionResult.ok &&
    txExecutionMode === 'execute' &&
    executionPlan.action !== 'none' &&
    !approvalOnlyExecution &&
    executionResult.lastTxHash
  ) {
    const watchedLifecycle = await watchLifecycleForExecutionHash({
      client: onchainActionsClient,
      config,
      task,
      statusEvent,
      activityTelemetry: state.thread.activity.telemetry,
      latestCycle: adjustedTelemetry,
      iteration,
      walletAddress: planBuilderWalletAddress,
      submissionTxHash: executionResult.lastTxHash,
      runtimeThreadId,
      runtimeCheckpointId,
      runtimeCheckpointNamespace,
    });
    task = watchedLifecycle.task;
    statusEvent = watchedLifecycle.statusEvent;
    lifecycleFailure = watchedLifecycle.lifecycleFailure;
    lifecycleStatus = watchedLifecycle.lifecycleStatus;
    reconciledLifecycleTxHash = watchedLifecycle.finalTxHash;
    lifecyclePendingAfterWatch = watchedLifecycle.pendingAfterWatch;
  }

  const userFacingTxHash = reconciledLifecycleTxHash ?? executionResult.lastTxHash;
  const userFacingTxHashes = (() => {
    const txHashes = [...(executionResult.txHashes ?? [])];
    if (userFacingTxHash && !txHashes.includes(userFacingTxHash)) {
      txHashes.push(userFacingTxHash);
    }
    return txHashes;
  })();

  const executionFailure =
    lifecycleFailure ??
    (executionResult.ok
      ? undefined
      : persistentSimulationFailureAfterTopUp
        ? summarizePersistentSimulationFailureAfterTopUp({
            iteration,
            error: executionResult.error,
          })
        : summarizeExecutionFailure({
            iteration,
            error: executionResult.error,
          }));
  const executionCompletedSuccessfully = executionResult.ok && !executionFailure;

  if (executionFailure) {
    const failedStatus = buildTaskStatus(
      task,
      executionFailure.taskState,
      executionFailure.statusMessage,
    );
    task = failedStatus.task;
    statusEvent = failedStatus.statusEvent;
  } else if (approvalOnlyExecution) {
    const approvalStatus = buildTaskStatus(
      task,
      'working',
      `[Cycle ${iteration}] approval completed; waiting for executable GMX trade transaction.`,
    );
    task = approvalStatus.task;
    statusEvent = approvalStatus.statusEvent;
  }

  let positionAfterExecution = currentMarketPosition;
  if (executionCompletedSuccessfully && executionPlan.action !== 'none') {
    try {
      const refreshedPositions = await onchainActionsClient.listPerpetualPositions({
        walletAddress: planBuilderWalletAddress,
        chainIds: [ARBITRUM_CHAIN_ID.toString()],
      });
      positionAfterExecution = refreshedPositions.find(
        (position) => position.marketAddress.toLowerCase() === normalizedTargetMarket,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logInfo('Unable to refresh GMX position snapshot after execution', { error: message });
    }
  }

  if (
    executionCompletedSuccessfully &&
    executionPlan.action === 'flip' &&
    positionAfterExecution?.positionSide !== resolveFlipSide(executionPlan.closeRequest.positionSide)
  ) {
    positionAfterExecution = await confirmFlipReopenedPosition({
      onchainActionsClient,
      walletAddress: planBuilderWalletAddress,
      marketAddress: normalizeHexAddress(gmxMarketAddress, 'market address'),
      expectedSide: resolveFlipSide(executionPlan.closeRequest.positionSide),
      runtimeThreadId,
      runtimeCheckpointId,
      runtimeCheckpointNamespace,
      iteration,
    });
  }

  const hasCompletedTradeEffect =
    executionCompletedSuccessfully && executionPlan.action !== 'none' && !approvalOnlyExecution;
  const executionAwaitingPositionConfirmation =
    hasCompletedTradeEffect && lifecycleStatus === 'pending' && !positionAfterExecution;
  const hasConfirmedTradeEffect = hasCompletedTradeEffect && !executionAwaitingPositionConfirmation;
  const latestCycle = (() => {
    if (approvalOnlyExecution) {
      return {
        ...adjustedTelemetry,
        action: 'hold' as const,
        side: undefined,
        leverage: undefined,
        sizeUsd: undefined,
        txHash: undefined,
        reason: `${adjustedTelemetry.reason} Approval completed; waiting for executable GMX trade transaction.`,
      };
    }

    const txLinkedCycle = userFacingTxHash
      ? {
          ...adjustedTelemetry,
          txHash: userFacingTxHash,
        }
      : adjustedTelemetry;

    if (!hasConfirmedTradeEffect || executionPlan.action !== 'flip') {
      return txLinkedCycle;
    }

    const previousSide = executionPlan.closeRequest.positionSide;
    const nextSide = resolveFlipSide(previousSide);
    return {
      ...txLinkedCycle,
      action: 'open' as const,
      side: nextSide,
      reason: `Signal direction flipped to ${nextSide}; closed ${previousSide} and reopened ${nextSide}.`,
    };
  })();
  const fallbackSizeUsd =
    approvalOnlyExecution
      ? undefined
      : executionCompletedSuccessfully && executionPlan.action === 'close'
      ? 0
      : executionCompletedSuccessfully &&
          (executionPlan.action === 'long' || executionPlan.action === 'short' || executionPlan.action === 'flip')
        ? adjustedTelemetry.sizeUsd
        : undefined;
  const normalizedFallbackSizeUsd =
    fallbackSizeUsd ??
    // Positions fetch already succeeded for this cycle. If target-market position is absent,
    // clear stale snapshot exposure instead of carrying forward previous non-zero totals.
    (positionAfterExecution ? undefined : 0);

  const latestSnapshot = buildLatestSnapshot({
    marketAddress: normalizeHexAddress(gmxMarketAddress, 'market address'),
    timestamp: latestCycle.timestamp,
    position: positionAfterExecution,
    fallbackSizeUsd: normalizedFallbackSizeUsd,
    fallbackLeverage:
      executionResult.ok &&
      (executionPlan.action === 'long' || executionPlan.action === 'short' || executionPlan.action === 'flip')
        ? latestCycle.leverage
        : undefined,
    fallbackOpenedAt:
      executionResult.ok &&
      (executionPlan.action === 'long' || executionPlan.action === 'short' || executionPlan.action === 'flip')
        ? latestCycle.timestamp
        : undefined,
    previous: state.thread.metrics.latestSnapshot,
  });
  const lifetimePnlUsd = positionAfterExecution
    ? parseUsdMetric(positionAfterExecution.pnl)
    : executionCompletedSuccessfully && executionPlan.action === 'close'
      ? 0
      : state.thread.metrics.lifetimePnlUsd;

  const nextPendingPositionSync: PositionSyncGuard | undefined = (():
    | PositionSyncGuard
    | undefined => {
    if (txExecutionMode !== 'execute') {
      return undefined;
    }

    const activeGuardWithoutPosition = activePositionSyncGuard && !positionAfterExecution;
    if (!executionCompletedSuccessfully || executionPlan.action === 'none' || approvalOnlyExecution) {
      return activeGuardWithoutPosition ? activePositionSyncGuard : undefined;
    }
    if (executionPlan.action === 'close') {
      if (!positionAfterExecution) {
        return undefined;
      }
      return {
        expectedSide: undefined,
        sourceAction: 'close' as const,
        sourceIteration: iteration,
        sourceTxHash: executionResult.lastTxHash,
        expiresAtEpochMs: nowEpochMs + POSITION_SYNC_GUARD_WINDOW_MS,
      };
    }

    if (executionPlan.action === 'flip') {
      const expectedSide = resolveFlipSide(executionPlan.closeRequest.positionSide);
      if (positionAfterExecution?.positionSide === expectedSide) {
        return undefined;
      }
      return {
        expectedSide,
        sourceAction: 'flip' as const,
        sourceIteration: iteration,
        sourceTxHash: executionResult.lastTxHash,
        expiresAtEpochMs: nowEpochMs + POSITION_SYNC_GUARD_WINDOW_MS,
      };
    }

    if (executionPlan.action === 'long' || executionPlan.action === 'short') {
      const expectedSide = executionPlan.action;
      if (positionAfterExecution?.positionSide === expectedSide) {
        return undefined;
      }
      return {
        expectedSide,
        sourceAction: executionPlan.action,
        sourceIteration: iteration,
        sourceTxHash: executionResult.lastTxHash,
        expiresAtEpochMs: nowEpochMs + POSITION_SYNC_GUARD_WINDOW_MS,
      };
    }
    return activeGuardWithoutPosition ? activePositionSyncGuard : undefined;
  })();
  if (nextPendingPositionSync) {
    logWarn('pollCycle: position sync guard active', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      expectedSide: nextPendingPositionSync.expectedSide,
      sourceAction: nextPendingPositionSync.sourceAction,
      sourceIteration: nextPendingPositionSync.sourceIteration,
      sourceTxHash: nextPendingPositionSync.sourceTxHash,
      expiresAtEpochMs: nextPendingPositionSync.expiresAtEpochMs,
      matchedMarketPositionAfterExecution: Boolean(positionAfterExecution),
      matchedPositionSideAfterExecution: positionAfterExecution?.positionSide,
    });
  }

  const nextAssumedPositionSide = (() => {
    if (!executionCompletedSuccessfully) {
      return (
        currentPositionSide ?? reconciledAssumedPositionSide ?? activePositionSyncGuard?.expectedSide
      );
    }
    if (approvalOnlyExecution) {
      return reconciledAssumedPositionSide;
    }
    if (executionAwaitingPositionConfirmation) {
      return currentPositionSide ?? reconciledAssumedPositionSide;
    }
    // Planned actions should advance local assumptions immediately so we don't
    // repeat stale intent on the next cycle.
    if (executionPlan.action === 'close') {
      return undefined;
    }
    if (executionPlan.action === 'flip') {
      return resolveFlipSide(executionPlan.closeRequest.positionSide);
    }
    if (executionPlan.action === 'long') {
      return 'long';
    }
    if (executionPlan.action === 'short') {
      return 'short';
    }
    // Otherwise, prefer actual onchain state when available.
    if (positionAfterExecution?.positionSide) {
      return positionAfterExecution.positionSide;
    }
    return currentPositionSide ?? reconciledAssumedPositionSide ?? nextPendingPositionSync?.expectedSide;
  })();
  const executionPlanEvent: ClmmEvent | undefined =
    executionPlan.action === 'none'
      ? undefined
      : {
          type: 'artifact',
          artifact: buildExecutionPlanArtifact({ plan: executionPlan, telemetry: latestCycle }),
          append: true,
        };
  const requiresFundingAcknowledgement = executionFailure?.requiresFundingAcknowledgement === true;
  if (requiresFundingAcknowledgement) {
    logWarn('pollCycle: execution blocked; funding acknowledgement required', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      detail: executionFailure?.detail,
      rawError: executionResult.error,
      taskState: executionFailure?.taskState,
      plannedAction: executionPlan.action,
      decisionAction: latestCycle.action,
      decisionReason: latestCycle.reason,
      targetMarketAddress: normalizedTargetMarket,
      matchedMarketPosition: Boolean(currentMarketPosition),
      matchedMarketPositionSide: currentMarketPosition?.positionSide,
      matchedMarketPositionSizeUsd: currentMarketPosition?.sizeInUsd,
      assumedPositionSide: reconciledAssumedPositionSide,
      activePositionSyncGuardExpectedSide: activePositionSyncGuard?.expectedSide,
    });
  }
  const executionResultEvent: ClmmEvent | undefined =
    executionPlan.action === 'none'
      ? undefined
      : {
          type: 'artifact',
          artifact: buildExecutionResultArtifact({
            action: executionResult.action,
            plan: executionPlan,
            ok: executionResult.ok,
            status: requiresFundingAcknowledgement
              ? 'blocked'
              : executionCompletedSuccessfully
                ? 'confirmed'
                : 'failed',
            error: requiresFundingAcknowledgement
              ? undefined
              : executionFailure?.detail ?? executionResult.error,
            telemetry: latestCycle,
            transactions: executionResult.transactions,
            txHashes: userFacingTxHashes,
            submissionTxHash: executionResult.lastTxHash,
            finalTxHash: reconciledLifecycleTxHash,
            lastTxHash: userFacingTxHash,
          }),
        append: true,
      };
  const telemetryEvent: ClmmEvent = {
    type: 'artifact',
    artifact: buildTelemetryArtifact(latestCycle),
    append: true,
  };

  const currentPollIntervalMs = state.private.pollIntervalMs ?? resolvePollIntervalMs();
  const nextPollIntervalMs = lifecyclePendingAfterWatch
    ? resolvePendingLifecycleReconcilePollIntervalMs(currentPollIntervalMs)
    : currentPollIntervalMs;
  let cronScheduled = state.private.cronScheduled;
  if (runtimeThreadId) {
    ensureCronForThread(runtimeThreadId, nextPollIntervalMs);
    if (!cronScheduled) {
      logInfo('Cron scheduled after first GMX cycle', {
        threadId: runtimeThreadId,
        checkpointId: runtimeCheckpointId,
        checkpointNamespace: runtimeCheckpointNamespace,
      });
      cronScheduled = true;
    }
  }

  const finalAction = latestCycle.action;
  const finalReason = latestCycle.reason;
  const resolvedTxHash = userFacingTxHash ?? latestCycle.txHash;
  const transactionEntry =
    executionPlan.action !== 'none' &&
    !requiresFundingAcknowledgement &&
    !executionAwaitingPositionConfirmation
      ? {
          cycle: iteration,
          action: finalAction,
          txHash: resolvedTxHash,
          status: executionCompletedSuccessfully ? ('success' as const) : ('failed' as const),
          reason: executionCompletedSuccessfully
            ? finalReason
            : executionFailure?.detail ?? executionResult.error ?? finalReason,
          timestamp: latestCycle.timestamp,
        }
      : undefined;

  const baseAum = state.thread.profile.aum ?? 52_000;
  const baseIncome = state.thread.profile.agentIncome ?? 5_400;
  const aumDelta = finalAction === 'hold' || finalAction === 'cooldown' ? 10 : 180;
  const incomeDelta = finalAction === 'hold' || finalAction === 'cooldown' ? 1.2 : 9.5;
  const nextProfile = {
    ...state.thread.profile,
    aum: Number((baseAum + aumDelta).toFixed(2)),
    agentIncome: Number((baseIncome + incomeDelta).toFixed(2)),
  };

  return {
    thread: {
      metrics: {
        lastSnapshot: selectedPool,
        previousPrice: prediction.predictedPrice,
        cyclesSinceRebalance: approvalOnlyExecution
          ? (state.thread.metrics.cyclesSinceRebalance ?? 0) + 1
          : nextCyclesSinceTrade,
        staleCycles: state.thread.metrics.staleCycles ?? 0,
        iteration,
        latestCycle,
        aumUsd: latestSnapshot.totalUsd,
        apy: state.thread.metrics.apy ?? state.thread.profile.apy,
        lifetimePnlUsd,
        latestSnapshot,
        assumedPositionSide: nextAssumedPositionSide,
        lastInferenceSnapshotKey: inferenceSnapshotKey,
        lastTradedInferenceSnapshotKey:
          hasConfirmedTradeEffect && inferenceSnapshotKey
            ? inferenceSnapshotKey
            : state.thread.metrics.lastTradedInferenceSnapshotKey,
        pendingPositionSync: nextPendingPositionSync,
      },
      task,
      activity: {
        telemetry: [latestCycle],
        events: executionPlanEvent
          ? executionResultEvent
            ? [telemetryEvent, executionPlanEvent, executionResultEvent, statusEvent]
            : [telemetryEvent, executionPlanEvent, statusEvent]
          : [telemetryEvent, statusEvent],
      },
      transactionHistory: transactionEntry
        ? [...state.thread.transactionHistory, transactionEntry]
        : state.thread.transactionHistory,
      profile: nextProfile,
      selectedPool,
      haltReason: '',
      executionError: executionFailure?.requiresFundingAcknowledgement
        ? ''
        : executionFailure?.detail ?? '',
    },
    private: {
      cronScheduled,
      pollIntervalMs: nextPollIntervalMs,
    },
  };
};
