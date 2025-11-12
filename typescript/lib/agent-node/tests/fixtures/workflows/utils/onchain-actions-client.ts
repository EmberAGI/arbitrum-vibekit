import * as z from 'zod';

const TokenIdentifierSchema = z.object({
  chainId: z.string(),
  address: z.templateLiteral(['0x', z.string()]),
});

/**
 * Schema for transaction information.
 */
export const TransactionInformationSchema = z.object({
  type: z.enum(['EVM_TX']),
  to: z.templateLiteral(['0x', z.string()]),
  data: z.templateLiteral(['0x', z.string()]),
  value: z.string(),
  chainId: z.string(),
});
export type TransactionInformation = z.infer<typeof TransactionInformationSchema>;

export class OnchainActionsClient {
  constructor(private baseUrl: string) {}

  /**
   * Fetch data from a REST API endpoint.
   */
  private async fetchEndpoint<T>(
    endpoint: string,
    resultSchema: z.ZodSchema<T>,
    options?: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const result = await fetch(url, options);

      if (!result.ok) {
        const errorText = await result.text().catch(() => 'Unable to read error response');
        throw new Error(`API request failed: ${result.status} ${result.statusText}. ${errorText}`);
      }

      const jsonData = await result.json();

      try {
        const parsedData = await resultSchema.parseAsync(jsonData);
        return parsedData;
      } catch (validationError) {
        throw new Error(
          `Invalid API response format from ${endpoint}: ${
            validationError instanceof Error ? validationError.message : String(validationError)
          }`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('API request failed')) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith('Invalid API response format')) {
        throw error;
      }

      throw new Error(
        `Network error while fetching ${endpoint}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * @param request The swap token request details.
   * @returns A promise that resolves to the swap token response.
   */
  public async createSwap(request: SwapTokenRequest): Promise<SwapTokenResponse> {
    const endpoint = `/swap`;
    const result = await this.fetchEndpoint(endpoint, SwapTokenResponseSchema, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    return result;
  }

  public async createSupplyLiquidity(
    request: SupplyLiquidityRequest,
  ): Promise<SupplyLiquidityResponse> {
    const endpoint = `/liquidity/supply`;
    const result = await this.fetchEndpoint(endpoint, SupplyLiquidityResponseSchema, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    return result;
  }
}

/**
 * Schema for identifying a token.
 */
const TokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
  isNative: z.boolean(),
  iconUri: z.string().url().nullable(),
  isVetted: z.boolean(),
});

/**
 * Schema for user assets.
 */
const UserAssetSchema = z
  .object({
    valueUsd: z.number().nonnegative(),
    amount: z.string(),
  })
  .extend(TokenSchema.pick({ symbol: true, decimals: true, tokenUid: true }).shape);

/**
 * Schema for user balances.
 */
const _UserBalanceSchema = z.object({
  balances: z.array(UserAssetSchema),
});
type _UserBalance = z.infer<typeof _UserBalanceSchema>;

/**
 * Schema for a swap token request.
 */
const _SwapTokenRequestSchema = z.object({
  walletAddress: z.string(),
  amount: z.string(),
  amountType: z.enum(['exactIn', 'exactOut']),
  fromTokenUid: TokenIdentifierSchema,
  toTokenUid: TokenIdentifierSchema,
});
type SwapTokenRequest = z.infer<typeof SwapTokenRequestSchema>;

/**
 * Schema for a swap token response.
 */
const SwapTokenResponseSchema = z.object({
  fromToken: TokenSchema,
  toToken: TokenSchema,
  exactFromAmount: z.string(),
  displayFromAmount: z.string(),
  exactToAmount: z.string(),
  displayToAmount: z.string(),
  transactions: z.array(TransactionInformationSchema),
  estimation: z.object({
    effectivePrice: z.string(),
    timeEstimate: z.string(),
    expiration: z.string(),
  }),
  providerTracking: z.object({
    requestId: z.string(),
    providerName: z.string(),
    explorerUrl: z.string().url(),
  }),
});
type SwapTokenResponse = z.infer<typeof SwapTokenResponseSchema>;

export const SupplyLiquidityRequestSchema = z.object({
  walletAddress: z.string(),
  supplyChain: z.string(),
  payableTokens: z.array(
    z.object({
      tokenUid: TokenIdentifierSchema,
      amount: z.string(),
    }),
  ),
  poolIdentifier: TokenIdentifierSchema,
});
export type SupplyLiquidityRequest = z.infer<typeof SupplyLiquidityRequestSchema>;

export const SupplyLiquidityResponseSchema = z.object({
  transactions: z.array(TransactionInformationSchema),
});
export type SupplyLiquidityResponse = z.infer<typeof SupplyLiquidityResponseSchema>;
