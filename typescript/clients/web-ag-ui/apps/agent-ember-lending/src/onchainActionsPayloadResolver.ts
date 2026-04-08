import {
  createExecution,
  type Delegation,
  ExecutionMode,
  getDeleGatorEnvironment,
} from '@metamask/delegation-toolkit';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import { createPublicClient, http, parseUnits, serializeTransaction } from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';
import { z } from 'zod';

const DEFAULT_ONCHAIN_ACTIONS_API_URL = 'https://api.emberai.xyz';
const DEFAULT_ARBITRUM_RPC_URL = 'https://arb1.arbitrum.io/rpc';
const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';
const DEFAULT_ETHEREUM_RPC_URL = 'https://eth.merkle.io';
const RPC_RETRY_COUNT = 2;
const RPC_TIMEOUT_MS = 8_000;
const SIGNING_RESOLUTION_ATTEMPTS = 2;
const SIGNING_RESOLUTION_RETRY_DELAY_MS = 500;

const HexStringSchema = z.string().regex(/^0x[0-9a-fA-F]+$/u);
const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u);
const TokenIdentifierSchema = z
  .object({
    chainId: z.string().min(1),
    address: AddressSchema,
  })
  .strict();
const TokenSchema = z
  .object({
    tokenUid: TokenIdentifierSchema,
    name: z.string().min(1),
    symbol: z.string().min(1),
    isNative: z.boolean(),
    decimals: z.number().int().nonnegative(),
    iconUri: z.string().nullable().optional(),
    isVetted: z.boolean(),
  })
  .strict();
const TokensResponseSchema = z
  .object({
    tokens: z.array(TokenSchema),
    cursor: z.string().nullable().optional(),
    currentPage: z.number().int().optional(),
    totalPages: z.number().int().optional(),
    totalItems: z.number().int().optional(),
  })
  .strict();
const OnchainActionsTransactionPlanSchema = z
  .object({
    type: z.literal('EVM_TX'),
    to: AddressSchema,
    value: z.string().optional().default('0'),
    data: HexStringSchema,
    chainId: z.string().min(1),
  })
  .strict();
const OnchainActionsPlanResponseSchema = z
  .object({
    liquidationThreshold: z.union([z.string(), z.number(), z.null()]).optional(),
    currentBorrowApy: z.union([z.string(), z.number(), z.null()]).optional(),
    transactions: z.array(OnchainActionsTransactionPlanSchema).min(1),
  })
  .strict();

export type EmberLendingPreparedUnsignedTransactionResolutionInput = {
  agentId: string;
  executionPreparationId: string;
  transactionPlanId: string;
  requestId: string;
  canonicalUnsignedPayloadRef: string;
  delegationArtifactRef?: string | null;
  rootDelegationArtifactRef?: string | null;
  plannedTransactionPayloadRef: string | null;
  walletAddress: `0x${string}`;
  network: string | null;
  requiredControlPath: string | null;
  anchoredPayloadRecords?: EmberLendingAnchoredPayloadRecord[] | null;
};

export type EmberLendingPreparedUnsignedTransactionResolver = (
  input: EmberLendingPreparedUnsignedTransactionResolutionInput,
) => Promise<`0x${string}` | null>;

export type EmberLendingPayloadBuilderOutput = {
  transaction_payload_ref: string;
  required_control_path: string;
  network: string;
};

export type EmberLendingCompactPlanSummary = {
  control_path: string;
  asset: string;
  amount: string;
  summary: string;
  protocol_summary?: string;
};

export type EmberLendingAnchoredTransactionRequest = z.infer<
  typeof OnchainActionsTransactionPlanSchema
>;

export type EmberLendingAnchoredPayloadRecord = {
  anchoredPayloadRef: string;
  capitalOwnerWalletAddress: `0x${string}`;
  transactionRequests: EmberLendingAnchoredTransactionRequest[];
  controlPath: string;
  network: string;
  transactionPlanId: string;
};

export type EmberLendingCandidatePlanPayloadAnchorInput = {
  agentId: string;
  threadId: string;
  transactionPlanId: string;
  walletAddress: `0x${string}`;
  rootUserWalletAddress: `0x${string}`;
  payloadBuilderOutput: EmberLendingPayloadBuilderOutput;
  compactPlanSummary: EmberLendingCompactPlanSummary;
};

export type EmberLendingAnchoredPayloadResolver = {
  anchorCandidatePlanPayload: (
    input: EmberLendingCandidatePlanPayloadAnchorInput,
  ) => Promise<EmberLendingAnchoredPayloadRecord | null>;
  resolvePreparedUnsignedTransaction: EmberLendingPreparedUnsignedTransactionResolver;
};

