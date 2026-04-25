import { createHash } from 'node:crypto';

import type { AgentRuntimeSigningService } from 'agent-runtime/internal';
import { signPreparedEvmTransaction } from 'agent-runtime/internal';

import type { PortfolioManagerSharedEmberProtocolHost } from './sharedEmberAdapter.js';
import {
  HIDDEN_OCA_EXECUTOR_AGENT_ID,
  HIDDEN_OCA_EXECUTOR_CONTROL_PATH,
} from './serviceIdentityPreflight.js';

const DEFAULT_ONCHAIN_ACTIONS_API_URL = 'https://api.emberai.xyz';
const DEFAULT_RUNTIME_SIGNER_REF = 'oca-executor-wallet';
const OWS_SIGNING_CHAIN = 'evm';
const MAX_EXECUTION_REQUEST_ATTEMPTS = 4;

type TokenIdentifier = {
  chainId: string;
  address: string;
};

type OnchainActionsToken = {
  tokenUid: TokenIdentifier;
  name: string;
  symbol: string;
  isNative?: boolean;
  decimals?: number;
  isVetted?: boolean;
};

type OnchainActionsTransactionRequest = {
  type: string;
  to: `0x${string}`;
  value?: string;
  data: `0x${string}`;
  chainId: string;
};

type OnchainActionsSwapResponse = {
  fromToken: OnchainActionsToken;
  toToken: OnchainActionsToken;
  exactFromAmount: string;
  displayFromAmount: string;
  exactToAmount: string;
  displayToAmount: string;
  transactions: OnchainActionsTransactionRequest[];
};

export type HiddenOcaReservationConflictHandling =
  | {
      kind: 'allow_reserved_for_other_agent';
    }
  | {
      kind: 'unassigned_only';
    };

export type HiddenOcaSpotSwapInput = {
  idempotencyKey?: string;
  rootedWalletContextId?: string;
  walletAddress: `0x${string}`;
  amount: string;
  amountType: 'exactIn' | 'exactOut';
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  slippageTolerance?: string;
  expiration?: string;
  reservationConflictHandling?: HiddenOcaReservationConflictHandling;
};

type HiddenOcaSpotSwapExecutionInput = {
  threadId: string;
  currentRevision?: number | null;
  input: HiddenOcaSpotSwapInput;
};

export type HiddenOcaSpotSwapResult = {
  status: 'completed' | 'submitted' | 'conflict' | 'awaiting_redelegation' | 'blocked' | 'failed';
  swapSummary: {
    fromToken: string;
    toToken: string;
    amount: string;
    amountType: HiddenOcaSpotSwapInput['amountType'];
    displayFromAmount: string;
    displayToAmount: string;
  };
  transactionPlanId: string | null;
  requestId: string | null;
  transactionHash?: string | null;
  committedEventIds: string[];
  conflict?: {
    kind: 'reserved_for_other_agent';
    blockingReasonCode: string;
    reservationId: string | null;
    message: string;
    retryOptions: Array<HiddenOcaReservationConflictHandling['kind']>;
  };
  failureReason?: string;
};

export type HiddenOcaOnchainActionsClient = {
  listTokens: (input: { chainIds?: string[] }) => Promise<OnchainActionsToken[]>;
  createSwap: (input: {
    walletAddress: `0x${string}`;
    amount: string;
    amountType: HiddenOcaSpotSwapInput['amountType'];
    fromTokenUid: TokenIdentifier;
    toTokenUid: TokenIdentifier;
    slippageTolerance?: string;
    expiration?: string;
  }) => Promise<OnchainActionsSwapResponse>;
};

type PreparedUnsignedTransactionResolutionInput = {
  executionResult: Record<string, unknown>;
  swapResponse: OnchainActionsSwapResponse;
};

type HiddenOcaSpotSwapExecutorOptions = {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  onchainActionsClient?: HiddenOcaOnchainActionsClient;
  onchainActionsBaseUrl?: string;
  runtimeSigning?: AgentRuntimeSigningService;
  runtimeSignerRef?: string;
  executorWalletAddress?: `0x${string}`;
  resolvePreparedUnsignedTransactionHex?: (
    input: PreparedUnsignedTransactionResolutionInput,
  ) => Promise<`0x${string}` | null>;
  requestRedelegationRefresh?: (input: {
    threadId: string;
    transactionPlanId: string;
    requestId: string;
  }) => Promise<void>;
  signPreparedTransaction?: typeof signPreparedEvmTransaction;
};

