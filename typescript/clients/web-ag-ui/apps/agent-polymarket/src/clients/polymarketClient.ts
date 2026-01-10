/**
 * Polymarket Client
 *
 * Direct integration with @polymarket/clob-client for prediction market trading.
 * This provides market discovery, order placement, and position tracking.
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
  maxOrderNotional?: number;
  gammaApiUrl?: string;
  dataApiUrl?: string;
}

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

export interface IPolymarketAdapter {
  getMarkets(request: { chainIds: string[] }): Promise<GetMarketsResponse>;
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

// ============================================================================
// Helper Functions
// ============================================================================

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

/**
 * Round a price to the market's tick size.
 * Example: roundToTickSize(0.123, '0.01') => 0.12
 */
function roundToTickSize(price: number, tickSize: string): number {
  const tick = parseFloat(tickSize);
  const rounded = Math.round(price / tick) * tick;
  // Fix floating point precision issues
  const decimals = tickSize.split('.')[1]?.length ?? 0;
  return parseFloat(rounded.toFixed(decimals));
}

// ============================================================================
// PolymarketAdapter Class
// ============================================================================

export class PolymarketAdapter implements IPolymarketAdapter {
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
    this.signatureType = params.signatureType ?? 1;
    this.maxOrderSize = params.maxOrderSize ?? 100;
    this.gammaApiUrl = params.gammaApiUrl ?? 'https://gamma-api.polymarket.com';
  }

  /**
   * Initialize CLOB client with API credentials.
   */
  private async getClobClient(): Promise<ClobClient> {
    if (this.clobClient) {
      return this.clobClient;
    }

    if (!this.clobClientPromise) {
      this.clobClientPromise = (async () => {
        logInfo('Initializing CLOB client', { host: this.host, chainId: this.chainId });
        const baseClient = new ClobClient(this.host, this.chainId, this.signer);
        logInfo('Creating/deriving API key...');
        const creds: ApiKeyCreds = await baseClient.createOrDeriveApiKey();
        logInfo('API key created', { apiKey: creds.key?.substring(0, 8) + '...' });
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

  /**
   * Get market info for order placement.
   *
   * Note: Most Polymarket markets use 0.01 tick size. The 0.001 tick size is only
   * available for specific high-volume markets. We default to 0.01 to be safe.
   */
  private async getMarketInfo(
    tokenId: string,
  ): Promise<{ tickSize: '0.1' | '0.01' | '0.001' | '0.0001'; negRisk: boolean }> {
    const market = this.marketCache.get(tokenId);
    if (market) {
      const validTickSizes = ['0.1', '0.01', '0.001', '0.0001'] as const;
      const tickSize = validTickSizes.includes(market.tickSize as (typeof validTickSizes)[number])
        ? (market.tickSize as '0.1' | '0.01' | '0.001' | '0.0001')
        : '0.01'; // Default to 0.01 if market tick size is not recognized
      logInfo('Using market tick size', { tokenId: tokenId.substring(0, 20) + '...', tickSize, marketTickSize: market.tickSize });
      return { tickSize, negRisk: market.negRisk ?? false };
    }
    // Default to 0.01 which is the most common tick size on Polymarket
    logInfo('Market not in cache, using default tick size 0.01', { tokenId: tokenId.substring(0, 20) + '...' });
    return { tickSize: '0.01', negRisk: false };
  }

  /**
   * Get NO token ID for a given YES token ID from cache.
   */
  private getNoTokenId(yesTokenId: string): string | null {
    for (const [tokenId, market] of this.marketCache.entries()) {
      const tokens = parseClobTokenIds(market.clobTokenIds);
      if (tokens?.yes === yesTokenId) {
        return tokens.no;
      }
      if (tokenId === yesTokenId) {
        return tokens?.no ?? null;
      }
    }
    return null;
  }

  /**
   * Fetch available markets from Gamma API.
   */
  async getMarkets(request: { chainIds: string[] }): Promise<GetMarketsResponse> {
    logInfo('getMarkets called', { chainIds: request.chainIds });

    if (!request.chainIds.includes('137')) {
      return { markets: [] };
    }

    try {
      const url = `${this.gammaApiUrl}/markets?closed=false&limit=100`;
      logInfo('Fetching markets from Gamma API', { url });

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }

      const data = (await response.json()) as GammaMarket[];
      logInfo(`Gamma API returned ${data.length} markets`);

      const markets: PerpetualMarket[] = data
        .filter((m) => {
          const tokens = parseClobTokenIds(m.clobTokenIds);
          return m.active && !m.closed && tokens !== null;
        })
        .map((m) => {
          const tokens = parseClobTokenIds(m.clobTokenIds)!;

          // Cache for later use
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

      logInfo(`Returning ${markets.length} active markets`);
      return { markets };
    } catch (error) {
      logInfo('Error fetching markets', { error: String(error) });
      return { markets: [] };
    }
  }

  /**
   * Create a long position (BUY YES token).
   */
  async createLongPosition(request: CreatePositionRequest): Promise<CreatePositionResponse> {
    logInfo('createLongPosition called', {
      marketAddress: request.marketAddress.substring(0, 20) + '...',
      amount: request.amount,
      limitPrice: request.limitPrice,
    });

    const clob = await this.getClobClient();
    const tokenId = request.marketAddress;
    const size = Number(request.amount);
    const rawPrice = request.limitPrice ? Number(request.limitPrice) : 0.5;

    if (size > this.maxOrderSize) {
      throw new Error(`Order size ${size} exceeds max allowed ${this.maxOrderSize}`);
    }

    const { tickSize, negRisk } = await this.getMarketInfo(tokenId);
    // Round price to tick size to avoid "invalid tick size" errors
    const price = roundToTickSize(rawPrice, tickSize);
    logInfo('Placing LONG order (BUY YES)', { tokenId: tokenId.substring(0, 20) + '...', price, rawPrice, tickSize, size });

    const response = (await clob.createAndPostOrder(
      {
        tokenID: tokenId,
        price,
        side: Side.BUY,
        size,
        feeRateBps: 0,
      },
      { tickSize, negRisk },
      OrderType.GTC,
    )) as { orderID?: string; id?: string; order?: { id: string } };

    const orderId = response?.orderID || response?.id || response?.order?.id;
    logInfo('Order placed', { orderId });

    return {
      transactions: [],
      orderId,
    };
  }

  /**
   * Create a short position (BUY NO token).
   */
  async createShortPosition(request: CreatePositionRequest): Promise<CreatePositionResponse> {
    logInfo('createShortPosition called', {
      marketAddress: request.marketAddress.substring(0, 20) + '...',
      amount: request.amount,
      limitPrice: request.limitPrice,
    });

    const clob = await this.getClobClient();
    const yesTokenId = request.marketAddress;
    const noTokenId = this.getNoTokenId(yesTokenId);

    if (!noTokenId) {
      throw new Error(`Could not find NO token for YES token ${yesTokenId}`);
    }

    const size = Number(request.amount);
    const rawPrice = request.limitPrice ? Number(request.limitPrice) : 0.5;

    if (size > this.maxOrderSize) {
      throw new Error(`Order size ${size} exceeds max allowed ${this.maxOrderSize}`);
    }

    const { tickSize, negRisk } = await this.getMarketInfo(yesTokenId);
    // Round price to tick size to avoid "invalid tick size" errors
    const price = roundToTickSize(rawPrice, tickSize);
    logInfo('Placing SHORT order (BUY NO)', { noTokenId: noTokenId.substring(0, 20) + '...', price, rawPrice, tickSize, size });

    const response = (await clob.createAndPostOrder(
      {
        tokenID: noTokenId,
        price,
        side: Side.BUY,
        size,
        feeRateBps: 0,
      },
      { tickSize, negRisk },
      OrderType.GTC,
    )) as { orderID?: string; id?: string; order?: { id: string } };

    const orderId = response?.orderID || response?.id || response?.order?.id;
    logInfo('Order placed', { orderId });

    return {
      transactions: [],
      orderId,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

// Cached adapter instance
let cachedAdapter: IPolymarketAdapter | null = null;

/**
 * Create adapter from environment variables.
 */
export async function createAdapterFromEnv(): Promise<IPolymarketAdapter | null> {
  if (cachedAdapter) {
    return cachedAdapter;
  }

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

    cachedAdapter = new PolymarketAdapter({
      chainId: 137,
      host: process.env['POLYMARKET_CLOB_API'] ?? 'https://clob.polymarket.com',
      funderAddress,
      privateKey,
      signatureType: parseInt(process.env['POLY_SIGNATURE_TYPE'] ?? '1', 10),
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

/**
 * Create a mock adapter for testing.
 */
export function createMockAdapter(): IPolymarketAdapter {
  return {
    getMarkets: async () => {
      logInfo('[MOCK] getMarkets called');
      return { markets: [] };
    },
    createLongPosition: async (request) => {
      logInfo('[MOCK] createLongPosition called', { market: request.marketAddress.substring(0, 20) });
      return { transactions: [], orderId: `mock-yes-${Date.now()}` };
    },
    createShortPosition: async (request) => {
      logInfo('[MOCK] createShortPosition called', { market: request.marketAddress.substring(0, 20) });
      return { transactions: [], orderId: `mock-no-${Date.now()}` };
    },
  };
}

// ============================================================================
// Direct Market Fetching (no auth required)
// ============================================================================

/**
 * Fetch markets directly from Gamma API without authentication.
 * This is useful for testing and displaying markets before login.
 */
export async function fetchMarketsFromGamma(limit = 20): Promise<PerpetualMarket[]> {
  const gammaApiUrl = process.env['POLYMARKET_GAMMA_API'] ?? 'https://gamma-api.polymarket.com';

  try {
    const url = `${gammaApiUrl}/markets?closed=false&limit=${limit}`;
    logInfo('Fetching markets directly from Gamma API', { url });

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.status}`);
    }

    const data = (await response.json()) as GammaMarket[];
    logInfo(`Direct fetch: Gamma API returned ${data.length} markets`);

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
    logInfo('Error fetching markets directly', { error: String(error) });
    return [];
  }
}

/**
 * Fetch market prices from CLOB API.
 */
export async function fetchMarketPrices(
  yesTokenId: string,
  noTokenId: string,
): Promise<{ yesPrice: number; noPrice: number }> {
  const clobUrl = process.env['POLYMARKET_CLOB_API'] ?? 'https://clob.polymarket.com';

  try {
    const [yesRes, noRes] = await Promise.all([
      fetch(`${clobUrl}/price?token_id=${yesTokenId}&side=buy`),
      fetch(`${clobUrl}/price?token_id=${noTokenId}&side=buy`),
    ]);

    let yesPrice = 0.5;
    let noPrice = 0.5;

    if (yesRes.ok) {
      const data = (await yesRes.json()) as { price?: string };
      yesPrice = parseFloat(data.price ?? '0.5');
    }
    if (noRes.ok) {
      const data = (await noRes.json()) as { price?: string };
      noPrice = parseFloat(data.price ?? '0.5');
    }

    return { yesPrice, noPrice };
  } catch {
    return { yesPrice: 0.5, noPrice: 0.5 };
  }
}
