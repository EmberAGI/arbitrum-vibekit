import { z } from 'zod';

const HTTP_TIMEOUT_MS = 60_000;
const GMX_PERPETUALS_PROVIDER_NAME = 'GMX Perpetuals' as const;
const DEFAULT_SLIPPAGE_BPS = '100' as const;
const USDC_TO_GMX_USD_SCALE = 10n ** 24n;

const PaginationSchema = z.object({
  cursor: z.string().nullable(),
  currentPage: z.number().int(),
  totalPages: z.number().int(),
  totalItems: z.number().int(),
});

type TokenIdentifier = {
  chainId: string;
  address: string;
};

const TokenIdentifierSchema = z.object({
  chainId: z.string(),
  address: z.string(),
});

const TokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  name: z.string(),
  symbol: z.string(),
  isNative: z.boolean(),
  decimals: z.number().int(),
  iconUri: z.string().nullish(),
  isVetted: z.boolean(),
});

const normalizeTokenInput = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (record['iconUri'] === null) {
    return { ...record, iconUri: undefined };
  }
  return record;
};

const TokenSchemaBridge: z.ZodType<z.infer<typeof TokenSchema>> = z
  .unknown()
  .transform((value) => normalizeTokenInput(value))
  .superRefine((value, ctx) => {
    const result = TokenSchema.safeParse(value);
    if (!result.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error.message });
    }
  })
  .transform((value) => TokenSchema.parse(value));

const PerpetualMarketSchema = z.object({
  marketToken: TokenIdentifierSchema,
  longFundingFee: z.string(),
  shortFundingFee: z.string(),
  longBorrowingFee: z.string(),
  shortBorrowingFee: z.string(),
  chainId: z.string(),
  name: z.string(),
  // Some markets returned by onchain-actions omit indexToken. Keep the boundary
  // validation, but allow skipping incomplete markets in our selection logic.
  indexToken: TokenSchemaBridge.optional(),
  longToken: TokenSchemaBridge.optional(),
  shortToken: TokenSchemaBridge.optional(),
});
export type PerpetualMarket = z.infer<typeof PerpetualMarketSchema>;

const PerpetualMarketsResponseSchema = PaginationSchema.extend({
  markets: z.array(PerpetualMarketSchema),
});

const PerpetualPositionSchema = z.object({
  chainId: z.string(),
  key: z.string(),
  contractKey: z.string(),
  account: z.string(),
  marketAddress: z.string(),
  sizeInUsd: z.string(),
  sizeInTokens: z.string(),
  collateralAmount: z.string(),
  pendingBorrowingFeesUsd: z.string(),
  increasedAtTime: z.string(),
  decreasedAtTime: z.string(),
  positionSide: z.enum(['long', 'short']),
  isLong: z.boolean(),
  fundingFeeAmount: z.string(),
  claimableLongTokenAmount: z.string(),
  claimableShortTokenAmount: z.string(),
  isOpening: z.boolean().optional(),
  pnl: z.string(),
  positionFeeAmount: z.string(),
  traderDiscountAmount: z.string(),
  uiFeeAmount: z.string(),
  data: z.string().optional(),
  collateralToken: TokenSchemaBridge,
});
export type PerpetualPosition = z.infer<typeof PerpetualPositionSchema>;

const PerpetualPositionsResponseSchema = PaginationSchema.extend({
  positions: z.array(PerpetualPositionSchema),
});

const WalletBalanceSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  symbol: z.string().optional(),
  valueUsd: z.number().optional(),
  decimals: z.number().int().optional(),
});
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;

const WalletBalancesResponseSchema = PaginationSchema.extend({
  balances: z.array(WalletBalanceSchema),
});

export const TransactionPlanSchema = z.object({
  type: z.string(),
  to: z.string(),
  data: z.string(),
  value: z
    .string()
    .optional()
    .transform((value) => value ?? '0'),
  chainId: z.string(),
});
export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;

const PerpetualActionResponseSchema = z
  .object({
    transactions: z.array(TransactionPlanSchema),
  })
  .catchall(z.unknown());
export type PerpetualActionResponse = z.infer<typeof PerpetualActionResponseSchema>;