type HiddenOcaSpotSwapExecutor = {
  executeSpotSwap: (input: HiddenOcaSpotSwapExecutionInput) => Promise<HiddenOcaSpotSwapResult>;
};

type SharedEmberRevisionResponse = {
  result?: {
    revision?: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readHexAddress(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  return normalized?.startsWith('0x') ? (normalized as `0x${string}`) : null;
}

function readInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readRecordKey(input: unknown, key: string): Record<string, unknown> | null {
  return isRecord(input) && isRecord(input[key]) ? input[key] : null;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function sanitizeIdSegment(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');

  return sanitized.length > 0 ? sanitized : 'spot-swap';
}

function buildPayloadDerivedIdempotencyKey(input: HiddenOcaSpotSwapInput): string {
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
  return `idem-hidden-oca-swap-${fingerprint}`;
}

function resolveChainId(chain: string): string {
  const normalized = chain.trim().toLowerCase();
  if (/^[0-9]+$/u.test(normalized)) {
    return normalized;
  }

  switch (normalized) {
    case 'arbitrum':
    case 'arb':
    case 'arbitrum-one':
      return '42161';
    case 'ethereum':
    case 'mainnet':
    case 'eth':
      return '1';
    default:
      throw new Error(`Unsupported Onchain Actions swap chain "${chain}".`);
  }
}

function normalizeNetworkName(chain: string): string {
  const normalized = chain.trim().toLowerCase();
  switch (resolveChainId(chain)) {
    case '42161':
      return 'arbitrum';
    case '1':
      return 'mainnet';
    default:
      return normalized;
  }
}

function resolveToken(input: {
  tokens: OnchainActionsToken[];
  chainId: string;
  token: string;
}): OnchainActionsToken {
  const needle = input.token.trim().toLowerCase();
  const candidates = input.tokens.filter((token) => token.tokenUid.chainId === input.chainId);
  const resolved =
    candidates.find((token) => token.tokenUid.address.toLowerCase() === needle) ??
    candidates.find((token) => token.symbol.toLowerCase() === needle) ??
    candidates.find((token) => token.name.toLowerCase() === needle) ??
    null;

  if (!resolved) {
    throw new Error(
      `Onchain Actions token resolution failed for ${input.token} on chain ${input.chainId}.`,
    );
  }

  return resolved;
}

function buildSwapSummary(input: {
  request: HiddenOcaSpotSwapInput;
  swapResponse: OnchainActionsSwapResponse;
}): HiddenOcaSpotSwapResult['swapSummary'] {
  return {
    fromToken: input.swapResponse.fromToken.symbol,
    toToken: input.swapResponse.toToken.symbol,
    amount: input.request.amount,
    amountType: input.request.amountType,
    displayFromAmount: input.swapResponse.displayFromAmount,
    displayToAmount: input.swapResponse.displayToAmount,
  };
}

async function readCurrentSharedEmberRevision(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  threadId: string;
}): Promise<number> {
  const response = (await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: `shared-ember-${input.threadId}-read-hidden-oca-executor-revision`,
    method: 'subagent.readPortfolioState.v1',
    params: {
      agent_id: HIDDEN_OCA_EXECUTOR_AGENT_ID,
    },
  })) as SharedEmberRevisionResponse;

  return response.result?.revision ?? 0;
}

async function runSharedEmberCommandWithResolvedRevision<T>(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  threadId: string;
  currentRevision: number | null;
  buildRequest: (expectedRevision: number) => unknown;
}): Promise<T> {
  const expectedRevision =
    input.currentRevision ?? (await readCurrentSharedEmberRevision(input));

  return (await input.protocolHost.handleJsonRpc(input.buildRequest(expectedRevision))) as T;
}

