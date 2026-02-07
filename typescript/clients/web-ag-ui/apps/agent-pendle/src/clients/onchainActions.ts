import { z } from 'zod';

const PaginationSchema = z.object({
  cursor: z.string().nullable(),
  currentPage: z.number().int(),
  totalPages: z.number().int(),
  totalItems: z.number().int(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeTokenInput = (value: unknown): unknown => {
  if (!isRecord(value)) {
    return value;
  }
  if (value.iconUri === null) {
    return { ...value, iconUri: undefined };
  }
  return value;
};

export const TokenIdentifierSchema = z.object({
  chainId: z.string(),
  address: z.string(),
});
export type TokenIdentifier = z.infer<typeof TokenIdentifierSchema>;

export const TokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  name: z.string(),
  symbol: z.string(),
  isNative: z.boolean(),
  decimals: z.number().int(),
  iconUri: z.string().nullish(),
  isVetted: z.boolean(),
});
export type Token = z.infer<typeof TokenSchema>;

const TokenSchemaBridge: z.ZodType<Token> = z
  .unknown()
  .transform((value) => normalizeTokenInput(value))
  .superRefine((value, ctx) => {
    const result = TokenSchema.safeParse(value);
    if (!result.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error.message });
    }
  })
  .transform((value) => TokenSchema.parse(value));

const TokenIdentifierSchemaBridge: z.ZodType<TokenIdentifier> = z
  .unknown()
  .superRefine((value, ctx) => {
    const result = TokenIdentifierSchema.safeParse(value);
    if (!result.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.error.message });
    }
  })
  .transform((value) => TokenIdentifierSchema.parse(value));

const TokenizedYieldMarketIdentifierSchema = z.object({
  chainId: z.string(),
  address: z.string(),
});
export type TokenizedYieldMarketIdentifier = TokenIdentifier;

const TokenizedYieldMarketPayloadSchema = z.object({
  marketIdentifier: TokenizedYieldMarketIdentifierSchema,
  expiry: z.string(),
  details: z.object({}).catchall(z.unknown()),
  ptToken: z.unknown(),
  ytToken: z.unknown(),
  underlyingToken: z.unknown(),
});

export type TokenizedYieldMarket = {
  marketIdentifier: TokenIdentifier;
  expiry: string;
  details: Record<string, unknown>;
  ptToken: Token;
  ytToken: Token;
  underlyingToken: Token;
};

export const parseTokenizedYieldMarket = (value: unknown): TokenizedYieldMarket => {
  const market = TokenizedYieldMarketPayloadSchema.parse(value);
  return {
    ...market,
    marketIdentifier: TokenIdentifierSchemaBridge.parse(market.marketIdentifier),
    ptToken: TokenSchemaBridge.parse(market.ptToken),
    ytToken: TokenSchemaBridge.parse(market.ytToken),
    underlyingToken: TokenSchemaBridge.parse(market.underlyingToken),
  };
};

export const TokenizedYieldMarketsResponseSchema = PaginationSchema.extend({
  markets: z.array(z.unknown()),
});
export type TokenizedYieldMarketsResponse = z.infer<typeof TokenizedYieldMarketsResponseSchema>;

const TokenizedYieldAmountSchema = z.object({
  token: TokenSchemaBridge,
  exactAmount: z.string(),
});
export type TokenizedYieldAmount = z.infer<typeof TokenizedYieldAmountSchema>;

const TokenizedYieldPositionSchema = z.object({
  marketIdentifier: TokenizedYieldMarketIdentifierSchema,
  pt: TokenizedYieldAmountSchema,
  yt: TokenizedYieldAmountSchema.extend({
    claimableRewards: z.array(TokenizedYieldAmountSchema),
  }),
});
export type TokenizedYieldPosition = z.infer<typeof TokenizedYieldPositionSchema>;

export const TokenizedYieldPositionsResponseSchema = PaginationSchema.extend({
  positions: z.array(TokenizedYieldPositionSchema),
});
export type TokenizedYieldPositionsResponse = z.infer<typeof TokenizedYieldPositionsResponseSchema>;

const WalletBalanceSchema = z.object({
  tokenUid: TokenIdentifierSchemaBridge,
  amount: z.string(),
  symbol: z.string().optional(),
  valueUsd: z.number().optional(),
  decimals: z.number().int().nonnegative().optional(),
});
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;