const PerpetualLifecyclePrecisionSchema = z.object({
  tokenDecimals: z.number().int().nonnegative(),
  priceDecimals: z.number().int().nonnegative(),
  usdDecimals: z.number().int().nonnegative(),
});

const PerpetualQuoteResponseSchema = z.object({
  asOf: z.string(),
  ttlMs: z.number().int().nonnegative(),
  precision: PerpetualLifecyclePrecisionSchema,
  pricing: z.object({
    markPrice: z.string(),
    acceptablePrice: z.string(),
    slippageBps: z.string(),
    priceImpactDeltaUsd: z.string(),
  }),
  fees: z.object({
    positionFeeUsd: z.string(),
    borrowingFeeUsd: z.string(),
    fundingFeeUsd: z.string(),
  }),
  warnings: z.array(z.string()),
});
type PerpetualQuoteResponse = z.infer<typeof PerpetualQuoteResponseSchema>;

const PerpetualLifecycleDisambiguationResponseSchema = z.object({
  providerName: z.string(),
  chainId: z.string(),
  txHash: z.string(),
  needsDisambiguation: z.literal(true),
  candidateOrderKeys: z.array(z.string()).min(1),
  asOf: z.string(),
});

const PerpetualLifecycleResolvedResponseSchema = z.object({
  providerName: z.string(),
  chainId: z.string(),
  txHash: z.string(),
  needsDisambiguation: z.literal(false).optional(),
  orderKey: z.string(),
  status: z.enum(['pending', 'executed', 'cancelled', 'failed', 'unknown']),
  reason: z.string().optional(),
  reasonBytes: z.string().optional(),
  requestedPrice: z.string().optional(),
  observedPrice: z.string().optional(),
  createTxHash: z.string().optional(),
  executionTxHash: z.string().optional(),
  cancellationTxHash: z.string().optional(),
  precision: PerpetualLifecyclePrecisionSchema,
  asOf: z.string(),
});

const PerpetualLifecycleResponseSchema = z.union([
  PerpetualLifecycleDisambiguationResponseSchema,
  PerpetualLifecycleResolvedResponseSchema,
]);
export type PerpetualLifecycleResponse = z.infer<typeof PerpetualLifecycleResponseSchema>;

export class OnchainActionsRequestError extends Error {
  readonly status: number;
  readonly url: string;
  readonly bodyText: string;

  constructor(params: { message: string; status: number; url: string; bodyText: string }) {
    super(params.message);
    this.name = 'OnchainActionsRequestError';
    this.status = params.status;
    this.url = params.url;
    this.bodyText = params.bodyText;
  }
}

export type PerpetualLongRequest = {
  // REST API accepts token base units as a bigint-like decimal string
  // (e.g., 10 USDC => "10000000" with 6 decimals).
  amount: string;
  walletAddress: `0x${string}`;
  chainId: string;
  marketAddress: string;
  payTokenAddress: string;
  collateralTokenAddress: string;
  leverage: string;
  referralCode?: string;
  limitPrice?: string;
};

export type PerpetualShortRequest = PerpetualLongRequest;

export type PerpetualCloseRequest = {
  walletAddress: `0x${string}`;
  marketAddress: string;
  positionSide?: 'long' | 'short';
  isLimit?: boolean;
};

export type PerpetualReduceRequest = {
  walletAddress: `0x${string}`;
  key: string;
  // onchain-actions expects a bigint-like decimal string (GMX USD units, 30 decimals).
  sizeDeltaUsd: string;
  providerName?: string;
};

export type PerpetualLifecycleRequest = {
  providerName: string;
  chainId: string;
  txHash: `0x${string}`;
  orderKey?: string;
  walletAddress?: `0x${string}`;
  submittedAtBlock?: string;
};

type PerpetualIncreasePayload = {
  walletAddress: `0x${string}`;
  providerName: string;
  chainId: string;
  marketAddress: string;
  collateralTokenAddress: string;
  side: 'long' | 'short';
  collateralDeltaAmount: string;
  sizeDeltaUsd: string;
  slippageBps: string;
};

