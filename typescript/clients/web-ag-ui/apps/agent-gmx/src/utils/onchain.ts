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

  public async openPerpPosition(
    request: OpenPerpLongRequest,
    positionType: 'short' | 'long',
  ): Promise<{ transactions: TransactionInformation[] }> {
    const endpoint = `/perpetuals/${positionType}`;
    return this.fetchEndpoint(
      endpoint,
      z.object({
        transactions: z.array(TransactionInformationSchema),
      }),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );
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
const UserBalanceSchema = z.object({
  balances: z.array(UserAssetSchema),
});
type UserBalance = z.infer<typeof UserBalanceSchema>;

export const PerpPositionRequestSchema = z.object({
  walletAddress: z.string(),
  chainId: z.string(),
  marketAddress: z.string(),

  amount: z.string(), // USD or collateral amount (API-defined)
  leverage: z.string(),

  payTokenAddress: z.string(),
  collateralTokenAddress: z.string(),

  limitPrice: z.string().optional(),
  referralCode: z.string().optional(),
});

export type PerpPositionRequest = z.infer<typeof PerpPositionRequestSchema>;

export const PerpPositionResponseSchema = z.object({
  transactions: z.array(TransactionInformationSchema),
});
export type PerpPositionResponse = z.infer<typeof PerpPositionResponseSchema>;
