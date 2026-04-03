import { createPublicClient, http, serializeTransaction } from 'viem';
import { arbitrum, base, mainnet } from 'viem/chains';
import { z } from 'zod';

const DEFAULT_ONCHAIN_ACTIONS_API_URL = 'https://api.emberai.xyz';
const DEFAULT_ARBITRUM_RPC_URL = 'https://arb1.arbitrum.io/rpc';
const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';
const DEFAULT_ETHEREUM_RPC_URL = 'https://eth.merkle.io';
const RPC_RETRY_COUNT = 2;
const RPC_TIMEOUT_MS = 8_000;

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
    transactions: z.array(OnchainActionsTransactionPlanSchema).min(1),
  })
  .strict();

export type EmberLendingPreparedUnsignedTransactionResolutionInput = {
  agentId: string;
  executionPreparationId: string;
  transactionPlanId: string;
  requestId: string;
  canonicalUnsignedPayloadRef: string;
  plannedTransactionPayloadRef: string | null;
  walletAddress: `0x${string}`;
  network: string | null;
  requiredControlPath: string | null;
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

export type EmberLendingAnchoredPayloadRecord = {
  anchoredPayloadRef: string;
  transactionRequest: z.infer<typeof OnchainActionsTransactionPlanSchema>;
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

async function resolveTokenIdentifier(input: {
  fetchImpl: typeof fetch;
  baseUrl: string;
  network: string;
  asset: string;
}): Promise<z.infer<typeof TokenIdentifierSchema>> {
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
      return match.tokenUid;
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
  transaction: z.infer<typeof OnchainActionsTransactionPlanSchema>;
  walletAddress: `0x${string}`;
}): Promise<`0x${string}`> {
  const chainId = Number(input.transaction.chainId);
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error(`Invalid transaction chain id "${input.transaction.chainId}".`);
  }

  const to = input.transaction.to.toLowerCase() as `0x${string}`;
  const value = BigInt(input.transaction.value);
  const data = input.transaction.data.toLowerCase() as `0x${string}`;
  const [nonce, feeEstimate, gas] = await Promise.all([
    input.publicClient.getTransactionCount({
      address: input.walletAddress,
      blockTag: 'pending',
    }),
    input.publicClient.estimateFeesPerGas(),
    input.publicClient.estimateGas({
      account: input.walletAddress,
      to,
      value,
      data,
    }),
  ]);

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
      to,
      value,
      data,
    });
  }

  if (typeof feeEstimate.gasPrice === 'bigint') {
    return serializeTransaction({
      chainId,
      nonce,
      gas,
      gasPrice: feeEstimate.gasPrice,
      to,
      value,
      data,
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
      const tokenUid = await resolveTokenIdentifier({
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
              walletAddress: request.walletAddress,
              tokenUid,
              amount: request.compactPlanSummary.amount,
            }),
          ),
        },
      });
      const terminalTransaction = response.transactions.at(-1);
      if (!terminalTransaction) {
        throw new Error('Onchain Actions did not return a terminal lending transaction.');
      }

      const anchoredPayload: EmberLendingAnchoredPayloadRecord = {
        anchoredPayloadRef: request.payloadBuilderOutput.transaction_payload_ref,
        transactionRequest: terminalTransaction,
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
      const anchoredPayload = anchoredPayloads.get(anchoredPayloadRef);
      if (!anchoredPayload) {
        return null;
      }

      return resolvePreparedUnsignedTransactionHex({
        publicClient: resolvePublicClient(
          resolveSupportedExecutionNetwork(anchoredPayload.network),
        ),
        transaction: anchoredPayload.transactionRequest,
        walletAddress: request.walletAddress,
      });
    },
  };
}