type PerpetualDecreasePayload = {
  walletAddress: `0x${string}`;
  providerName: string;
  chainId: string;
  marketAddress: string;
  collateralTokenAddress: string;
  side: 'long' | 'short';
  decrease:
    | {
        mode: 'full';
        slippageBps: string;
      }
    | {
        mode: 'partial';
        sizeDeltaUsd: string;
        slippageBps: string;
      };
};

export class OnchainActionsClient {
  constructor(private readonly baseUrl: string) {}

  private parseLeverageToBps(raw: string): bigint {
    const value = raw.trim();
    const match = value.match(/^(\d+)(?:\.(\d+))?$/u);
    if (!match) {
      throw new Error(`Invalid leverage value: ${raw}`);
    }

    const integerPart = match[1] ?? '0';
    const fractionalPart = match[2] ?? '';
    const paddedFraction = (fractionalPart + '0000').slice(0, 4);
    const bps = BigInt(integerPart) * 10_000n + (paddedFraction ? BigInt(paddedFraction) : 0n);
    if (bps <= 0n) {
      throw new Error(`Invalid leverage value: ${raw}`);
    }
    return bps;
  }

  private deriveSizeDeltaUsd(params: { collateralDeltaAmount: string; leverage: string }): string {
    const collateralDeltaAmount = BigInt(params.collateralDeltaAmount);
    if (collateralDeltaAmount <= 0n) {
      throw new Error('collateralDeltaAmount must be greater than zero');
    }
    const leverageBps = this.parseLeverageToBps(params.leverage);
    return ((collateralDeltaAmount * USDC_TO_GMX_USD_SCALE * leverageBps) / 10_000n).toString();
  }

  private async resolvePositionByKey(params: {
    walletAddress: `0x${string}`;
    key: string;
  }): Promise<PerpetualPosition> {
    const positions = await this.listPerpetualPositions({
      walletAddress: params.walletAddress,
    });
    const targetKey = params.key.toLowerCase();
    const position = positions.find((candidate) => {
      return (
        candidate.key.toLowerCase() === targetKey || candidate.contractKey.toLowerCase() === targetKey
      );
    });
    if (!position) {
      throw new Error(`No perpetual position found for key ${params.key}`);
    }
    return position;
  }

  private async resolvePositionForClose(params: {
    walletAddress: `0x${string}`;
    marketAddress: string;
    positionSide?: 'long' | 'short';
  }): Promise<PerpetualPosition> {
    const positions = await this.listPerpetualPositions({
      walletAddress: params.walletAddress,
    });
    const targetMarket = params.marketAddress.toLowerCase();
    const matchingPositions = positions.filter((candidate) => {
      if (candidate.marketAddress.toLowerCase() !== targetMarket) {
        return false;
      }
      if (params.positionSide && candidate.positionSide !== params.positionSide) {
        return false;
      }
      return true;
    });

    if (matchingPositions.length === 0) {
      throw new Error(
        `No perpetual position found for market ${params.marketAddress}${params.positionSide ? ` and side ${params.positionSide}` : ''}`,
      );
    }

    if (matchingPositions.length === 1) {
      return matchingPositions[0];
    }

    return matchingPositions.reduce((largest, current) => {
      const largestSize = BigInt(largest.sizeInUsd);
      const currentSize = BigInt(current.sizeInUsd);
      return currentSize > largestSize ? current : largest;
    });
  }

