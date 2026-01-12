/**
 * Polymarket Client
 *
 * Lightweight client for Polymarket market discovery and price fetching.
 * For full trading operations, this uses the same approach as the plugin.
 */

import { Wallet } from '@ethersproject/wallet';
import {
  ClobClient,
  OrderType,
  Side,
  type ApiKeyCreds,
} from '@polymarket/clob-client';
import { logInfo } from '../workflow/context.js';

// ============================================================================
// Types
// ============================================================================

export interface PolymarketAdapterParams {
  host?: string;
  chainId: number;
  funderAddress: string;
  privateKey: string;
  signatureType?: number;
  maxOrderSize?: number;
  gammaApiUrl?: string;
}

/**
 * Simplified market type for agent UI display.
 */
export interface PerpetualMarket {
  name: string;
  marketToken: { address: string; chainId: string };
  longToken: { address: string; chainId: string };
  shortToken: { address: string; chainId: string };
  longFundingFee: string;
  shortFundingFee: string;
  longBorrowingFee: string;
  shortBorrowingFee: string;
  chainId: string;
}

export interface CreatePositionRequest {
  marketAddress: string;
  amount: string;
  limitPrice?: string;
  chainId: string;
}

export interface CreatePositionResponse {
  transactions: unknown[];
  orderId?: string;
}

export interface GetMarketsResponse {
  markets: PerpetualMarket[];
}

/**
 * Order request for placing buy/sell orders.
 */
export interface PlaceOrderRequest {
  marketId: string;
  outcomeId: 'yes' | 'no';
  side: 'buy' | 'sell';
  size: string;
  price?: string;
  chainId: string;
}

/**
 * Response from placing an order.
 */
export interface PlaceOrderResponse {
  transactions: unknown[];
  orderId?: string;
  success: boolean;
  error?: string;
}

/**
 * User position in a market.
 */
export interface UserPosition {
  marketId: string;
  marketTitle: string;
  outcomeId: 'yes' | 'no';
  tokenId: string;
  size: string;
  currentPrice?: string;
}

/**
 * Full adapter interface for cross-arbitrage trading.
 */
export interface IPolymarketAdapter {
  // Queries
  getMarkets(request: {
    chainIds: string[];
    status?: 'active' | 'resolved';  // Filter by market status
  }): Promise<GetMarketsResponse>;
  getPositions(walletAddress: string): Promise<{ positions: UserPosition[] }>;

  // Trading - unified order placement for buy/sell YES/NO
  placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResponse>;

  // Convenience methods (deprecated - use placeOrder instead)
  createLongPosition(request: CreatePositionRequest): Promise<CreatePositionResponse>;
  createShortPosition(request: CreatePositionRequest): Promise<CreatePositionResponse>;
}

// ============================================================================
// Gamma API Types
// ============================================================================

interface GammaMarket {
  id: string;
  slug: string;
  question: string;
  endDate: string;
  outcomes: string;
  liquidity: string;
  volume: string;
  endDateIso: string;
  image: string | null;
  active: boolean;
  closed: boolean;
  archived: boolean;
  marketMakerAddress: string | null;
  clobTokenIds: string;
  tickSize: string;
  negRisk: boolean;
}

interface ParsedClobTokenIds {
  yes: string;
  no: string;
}

function parseClobTokenIds(clobTokenIds: string | undefined): ParsedClobTokenIds | null {
  if (!clobTokenIds) return null;
  try {
    const parsed = JSON.parse(clobTokenIds) as string[];
    if (Array.isArray(parsed) && parsed.length >= 2 && parsed[0] && parsed[1]) {
      return { yes: parsed[0], no: parsed[1] };
    }
    return null;
  } catch {
    return null;
  }
}

function roundToTickSize(price: number, tickSize: string): number {
  const tick = parseFloat(tickSize);
  const rounded = Math.round(price / tick) * tick;
  const decimals = tickSize.split('.')[1]?.length ?? 0;
  return parseFloat(rounded.toFixed(decimals));
}

