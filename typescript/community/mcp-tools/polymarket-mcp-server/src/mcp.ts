import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ClobClient, OrderType, Side, type ApiKeyCreds } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';

const POLYMARKET_HOST = process.env.POLYMARKET_HOST ?? 'https://clob.polymarket.com';
const POLYMARKET_CHAIN_ID = Number(process.env.POLYMARKET_CHAIN_ID ?? '137');
const POLYMARKET_SIGNATURE_TYPE = Number(process.env.POLYMARKET_SIGNATURE_TYPE ?? '1'); // 0 = EOA, 1 = Magic/email, 2 = browser wallet

const MAX_ORDER_SIZE = Number(process.env.POLYMARKET_MAX_ORDER_SIZE ?? '100');
const MAX_ORDER_NOTIONAL = Number(process.env.POLYMARKET_MAX_ORDER_NOTIONAL ?? '500');

let clobClientPromise: Promise<ClobClient> | null = null;

async function getClobClient(): Promise<ClobClient> {
  if (!clobClientPromise) {
    const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    if (!funderAddress || !privateKey) {
      throw new Error('POLYMARKET_FUNDER_ADDRESS and POLYMARKET_PRIVATE_KEY are required');
    }

    const signer = new Wallet(privateKey);

    const baseClient = new ClobClient(POLYMARKET_HOST, POLYMARKET_CHAIN_ID, signer);
    const creds: ApiKeyCreds = await baseClient.createOrDeriveApiKey();
    clobClientPromise = Promise.resolve(
      new ClobClient(
        POLYMARKET_HOST,
        POLYMARKET_CHAIN_ID,
        signer,
        creds,
        POLYMARKET_SIGNATURE_TYPE,
        funderAddress,
      ),
    );
  }
  return clobClientPromise;
}

const listMarketsInputSchema = z.object({
  search: z.string().min(1).optional(),
  category: z.string().optional(),
  minLiquidityUsd: z.number().nonnegative().default(0),
  onlyTradable: z.boolean().default(true),
  limit: z.number().int().min(1).max(100).default(20),
});

const getOrderbookInputSchema = z.object({
  tokenId: z.string().min(1),
  depth: z.number().int().min(1).max(100).default(20),
});

const placeLimitOrderInputSchema = z.object({
  tokenId: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  size: z.number().positive(),
  price: z.number().min(0).max(1),
  orderType: z.nativeEnum(OrderType).default(OrderType.GTC),
  tickSize: z.string().min(1),
  negRisk: z.boolean(),
  feeRateBps: z.number().int().min(0).max(10_000).default(0),
  maxNotionalUsd: z.number().positive().optional(),
});

const cancelOrderInputSchema = z.object({
  orderId: z.string().min(1),
});

const getTradeHistoryInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
});