  private buildQuery(params: Record<string, string | string[] | undefined>): URLSearchParams {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (!value) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          query.append(key, item);
        }
        continue;
      }
      query.set(key, value);
    }
    return query;
  }

  private async fetchEndpoint<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(HTTP_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'No error body');
      throw new OnchainActionsRequestError({
        message: `Onchain actions request failed (${response.status}): ${text}`,
        status: response.status,
        url,
        bodyText: text,
      });
    }

    return schema.parse(await response.json());
  }

  async listPerpetualMarkets(params?: { chainIds?: string[] }): Promise<PerpetualMarket[]> {
    const baseQuery = this.buildQuery({
      chainIds: params?.chainIds,
    });
    const endpoint = baseQuery.toString()
      ? `/perpetuals/markets?${baseQuery.toString()}`
      : '/perpetuals/markets';
    const firstPage = await this.fetchEndpoint(endpoint, PerpetualMarketsResponseSchema);
    const markets = [...firstPage.markets];
    const cursor = firstPage.cursor ?? undefined;
    if (!cursor || firstPage.totalPages <= 1) {
      return markets;
    }

    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const query = this.buildQuery({
        chainIds: params?.chainIds,
        cursor,
        page: page.toString(),
      });
      const pageEndpoint = `/perpetuals/markets?${query.toString()}`;
      const data = await this.fetchEndpoint(pageEndpoint, PerpetualMarketsResponseSchema);
      markets.push(...data.markets);
    }
    return markets;
  }

  async listPerpetualPositions(params: {
    walletAddress: `0x${string}`;
    chainIds?: string[];
  }): Promise<PerpetualPosition[]> {
    const baseQuery = this.buildQuery({
      chainIds: params.chainIds,
    });
    const endpoint = baseQuery.toString()
      ? `/perpetuals/positions/${params.walletAddress}?${baseQuery.toString()}`
      : `/perpetuals/positions/${params.walletAddress}`;
    const firstPage = await this.fetchEndpoint(endpoint, PerpetualPositionsResponseSchema);
    const positions = [...firstPage.positions];
    const cursor = firstPage.cursor ?? undefined;
    if (!cursor || firstPage.totalPages <= 1) {
      return positions;
    }

    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const query = this.buildQuery({
        chainIds: params.chainIds,
        cursor,
        page: page.toString(),
      });
      const pageEndpoint = `/perpetuals/positions/${params.walletAddress}?${query.toString()}`;
      const data = await this.fetchEndpoint(pageEndpoint, PerpetualPositionsResponseSchema);
      positions.push(...data.positions);
    }
    return positions;
  }

  async listWalletBalances(params: { walletAddress: `0x${string}` }): Promise<WalletBalance[]> {
    const endpoint = `/wallet/balances/${params.walletAddress}`;
    const firstPage = await this.fetchEndpoint(endpoint, WalletBalancesResponseSchema);
    const balances = [...firstPage.balances];
    const cursor = firstPage.cursor ?? undefined;
    if (!cursor || firstPage.totalPages <= 1) {
      return balances;
    }

    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const query = this.buildQuery({
        cursor,
        page: page.toString(),
      });
      const pageEndpoint = `/wallet/balances/${params.walletAddress}?${query.toString()}`;
      const data = await this.fetchEndpoint(pageEndpoint, WalletBalancesResponseSchema);
      balances.push(...data.balances);
    }

    return balances;
  }

  private stringifyPayload(value: unknown): string {
    return JSON.stringify(value, (_key: string, item: unknown): unknown =>
      typeof item === 'bigint' ? item.toString() : item,
    );
  }

  private async quotePerpetualIncrease(payload: PerpetualIncreasePayload): Promise<PerpetualQuoteResponse> {
    return this.fetchEndpoint('/perpetuals/increase/quote', PerpetualQuoteResponseSchema, {
      method: 'POST',
      body: this.stringifyPayload(payload),
    });
  }

  private async quotePerpetualDecrease(payload: PerpetualDecreasePayload): Promise<PerpetualQuoteResponse> {
    return this.fetchEndpoint('/perpetuals/decrease/quote', PerpetualQuoteResponseSchema, {
      method: 'POST',
      body: this.stringifyPayload(payload),
    });
  }

  async createPerpetualLong(request: PerpetualLongRequest): Promise<PerpetualActionResponse> {
    const payload: PerpetualIncreasePayload = {
      walletAddress: request.walletAddress,
      providerName: GMX_PERPETUALS_PROVIDER_NAME,
      chainId: request.chainId,
      marketAddress: request.marketAddress,
      collateralTokenAddress: request.collateralTokenAddress,
      side: 'long',
      collateralDeltaAmount: request.amount,
      sizeDeltaUsd: this.deriveSizeDeltaUsd({
        collateralDeltaAmount: request.amount,
        leverage: request.leverage,
      }),
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    };
    const quote = await this.quotePerpetualIncrease(payload);
    return this.fetchEndpoint('/perpetuals/increase/plan', PerpetualActionResponseSchema, {
      method: 'POST',
      body: this.stringifyPayload({
        ...payload,
        slippageBps: quote.pricing.slippageBps,
      }),
    });
  }

  async createPerpetualShort(request: PerpetualShortRequest): Promise<PerpetualActionResponse> {
    const payload: PerpetualIncreasePayload = {
      walletAddress: request.walletAddress,
      providerName: GMX_PERPETUALS_PROVIDER_NAME,
      chainId: request.chainId,
      marketAddress: request.marketAddress,
      collateralTokenAddress: request.collateralTokenAddress,
      side: 'short',
      collateralDeltaAmount: request.amount,
      sizeDeltaUsd: this.deriveSizeDeltaUsd({
        collateralDeltaAmount: request.amount,
        leverage: request.leverage,
      }),
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    };
    const quote = await this.quotePerpetualIncrease(payload);
    return this.fetchEndpoint('/perpetuals/increase/plan', PerpetualActionResponseSchema, {
      method: 'POST',
      body: this.stringifyPayload({
        ...payload,
        slippageBps: quote.pricing.slippageBps,
      }),
    });
  }

  async createPerpetualClose(request: PerpetualCloseRequest): Promise<PerpetualActionResponse> {
    const position = await this.resolvePositionForClose({
      walletAddress: request.walletAddress,
      marketAddress: request.marketAddress,
      positionSide: request.positionSide,
    });
    const payload: PerpetualDecreasePayload = {
      walletAddress: request.walletAddress,
      providerName: GMX_PERPETUALS_PROVIDER_NAME,
      chainId: position.chainId,
      marketAddress: position.marketAddress,
      collateralTokenAddress: position.collateralToken.tokenUid.address,
      side: position.positionSide,
      decrease: {
        mode: 'full',
        slippageBps: DEFAULT_SLIPPAGE_BPS,
      },
    };
    const quote = await this.quotePerpetualDecrease(payload);
    return this.fetchEndpoint('/perpetuals/decrease/plan', PerpetualActionResponseSchema, {
      method: 'POST',
      body: this.stringifyPayload({
        ...payload,
        decrease: {
          ...payload.decrease,
          slippageBps: quote.pricing.slippageBps,
        },
      }),
    });
  }

  async createPerpetualReduce(request: PerpetualReduceRequest): Promise<PerpetualActionResponse> {
    const position = await this.resolvePositionByKey({
      walletAddress: request.walletAddress,
      key: request.key,
    });
    const payload: PerpetualDecreasePayload = {
      walletAddress: request.walletAddress,
      providerName: request.providerName ?? GMX_PERPETUALS_PROVIDER_NAME,
      chainId: position.chainId,
      marketAddress: position.marketAddress,
      collateralTokenAddress: position.collateralToken.tokenUid.address,
      side: position.positionSide,
      decrease: {
        mode: 'partial',
        sizeDeltaUsd: request.sizeDeltaUsd,
        slippageBps: DEFAULT_SLIPPAGE_BPS,
      },
    };
    const quote = await this.quotePerpetualDecrease(payload);
    return this.fetchEndpoint('/perpetuals/decrease/plan', PerpetualActionResponseSchema, {
      method: 'POST',
      body: this.stringifyPayload({
        ...payload,
        decrease: {
          ...payload.decrease,
          slippageBps: quote.pricing.slippageBps,
        },
      }),
    });
  }

  async getPerpetualLifecycle(
    request: PerpetualLifecycleRequest,
  ): Promise<PerpetualLifecycleResponse> {
    const query = this.buildQuery({
      providerName: request.providerName,
      chainId: request.chainId,
      txHash: request.txHash,
      orderKey: request.orderKey,
      walletAddress: request.walletAddress,
      submittedAtBlock: request.submittedAtBlock,
    });
    return this.fetchEndpoint(
      `/perpetuals/lifecycle?${query.toString()}`,
      PerpetualLifecycleResponseSchema,
    );
  }
}

export type { TokenIdentifier };
