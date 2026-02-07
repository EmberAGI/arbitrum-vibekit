import { z } from 'zod';

const HTTP_TIMEOUT_MS = 60_000;

const PaginationSchema = z.object({
  cursor: z.string(),
  currentPage: z.number().int(),
  totalPages: z.number().int(),
  totalItems: z.number().int(),
});

export type TokenIdentifier = {
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

const PerpetualMarketSchema = z.object({
  marketToken: TokenIdentifierSchema,
  longFundingFee: z.string(),
  shortFundingFee: z.string(),
  longBorrowingFee: z.string(),
  shortBorrowingFee: z.string(),
  chainId: z.string(),
  name: z.string(),
  // onchain-actions hydrates these token identifiers into full token objects.
  // Allow missing tokens so selection logic can safely skip incomplete rows.
  indexToken: TokenSchema.optional(),
  longToken: TokenSchema.optional(),
  shortToken: TokenSchema.optional(),
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
  collateralToken: TokenSchema,
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

export const TransactionPlanSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (record['value'] === undefined) {
    return { ...record, value: '0x0' };
  }
  return value;
},
z.object({
  type: z.string(),
  to: z.string(),
  data: z.string(),
  value: z.string(),
  chainId: z.string(),
}));
export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;

const PerpetualActionResponseSchema = z
  .object({
    transactions: z.array(TransactionPlanSchema),
  })
  .catchall(z.unknown());
export type PerpetualActionResponse = z.infer<typeof PerpetualActionResponseSchema>;

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
  // REST API accepts a bigint-like decimal string; avoid JSON number precision loss.
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

export class OnchainActionsClient {
  constructor(private readonly baseUrl: string) {}

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

  async listWalletBalances(params: {
    walletAddress: `0x${string}`;
  }): Promise<WalletBalance[]> {
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

  async createPerpetualLong(request: PerpetualLongRequest): Promise<PerpetualActionResponse> {
    return this.fetchEndpoint('/perpetuals/long', PerpetualActionResponseSchema, {
      method: 'POST',
      body: this.stringifyPayload(request),
    });
  }

  async createPerpetualShort(request: PerpetualShortRequest): Promise<PerpetualActionResponse> {
    return this.fetchEndpoint('/perpetuals/short', PerpetualActionResponseSchema, {
      method: 'POST',
      body: this.stringifyPayload(request),
    });
  }

  async createPerpetualClose(request: PerpetualCloseRequest): Promise<PerpetualActionResponse> {
    return this.fetchEndpoint('/perpetuals/close', PerpetualActionResponseSchema, {
      method: 'POST',
      body: this.stringifyPayload(request),
    });
  }
}