function buildCreateTransactionRequest(input: {
  threadId: string;
  idempotencyKey: string;
  expectedRevision: number;
  rootedWalletContextId?: string;
  request: HiddenOcaSpotSwapInput;
  swapResponse: OnchainActionsSwapResponse;
  fromToken: OnchainActionsToken;
  network: string;
}) {
  return {
    jsonrpc: '2.0',
    id: `shared-ember-${input.threadId}-create-hidden-oca-swap-transaction`,
    method: 'subagent.createTransaction.v1',
    params: {
      idempotency_key: `${input.idempotencyKey}:create-transaction`,
      expected_revision: input.expectedRevision,
      agent_id: HIDDEN_OCA_EXECUTOR_AGENT_ID,
      ...(input.rootedWalletContextId
        ? { rooted_wallet_context_id: input.rootedWalletContextId }
        : {}),
      request: {
        control_path: HIDDEN_OCA_EXECUTOR_CONTROL_PATH,
        asset: input.fromToken.symbol,
        protocol_system: 'onchain-actions',
        network: input.network,
        quantity: {
          kind: 'exact',
          value: input.swapResponse.exactFromAmount || input.request.amount,
        },
      },
    },
  };
}

function readCandidatePlanId(createTransactionResponse: unknown): string | null {
  const result = readRecordKey(createTransactionResponse, 'result');
  const candidatePlan = readRecordKey(result, 'candidate_plan');

  return readString(candidatePlan?.['transaction_plan_id']);
}

function readResultRevision(response: unknown): number | null {
  return readInt(readRecordKey(response, 'result')?.['revision']);
}

function readCommittedEventIds(response: unknown): string[] {
  const raw = readRecordKey(response, 'result')?.['committed_event_ids'];
  return Array.isArray(raw) ? raw.filter((eventId): eventId is string => typeof eventId === 'string') : [];
}

function readExecutionResult(response: unknown): Record<string, unknown> | null {
  return readRecordKey(readRecordKey(response, 'result'), 'execution_result');
}

function readExecutionRequestId(executionResult: Record<string, unknown> | null): string | null {
  return readString(executionResult?.['request_id']);
}

function readExecutionTransactionPlanId(
  executionResult: Record<string, unknown> | null,
): string | null {
  return readString(executionResult?.['transaction_plan_id']);
}

function buildRequestExecutionRequest(input: {
  threadId: string;
  idempotencyKey: string;
  expectedRevision: number;
  transactionPlanId: string;
  attempt: number;
  reservationConflictHandling?: HiddenOcaReservationConflictHandling;
}) {
  return {
    jsonrpc: '2.0',
    id: `shared-ember-${input.threadId}-request-hidden-oca-swap-execution`,
    method: 'subagent.requestExecution.v1',
    params: {
      idempotency_key: `${input.idempotencyKey}:request-execution:${input.attempt}`,
      expected_revision: input.expectedRevision,
      transaction_plan_id: input.transactionPlanId,
      ...(input.reservationConflictHandling
        ? { reservation_conflict_handling: input.reservationConflictHandling }
        : {}),
    },
  };
}

function readBlockedConflict(
  executionResult: Record<string, unknown>,
): HiddenOcaSpotSwapResult['conflict'] | null {
  const requestResult = readRecordKey(executionResult, 'request_result');
  const blockingReasonCode = readString(requestResult?.['blocking_reason_code']);
  if (blockingReasonCode !== 'reserved_for_other_agent') {
    return null;
  }

  return {
    kind: 'reserved_for_other_agent',
    blockingReasonCode,
    reservationId: readString(requestResult?.['reservation_id']),
    message: readString(requestResult?.['message']) ?? 'Swap execution touches reserved capital.',
    retryOptions: ['allow_reserved_for_other_agent', 'unassigned_only'],
  };
}

function buildBlockedResult(input: {
  request: HiddenOcaSpotSwapInput;
  swapResponse: OnchainActionsSwapResponse;
  executionResult: Record<string, unknown>;
  committedEventIds: string[];
}): HiddenOcaSpotSwapResult {
  const conflict = readBlockedConflict(input.executionResult);

  return {
    status: conflict ? 'conflict' : 'blocked',
    swapSummary: buildSwapSummary({
      request: input.request,
      swapResponse: input.swapResponse,
    }),
    transactionPlanId: readExecutionTransactionPlanId(input.executionResult),
    requestId: readExecutionRequestId(input.executionResult),
    committedEventIds: input.committedEventIds,
    ...(conflict ? { conflict } : {}),
  };
}