export async function createServer() {
  const server = new McpServer({ name: 'polymarket-mcp-server', version: '1.0.0' });

  server.tool(
    'list_markets',
    'List active Polymarket markets with basic filters',
    listMarketsInputSchema.shape,
    async (args) => {
      const clob = await getClobClient();
      const { search, category, minLiquidityUsd, onlyTradable, limit } = args;

      const extended = clob as unknown as {
        getMarkets?: (params: {
          search?: string;
          category?: string;
          limit?: number;
          tradableOnly?: boolean;
        }) => Promise<unknown>;
      };

      const marketsRaw = extended.getMarkets
        ? await extended.getMarkets({
            search,
            category,
            limit,
            tradableOnly: onlyTradable,
          })
        : [];

      const markets = marketsRaw as unknown as Array<Record<string, unknown>>;

      const normalized = markets.map((m) => {
        const market = m as Record<string, unknown>;
        marketId: m.id ?? m.marketId ?? '',
        slug: m.slug ?? '',
        question: m.question ?? m.title ?? '',
        endDate: m.endDate ?? m.end_date ?? '',
        yesTokenId: m.yesTokenId ?? m.yes_token_id ?? '',
        noTokenId: m.noTokenId ?? m.no_token_id ?? '',
        tickSize: m.tickSize ?? m.tick_size ?? '0.001',
        negRisk: Boolean(m.negRisk ?? m.negrisk),
        liquidityUsd: Number(m.liquidity ?? m.liquidityUsd ?? 0),
      }).filter((m) => m.liquidityUsd >= minLiquidityUsd);

      return { content: [{ type: 'text', text: JSON.stringify({ markets: normalized }, null, 2) }] };
    },
  );

  server.tool(
    'get_orderbook',
    'Get Polymarket orderbook for a specific token',
    getOrderbookInputSchema.shape,
    async ({ tokenId, depth }) => {
      const clob = await getClobClient();
      const extended = clob as unknown as {
        getOrderBook?: (tokenId: string, opts: { depth: number }) => Promise<unknown>;
      };
      const bookRaw = extended.getOrderBook ? await extended.getOrderBook(tokenId, { depth }) : null;
      const book = (bookRaw ?? {}) as { bids?: unknown[]; asks?: unknown[] };

      const bids = (book.bids ?? []).map((b) => {
        const bid = b as Record<string, unknown>;
        return {
          price: Number(bid.price),
          size: Number(bid.size),
        };
      });
      const asks = (book.asks ?? []).map((a) => {
        const ask = a as Record<string, unknown>;
        return {
          price: Number(ask.price),
          size: Number(ask.size),
        };
      });

      const bestBid = bids[0]?.price ?? null;
      const bestAsk = asks[0]?.price ?? null;
      const midPrice = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                tokenId,
                bids,
                asks,
                midPrice,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'get_positions',
    'Get current Polymarket positions for the configured account',
    z.object({}).shape,
    async () => {
      const clob = await getClobClient();
      const extended = clob as unknown as {
        getPositions?: () => Promise<unknown>;
      };
      const positionsRaw = extended.getPositions ? await extended.getPositions() : [];
      const positions = positionsRaw as unknown as Array<Record<string, unknown>>;

      const normalized = positions.map((p) => {
        const pos = p as Record<string, unknown>;
        return {
          tokenId: pos.tokenId ?? pos.token_id ?? '',
          side: pos.side ?? '',
          size: Number(pos.size ?? 0),
          avgEntryPrice: Number(pos.avgEntryPrice ?? pos.avg_entry_price ?? 0),
          markPrice: pos.markPrice != null ? Number(pos.markPrice as number) : null,
          unrealizedPnlUsd:
            pos.unrealizedPnlUsd != null ? Number(pos.unrealizedPnlUsd as number) : null,
          realizedPnlUsd:
            pos.realizedPnlUsd != null ? Number(pos.realizedPnlUsd as number) : null,
          marketSlug: (pos.marketSlug ?? pos.slug) as string | undefined,
        };
      });

      return { content: [{ type: 'text', text: JSON.stringify({ positions: normalized }, null, 2) }] };
    },
  );

  server.tool(
    'place_limit_order',
    'Place a Polymarket limit order with safety checks',
    placeLimitOrderInputSchema.shape,
    async (args) => {
      const { tokenId, side, size, price, orderType, tickSize, negRisk, feeRateBps, maxNotionalUsd } = args;

      if (size > MAX_ORDER_SIZE) {
        throw new Error(`Order size ${size} exceeds max allowed ${MAX_ORDER_SIZE}`);
      }

      const notional = size * price;
      const cap = maxNotionalUsd ?? MAX_ORDER_NOTIONAL;
      if (notional > cap) {
        throw new Error(`Order notional ${notional} exceeds cap ${cap}`);
      }

      const clob = await getClobClient();

      const resp = await (clob as any).createAndPostOrder(
        {
          tokenID: tokenId,
          price,
          side: side === 'BUY' ? Side.BUY : Side.SELL,
          size,
          feeRateBps,
        },
        { tickSize, negRisk },
        orderType,
      );

      const result = {
        orderId: resp?.orderId ?? resp?.id ?? '',
        status: resp?.status ?? 'UNKNOWN',
        tokenId,
        side,
        size,
        price,
        notionalUsd: notional,
        createdAt: resp?.createdAt ?? resp?.created_at ?? new Date().toISOString(),
        explanation: `Placed ${side} ${size} @ ${price} on token ${tokenId}`,
      };

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'cancel_order',
    'Cancel an existing Polymarket order by ID',
    cancelOrderInputSchema.shape,
    async ({ orderId }) => {
      const clob = await getClobClient();
      const extended = clob as unknown as {
        cancelOrder?: (orderId: string) => Promise<unknown>;
      };
      const respRaw = extended.cancelOrder ? await extended.cancelOrder(orderId) : null;
      const resp = (respRaw ?? {}) as { status?: unknown };

      const result = {
        orderId,
        status: (resp.status as string | undefined) ?? 'CANCELLED',
      };

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_trade_history',
    'Get recent Polymarket trade history for the configured account',
    getTradeHistoryInputSchema.shape,
    async ({ limit }) => {
      const clob = await getClobClient();
      const extended = clob as unknown as {
        getTrades?: (params: { limit: number }) => Promise<unknown>;
      };
      const tradesRaw = extended.getTrades ? await extended.getTrades({ limit }) : [];
      const trades = tradesRaw as unknown as Array<Record<string, unknown>>;

      const normalized = trades.map((t) => {
        const trade = t as Record<string, unknown>;
        return {
          tradeId: trade.tradeId ?? trade.id ?? '',
          tokenId: trade.tokenId ?? trade.token_id ?? '',
          side: trade.side ?? '',
          size: Number(trade.size ?? 0),
          price: Number(trade.price ?? 0),
          notionalUsd: Number(trade.notionalUsd ?? trade.notional_usd ?? 0),
          realizedPnlUsd:
            trade.realizedPnlUsd != null ? Number(trade.realizedPnlUsd as number) : null,
          executedAt: (trade.executedAt ?? trade.executed_at ?? '') as string,
        };
      });

      return { content: [{ type: 'text', text: JSON.stringify({ trades: normalized }, null, 2) }] };
    },
  );

  return server;
}


