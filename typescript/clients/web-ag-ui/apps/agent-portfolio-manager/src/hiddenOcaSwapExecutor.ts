import { createHash } from 'node:crypto';

import {
  createExecution,
  type Delegation,
  ExecutionMode,
  getDeleGatorEnvironment,
} from '@metamask/delegation-toolkit';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import type { AgentRuntimeSigningService } from 'agent-runtime/internal';
import { signPreparedEvmTransaction } from 'agent-runtime/internal';
import { createPublicClient, http, isAddress, isAddressEqual, isHex, serializeTransaction } from 'viem';
import { arbitrum, mainnet } from 'viem/chains';

import {
  HIDDEN_OCA_EXECUTOR_AGENT_ID,
  HIDDEN_OCA_EXECUTOR_CONTROL_PATH,
} from './serviceIdentityPreflight.js';
import type { PortfolioManagerSharedEmberProtocolHost } from './sharedEmberAdapter.js';

const DEFAULT_ONCHAIN_ACTIONS_API_URL = 'https://api.emberai.xyz';
const DEFAULT_ARBITRUM_RPC_URL = 'https://arb1.arbitrum.io/rpc';
const DEFAULT_ETHEREUM_RPC_URL = 'https://eth.merkle.io';
const DEFAULT_RUNTIME_SIGNER_REF = 'oca-executor-wallet';
const OWS_SIGNING_CHAIN = 'evm';
const MAX_EXECUTION_REQUEST_ATTEMPTS = 4;
const RPC_RETRY_COUNT = 2;
const RPC_TIMEOUT_MS = 8_000;

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
  idempotencyKey?: string;
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
  env?: NodeJS.ProcessEnv;
  runtimeSigning?: AgentRuntimeSigningService;
  runtimeSignerRef?: string;
  executorWalletAddress?: `0x${string}`;
  resolvePreparedUnsignedTransactionHex?: (
    input: PreparedUnsignedTransactionResolutionInput,
  ) => Promise<`0x${string}` | null>;
  resolveExecutionPublicClient?: ResolveHiddenOcaExecutionPublicClient;
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

type HiddenOcaExecutionPublicClient = {
  getTransactionCount: (input: { address: `0x${string}`; blockTag?: 'pending' }) => Promise<number>;
  estimateFeesPerGas: () => Promise<{
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  }>;
  estimateGas: (input: {
    account: `0x${string}`;
    to: `0x${string}`;
    value: bigint;
    data: `0x${string}`;
  }) => Promise<bigint>;
};

type SupportedExecutionNetwork = 'arbitrum' | 'mainnet';

type ResolveHiddenOcaExecutionPublicClient = (
  network: SupportedExecutionNetwork,
) => HiddenOcaExecutionPublicClient;

type SharedEmberRevisionResponse = {
  result?: {
    revision?: number;
  };
};

function isSharedEmberRevisionConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('Shared Ember Domain Service JSON-RPC error: protocol_conflict') &&
    error.message.includes('expected_revision')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readHexAddress(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  return normalized && isAddress(normalized, { strict: false })
    ? (normalized.toLowerCase() as `0x${string}`)
    : null;
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

function bufferDelegatedExecutionGas(gasEstimate: bigint): bigint {
  return (gasEstimate * 3n) / 2n;
}

function normalizeDelegationSignature(signature: string): `0x${string}` {
  const normalized = signature.trim().toLowerCase();
  return normalized.startsWith('0x')
    ? (normalized as `0x${string}`)
    : (`0x${normalized}` as `0x${string}`);
}

function decodeDelegationArtifactRef(artifactRef: string): Delegation {
  const prefix = 'metamask-delegation:';
  if (!artifactRef.startsWith(prefix)) {
    throw new Error(`Unsupported delegation artifact ref "${artifactRef}".`);
  }

  const decoded = JSON.parse(
    Buffer.from(artifactRef.slice(prefix.length), 'base64url').toString('utf8'),
  ) as Delegation;
  decoded.signature = normalizeDelegationSignature(decoded.signature);

  return decoded;
}

function requireDelegationArtifactRef(input: { label: string; value?: string | null }): string {
  if (typeof input.value === 'string' && input.value.trim().length > 0) {
    return input.value;
  }

  throw new Error(
    `Hidden swap execution signing requires ${input.label} to build the delegated transaction wrapper.`,
  );
}

function createRpcTransport(url: string): ReturnType<typeof http> {
  const baseTransport = http(url);
  const baseTransportValue: unknown = baseTransport;
  if (typeof baseTransportValue !== 'function') {
    return baseTransport;
  }

  return ((params: Parameters<typeof baseTransport>[0]) =>
    baseTransport({
      ...params,
      retryCount: RPC_RETRY_COUNT,
      timeout: RPC_TIMEOUT_MS,
    })) as ReturnType<typeof http>;
}

function resolveSupportedExecutionNetworkForChainId(chainId: number): SupportedExecutionNetwork {
  switch (chainId) {
    case arbitrum.id:
      return 'arbitrum';
    case mainnet.id:
      return 'mainnet';
    default:
      throw new Error(`Unsupported hidden OCA execution chain id "${chainId}".`);
  }
}

function resolveRpcUrl(network: SupportedExecutionNetwork, env: NodeJS.ProcessEnv): string {
  switch (network) {
    case 'arbitrum':
      return env['ARBITRUM_RPC_URL']?.trim() || DEFAULT_ARBITRUM_RPC_URL;
    case 'mainnet':
      return env['ETHEREUM_RPC_URL']?.trim() || DEFAULT_ETHEREUM_RPC_URL;
  }
}

function createDefaultExecutionPublicClientResolver(
  env: NodeJS.ProcessEnv,
): ResolveHiddenOcaExecutionPublicClient {
  const clients = new Map<SupportedExecutionNetwork, HiddenOcaExecutionPublicClient>();

  return (network) => {
    const existingClient = clients.get(network);
    if (existingClient) {
      return existingClient;
    }

    const client = createPublicClient({
      chain: network === 'arbitrum' ? arbitrum : mainnet,
      transport: createRpcTransport(resolveRpcUrl(network, env)),
    }) as HiddenOcaExecutionPublicClient;
    clients.set(network, client);
    return client;
  };
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

function buildInputOnlySwapSummary(
  request: HiddenOcaSpotSwapInput,
): HiddenOcaSpotSwapResult['swapSummary'] {
  return {
    fromToken: request.fromToken,
    toToken: request.toToken,
    amount: request.amount,
    amountType: request.amountType,
    displayFromAmount: '',
    displayToAmount: '',
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
  let expectedRevision =
    input.currentRevision ?? (await readCurrentSharedEmberRevision(input));

  try {
    return (await input.protocolHost.handleJsonRpc(input.buildRequest(expectedRevision))) as T;
  } catch (error) {
    if (!isSharedEmberRevisionConflict(error)) {
      throw error;
    }

    const refreshedRevision = await readCurrentSharedEmberRevision(input);
    if (refreshedRevision === expectedRevision) {
      throw error;
    }

    expectedRevision = refreshedRevision;
    return (await input.protocolHost.handleJsonRpc(input.buildRequest(expectedRevision))) as T;
  }
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
  idempotencyKey?: string;
}): HiddenOcaSpotSwapResult {
  const conflict = readBlockedConflict(input.executionResult);

  return {
    status: conflict ? 'conflict' : 'blocked',
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
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
  idempotencyKey?: string;
}): HiddenOcaSpotSwapResult {
  const executionStatus = readCompletedExecutionStatus(input.executionResult);

  return {
    status: executionStatus === 'submitted' ? 'submitted' : 'completed',
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
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

async function resolvePreparedUnsignedTransactionHexFromSwapResponse(input: {
  executionSigningPackage: Record<string, unknown> | null;
  swapResponse: OnchainActionsSwapResponse;
  walletAddress: `0x${string}`;
  resolveExecutionPublicClient: ResolveHiddenOcaExecutionPublicClient;
}): Promise<`0x${string}`> {
  const [firstTransaction, ...remainingTransactions] = input.swapResponse.transactions;
  if (!firstTransaction) {
    throw new Error('Hidden swap execution signing requires at least one OCA transaction request.');
  }

  const chainId = Number(firstTransaction.chainId);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error(`Invalid hidden swap transaction chain id "${firstTransaction.chainId}".`);
  }

  for (const transaction of remainingTransactions) {
    if (Number(transaction.chainId) !== chainId) {
      throw new Error(
        'Hidden swap execution signing requires all OCA transaction requests to use the same chain id.',
      );
    }
  }

  const network = resolveSupportedExecutionNetworkForChainId(chainId);
  const publicClient = input.resolveExecutionPublicClient(network);
  const delegationManager = getDeleGatorEnvironment(
    chainId,
  ).DelegationManager.toLowerCase() as `0x${string}`;
  const executions = input.swapResponse.transactions.map((transaction) =>
    createExecution({
      target: transaction.to.toLowerCase() as `0x${string}`,
      value: BigInt(transaction.value ?? '0'),
      callData: transaction.data.toLowerCase() as `0x${string}`,
    }),
  );
  const activeDelegationArtifactRef = requireDelegationArtifactRef({
    label: 'active delegation artifact ref',
    value: readString(input.executionSigningPackage?.['delegation_artifact_ref']),
  });
  const rootDelegationArtifactRef = requireDelegationArtifactRef({
    label: 'root delegation artifact ref',
    value: readString(input.executionSigningPackage?.['root_delegation_artifact_ref']),
  });
  const delegatedTransactionData = DelegationManager.encode.redeemDelegations({
    delegations: [
      [
        decodeDelegationArtifactRef(activeDelegationArtifactRef),
        decodeDelegationArtifactRef(rootDelegationArtifactRef),
      ],
    ],
    modes: [executions.length === 1 ? ExecutionMode.SingleDefault : ExecutionMode.BatchDefault],
    executions: [executions],
  });
  const [nonce, feeEstimate, gasEstimate] = await Promise.all([
    publicClient.getTransactionCount({
      address: input.walletAddress,
      blockTag: 'pending',
    }),
    publicClient.estimateFeesPerGas(),
    publicClient.estimateGas({
      account: input.walletAddress,
      to: delegationManager,
      value: 0n,
      data: delegatedTransactionData,
    }),
  ]);
  const gas = bufferDelegatedExecutionGas(gasEstimate);

  if (
    typeof feeEstimate.maxFeePerGas === 'bigint' &&
    typeof feeEstimate.maxPriorityFeePerGas === 'bigint'
  ) {
    return serializeTransaction({
      chainId,
      type: 'eip1559',
      nonce,
      gas,
      maxFeePerGas: feeEstimate.maxFeePerGas,
      maxPriorityFeePerGas: feeEstimate.maxPriorityFeePerGas,
      to: delegationManager,
      value: 0n,
      data: delegatedTransactionData,
    });
  }

  if (typeof feeEstimate.gasPrice === 'bigint') {
    return serializeTransaction({
      chainId,
      nonce,
      gas,
      gasPrice: feeEstimate.gasPrice,
      to: delegationManager,
      value: 0n,
      data: delegatedTransactionData,
    });
  }

  throw new Error('RPC fee estimation did not return a signable gas price or EIP-1559 fee pair.');
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
  const expectedWalletAddress = readHexAddress(input.options.executorWalletAddress);
  if (!expectedWalletAddress || !preparedWalletAddress) {
    throw new Error(
      'Hidden swap execution signing could not continue because the executor wallet identity is incomplete.',
    );
  }
  if (!isAddressEqual(preparedWalletAddress, expectedWalletAddress)) {
    throw new Error(
      'Hidden swap execution signing could not continue because the prepared signing package does not match the hidden executor wallet.',
    );
  }

  const unsignedTransactionHex =
    (await input.options.resolvePreparedUnsignedTransactionHex?.({
      executionResult: input.executionResult,
      swapResponse: input.swapResponse,
    })) ??
    (await resolvePreparedUnsignedTransactionHexFromSwapResponse({
      executionSigningPackage,
      swapResponse: input.swapResponse,
      walletAddress: expectedWalletAddress,
      resolveExecutionPublicClient:
        input.options.resolveExecutionPublicClient ??
        createDefaultExecutionPublicClientResolver(input.options.env ?? process.env),
    }));

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
  idempotencyKey?: string;
}): HiddenOcaSpotSwapResult {
  return {
    status: 'failed',
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
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

function createInputFailedResult(input: {
  request: HiddenOcaSpotSwapInput;
  idempotencyKey?: string;
  failureReason: string;
}): HiddenOcaSpotSwapResult {
  return {
    status: 'failed',
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    swapSummary: buildInputOnlySwapSummary(input.request),
    transactionPlanId: null,
    requestId: null,
    committedEventIds: [],
    failureReason: input.failureReason,
  };
}

async function runExecutionFlow(input: {
  options: HiddenOcaSpotSwapExecutorOptions;
  threadId: string;
  idempotencyKey: string;
  resultIdempotencyKey: string;
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
        idempotencyKey: input.resultIdempotencyKey,
      });
    }

    if (phase === 'blocked') {
      return buildBlockedResult({
        request: input.request,
        swapResponse: input.swapResponse,
        executionResult,
        committedEventIds,
        idempotencyKey: input.resultIdempotencyKey,
      });
    }

    if (phase === 'completed') {
      return buildCompletedResult({
        request: input.request,
        swapResponse: input.swapResponse,
        executionResult,
        committedEventIds,
        idempotencyKey: input.resultIdempotencyKey,
      });
    }

    if (phase === 'ready_for_redelegation') {
      const requestId = readExecutionRequestId(executionResult);
      if (!requestId || !input.options.requestRedelegationRefresh) {
        return createFailedResult({
          request: input.request,
          swapResponse: input.swapResponse,
          transactionPlanId: input.transactionPlanId,
          requestId,
          committedEventIds,
          failureReason:
            'Hidden swap execution reached redelegation readiness, but no redelegation refresh handler is configured.',
          idempotencyKey: input.resultIdempotencyKey,
        });
      }

      try {
        await input.options.requestRedelegationRefresh({
          threadId: input.threadId,
          transactionPlanId: input.transactionPlanId,
          requestId,
        });
      } catch (error) {
        return createFailedResult({
          request: input.request,
          swapResponse: input.swapResponse,
          transactionPlanId: input.transactionPlanId,
          requestId,
          committedEventIds,
          failureReason:
            error instanceof Error ? error.message : 'Unknown hidden swap redelegation failure.',
          idempotencyKey: input.resultIdempotencyKey,
        });
      }
      revision = null;
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
          idempotencyKey: input.resultIdempotencyKey,
        });
      }

      if (executionResult && readString(executionResult['phase']) === 'completed') {
        return buildCompletedResult({
          request: input.request,
          swapResponse: input.swapResponse,
          executionResult,
          committedEventIds,
          idempotencyKey: input.resultIdempotencyKey,
        });
      }

      return createFailedResult({
        request: input.request,
        swapResponse: input.swapResponse,
        transactionPlanId: input.transactionPlanId,
        requestId: readExecutionRequestId(executionResult),
        committedEventIds,
        failureReason: 'Shared Ember did not complete hidden swap signed-transaction submission.',
        idempotencyKey: input.resultIdempotencyKey,
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
    idempotencyKey: input.resultIdempotencyKey,
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

function readSwapTransaction(value: unknown): OnchainActionsTransactionRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = readString(value['type']);
  const to = readHexAddress(value['to']);
  const chainId = readString(value['chainId']);
  const data = readString(value['data']);
  const transactionValue = value['value'] === undefined ? undefined : readString(value['value']);

  if (
    type === null ||
    to === null ||
    chainId === null ||
    data === null ||
    !isHex(data) ||
    (value['value'] !== undefined && transactionValue === null)
  ) {
    return null;
  }

  return {
    type,
    to,
    ...(transactionValue ? { value: transactionValue } : {}),
    data: data.toLowerCase() as `0x${string}`,
    chainId,
  };
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
  const transactions = value['transactions'].map(readSwapTransaction);

  if (transactions.some((transaction) => transaction === null)) {
    throw new Error('Onchain Actions swap response included malformed transaction entries.');
  }

  if (!fromToken || !toToken || !exactFromAmount || !displayFromAmount || !exactToAmount || !displayToAmount) {
    throw new Error('Onchain Actions swap response was incomplete.');
  }

  return {
    fromToken,
    toToken,
    exactFromAmount,
    displayFromAmount,
    exactToAmount,
    displayToAmount,
    transactions: transactions as OnchainActionsTransactionRequest[],
  };
}

export function resolveHiddenOcaOnchainActionsApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const endpoint = trimTrailingSlash(
    env['ONCHAIN_ACTIONS_API_URL']?.trim() || DEFAULT_ONCHAIN_ACTIONS_API_URL,
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
      const inputIdempotencyKey = input.idempotencyKey ?? buildPayloadDerivedIdempotencyKey(input);
      const walletAddress = readHexAddress(input.walletAddress);
      if (walletAddress === null) {
        return createInputFailedResult({
          request: input,
          idempotencyKey: inputIdempotencyKey,
          failureReason: 'Hidden OCA spot swap requires a valid EVM wallet address.',
        });
      }

      const request: HiddenOcaSpotSwapInput = {
        ...input,
        walletAddress,
      };
      const idempotencyKey = request.idempotencyKey ?? buildPayloadDerivedIdempotencyKey(request);
      const fromChainId = resolveChainId(request.fromChain);
      const toChainId = resolveChainId(request.toChain);
      if (fromChainId !== toChainId) {
        return createInputFailedResult({
          request,
          idempotencyKey,
          failureReason: 'Hidden OCA spot swaps currently require fromChain and toChain to match.',
        });
      }

      const fromTokens = await onchainActionsClient.listTokens({ chainIds: [fromChainId] });
      const toTokens =
        toChainId === fromChainId
          ? fromTokens
          : await onchainActionsClient.listTokens({ chainIds: [toChainId] });
      const fromToken = resolveToken({
        tokens: fromTokens,
        chainId: fromChainId,
        token: request.fromToken,
      });
      const toToken = resolveToken({
        tokens: toTokens,
        chainId: toChainId,
        token: request.toToken,
      });
      const swapResponse = await onchainActionsClient.createSwap({
        walletAddress: request.walletAddress,
        amount: request.amount,
        amountType: request.amountType,
        fromTokenUid: fromToken.tokenUid,
        toTokenUid: toToken.tokenUid,
        ...(request.slippageTolerance ? { slippageTolerance: request.slippageTolerance } : {}),
        ...(request.expiration ? { expiration: request.expiration } : {}),
      });
      const createResponse = await runSharedEmberCommandWithResolvedRevision({
        protocolHost: options.protocolHost,
        threadId,
        currentRevision,
        buildRequest: (expectedRevision) =>
          buildCreateTransactionRequest({
            threadId,
            idempotencyKey,
            expectedRevision,
            rootedWalletContextId: request.rootedWalletContextId,
            request,
            swapResponse,
            fromToken,
            network: normalizeNetworkName(request.fromChain),
          }),
      });
      const transactionPlanId = readCandidatePlanId(createResponse);
      if (!transactionPlanId) {
        return createFailedResult({
          request,
          swapResponse,
          transactionPlanId: null,
          requestId: null,
          committedEventIds: readCommittedEventIds(createResponse),
          failureReason: 'Shared Ember did not return a hidden swap transaction plan.',
          idempotencyKey,
        });
      }

      return await runExecutionFlow({
        options,
        threadId,
        idempotencyKey: sanitizeIdSegment(idempotencyKey),
        resultIdempotencyKey: idempotencyKey,
        currentRevision: readResultRevision(createResponse),
        transactionPlanId,
        request,
        swapResponse,
      });
    },
  };
}