function readCompletedExecutionStatus(executionResult: Record<string, unknown>): string | null {
  return readString(readRecordKey(executionResult, 'execution')?.['status']);
}

function readCompletedTransactionHash(executionResult: Record<string, unknown>): string | null {
  return readString(readRecordKey(executionResult, 'execution')?.['transaction_hash']);
}

function buildCompletedResult(input: {
  request: HiddenOcaSpotSwapInput;
  swapResponse: OnchainActionsSwapResponse;
  executionResult: Record<string, unknown>;
  committedEventIds: string[];
}): HiddenOcaSpotSwapResult {
  const executionStatus = readCompletedExecutionStatus(input.executionResult);

  return {
    status: executionStatus === 'submitted' ? 'submitted' : 'completed',
    swapSummary: buildSwapSummary({
      request: input.request,
      swapResponse: input.swapResponse,
    }),
    transactionPlanId: readExecutionTransactionPlanId(input.executionResult),
    requestId: readExecutionRequestId(input.executionResult),
    transactionHash: readCompletedTransactionHash(input.executionResult),
    committedEventIds: input.committedEventIds,
  };
}

function readExecutionSigningPackage(executionResult: Record<string, unknown>) {
  return readRecordKey(executionResult, 'execution_signing_package');
}

function readExecutionPreparation(executionResult: Record<string, unknown>) {
  return readRecordKey(executionResult, 'execution_preparation');
}

async function signAndSubmitPreparedExecution(input: {
  options: HiddenOcaSpotSwapExecutorOptions;
  threadId: string;
  idempotencyKey: string;
  currentRevision: number | null;
  transactionPlanId: string;
  executionResult: Record<string, unknown>;
  swapResponse: OnchainActionsSwapResponse;
}): Promise<{
  response: unknown;
  executionResult: Record<string, unknown> | null;
}> {
  if (!input.options.runtimeSigning) {
    throw new Error('Runtime-owned signing service is not configured for hidden swap execution.');
  }

  const executionPreparation = readExecutionPreparation(input.executionResult);
  const executionSigningPackage = readExecutionSigningPackage(input.executionResult);
  const preparedWalletAddress = readHexAddress(executionPreparation?.['agent_wallet']);
  const expectedWalletAddress = input.options.executorWalletAddress;
  if (!expectedWalletAddress || !preparedWalletAddress) {
    throw new Error(
      'Hidden swap execution signing could not continue because the executor wallet identity is incomplete.',
    );
  }
  if (preparedWalletAddress !== expectedWalletAddress) {
    throw new Error(
      'Hidden swap execution signing could not continue because the prepared signing package does not match the hidden executor wallet.',
    );
  }

  const unsignedTransactionHex =
    (await input.options.resolvePreparedUnsignedTransactionHex?.({
      executionResult: input.executionResult,
      swapResponse: input.swapResponse,
    })) ?? null;
  if (!unsignedTransactionHex) {
    throw new Error(
      'Hidden swap execution signing could not continue because no prepared unsigned transaction was resolved.',
    );
  }

  const signer = input.options.signPreparedTransaction ?? signPreparedEvmTransaction;
  const signed = await signer({
    signing: input.options.runtimeSigning,
    signerRef: input.options.runtimeSignerRef ?? DEFAULT_RUNTIME_SIGNER_REF,
    expectedAddress: expectedWalletAddress,
    chain: OWS_SIGNING_CHAIN,
    unsignedTransactionHex,
  });

  const requestId = readString(executionSigningPackage?.['request_id']);
  const executionPreparationId = readString(
    executionSigningPackage?.['execution_preparation_id'],
  );
  if (!requestId || !executionPreparationId) {
    throw new Error(
      'Hidden swap execution signing could not continue because the signing package is incomplete.',
    );
  }

  const response = await runSharedEmberCommandWithResolvedRevision({
    protocolHost: input.options.protocolHost,
    threadId: input.threadId,
    currentRevision: input.currentRevision,
    buildRequest: (expectedRevision) => ({
      jsonrpc: '2.0',
      id: `shared-ember-${input.threadId}-submit-hidden-oca-swap-transaction`,
      method: 'subagent.submitSignedTransaction.v1',
      params: {
        idempotency_key: `${input.idempotencyKey}:submit-signed-transaction:${requestId}:${executionPreparationId}`,
        expected_revision: expectedRevision,
        transaction_plan_id: input.transactionPlanId,
        signed_transaction: {
          execution_preparation_id: executionPreparationId,
          transaction_plan_id: input.transactionPlanId,
          request_id: requestId,
          active_delegation_id: readString(executionSigningPackage?.['active_delegation_id']),
          canonical_unsigned_payload_ref: readString(
            executionSigningPackage?.['canonical_unsigned_payload_ref'],
          ),
          signer_address: signed.confirmedAddress,
          raw_transaction: signed.rawTransaction,
        },
      },
    }),
  });

  return {
    response,
    executionResult: readExecutionResult(response),
  };
}