// ============================================================================
// Lightweight Adapter for Agent
// ============================================================================

class AgentPolymarketAdapter implements IPolymarketAdapter {
  private clobClient: ClobClient | null = null;
  private clobClientPromise: Promise<ClobClient> | null = null;
  private readonly host: string;
  private readonly chainId: number;
  private readonly funderAddress: string;
  private readonly signer: Wallet;
  private readonly signatureType: number;
  private readonly maxOrderSize: number;
  private readonly gammaApiUrl: string;
  private marketCache: Map<string, GammaMarket> = new Map();

  constructor(params: PolymarketAdapterParams) {
    this.host = params.host ?? 'https://clob.polymarket.com';
    this.chainId = params.chainId;
    this.funderAddress = params.funderAddress;
    this.signer = new Wallet(params.privateKey);
    this.signatureType = params.signatureType ?? 0;
    this.maxOrderSize = params.maxOrderSize ?? 100;
    this.gammaApiUrl = params.gammaApiUrl ?? 'https://gamma-api.polymarket.com';
  }

  private async getClobClient(): Promise<ClobClient> {
    if (this.clobClient) return this.clobClient;

    if (!this.clobClientPromise) {
      this.clobClientPromise = (async () => {
        logInfo('Initializing CLOB client', { host: this.host });
        const baseClient = new ClobClient(this.host, this.chainId, this.signer);
        const creds: ApiKeyCreds = await baseClient.createOrDeriveApiKey();
        logInfo('API key created');
        const client = new ClobClient(
          this.host,
          this.chainId,
          this.signer,
          creds,
          this.signatureType,
          this.funderAddress,
        );
        this.clobClient = client;
        logInfo('CLOB client initialized successfully');
        return client;
      })();
    }

    return this.clobClientPromise;
  }

  private async getMarketInfo(
    tokenId: string,
  ): Promise<{ tickSize: '0.1' | '0.01' | '0.001' | '0.0001'; negRisk: boolean }> {
    const market = this.marketCache.get(tokenId);
    if (market) {
      const validTickSizes = ['0.1', '0.01', '0.001', '0.0001'] as const;
      const tickSize = validTickSizes.includes(market.tickSize as (typeof validTickSizes)[number])
        ? (market.tickSize as '0.1' | '0.01' | '0.001' | '0.0001')
        : '0.01';
      return { tickSize, negRisk: market.negRisk ?? false };
    }
    return { tickSize: '0.01', negRisk: false };
  }

  private getNoTokenId(yesTokenId: string): string | null {
    for (const [tokenId, market] of this.marketCache.entries()) {
      const tokens = parseClobTokenIds(market.clobTokenIds);
      if (tokens?.yes === yesTokenId) return tokens.no;
      if (tokenId === yesTokenId) return tokens?.no ?? null;
    }
    return null;
  }