type OnchainActionsApiEnv = NodeJS.ProcessEnv & {
  ONCHAIN_ACTIONS_API_URL?: string;
  ARBITRUM_RPC_URL?: string;
  BASE_CHAIN_RPC_URL?: string;
  ETHEREUM_RPC_URL?: string;
};

type LendingOperation = 'supply' | 'withdraw' | 'borrow' | 'repay';
type SupportedExecutionNetwork = 'arbitrum' | 'base' | 'mainnet';
type EmberLendingExecutionPublicClient = {
  getTransactionCount: (input: {
    address: `0x${string}`;
    blockTag?: 'pending';
  }) => Promise<number>;
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
type ResolveExecutionPublicClient = (
  network: SupportedExecutionNetwork,
) => EmberLendingExecutionPublicClient;

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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

export function resolveEmberLendingOnchainActionsApiUrl(
  env: OnchainActionsApiEnv = process.env,
): string {
  const endpoint = trimTrailingSlash(
    env.ONCHAIN_ACTIONS_API_URL?.trim() || DEFAULT_ONCHAIN_ACTIONS_API_URL,
  );

  return endpoint.endsWith('/openapi.json')
    ? endpoint.slice(0, -'/openapi.json'.length)
    : endpoint;
}

function resolveChainId(network: string): string {
  switch (network.trim().toLowerCase()) {
    case 'arbitrum':
      return '42161';
    case 'base':
      return '8453';
    case 'ethereum':
    case 'mainnet':
      return '1';
    default:
      throw new Error(`Unsupported lending execution network "${network}".`);
  }
}

function resolveSupportedExecutionNetwork(network: string): SupportedExecutionNetwork {
  switch (network.trim().toLowerCase()) {
    case 'arbitrum':
      return 'arbitrum';
    case 'base':
      return 'base';
    case 'ethereum':
    case 'mainnet':
      return 'mainnet';
    default:
      throw new Error(`Unsupported lending execution network "${network}".`);
  }
}

function resolveRpcUrl(
  network: SupportedExecutionNetwork,
  env: OnchainActionsApiEnv,
): string {
  switch (network) {
    case 'arbitrum':
      return env.ARBITRUM_RPC_URL?.trim() || DEFAULT_ARBITRUM_RPC_URL;
    case 'base':
      return env.BASE_CHAIN_RPC_URL?.trim() || DEFAULT_BASE_RPC_URL;
    case 'mainnet':
      return env.ETHEREUM_RPC_URL?.trim() || DEFAULT_ETHEREUM_RPC_URL;
  }
}

function createDefaultExecutionPublicClientResolver(
  env: OnchainActionsApiEnv,
): ResolveExecutionPublicClient {
  const clients = new Map<SupportedExecutionNetwork, EmberLendingExecutionPublicClient>();

  return (network) => {
    const existingClient = clients.get(network);
    if (existingClient) {
      return existingClient;
    }

    const client = createPublicClient({
      chain:
        network === 'arbitrum' ? arbitrum : network === 'base' ? base : mainnet,
      transport: createRpcTransport(resolveRpcUrl(network, env)),
    }) as EmberLendingExecutionPublicClient;
    clients.set(network, client);
    return client;
  };
}

function resolveLendingOperation(controlPath: string): LendingOperation {
  switch (controlPath.trim().toLowerCase()) {
    case 'lending.supply':
    case 'vault.deposit':
      return 'supply';
    case 'lending.withdraw':
    case 'vault.withdraw':
      return 'withdraw';
    case 'lending.borrow':
    case 'vault.borrow':
      return 'borrow';
    case 'lending.repay':
    case 'vault.repay':
      return 'repay';
    default:
      throw new Error(`Unsupported lending control path "${controlPath}".`);
  }
}

async function fetchJson<T>(input: {
  fetchImpl: typeof fetch;
  url: string;
  schema: z.ZodType<T>;
  init?: RequestInit;
}): Promise<T> {
  const response = await input.fetchImpl(input.url, input.init);
  const rawBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Onchain Actions request failed with status ${response.status}: ${rawBody || 'no body'}`,
    );
  }

  const parsedBody = rawBody.length === 0 ? null : (JSON.parse(rawBody) as unknown);
  return input.schema.parse(parsedBody);
}

async function resolveToken(input: {
  fetchImpl: typeof fetch;
  baseUrl: string;
  network: string;
  asset: string;
}): Promise<z.infer<typeof TokenSchema>> {
  const chainId = resolveChainId(input.network);
  const normalizedAsset = input.asset.trim().toLowerCase();
  let page = 1;

  while (true) {
    const response = await fetchJson({
      fetchImpl: input.fetchImpl,
      url: `${input.baseUrl}/tokens?${new URLSearchParams({
        chainIds: chainId,
        page: String(page),
      }).toString()}`,
      schema: TokensResponseSchema,
    });
    const match =
      response.tokens.find(
        (token) =>
          token.symbol.trim().toLowerCase() === normalizedAsset && token.isVetted,
      ) ??
      response.tokens.find(
        (token) => token.symbol.trim().toLowerCase() === normalizedAsset,
      ) ??
      response.tokens.find(
        (token) => token.name.trim().toLowerCase() === normalizedAsset && token.isVetted,
      ) ??
      response.tokens.find(
        (token) => token.name.trim().toLowerCase() === normalizedAsset,
    );

    if (match) {
      return match;
    }

    const currentPage = response.currentPage ?? page;
    const totalPages = response.totalPages ?? currentPage;
    if (currentPage >= totalPages) {
      break;
    }

    page = currentPage + 1;
  }

  throw new Error(
    `Onchain Actions did not return a token for ${input.asset} on ${input.network}.`,
  );
}

function resolveAmountForOnchainActions(input: {
  amount: string;
  decimals: number;
}): string {
  const normalizedAmount = input.amount.trim();
  if (/^\d+$/u.test(normalizedAmount)) {
    return normalizedAmount;
  }

  return parseUnits(normalizedAmount, input.decimals).toString();
}

function decodeDelegationArtifactRef(artifactRef: string): Delegation {
  const prefix = 'metamask-delegation:';
  if (!artifactRef.startsWith(prefix)) {
    throw new Error(`Unsupported delegation artifact ref "${artifactRef}".`);
  }

  const decoded = JSON.parse(
    Buffer.from(artifactRef.slice(prefix.length), 'base64url').toString('utf8'),
  ) as Delegation;
  const signature = decoded.signature.trim();
  if (!signature.startsWith('0x')) {
    decoded.signature = `0x${signature.toLowerCase()}` as `0x${string}`;
  } else {
    decoded.signature = signature.toLowerCase() as `0x${string}`;
  }

  return decoded;
}

function requireDelegationArtifactRef(input: {
  label: string;
  value?: string | null;
}): string {
  if (typeof input.value === 'string' && input.value.trim().length > 0) {
    return input.value;
  }

  throw new Error(
    `Prepared execution signing requires ${input.label} to build the delegated transaction wrapper.`,
  );
}

function buildLendingRequestBody(input: {
  operation: LendingOperation;
  walletAddress: `0x${string}`;
  tokenUid: z.infer<typeof TokenIdentifierSchema>;
  amount: string;
}): Record<string, unknown> {
  switch (input.operation) {
    case 'supply':
      return {
        walletAddress: input.walletAddress,
        supplyTokenUid: input.tokenUid,
        amount: input.amount,
      };
    case 'withdraw':
      return {
        walletAddress: input.walletAddress,
        tokenUidToWidthraw: input.tokenUid,
        amount: input.amount,
      };
    case 'borrow':
      return {
        walletAddress: input.walletAddress,
        borrowTokenUid: input.tokenUid,
        amount: input.amount,
      };
    case 'repay':
      return {
        walletAddress: input.walletAddress,
        repayTokenUid: input.tokenUid,
        amount: input.amount,
      };
  }
}

async function resolvePreparedUnsignedTransactionHex(input: {
  publicClient: EmberLendingExecutionPublicClient;
  transactions: z.infer<typeof OnchainActionsTransactionPlanSchema>[];
  walletAddress: `0x${string}`;
  delegationArtifactRef: string;
  rootDelegationArtifactRef: string;
}): Promise<`0x${string}`> {
  const [firstTransaction, ...remainingTransactions] = input.transactions;
  if (!firstTransaction) {
    throw new Error('Prepared execution signing requires at least one transaction request.');
  }

  const chainId = Number(firstTransaction.chainId);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error(`Invalid transaction chain id "${firstTransaction.chainId}".`);
  }

  for (const transaction of remainingTransactions) {
    if (Number(transaction.chainId) !== chainId) {
      throw new Error(
        'Prepared execution signing requires all anchored transaction requests to use the same chain id.',
      );
    }
  }

  const delegationManager =
    getDeleGatorEnvironment(chainId).DelegationManager.toLowerCase() as `0x${string}`;
  const executions = input.transactions.map((transaction) =>
    createExecution({
      target: transaction.to.toLowerCase() as `0x${string}`,
      value: BigInt(transaction.value),
      callData: transaction.data.toLowerCase() as `0x${string}`,
    }),
  );
  const delegatedTransactionData = DelegationManager.encode.redeemDelegations({
    delegations: [
      [
        decodeDelegationArtifactRef(input.delegationArtifactRef),
        decodeDelegationArtifactRef(input.rootDelegationArtifactRef),
      ],
    ],
    modes: [executions.length === 1 ? ExecutionMode.SingleDefault : ExecutionMode.BatchDefault],
    executions: [executions],
  });
  let nonce: number;
  let feeEstimate: Awaited<ReturnType<EmberLendingExecutionPublicClient['estimateFeesPerGas']>>;
  let gas: bigint;

  for (let attempt = 1; attempt <= SIGNING_RESOLUTION_ATTEMPTS; attempt += 1) {
    try {
      [nonce, feeEstimate, gas] = await Promise.all([
        input.publicClient.getTransactionCount({
          address: input.walletAddress,
          blockTag: 'pending',
        }),
        input.publicClient.estimateFeesPerGas(),
        input.publicClient.estimateGas({
          account: input.walletAddress,
          to: delegationManager,
          value: 0n,
          data: delegatedTransactionData,
        }),
      ]);
      break;
    } catch (error) {
      if (attempt === SIGNING_RESOLUTION_ATTEMPTS) {
        throw error;
      }

      await sleep(SIGNING_RESOLUTION_RETRY_DELAY_MS);
    }
  }

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

function resolveAnchoredPayloadRef(input: {
  plannedTransactionPayloadRef: string | null;
  canonicalUnsignedPayloadRef: string;
}): string {
  if (input.plannedTransactionPayloadRef) {
    return input.plannedTransactionPayloadRef;
  }

  return input.canonicalUnsignedPayloadRef.startsWith('unsigned-')
    ? input.canonicalUnsignedPayloadRef.slice('unsigned-'.length)
    : input.canonicalUnsignedPayloadRef;
}

function readExplicitTransactionIndex(input: {
  anchoredPayloadRef: string;
  plannedTransactionPayloadRef: string | null;
  canonicalUnsignedPayloadRef: string;
}): number | null {
  const candidates = [
    input.plannedTransactionPayloadRef,
    input.canonicalUnsignedPayloadRef.startsWith('unsigned-')
      ? input.canonicalUnsignedPayloadRef.slice('unsigned-'.length)
      : input.canonicalUnsignedPayloadRef,
  ];

  for (const candidate of candidates) {
    if (!candidate || candidate === input.anchoredPayloadRef) {
      continue;
    }
    if (!candidate.startsWith(input.anchoredPayloadRef)) {
      continue;
    }

    const suffix = candidate.slice(input.anchoredPayloadRef.length);
    const stepMatch =
      suffix.match(/^[:#/_-](\d+)$/u) ??
      suffix.match(/^[:#/_-](?:step|tx|transaction)[-_:]?(\d+)$/iu) ??
      suffix.match(/^(?:step|tx|transaction)[-_:]?(\d+)$/iu);
    if (!stepMatch) {
      continue;
    }

    const parsed = Number.parseInt(stepMatch[1] ?? '', 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function resolveAnchoredPayloadRecord(input: {
  anchoredPayloadRecords?: EmberLendingAnchoredPayloadRecord[] | null;
  anchoredPayloads: Map<string, EmberLendingAnchoredPayloadRecord>;
  anchoredPayloadRef: string;
}): EmberLendingAnchoredPayloadRecord | null {
  const allRecords = [
    ...(input.anchoredPayloadRecords ?? []),
    ...input.anchoredPayloads.values(),
  ];
  const exactRecord =
    allRecords.find((record) => record.anchoredPayloadRef === input.anchoredPayloadRef) ?? null;
  if (exactRecord) {
    return exactRecord;
  }

  let matchedRecord: EmberLendingAnchoredPayloadRecord | null = null;
  for (const record of allRecords) {
    if (!input.anchoredPayloadRef.startsWith(record.anchoredPayloadRef)) {
      continue;
    }
    if (
      matchedRecord === null ||
      record.anchoredPayloadRef.length > matchedRecord.anchoredPayloadRef.length
    ) {
      matchedRecord = record;
    }
  }

  return matchedRecord;
}

function resolveAnchoredTransactionRequests(input: {
  anchoredPayload: EmberLendingAnchoredPayloadRecord;
  plannedTransactionPayloadRef: string | null;
  canonicalUnsignedPayloadRef: string;
}): EmberLendingAnchoredTransactionRequest[] {
  const explicitTransactionIndex = readExplicitTransactionIndex({
    anchoredPayloadRef: input.anchoredPayload.anchoredPayloadRef,
    plannedTransactionPayloadRef: input.plannedTransactionPayloadRef,
    canonicalUnsignedPayloadRef: input.canonicalUnsignedPayloadRef,
  });

  if (explicitTransactionIndex === null) {
    if (input.anchoredPayload.transactionRequests.length === 0) {
      throw new Error(
        `Anchored payload ref "${input.anchoredPayload.anchoredPayloadRef}" does not contain any transaction steps.`,
      );
    }
    return input.anchoredPayload.transactionRequests;
  }

  const transaction = input.anchoredPayload.transactionRequests[explicitTransactionIndex];
  if (!transaction) {
    throw new Error(
      `Anchored payload ref "${input.anchoredPayload.anchoredPayloadRef}" does not contain transaction step ${explicitTransactionIndex}.`,
    );
  }

  return [transaction];
}

export function createEmberLendingOnchainActionsAnchoredPayloadResolver(input?: {
  baseUrl?: string;
  fetch?: typeof fetch;
  env?: OnchainActionsApiEnv;
  resolvePublicClient?: ResolveExecutionPublicClient;
}): EmberLendingAnchoredPayloadResolver {
  const fetchImpl = input?.fetch ?? fetch;
  const env = input?.env ?? process.env;
  const baseUrl = trimTrailingSlash(
    input?.baseUrl ?? resolveEmberLendingOnchainActionsApiUrl(env),
  );
  const resolvePublicClient =
    input?.resolvePublicClient ?? createDefaultExecutionPublicClientResolver(env);
  const anchoredPayloads = new Map<string, EmberLendingAnchoredPayloadRecord>();

  return {
    async anchorCandidatePlanPayload(request) {
      const operation = resolveLendingOperation(request.payloadBuilderOutput.required_control_path);
      const token = await resolveToken({
        fetchImpl,
        baseUrl,
        network: request.payloadBuilderOutput.network,
        asset: request.compactPlanSummary.asset,
      });
      const response = await fetchJson({
        fetchImpl,
        url: `${baseUrl}/lending/${operation}`,
        schema: OnchainActionsPlanResponseSchema,
        init: {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(
            buildLendingRequestBody({
              operation,
              walletAddress: request.rootUserWalletAddress,
              tokenUid: token.tokenUid,
              amount: resolveAmountForOnchainActions({
                amount: request.compactPlanSummary.amount,
                decimals: token.decimals,
              }),
            }),
          ),
        },
      });

      const anchoredPayload: EmberLendingAnchoredPayloadRecord = {
        anchoredPayloadRef: request.payloadBuilderOutput.transaction_payload_ref,
        capitalOwnerWalletAddress: request.rootUserWalletAddress,
        transactionRequests: response.transactions,
        controlPath: request.payloadBuilderOutput.required_control_path,
        network: request.payloadBuilderOutput.network,
        transactionPlanId: request.transactionPlanId,
      };

      anchoredPayloads.set(anchoredPayload.anchoredPayloadRef, anchoredPayload);
      return anchoredPayload;
    },

    async resolvePreparedUnsignedTransaction(request) {
      const anchoredPayloadRef = resolveAnchoredPayloadRef({
        plannedTransactionPayloadRef: request.plannedTransactionPayloadRef,
        canonicalUnsignedPayloadRef: request.canonicalUnsignedPayloadRef,
      });
      const anchoredPayload = resolveAnchoredPayloadRecord({
        anchoredPayloadRecords: request.anchoredPayloadRecords,
        anchoredPayloads,
        anchoredPayloadRef,
      });
      if (!anchoredPayload) {
        return null;
      }

      return resolvePreparedUnsignedTransactionHex({
        publicClient: resolvePublicClient(
          resolveSupportedExecutionNetwork(anchoredPayload.network),
        ),
        transactions: resolveAnchoredTransactionRequests({
          anchoredPayload,
          plannedTransactionPayloadRef: request.plannedTransactionPayloadRef,
          canonicalUnsignedPayloadRef: request.canonicalUnsignedPayloadRef,
        }),
        walletAddress: request.walletAddress,
        delegationArtifactRef: requireDelegationArtifactRef({
          label: 'delegation_artifact_ref',
          value: request.delegationArtifactRef,
        }),
        rootDelegationArtifactRef: requireDelegationArtifactRef({
          label: 'root_delegation_artifact_ref',
          value: request.rootDelegationArtifactRef,
        }),
      });
    },
  };
}
