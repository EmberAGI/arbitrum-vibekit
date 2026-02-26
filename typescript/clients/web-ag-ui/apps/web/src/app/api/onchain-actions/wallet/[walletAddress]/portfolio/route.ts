import { NextResponse } from 'next/server';
import { z } from 'zod';

const WalletAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const PaginationSchema = z.object({
  cursor: z.string().nullable().optional(),
  currentPage: z.number().int().optional(),
  totalPages: z.number().int().optional(),
  totalItems: z.number().int().optional(),
});

const TokenIdentifierSchema = z.object({
  chainId: z.string(),
  address: z.string(),
});

const WalletBalanceSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  symbol: z.string().optional(),
  valueUsd: z.number().optional(),
  decimals: z.number().int().optional(),
});

const PerpetualPositionSchema = z.object({
  key: z.string(),
  marketAddress: z.string(),
  positionSide: z.enum(['long', 'short']),
  sizeInUsd: z.string(),
});

const TokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  name: z.string(),
  symbol: z.string(),
  isNative: z.boolean(),
  decimals: z.number().int(),
  iconUri: z.string().nullish().optional(),
  isVetted: z.boolean(),
});

const TokenizedYieldPositionSchema = z.object({
  marketIdentifier: TokenIdentifierSchema,
  pt: z.object({
    token: TokenSchema,
    exactAmount: z.string(),
  }),
  yt: z.object({
    token: TokenSchema,
    exactAmount: z.string(),
    claimableRewards: z.array(
      z.object({
        token: TokenSchema,
        exactAmount: z.string(),
      }),
    ),
  }),
});

const LiquidityPositionSchema = z.object({
  positionId: z.string().optional(),
  poolName: z.string().optional(),
  positionValueUsd: z.string().optional(),
  providerId: z.string(),
  pooledTokens: z.array(z.unknown()),
  feesOwedTokens: z.array(z.unknown()),
  rewardsOwedTokens: z.array(z.unknown()),
});

function resolveOnchainActionsBaseUrl(): string {
  return (
    process.env.ONCHAIN_ACTIONS_API_URL ??
    process.env.NEXT_PUBLIC_ONCHAIN_ACTIONS_API_URL ??
    'https://api.emberai.xyz'
  );
}

type CollectionKey = 'balances' | 'positions';

async function fetchPaginatedCollection<T>(params: {
  endpoint: string;
  key: CollectionKey;
  schema: z.ZodType<T>;
}): Promise<T[]> {
  const baseUrl = resolveOnchainActionsBaseUrl().replace(/\/$/, '');
  let page = 1;
  let totalPages = 1;
  let cursor: string | undefined;
  const results: T[] = [];

  while (page <= totalPages) {
    const pageUrl = new URL(`${baseUrl}${params.endpoint}`);
    if (page > 1) {
      pageUrl.searchParams.set('page', String(page));
      if (cursor) {
        pageUrl.searchParams.set('cursor', cursor);
      }
    }

    const response = await fetch(pageUrl.toString());
    const payloadText = await response.text();
    if (!response.ok) {
      throw new Error(
        `onchain-actions request failed (${response.status}) for ${params.endpoint}: ${payloadText}`,
      );
    }

    const payload = payloadText.trim().length > 0 ? JSON.parse(payloadText) : {};
    const pageSchema = PaginationSchema.extend({
      [params.key]: z.array(params.schema),
    });
    const parsed = pageSchema.parse(payload) as {
      cursor?: string | null;
      totalPages?: number;
    } & Record<string, unknown>;

    const items = parsed[params.key];
    if (!Array.isArray(items)) {
      throw new Error(`Invalid ${params.key} payload`);
    }
    results.push(...(items as T[]));

    totalPages = parsed.totalPages ?? 1;
    cursor = parsed.cursor ?? undefined;
    page += 1;
  }

  return results;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ walletAddress: string }> },
): Promise<NextResponse> {
  const { walletAddress } = await params;
  const parsedWalletAddress = WalletAddressSchema.safeParse(walletAddress);
  if (!parsedWalletAddress.success) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  try {
    const [balances, perpetuals, pendle, liquidity] = await Promise.all([
      fetchPaginatedCollection({
        endpoint: `/wallet/balances/${walletAddress}`,
        key: 'balances',
        schema: WalletBalanceSchema,
      }),
      fetchPaginatedCollection({
        endpoint: `/perpetuals/positions/${walletAddress}`,
        key: 'positions',
        schema: PerpetualPositionSchema,
      }),
      fetchPaginatedCollection({
        endpoint: `/tokenizedYield/positions/${walletAddress}`,
        key: 'positions',
        schema: TokenizedYieldPositionSchema,
      }),
      fetchPaginatedCollection({
        endpoint: `/liquidity/positions/${walletAddress}`,
        key: 'positions',
        schema: LiquidityPositionSchema,
      }),
    ]);

    return NextResponse.json(
      {
        walletAddress,
        balances,
        positions: {
          perpetuals,
          pendle,
          liquidity,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to load wallet portfolio', details: message }, { status: 502 });
  }
}