function createFailedResult(input: {
  request: HiddenOcaSpotSwapInput;
  swapResponse: OnchainActionsSwapResponse;
  transactionPlanId: string | null;
  requestId: string | null;
  committedEventIds: string[];
  failureReason: string;
}): HiddenOcaSpotSwapResult {
  return {
    status: 'failed',
    swapSummary: buildSwapSummary({
      request: input.request,
      swapResponse: input.swapResponse,
    }),
    transactionPlanId: input.transactionPlanId,
    requestId: input.requestId,
    committedEventIds: input.committedEventIds,
    failureReason: input.failureReason,
  };
}

async function runExecutionFlow(input: {
  options: HiddenOcaSpotSwapExecutorOptions;
  threadId: string;
  idempotencyKey: string;
  currentRevision: number | null;
  transactionPlanId: string;
  request: HiddenOcaSpotSwapInput;
  swapResponse: OnchainActionsSwapResponse;
}): Promise<HiddenOcaSpotSwapResult> {
  let revision = input.currentRevision;
  let attempt = 1;
  const committedEventIds: string[] = [];

  while (attempt <= MAX_EXECUTION_REQUEST_ATTEMPTS) {
    const requestResponse = await runSharedEmberCommandWithResolvedRevision({
      protocolHost: input.options.protocolHost,
      threadId: input.threadId,
      currentRevision: revision,
      buildRequest: (expectedRevision) =>
        buildRequestExecutionRequest({
          threadId: input.threadId,
          idempotencyKey: input.idempotencyKey,
          expectedRevision,
          transactionPlanId: input.transactionPlanId,
          attempt,
          reservationConflictHandling: input.request.reservationConflictHandling,
        }),
    });
    revision = readResultRevision(requestResponse);
    committedEventIds.push(...readCommittedEventIds(requestResponse));

    let executionResult = readExecutionResult(requestResponse);
    const phase = readString(executionResult?.['phase']);
    if (!executionResult || !phase) {
      return createFailedResult({
        request: input.request,
        swapResponse: input.swapResponse,
        transactionPlanId: input.transactionPlanId,
        requestId: null,
        committedEventIds,
        failureReason: 'Shared Ember did not return a hidden swap execution result.',
      });
    }

    if (phase === 'blocked') {
      return buildBlockedResult({
        request: input.request,
        swapResponse: input.swapResponse,
        executionResult,
        committedEventIds,
      });
    }

    if (phase === 'completed') {
      return buildCompletedResult({
        request: input.request,
        swapResponse: input.swapResponse,
        executionResult,
        committedEventIds,
      });
    }

    if (phase === 'ready_for_redelegation') {
      const requestId = readExecutionRequestId(executionResult);
      if (!requestId || !input.options.requestRedelegationRefresh) {
        return {
          status: 'awaiting_redelegation',
          swapSummary: buildSwapSummary({
            request: input.request,
            swapResponse: input.swapResponse,
          }),
          transactionPlanId: input.transactionPlanId,
          requestId,
          committedEventIds,
        };
      }

      await input.options.requestRedelegationRefresh({
        threadId: input.threadId,
        transactionPlanId: input.transactionPlanId,
        requestId,
      });
      attempt += 1;
      continue;
    }

    if (phase === 'ready_for_execution_signing') {
      try {
        const submitResult = await signAndSubmitPreparedExecution({
          options: input.options,
          threadId: input.threadId,
          idempotencyKey: input.idempotencyKey,
          currentRevision: revision,
          transactionPlanId: input.transactionPlanId,
          executionResult,
          swapResponse: input.swapResponse,
        });
        revision = readResultRevision(submitResult.response);
        committedEventIds.push(...readCommittedEventIds(submitResult.response));
        executionResult = submitResult.executionResult;
      } catch (error) {
        return createFailedResult({
          request: input.request,
          swapResponse: input.swapResponse,
          transactionPlanId: input.transactionPlanId,
          requestId: readExecutionRequestId(executionResult),
          committedEventIds,
          failureReason: error instanceof Error ? error.message : 'Unknown hidden swap signing failure.',
        });
      }

      if (executionResult && readString(executionResult['phase']) === 'completed') {
        return buildCompletedResult({
          request: input.request,
          swapResponse: input.swapResponse,
          executionResult,
          committedEventIds,
        });
      }

      return createFailedResult({
        request: input.request,
        swapResponse: input.swapResponse,
        transactionPlanId: input.transactionPlanId,
        requestId: readExecutionRequestId(executionResult),
        committedEventIds,
        failureReason: 'Shared Ember did not complete hidden swap signed-transaction submission.',
      });
    }

    attempt += 1;
  }

  return createFailedResult({
    request: input.request,
    swapResponse: input.swapResponse,
    transactionPlanId: input.transactionPlanId,
    requestId: null,
    committedEventIds,
    failureReason: 'Shared Ember did not complete hidden swap execution readiness.',
  });
}

