import { z } from 'zod';

const HTTP_TIMEOUT_MS = 60_000;

const HexPrefixedStringSchema = z
  .templateLiteral(['0x', z.string()])
  .transform((value) => value.toLowerCase() as `0x${string}`);

const TokenUidSchema = z.object({
  chainId: z.string(),
  address: HexPrefixedStringSchema,
});

const WalletBalanceSchema = z.object({
  tokenUid: TokenUidSchema,
  amount: z.string(),
  symbol: z.string().optional(),
  valueUsd: z.number().optional(),
  decimals: z.number().int().nonnegative().optional(),
});
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;

const WalletBalancesResponseSchema = z.object({
  balances: z.array(WalletBalanceSchema),
  cursor: z.string().nullable().optional(),
  currentPage: z.number().int().optional(),
  totalPages: z.number().int().optional(),
  totalItems: z.number().int().optional(),
});

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

  async listWalletBalances(walletAddress: `0x${string}`): Promise<WalletBalance[]> {
    const balances: WalletBalance[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();

    do {
      const query = new URLSearchParams();
      if (cursor) {
        query.set('cursor', cursor);
      }
      const data = await this.fetchEndpoint(
        `/wallet/balances/${walletAddress}?${query.toString()}`,
        WalletBalancesResponseSchema,
      );
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
}
