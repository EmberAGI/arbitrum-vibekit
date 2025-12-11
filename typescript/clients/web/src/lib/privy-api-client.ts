import { z } from 'zod';

// Zod schemas for Privy API responses
const PrivyTransactionsResponseSchema = z.object({
  transactions: z.array(z.any()),
  next_cursor: z.string().nullable(),
});

const PrivyWalletResponseSchema = z.object({
  id: z.string(),
  address: z.string(),
  chain_type: z.string(),
  policy_ids: z.array(z.string()),
  additional_signers: z.array(z.string()),
  owner_id: z.string(),
  created_at: z.number(),
  exported_at: z.number().nullable(),
  imported_at: z.number().nullable(),
});

export type PrivyTransactionsResponse = z.infer<typeof PrivyTransactionsResponseSchema>;
export type PrivyWalletResponse = z.infer<typeof PrivyWalletResponseSchema>;

/**
 * Check if a wallet can be funded based on its transaction history.
 * A wallet can be funded if it has no transactions (fresh wallet).
 */
export function canWalletBeFunded(transactions: PrivyTransactionsResponse): boolean {
  return transactions.transactions.length === 0;
}

export class PrivyApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'PrivyApiClientError';
  }
}

export class PrivyApiClient {
  private readonly baseUrl = 'https://api.privy.io/v1';
  private readonly authHeader: string;
  private readonly appId: string;

  constructor(username: string, password: string, appId: string) {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
    this.appId = appId;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      'privy-app-id': this.appId,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    endpoint: string,
    schema: z.ZodType<T>,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new PrivyApiClientError(
        `Privy API request failed: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    const data = await response.json();
    return schema.parse(data);
  }

  async getNativeArbitrumTransactions(walletId: string): Promise<PrivyTransactionsResponse> {
    return this.request(
      `/wallets/${walletId}/transactions?chain=arbitrum&asset=eth`,
      PrivyTransactionsResponseSchema,
    );
  }

  async getWallet(walletId: string): Promise<PrivyWalletResponse> {
    return this.request(`/wallets/${walletId}`, PrivyWalletResponseSchema);
  }
}