async function parseJsonResponse(response: Response, endpoint: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Onchain Actions request failed (${response.status}) for ${endpoint}: ${text}`);
  }

  return text.length > 0 ? (JSON.parse(text) as unknown) : {};
}

function readTokensResponse(value: unknown): OnchainActionsToken[] {
  const tokens = isRecord(value) && Array.isArray(value['tokens']) ? value['tokens'] : [];
  return tokens.filter((token): token is OnchainActionsToken => {
    if (!isRecord(token) || !isRecord(token['tokenUid'])) {
      return false;
    }

    return (
      typeof token['tokenUid']['chainId'] === 'string' &&
      typeof token['tokenUid']['address'] === 'string' &&
      typeof token['name'] === 'string' &&
      typeof token['symbol'] === 'string'
    );
  });
}

function readSwapResponse(value: unknown): OnchainActionsSwapResponse {
  if (!isRecord(value) || !Array.isArray(value['transactions']) || value['transactions'].length === 0) {
    throw new Error('Onchain Actions swap response did not include executable transactions.');
  }

  const fromToken = readTokensResponse({ tokens: [value['fromToken']] })[0];
  const toToken = readTokensResponse({ tokens: [value['toToken']] })[0];
  const exactFromAmount = readString(value['exactFromAmount']);
  const displayFromAmount = readString(value['displayFromAmount']);
  const exactToAmount = readString(value['exactToAmount']);
  const displayToAmount = readString(value['displayToAmount']);
  const transactions = value['transactions'].filter(
    (transaction): transaction is OnchainActionsTransactionRequest =>
      isRecord(transaction) &&
      readString(transaction['type']) !== null &&
      readHexAddress(transaction['to']) !== null &&
      readString(transaction['chainId']) !== null &&
      typeof transaction['data'] === 'string' &&
      transaction['data'].startsWith('0x'),
  );

  if (!fromToken || !toToken || !exactFromAmount || !displayFromAmount || !exactToAmount || !displayToAmount || transactions.length === 0) {
    throw new Error('Onchain Actions swap response was incomplete.');
  }

  return {
    fromToken,
    toToken,
    exactFromAmount,
    displayFromAmount,
    exactToAmount,
    displayToAmount,
    transactions,
  };
}

export function resolveHiddenOcaOnchainActionsApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const endpoint = trimTrailingSlash(
    env.ONCHAIN_ACTIONS_API_URL?.trim() || DEFAULT_ONCHAIN_ACTIONS_API_URL,
  );

  return endpoint.endsWith('/openapi.json') ? endpoint.slice(0, -'/openapi.json'.length) : endpoint;
}

export function createHiddenOcaOnchainActionsClient(input: {
  baseUrl?: string;
  fetch?: typeof fetch;
} = {}): HiddenOcaOnchainActionsClient {
  const baseUrl = trimTrailingSlash(input.baseUrl ?? resolveHiddenOcaOnchainActionsApiUrl());
  const fetchImpl = input.fetch ?? fetch;

  return {
    async listTokens(params) {
      const query = new URLSearchParams();
      for (const chainId of params.chainIds ?? []) {
        query.append('chainIds', chainId);
      }
      const endpoint = query.toString() ? `/tokens?${query.toString()}` : '/tokens';
      return readTokensResponse(await parseJsonResponse(await fetchImpl(`${baseUrl}${endpoint}`), endpoint));
    },
    async createSwap(params) {
      const payload = {
        walletAddress: params.walletAddress,
        amount: params.amount,
        amountType: params.amountType,
        fromTokenUid: params.fromTokenUid,
        toTokenUid: params.toTokenUid,
        ...(params.slippageTolerance ? { slippageTolerance: params.slippageTolerance } : {}),
        ...(params.expiration ? { expiration: params.expiration } : {}),
      };
      const endpoint = '/swap';
      return readSwapResponse(
        await parseJsonResponse(
          await fetchImpl(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
          }),
          endpoint,
        ),
      );
    },
  };
}

export function createHiddenOcaSpotSwapExecutor(
  options: HiddenOcaSpotSwapExecutorOptions,
): HiddenOcaSpotSwapExecutor {
  const onchainActionsClient =
    options.onchainActionsClient ??
    createHiddenOcaOnchainActionsClient({
      baseUrl: options.onchainActionsBaseUrl,
    });

  return {
    async executeSpotSwap({ threadId, currentRevision = null, input }) {
      const fromChainId = resolveChainId(input.fromChain);
      const toChainId = resolveChainId(input.toChain);
      const fromTokens = await onchainActionsClient.listTokens({ chainIds: [fromChainId] });
      const toTokens =
        toChainId === fromChainId
          ? fromTokens
          : await onchainActionsClient.listTokens({ chainIds: [toChainId] });
      const fromToken = resolveToken({
        tokens: fromTokens,
        chainId: fromChainId,
        token: input.fromToken,
      });
      const toToken = resolveToken({
        tokens: toTokens,
        chainId: toChainId,
        token: input.toToken,
      });
      const swapResponse = await onchainActionsClient.createSwap({
        walletAddress: input.walletAddress,
        amount: input.amount,
        amountType: input.amountType,
        fromTokenUid: fromToken.tokenUid,
        toTokenUid: toToken.tokenUid,
        ...(input.slippageTolerance ? { slippageTolerance: input.slippageTolerance } : {}),
        ...(input.expiration ? { expiration: input.expiration } : {}),
      });
      const idempotencyKey =
        input.idempotencyKey ?? buildPayloadDerivedIdempotencyKey(input);
      const createResponse = await runSharedEmberCommandWithResolvedRevision({
        protocolHost: options.protocolHost,
        threadId,
        currentRevision,
        buildRequest: (expectedRevision) =>
          buildCreateTransactionRequest({
            threadId,
            idempotencyKey,
            expectedRevision,
            rootedWalletContextId: input.rootedWalletContextId,
            request: input,
            swapResponse,
            fromToken,
            network: normalizeNetworkName(input.fromChain),
          }),
      });
      const transactionPlanId = readCandidatePlanId(createResponse);
      if (!transactionPlanId) {
        return createFailedResult({
          request: input,
          swapResponse,
          transactionPlanId: null,
          requestId: null,
          committedEventIds: readCommittedEventIds(createResponse),
          failureReason: 'Shared Ember did not return a hidden swap transaction plan.',
        });
      }

      return await runExecutionFlow({
        options,
        threadId,
        idempotencyKey: sanitizeIdSegment(idempotencyKey),
        currentRevision: readResultRevision(createResponse),
        transactionPlanId,
        request: input,
        swapResponse,
      });
    },
  };
}