  async getMarkets(request: {
    chainIds: string[];
    status?: 'active' | 'resolved';
  }): Promise<GetMarketsResponse> {
    if (!request.chainIds.includes('137')) return { markets: [] };

    try {
      // Build URL with status filter
      let url = `${this.gammaApiUrl}/markets?limit=100`;
      if (request.status === 'active') {
        url += '&closed=false&active=true';
      } else if (request.status === 'resolved') {
        url += '&closed=true';
      } else {
        // Default to active markets only
        url += '&closed=false&active=true';
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Gamma API error: ${response.status}`);

      const data = (await response.json()) as GammaMarket[];

      const markets: PerpetualMarket[] = data
        .filter((m) => {
          const tokens = parseClobTokenIds(m.clobTokenIds);
          // Additional filtering to ensure we only get valid markets
          return m.active && !m.closed && tokens !== null;
        })
        .map((m) => {
          const tokens = parseClobTokenIds(m.clobTokenIds)!;
          this.marketCache.set(tokens.yes, m);
          this.marketCache.set(tokens.no, m);

          return {
            name: m.question,
            marketToken: { address: tokens.yes, chainId: '137' },
            longToken: { address: tokens.yes, chainId: '137' },
            shortToken: { address: tokens.no, chainId: '137' },
            longFundingFee: '0',
            shortFundingFee: '0',
            longBorrowingFee: '0',
            shortBorrowingFee: '0',
            chainId: '137',
          };
        });

      return { markets };
    } catch (error) {
      logInfo('Error fetching markets', { error: String(error) });
      return { markets: [] };
    }
  }

  /**
   * Get token ID for a given market and outcome.
   */
  private getTokenIdForOutcome(marketId: string, outcomeId: 'yes' | 'no'): string | null {
    // marketId could be the YES token ID, so check cache
    const market = this.marketCache.get(marketId);
    if (market) {
      const tokens = parseClobTokenIds(market.clobTokenIds);
      if (tokens) {
        return outcomeId === 'yes' ? tokens.yes : tokens.no;
      }
    }
    // If marketId is already a token ID, try to find the other token
    if (outcomeId === 'yes') {
      return marketId; // Assume marketId is YES token
    }
    return this.getNoTokenId(marketId);
  }

  /**
   * Place an order - unified method for buy/sell YES/NO.
   */
  async placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    try {
      const clob = await this.getClobClient();

      // Resolve token ID from market ID and outcome
      const tokenId = this.getTokenIdForOutcome(request.marketId, request.outcomeId);
      if (!tokenId) {
        return {
          transactions: [],
          success: false,
          error: `Could not resolve token for market ${request.marketId} outcome ${request.outcomeId}`,
        };
      }

      const size = Number(request.size);
      const rawPrice = request.price ? Number(request.price) : 0.5;

      if (size > this.maxOrderSize) {
        return {
          transactions: [],
          success: false,
          error: `Order size ${size} exceeds max ${this.maxOrderSize}`,
        };
      }

      const { tickSize, negRisk } = await this.getMarketInfo(tokenId);
      const price = roundToTickSize(rawPrice, tickSize);
      const clobSide = request.side === 'buy' ? Side.BUY : Side.SELL;

      logInfo('Placing order', {
        tokenId: tokenId.substring(0, 20) + '...',
        side: request.side,
        outcome: request.outcomeId,
        size,
        price,
      });

      const response = (await clob.createAndPostOrder(
        { tokenID: tokenId, price, side: clobSide, size, feeRateBps: 0 },
        { tickSize, negRisk },
        OrderType.GTC,
      )) as { orderID?: string; id?: string; order?: { id: string }; success?: boolean; error?: string };

      const orderId = response?.orderID || response?.id || response?.order?.id;

      if (!orderId && response?.error) {
        return {
          transactions: [],
          success: false,
          error: response.error,
        };
      }

      logInfo('Order placed', { orderId, side: request.side, outcome: request.outcomeId });

      return {
        transactions: [],
        orderId,
        success: true,
      };
    } catch (error) {
      logInfo('Order failed', { error: String(error) });
      return {
        transactions: [],
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Get user positions from the CLOB API.
   */
  async getPositions(walletAddress: string): Promise<{ positions: UserPosition[] }> {
    try {
      // Fetch balances from data API
      const dataApiUrl = 'https://data-api.polymarket.com';
      const url = `${dataApiUrl}/users/${walletAddress}/positions`;

      logInfo('Fetching positions', { walletAddress: walletAddress.substring(0, 10) + '...' });

      const response = await fetch(url);
      if (!response.ok) {
        logInfo('Positions API returned error', { status: response.status });
        return { positions: [] };
      }

      const data = (await response.json()) as { positions?: { tokenId: string; balance: string }[] };
      const positions: UserPosition[] = [];

      for (const pos of data.positions ?? []) {
        if (!pos.balance || pos.balance === '0') continue;

        // Find market in cache
        const market = this.marketCache.get(pos.tokenId);
        if (!market) continue;

        const tokens = parseClobTokenIds(market.clobTokenIds);
        if (!tokens) continue;

        const isYes = pos.tokenId === tokens.yes;

        positions.push({
          marketId: market.id,
          marketTitle: market.question,
          outcomeId: isYes ? 'yes' : 'no',
          tokenId: pos.tokenId,
          size: pos.balance,
        });
      }

      logInfo('Positions fetched', { count: positions.length });
      return { positions };
    } catch (error) {
      logInfo('Error fetching positions', { error: String(error) });
      return { positions: [] };
    }
  }

  /**
   * @deprecated Use placeOrder with side='buy' and outcomeId='yes'
   */
  async createLongPosition(request: CreatePositionRequest): Promise<CreatePositionResponse> {
    const result = await this.placeOrder({
      marketId: request.marketAddress,
      outcomeId: 'yes',
      side: 'buy',
      size: request.amount,
      price: request.limitPrice,
      chainId: request.chainId,
    });

    return {
      transactions: result.transactions,
      orderId: result.orderId,
    };
  }

  /**
   * @deprecated Use placeOrder with side='buy' and outcomeId='no'
   */
  async createShortPosition(request: CreatePositionRequest): Promise<CreatePositionResponse> {
    const result = await this.placeOrder({
      marketId: request.marketAddress,
      outcomeId: 'no',
      side: 'buy',
      size: request.amount,
      price: request.limitPrice,
      chainId: request.chainId,
    });

    return {
      transactions: result.transactions,
      orderId: result.orderId,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let cachedAdapter: IPolymarketAdapter | null = null;

export async function createAdapterFromEnv(): Promise<IPolymarketAdapter | null> {
  if (cachedAdapter) return cachedAdapter;

  const privateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
  const funderAddress = process.env['POLY_FUNDER_ADDRESS'];

  if (!privateKey || !funderAddress) {
    logInfo('Missing credentials for PolymarketAdapter', {
      hasPrivateKey: !!privateKey,
      hasFunderAddress: !!funderAddress,
    });
    return null;
  }

  try {
    logInfo('Creating PolymarketAdapter...');
    cachedAdapter = new AgentPolymarketAdapter({
      chainId: 137,
      host: process.env['POLYMARKET_CLOB_API'] ?? 'https://clob.polymarket.com',
      funderAddress,
      privateKey,
      signatureType: parseInt(process.env['POLY_SIGNATURE_TYPE'] ?? '0', 10),
      maxOrderSize: parseInt(process.env['POLY_MAX_ORDER_SIZE'] ?? '100', 10),
      gammaApiUrl: process.env['POLYMARKET_GAMMA_API'] ?? 'https://gamma-api.polymarket.com',
    });
    logInfo('PolymarketAdapter created successfully');
    return cachedAdapter;
  } catch (error) {
    logInfo('Failed to create PolymarketAdapter', { error: String(error) });
    return null;
  }
}

// ============================================================================
// Direct Market Fetching (no auth required)
// ============================================================================

export async function fetchMarketsFromGamma(limit = 20): Promise<PerpetualMarket[]> {
  const gammaApiUrl = process.env['POLYMARKET_GAMMA_API'] ?? 'https://gamma-api.polymarket.com';

  try {
    const url = `${gammaApiUrl}/markets?closed=false&limit=${limit}`;
    logInfo('Fetching markets from Gamma API', { url });

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Gamma API error: ${response.status}`);

    const data = (await response.json()) as GammaMarket[];
    logInfo(`Gamma API returned ${data.length} markets`);

    return data
      .filter((m) => {
        const tokens = parseClobTokenIds(m.clobTokenIds);
        return m.active && !m.closed && tokens !== null;
      })
      .map((m) => {
        const tokens = parseClobTokenIds(m.clobTokenIds)!;
        return {
          name: m.question,
          marketToken: { address: tokens.yes, chainId: '137' },
          longToken: { address: tokens.yes, chainId: '137' },
          shortToken: { address: tokens.no, chainId: '137' },
          longFundingFee: '0',
          shortFundingFee: '0',
          longBorrowingFee: '0',
          shortBorrowingFee: '0',
          chainId: '137',
        };
      });
  } catch (error) {
    logInfo('Error fetching markets', { error: String(error) });
    return [];
  }
}

// ============================================================================
// Price Fetching from CLOB API (no auth required)
// ============================================================================

/**
 * Market prices with bid/ask for both YES and NO tokens.
 */
export interface MarketPrices {
  /** Price to BUY YES tokens (best ask) - 0 means no sellers */
  yesBuyPrice: number;
  /** Price to SELL YES tokens (best bid) - 0 means no buyers */
  yesSellPrice: number;
  /** Price to BUY NO tokens (best ask) - 0 means no sellers */
  noBuyPrice: number;
  /** Price to SELL NO tokens (best bid) - 0 means no buyers */
  noSellPrice: number;
  /** Midpoint price for YES token */
  yesMidpoint: number;
  /** Midpoint price for NO token */
  noMidpoint: number;
}

/**
 * Fetch market prices from CLOB API.
 * Returns buy, sell, and midpoint prices for YES and NO tokens.
 *
 * IMPORTANT: Polymarket CLOB API `side` parameter refers to the ORDER's side, not user action:
 * - `side=buy`  returns BID price (orders wanting to BUY = what YOU receive when SELLING)
 * - `side=sell` returns ASK price (orders wanting to SELL = what YOU pay when BUYING)
 */
export async function fetchMarketPrices(
  yesTokenId: string,
  noTokenId: string,
): Promise<MarketPrices> {
  const clobUrl = process.env['POLYMARKET_CLOB_API'] ?? 'https://clob.polymarket.com';

  try {
    // Fetch all prices in parallel
    // side=sell -> ASK (what you PAY to buy tokens)
    // side=buy  -> BID (what you GET when selling tokens)
    const [yesAskRes, yesBidRes, noAskRes, noBidRes, yesMidRes, noMidRes] = await Promise.all([
      fetch(`${clobUrl}/price?token_id=${yesTokenId}&side=sell`), // ASK = buy price
      fetch(`${clobUrl}/price?token_id=${yesTokenId}&side=buy`), // BID = sell price
      fetch(`${clobUrl}/price?token_id=${noTokenId}&side=sell`), // ASK = buy price
      fetch(`${clobUrl}/price?token_id=${noTokenId}&side=buy`), // BID = sell price
      fetch(`${clobUrl}/midpoint?token_id=${yesTokenId}`),
      fetch(`${clobUrl}/midpoint?token_id=${noTokenId}`),
    ]);

    const parsePrice = async (res: Response, fallback = 0): Promise<number> => {
      if (!res.ok) return fallback;
      const data = (await res.json()) as { price?: string };
      return parseFloat(data.price ?? String(fallback));
    };

    const parseMidpoint = async (res: Response, fallback = 0.5): Promise<number> => {
      if (!res.ok) return fallback;
      const data = (await res.json()) as { mid?: string };
      return parseFloat(data.mid ?? String(fallback));
    };

    // Parse: yesBuyPrice = ASK, yesSellPrice = BID
    const [yesBuyPrice, yesSellPrice, noBuyPrice, noSellPrice, yesMidpoint, noMidpoint] =
      await Promise.all([
        parsePrice(yesAskRes), // ASK = what you pay to BUY YES
        parsePrice(yesBidRes), // BID = what you get when SELLING YES
        parsePrice(noAskRes), // ASK = what you pay to BUY NO
        parsePrice(noBidRes), // BID = what you get when SELLING NO
        parseMidpoint(yesMidRes),
        parseMidpoint(noMidRes),
      ]);

    return { yesBuyPrice, yesSellPrice, noBuyPrice, noSellPrice, yesMidpoint, noMidpoint };
  } catch {
    return {
      yesBuyPrice: 0,
      yesSellPrice: 0,
      noBuyPrice: 0,
      noSellPrice: 0,
      yesMidpoint: 0.5,
      noMidpoint: 0.5,
    };
  }
}