export const WalletBalancesResponseSchema = PaginationSchema.extend({
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

const SwapTokensResponseSchema = z
  .object({
    exactFromAmount: z.string(),
    exactToAmount: z.string(),
    transactions: z.array(TransactionPlanSchema),
  })
  .catchall(z.unknown());
export type SwapTokensResponse = z.infer<typeof SwapTokensResponseSchema>;

const TokenizedYieldBuyPtResponseSchema = z
  .object({
    transactions: z.array(TransactionPlanSchema),
  })
  .catchall(z.unknown());
export type TokenizedYieldBuyPtResponse = z.infer<typeof TokenizedYieldBuyPtResponseSchema>;

const TokenizedYieldSellPtResponseSchema = z
  .object({
    exactAmountOut: z.string(),
    tokenOut: TokenSchemaBridge,
    transactions: z.array(TransactionPlanSchema),
  })
  .catchall(z.unknown());
export type TokenizedYieldSellPtResponse = z.infer<typeof TokenizedYieldSellPtResponseSchema>;

const TokenizedYieldClaimRewardsResponseSchema = z
  .object({
    transactions: z.array(TransactionPlanSchema),
  })
  .catchall(z.unknown());
export type TokenizedYieldClaimRewardsResponse = z.infer<
  typeof TokenizedYieldClaimRewardsResponseSchema
>;

const TokenizedYieldRedeemPtResponseSchema = z
  .object({
    transactions: z.array(TransactionPlanSchema),
    exactAmountOut: z.string().optional(),
    tokenOut: TokenSchemaBridge.optional(),
    exactUnderlyingAmount: z.string().optional(),
    underlyingTokenIdentifier: TokenIdentifierSchemaBridge.optional(),
  })
  .catchall(z.unknown());
export type TokenizedYieldRedeemPtResponse = z.infer<typeof TokenizedYieldRedeemPtResponseSchema>;

export type TokenizedYieldPlan = {
  transactions: TransactionPlan[];
};

const TokensResponseSchema = PaginationSchema.extend({
  tokens: z.array(TokenSchemaBridge),
});
export type TokensResponse = z.infer<typeof TokensResponseSchema>;

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
      signal: init?.signal ?? AbortSignal.timeout(60_000),
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

  async listTokens(params?: { chainIds?: string[] }): Promise<Token[]> {
    const baseQuery = this.buildQuery({
      chainIds: params?.chainIds,
    });
    const endpoint = baseQuery.toString() ? `/tokens?${baseQuery.toString()}` : '/tokens';
    const firstPage = await this.fetchEndpoint(endpoint, TokensResponseSchema);
    const tokens = [...firstPage.tokens];
    const cursor = firstPage.cursor ?? undefined;
    if (!cursor || firstPage.totalPages <= 1) {
      return tokens;
    }

    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const query = this.buildQuery({
        chainIds: params?.chainIds,
        cursor,
        page: page.toString(),
      });
      const pageEndpoint = `/tokens?${query.toString()}`;
      const data = await this.fetchEndpoint(pageEndpoint, TokensResponseSchema);
      tokens.push(...data.tokens);
    }
    return tokens;
  }

  async listWalletBalances(walletAddress: `0x${string}`): Promise<WalletBalance[]> {
    const balances: WalletBalance[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();

    do {
      const query = new URLSearchParams();
      if (cursor) {
        query.set('cursor', cursor);
      }
      const endpoint = query.toString()
        ? `/wallet/balances/${walletAddress}?${query.toString()}`
        : `/wallet/balances/${walletAddress}`;
      const data = await this.fetchEndpoint(endpoint, WalletBalancesResponseSchema);
      balances.push(...data.balances);
      const nextCursor = data.cursor ?? undefined;
      if (!nextCursor || seenCursors.has(nextCursor)) {
        break;
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    } while (cursor);

    return balances;
  }

  async createSwap(params: {
    walletAddress: `0x${string}`;
    amount: string;
    amountType: 'exactIn' | 'exactOut';
    fromTokenUid: TokenIdentifier;
    toTokenUid: TokenIdentifier;
    slippageTolerance?: string;
    expiration?: string;
    signal?: AbortSignal;
  }): Promise<SwapTokensResponse> {
    const { signal, ...rest } = params;
    const payload = {
      walletAddress: rest.walletAddress,
      amount: rest.amount,
      amountType: rest.amountType,
      fromTokenUid: rest.fromTokenUid,
      toTokenUid: rest.toTokenUid,
      ...(rest.slippageTolerance ? { slippageTolerance: rest.slippageTolerance } : {}),
      ...(rest.expiration ? { expiration: rest.expiration } : {}),
    };
    return this.fetchEndpoint('/swap', SwapTokensResponseSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  }

  async createTokenizedYieldBuyPt(params: {
    walletAddress: `0x${string}`;
    marketAddress: string;
    inputTokenUid: TokenIdentifier;
    amount: string;
    slippage?: string;
  }): Promise<TokenizedYieldBuyPtResponse> {
    const payload = {
      walletAddress: params.walletAddress,
      marketAddress: params.marketAddress,
      inputTokenUid: params.inputTokenUid,
      amount: params.amount,
      ...(params.slippage ? { slippage: params.slippage } : {}),
    };
    return this.fetchEndpoint('/tokenizedYield/buyPt', TokenizedYieldBuyPtResponseSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createTokenizedYieldSellPt(params: {
    walletAddress: `0x${string}`;
    ptTokenUid: TokenIdentifier;
    amount: string;
    slippage?: string;
  }): Promise<TokenizedYieldSellPtResponse> {
    const payload = {
      walletAddress: params.walletAddress,
      ptTokenUid: params.ptTokenUid,
      amount: params.amount,
      ...(params.slippage ? { slippage: params.slippage } : {}),
    };
    return this.fetchEndpoint('/tokenizedYield/sellPt', TokenizedYieldSellPtResponseSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createTokenizedYieldClaimRewards(params: {
    walletAddress: `0x${string}`;
    ytTokenUid: TokenIdentifier;
  }): Promise<TokenizedYieldClaimRewardsResponse> {
    const payload = {
      walletAddress: params.walletAddress,
      ytTokenUid: params.ytTokenUid,
    };
    return this.fetchEndpoint('/tokenizedYield/claimRewards', TokenizedYieldClaimRewardsResponseSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createTokenizedYieldRedeemPt(params: {
    walletAddress: `0x${string}`;
    ptTokenUid: TokenIdentifier;
    amount: string;
  }): Promise<TokenizedYieldRedeemPtResponse> {
    const payload = {
      walletAddress: params.walletAddress,
      ptTokenUid: params.ptTokenUid,
      amount: params.amount,
    };
    return this.fetchEndpoint('/tokenizedYield/redeemPt', TokenizedYieldRedeemPtResponseSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listTokenizedYieldMarkets(params?: { chainIds?: string[] }): Promise<TokenizedYieldMarket[]> {
    const baseQuery = this.buildQuery({
      chainIds: params?.chainIds,
    });
    const endpoint = baseQuery.toString()
      ? `/tokenizedYield/markets?${baseQuery.toString()}`
      : '/tokenizedYield/markets';
    const firstPage = await this.fetchEndpoint(endpoint, TokenizedYieldMarketsResponseSchema);
    const markets = firstPage.markets.map(parseTokenizedYieldMarket);
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
      const pageEndpoint = `/tokenizedYield/markets?${query.toString()}`;
      const data = await this.fetchEndpoint(pageEndpoint, TokenizedYieldMarketsResponseSchema);
      markets.push(...data.markets.map(parseTokenizedYieldMarket));
    }
    return markets;
  }

  async listTokenizedYieldPositions(params: {
    walletAddress: `0x${string}`;
    chainIds?: string[];
  }): Promise<TokenizedYieldPosition[]> {
    const baseQuery = this.buildQuery({
      chainIds: params.chainIds,
    });
    const endpoint = baseQuery.toString()
      ? `/tokenizedYield/positions/${params.walletAddress}?${baseQuery.toString()}`
      : `/tokenizedYield/positions/${params.walletAddress}`;
    const firstPage = await this.fetchEndpoint(endpoint, TokenizedYieldPositionsResponseSchema);
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
      const pageEndpoint = `/tokenizedYield/positions/${params.walletAddress}?${query.toString()}`;
      const data = await this.fetchEndpoint(pageEndpoint, TokenizedYieldPositionsResponseSchema);
      positions.push(...data.positions);
    }
    return positions;
  }
}
