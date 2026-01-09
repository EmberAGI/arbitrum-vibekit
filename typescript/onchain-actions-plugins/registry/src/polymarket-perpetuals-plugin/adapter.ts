import { Wallet } from '@ethersproject/wallet';
import {
  ClobClient,
  OrderType,
  Side,
  type ApiKeyCreds,
  type OpenOrder,
  type Trade,
  type MarketPrice,
  type PriceHistoryFilterParams,
  type MarketTradeEvent,
} from '@polymarket/clob-client';

import type {
  CreatePerpetualsPositionRequest,
  CreatePerpetualsPositionResponse,
  ClosePerpetualsOrdersRequest,
  ClosePerpetualsOrdersResponse,
  GetPerpetualsMarketsRequest,
  GetPerpetualsMarketsResponse,
  GetPerpetualsMarketsPositionsRequest,
  GetPerpetualsMarketsPositionsResponse,
  GetPerpetualsMarketsOrdersRequest,
  GetPerpetualsMarketsOrdersResponse,
  PerpetualMarket,
  PerpetualsPosition,
  PerpetualsOrder,
  TransactionPlan,
  TokenIdentifier,
} from '../core/index.js';
import { TransactionTypes } from '../core/schemas/enums.js';
import type { PositionSide } from '../core/schemas/perpetuals.js';

// Additional type definitions for better type safety
interface ClobOrderResponse {
  orderID?: string;
  id?: string;
  order?: { id: string };
  success?: boolean;
  error?: string;
  message?: string;
  errorMsg?: string;
  transactionsHashes?: string[];
  status?: string;
  takingAmount?: string;
  makingAmount?: string;
}


interface UserEarnings {
  date: string;
  earnings: unknown[];
  totalEarnings: unknown[];
}

interface ComprehensiveWalletData {
  currentBalances: { tokenId: string; balance: string; marketName?: string }[];
  tradingHistory: Trade[];
  openOrders: PerpetualsOrder[];
  earnings: UserEarnings | null;
  marketActivity: { market: string; trades: MarketTradeEvent[] }[];
  summary: {
    totalTokensHeld?: number;
    totalTrades?: number;
    activeOrders?: number;
    marketsTraded?: number;
    lastTradeDate?: string;
  };
}

// Enable debug logging
const DEBUG = process.env['POLYMARKET_DEBUG'] === 'true';

export interface PolymarketAdapterParams {
  host?: string;
  chainId: number;
  funderAddress: string;
  privateKey: string;
  signatureType?: number; // 0 = EOA, 1 = Magic/email, 2 = browser wallet
  maxOrderSize?: number;
  maxOrderNotional?: number;
  gammaApiUrl?: string; // Gamma API for market data
  dataApiUrl?: string; // Data API for user positions
}

interface PolymarketMarket {
  id: string;
  slug: string;
  question: string;
  endDate: string;
  outcomes: string; // JSON string like '["Yes", "No"]'
  liquidity: string;
  volume: string;
  endDateIso: string;
  image: string | null;
  active: boolean;
  closed: boolean;
  archived: boolean;
  marketMakerAddress: string | null;
  resolutionSource: string | null;
  clobTokenIds: string; // JSON string like '["yesTokenId", "noTokenId"]'
  tickSize: string;
  negRisk: boolean;
}

/**
 * Parsed clobTokenIds with YES and NO token IDs.
 */
interface ParsedClobTokenIds {
  yes: string;
  no: string;
}

/**
 * Debug logging helper
 */
function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(`[PolymarketAdapter] ${message}`, data !== undefined ? data : '');
  }
}

/**
 * Parse clobTokenIds from JSON string to object.
 * @param clobTokenIds - JSON string like '["yesTokenId", "noTokenId"]'
 * @returns Parsed object with yes/no token IDs, or null if invalid
 */
function parseClobTokenIds(clobTokenIds: string | undefined): ParsedClobTokenIds | null {
  if (!clobTokenIds) return null;
  try {
    const parsed = JSON.parse(clobTokenIds) as string[];
    if (Array.isArray(parsed) && parsed.length >= 2 && parsed[0] && parsed[1]) {
      return {
        yes: parsed[0],
        no: parsed[1],
      };
    }
    return null;
  } catch {
    return null;
  }
}

interface PolymarketPosition {
  tokenId: string;
  balance: string;
  marketSlug?: string;
  outcome?: string;
}

// Note: Using OpenOrder type from @polymarket/clob-client for order data

/**
 * PolymarketAdapter wraps the Polymarket CLOB client for prediction market trading.
 * Maps Polymarket YES/NO tokens to perpetuals long/short positions.
 */
export class PolymarketAdapter {
  private clobClient: ClobClient | null = null;
  private clobClientPromise: Promise<ClobClient> | null = null;
  private readonly host: string;
  private readonly chainId: number;
  private readonly funderAddress: string;
  private readonly signer: Wallet;
  private readonly signatureType: number;
  private readonly maxOrderSize: number;
  private readonly maxOrderNotional: number;
  private readonly gammaApiUrl: string;
  private readonly dataApiUrl: string;
  private marketCache: Map<string, PolymarketMarket> = new Map();

  constructor(params: PolymarketAdapterParams) {
    this.host = params.host ?? 'https://clob.polymarket.com';
    this.chainId = params.chainId;
    this.funderAddress = params.funderAddress;
    this.signer = new Wallet(params.privateKey);
    this.signatureType = params.signatureType ?? 1;
    this.maxOrderSize = params.maxOrderSize ?? 100;
    this.maxOrderNotional = params.maxOrderNotional ?? 500;
    this.gammaApiUrl = params.gammaApiUrl ?? 'https://gamma-api.polymarket.com';
    this.dataApiUrl = params.dataApiUrl ?? 'https://data-api.polymarket.com';
  }

  /**
   * Fetch market data from Gamma API and cache it.
   */
  private async fetchMarketData(tokenId?: string): Promise<PolymarketMarket | null> {
    debugLog('fetchMarketData called', { tokenId });

    if (tokenId && this.marketCache.has(tokenId)) {
      debugLog('Returning cached market for token', { tokenId });
      return this.marketCache.get(tokenId) ?? null;
    }

    try {
      // Use clob_token_ids parameter for specific token lookup
      const url = tokenId
        ? `${this.gammaApiUrl}/markets?clob_token_ids=${tokenId}`
        : `${this.gammaApiUrl}/markets?closed=false&limit=100`;

      debugLog('Fetching from URL', { url });

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }

      // API returns array directly, not { markets: [...] }
      const data = (await response.json()) as PolymarketMarket[];
      debugLog('Gamma API returned', { count: data.length });

      if (data.length === 0) {
        debugLog('No markets found');
        return null;
      }

      const market = data[0];
      if (market) {
        const tokens = parseClobTokenIds(market.clobTokenIds);
        debugLog('Market tokens', { tokens, question: market.question });
        if (tokens) {
          this.marketCache.set(tokens.yes, market);
          this.marketCache.set(tokens.no, market);
        }
        return market;
      }
    } catch (error) {
      console.error('Error fetching market data:', error);
      debugLog('Error fetching market data', error);
    }

    return null;
  }

  /**
   * Get market info for a token ID, including tickSize and negRisk.
   */
  private async getMarketInfo(
    tokenId: string,
  ): Promise<{ tickSize: '0.1' | '0.01' | '0.001' | '0.0001'; negRisk: boolean }> {
    const market = await this.fetchMarketData(tokenId);
    if (market) {
      // Validate tickSize is a valid value
      const validTickSizes = ['0.1', '0.01', '0.001', '0.0001'] as const;
      const tickSize = validTickSizes.includes(market.tickSize as (typeof validTickSizes)[number])
        ? (market.tickSize as '0.1' | '0.01' | '0.001' | '0.0001')
        : '0.001';
      return {
        tickSize,
        negRisk: market.negRisk ?? false,
      };
    }
    return { tickSize: '0.001', negRisk: false };
  }

  /**
   * Get the NO token ID for a given YES token ID.
   * First checks the cache, then fetches from API if needed.
   */
  private async getNoTokenId(yesTokenId: string): Promise<string | null> {
    debugLog('getNoTokenId called', { yesTokenId });

    // Check if we have this market cached
    const cachedMarket = this.marketCache.get(yesTokenId);
    if (cachedMarket) {
      const tokens = parseClobTokenIds(cachedMarket.clobTokenIds);
      debugLog('Found cached market', { tokens });
      return tokens?.no ?? null;
    }

    // Fetch market data using the token ID
    const market = await this.fetchMarketData(yesTokenId);
    if (!market) {
      debugLog('Market not found for token', { yesTokenId });
      return null;
    }

    const tokens = parseClobTokenIds(market.clobTokenIds);
    debugLog('Fetched market tokens', { tokens, marketId: market.id });

    // Verify this is the right market by checking if yesTokenId matches
    if (tokens && tokens.yes !== yesTokenId) {
      debugLog('Warning: YES token mismatch', { expected: yesTokenId, got: tokens.yes });
      // This market doesn't match - clear cache and return null
      return null;
    }

    return tokens?.no ?? null;
  }

  /**
   * Get all available token addresses for input/output token mapping.
   * Returns USDC (for input) and all YES/NO token addresses (for output).
   */
  async getAvailableTokens(): Promise<{ usdc: string; yesTokens: string[]; noTokens: string[] }> {
    try {
      const url = `${this.gammaApiUrl}/markets?closed=false&limit=100`;
      const response = await fetch(url);

      if (!response.ok) {
        return { usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', yesTokens: [], noTokens: [] };
      }

      // API returns array directly, not { markets: [...] }
      const data = (await response.json()) as PolymarketMarket[];
      const yesTokens: string[] = [];
      const noTokens: string[] = [];

      for (const market of data) {
        if (market.active && !market.closed) {
          const tokens = parseClobTokenIds(market.clobTokenIds);
          if (tokens) {
            yesTokens.push(tokens.yes);
            noTokens.push(tokens.no);
          }
        }
      }

      return {
        usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC on Polygon
        yesTokens,
        noTokens,
      };
    } catch (error) {
      console.error('Error fetching available tokens:', error);
      return { usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', yesTokens: [], noTokens: [] };
    }
  }

  private async getClobClient(): Promise<ClobClient> {
    if (this.clobClient) {
      return this.clobClient;
    }

    if (!this.clobClientPromise) {
      this.clobClientPromise = (async () => {
        debugLog('Initializing CLOB client', { host: this.host, chainId: this.chainId });
        const baseClient = new ClobClient(this.host, this.chainId, this.signer);
        debugLog('Creating/deriving API key...');
        const creds: ApiKeyCreds = await baseClient.createOrDeriveApiKey();
        debugLog('API key created', { apiKey: creds.key?.substring(0, 8) + '...' });
        const client = new ClobClient(
          this.host,
          this.chainId,
          this.signer,
          creds,
          this.signatureType,
          this.funderAddress,
        );
        this.clobClient = client;
        debugLog('CLOB client initialized successfully');
        return client;
      })();
    }

    return this.clobClientPromise;
  }

  /**
   * Create a long position (BUY YES token) on a Polymarket market.
   * Maps to perpetuals-long action.
   */
  async createLongPosition(
    request: CreatePerpetualsPositionRequest,
  ): Promise<CreatePerpetualsPositionResponse> {
    debugLog('createLongPosition called', {
      marketAddress: request.marketAddress,
      amount: request.amount,
      limitPrice: request.limitPrice,
    });

    const clob = await this.getClobClient();

    // For Polymarket, marketAddress is the YES token ID
    const tokenId = request.marketAddress;
    const size = Number(request.amount);
    const price = request.limitPrice ? Number(request.limitPrice) : undefined;

    debugLog('Order params', { tokenId, size, price });

    if (size > this.maxOrderSize) {
      throw new Error(`Order size ${size} exceeds max allowed ${this.maxOrderSize}`);
    }

    // Get market info to determine tickSize and negRisk
    const { tickSize, negRisk } = await this.getMarketInfo(tokenId);
    debugLog('Market info', { tickSize, negRisk });

    // Calculate notional
    const notional = price ? size * price : size * 0.5; // Default to mid-price estimate
    if (notional > this.maxOrderNotional) {
      throw new Error(`Order notional ${notional} exceeds cap ${this.maxOrderNotional}`);
    }

    // Place order via CLOB
    const orderPrice = price ?? 0.5; // Default to 0.5 if no limit price
    debugLog('Placing LONG order (BUY YES)', { tokenId, orderPrice, size, tickSize, negRisk });

    const response = (await clob.createAndPostOrder(
      {
        tokenID: tokenId,
        price: orderPrice,
        side: Side.BUY,
        size,
        feeRateBps: 0,
      },
      { tickSize, negRisk },
      OrderType.GTC,
    )) as ClobOrderResponse;

    debugLog('CLOB response', response);

    // Check if order was placed successfully
    const orderId = response?.orderID || response?.id || response?.order?.id;
    if (!orderId && !response?.success) {
      const errorMsg = response?.error || response?.message || 'Unknown error placing order';
      throw new Error(`Failed to place order: ${errorMsg}`);
    }

    debugLog('Order placed successfully', { orderId });

    // Return transaction plan with order ID
    const transaction: TransactionPlan = {
      type: TransactionTypes.EVM_TX,
      to: this.funderAddress,
      data: orderId ? `0x${Buffer.from(orderId).toString('hex')}` : '0x',
      value: '0',
      chainId: request.chainId,
    };

    return {
      transactions: [transaction],
      orderId, // Include order ID for reference
    } as CreatePerpetualsPositionResponse;
  }

  /**
   * Create a short position (BUY NO token or SELL YES token) on a Polymarket market.
   * Maps to perpetuals-short action.
   */
  async createShortPosition(
    request: CreatePerpetualsPositionRequest,
  ): Promise<CreatePerpetualsPositionResponse> {
    debugLog('createShortPosition called', {
      marketAddress: request.marketAddress,
      amount: request.amount,
      limitPrice: request.limitPrice,
    });

    const clob = await this.getClobClient();

    // For short, we need the NO token ID
    const yesTokenId = request.marketAddress;

    // Get NO token ID from cache first (set by getMarkets)
    let noTokenId = await this.getNoTokenId(yesTokenId);

    debugLog('Token IDs from getNoTokenId', { yesTokenId, noTokenId });

    // If noTokenId is not found or doesn't match, try to get it directly from CLOB
    if (!noTokenId) {
      debugLog('NO token not found, trying to get tick size from CLOB to verify token...');
      // Try to get tick size for the YES token to force cache update
      try {
        await clob.getTickSize(yesTokenId);
        noTokenId = await this.getNoTokenId(yesTokenId);
      } catch {
        debugLog('Could not get tick size for YES token');
      }
    }

    if (!noTokenId) {
      throw new Error(`Could not find NO token for YES token ${yesTokenId}`);
    }

    const size = Number(request.amount);
    const price = request.limitPrice ? Number(request.limitPrice) : undefined;

    if (size > this.maxOrderSize) {
      throw new Error(`Order size ${size} exceeds max allowed ${this.maxOrderSize}`);
    }

    // Get market info using the YES token (which is more likely to be cached)
    const { tickSize, negRisk } = await this.getMarketInfo(yesTokenId);
    debugLog('Market info (from YES token)', { tickSize, negRisk });

    const orderPrice = price ?? 0.5;
    debugLog('Placing SHORT order (BUY NO)', { noTokenId, orderPrice, size, tickSize, negRisk });

    const response = (await clob.createAndPostOrder(
      {
        tokenID: noTokenId,
        price: orderPrice,
        side: Side.BUY,
        size,
        feeRateBps: 0,
      },
      { tickSize, negRisk },
      OrderType.GTC,
    )) as ClobOrderResponse;

    debugLog('CLOB response', response);

    // Check if order was placed successfully
    const orderId = response?.orderID || response?.id || response?.order?.id;
    if (!orderId && !response?.success) {
      const errorMsg = response?.error || response?.message || 'Unknown error placing order';
      throw new Error(`Failed to place order: ${errorMsg}`);
    }

    debugLog('Order placed successfully', { orderId });

    const transaction: TransactionPlan = {
      type: TransactionTypes.EVM_TX,
      to: this.funderAddress,
      data: orderId ? `0x${Buffer.from(orderId).toString('hex')}` : '0x',
      value: '0',
      chainId: request.chainId,
    };

    return {
      transactions: [transaction],
      orderId,
    } as CreatePerpetualsPositionResponse;
  }

  /**
   * Close/cancel orders on Polymarket.
   * @param request - Contains the order key (order ID or 'all' to cancel all orders)
   */
  async closeOrders(
    request: ClosePerpetualsOrdersRequest,
  ): Promise<ClosePerpetualsOrdersResponse> {
    debugLog('closeOrders called', { key: request.key });

    const clob = await this.getClobClient();

    try {
      let response: unknown;

      if (request.key === 'all') {
        // Cancel all orders
        debugLog('Canceling all orders');
        response = await clob.cancelAll();
        debugLog('cancelAll response', response);
      } else {
        // Cancel specific order by ID
        debugLog('Canceling order', { orderId: request.key });

        // Get the order first to get the orderID hash
        const order = await clob.getOrder(request.key);
        debugLog('Order details', order);

        if (!order) {
          throw new Error(`Order not found: ${request.key}`);
        }

        // Cancel the order
        response = await clob.cancelOrder({ orderID: request.key });
        debugLog('cancelOrder response', response);
      }

      // Return transaction plan (off-chain cancellation, but we return a plan for consistency)
      const transaction: TransactionPlan = {
        type: TransactionTypes.EVM_TX,
        to: this.funderAddress,
        data: '0x',
        value: '0',
        chainId: '137', // Polygon
      };

      return {
        transactions: [transaction],
        success: true,
      } as ClosePerpetualsOrdersResponse;
    } catch (error) {
      console.error('Error canceling order:', error);
      throw error;
    }
  }

  /**
   * Get available Polymarket markets.
   */
  async getMarkets(request: GetPerpetualsMarketsRequest): Promise<GetPerpetualsMarketsResponse> {
    debugLog('getMarkets called', { chainIds: request.chainIds });

    // Filter to only Polygon (chain 137)
    if (!request.chainIds.includes('137')) {
      return { markets: [] };
    }

    try {
      const url = `${this.gammaApiUrl}/markets?closed=false&limit=100`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }

      // API returns array directly, not { markets: [...] }
      const data = (await response.json()) as PolymarketMarket[];
      debugLog('Fetched markets from Gamma API', { count: data.length });

      const markets: PerpetualMarket[] = data
        .filter((m) => {
          const tokens = parseClobTokenIds(m.clobTokenIds);
          return m.active && !m.closed && tokens !== null;
        })
        .map((m) => {
          // Parse clobTokenIds from JSON string
          const tokens = parseClobTokenIds(m.clobTokenIds)!;

          // IMPORTANT: Cache the raw market data for later use
          this.marketCache.set(tokens.yes, m);
          this.marketCache.set(tokens.no, m);

          // Map Polymarket market to PerpetualMarket format
          const yesToken: TokenIdentifier = {
            chainId: '137',
            address: tokens.yes,
          };
          const noToken: TokenIdentifier = {
            chainId: '137',
            address: tokens.no,
          };

          return {
            marketToken: yesToken, // Use YES token as market token
            indexToken: yesToken, // Use YES as index
            longToken: yesToken, // Long = YES
            shortToken: noToken, // Short = NO
            longFundingFee: '0',
            shortFundingFee: '0',
            longBorrowingFee: '0',
            shortBorrowingFee: '0',
            chainId: '137',
            name: m.question,
          };
        });

      debugLog('Cached markets', { cacheSize: this.marketCache.size, marketsReturned: markets.length });

      return { markets };
    } catch (error) {
      console.error('Error fetching markets:', error);
      return { markets: [] };
    }
  }

  /**
   * Get user positions (YES/NO token holdings).
   */
  async getPositions(
    request: GetPerpetualsMarketsPositionsRequest,
  ): Promise<GetPerpetualsMarketsPositionsResponse> {
    try {
      // Fetch positions from data API
      const url = `${this.dataApiUrl}/users/${request.walletAddress}/positions`;
      const response = await fetch(url);

      if (!response.ok) {
        // If data API fails, use blockchain fallback directly
        return await this.getPositionsFromBlockchain(request);
      }

      const data = (await response.json()) as { positions: PolymarketPosition[] };
      const positions: PerpetualsPosition[] = [];

      for (const pos of data.positions) {
        const market = await this.fetchMarketData(pos.tokenId);
        if (!market) continue;
        const tokens = parseClobTokenIds(market.clobTokenIds);
        if (!tokens) continue;

        const isYesToken = pos.tokenId === tokens.yes;
        const positionSide: PositionSide = isYesToken ? 'long' : 'short';
        const sizeInTokens = BigInt(pos.balance || '0');
        const sizeInUsd = Number(sizeInTokens) * 0.5; // Estimate at 0.5 price

        positions.push({
          chainId: '137',
          key: `${pos.tokenId}-${request.walletAddress}`,
          contractKey: 'polymarket',
          account: request.walletAddress,
          marketAddress: market.id,
          collateralTokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC on Polygon
          sizeInUsd: sizeInUsd.toString(),
          sizeInTokens: sizeInTokens.toString(),
          collateralAmount: sizeInTokens.toString(),
          pendingBorrowingFeesUsd: '0',
          increasedAtTime: Date.now().toString(),
          decreasedAtTime: '0',
          positionSide,
          isLong: isYesToken,
          fundingFeeAmount: '0',
          claimableLongTokenAmount: isYesToken ? pos.balance : '0',
          claimableShortTokenAmount: !isYesToken ? pos.balance : '0',
          isOpening: false,
          pnl: '0', // Would need price data to calculate
          positionFeeAmount: '0',
          traderDiscountAmount: '0',
          uiFeeAmount: '0',
        });
      }

      return { positions };
    } catch (error) {
      console.error('Error fetching positions:', error);
      return await this.getPositionsFromBlockchain(request);
    }
  }

  /**
   * Get positions by querying blockchain directly for token balances.
   * This method works by checking token balances against known market token IDs.
   */
  private async getPositionsFromBlockchain(
    request: GetPerpetualsMarketsPositionsRequest,
  ): Promise<GetPerpetualsMarketsPositionsResponse> {
    debugLog('getPositionsFromBlockchain called', { walletAddress: request.walletAddress });

    try {
      // Get markets to extract token IDs
      const markets = await this.getMarkets({ chainIds: ['137'] });
      const tokenIds: string[] = [];

      // Collect all YES/NO token IDs from first 50 markets
      for (const market of markets.markets.slice(0, 50)) {
        tokenIds.push(market.longToken.address);  // YES token
        tokenIds.push(market.shortToken.address); // NO token
      }

      // Query blockchain for actual balances
      const balances = await this.getTokenBalances(request.walletAddress, tokenIds);
      const positions: PerpetualsPosition[] = [];

      // Convert non-zero balances to position objects
      for (const balance of balances) {
        const balanceNum = parseInt(balance.balance);
        if (balanceNum === 0) continue;

        // Find the market for this token
        const market = markets.markets.find(m =>
          m.longToken.address === balance.tokenId ||
          m.shortToken.address === balance.tokenId
        );

        if (!market) continue;

        const isYesToken = balance.tokenId === market.longToken.address;
        const positionSide: PositionSide = isYesToken ? 'long' : 'short';
        const sizeInTokens = BigInt(balance.balance);
        const sizeInUsd = Number(sizeInTokens) * 0.5; // Estimate at 0.5 price

        positions.push({
          chainId: '137',
          key: `${balance.tokenId}-${request.walletAddress}`,
          contractKey: 'polymarket',
          account: request.walletAddress,
          marketAddress: market.marketToken.address,
          collateralTokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC on Polygon
          sizeInUsd: sizeInUsd.toString(),
          sizeInTokens: sizeInTokens.toString(),
          collateralAmount: sizeInTokens.toString(),
          pendingBorrowingFeesUsd: '0',
          increasedAtTime: Date.now().toString(),
          decreasedAtTime: '0',
          positionSide,
          isLong: isYesToken,
          fundingFeeAmount: '0',
          claimableLongTokenAmount: isYesToken ? balance.balance : '0',
          claimableShortTokenAmount: !isYesToken ? balance.balance : '0',
          isOpening: false,
          pnl: '0', // Would need price data to calculate
          positionFeeAmount: '0',
          traderDiscountAmount: '0',
          uiFeeAmount: '0',
        });
      }

      debugLog('Positions found via blockchain query', { count: positions.length });
      return { positions };

    } catch (error) {
      debugLog('Error getting positions from blockchain', error);
      return { positions: [] };
    }
  }

  /**
   * Get pending orders using the CLOB client.
   */
  async getOrders(
    request: GetPerpetualsMarketsOrdersRequest,
  ): Promise<GetPerpetualsMarketsOrdersResponse> {
    debugLog('getOrders called', { walletAddress: request.walletAddress });

    const clob = await this.getClobClient();

    try {
      // Use CLOB client to get open orders
      const openOrdersResponse = await clob.getOpenOrders();
      debugLog('getOpenOrders response', openOrdersResponse);

      // OpenOrdersResponse is OpenOrder[]
      const openOrders: OpenOrder[] = Array.isArray(openOrdersResponse)
        ? openOrdersResponse
        : [];

      debugLog('Open orders count', openOrders.length);

      const orders: PerpetualsOrder[] = openOrders.map((o: OpenOrder) => {
        // Determine if this is a YES or NO token order based on side
        const positionSide: PositionSide = o.side === 'BUY' ? 'long' : 'short';
        const price = parseFloat(o.price || '0');
        const size = parseFloat(o.original_size || '0');

        return {
          chainId: '137',
          key: o.id,
          account: request.walletAddress,
          callbackContract: '0x0000000000000000000000000000000000000000',
          initialCollateralTokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
          marketAddress: o.asset_id, // Token ID
          decreasePositionSwapType: 'NoSwap' as const,
          receiver: request.walletAddress,
          swapPath: [],
          contractAcceptablePrice: (price * 1e18).toString(),
          contractTriggerPrice: '0',
          callbackGasLimit: '0',
          executionFee: '0',
          initialCollateralDeltaAmount: (size * price * 1e6).toString(),
          minOutputAmount: size.toString(),
          sizeDeltaUsd: (size * price).toString(),
          updatedAtTime: o.created_at.toString(), // created_at is a number
          isFrozen: false,
          positionSide,
          orderType: 'LimitIncrease' as const,
          shouldUnwrapNativeToken: false,
          autoCancel: false,
          uiFeeReceiver: '0x0000000000000000000000000000000000000000',
          validFromTime: o.created_at.toString(),
        };
      });

      debugLog('Mapped orders', orders.length);
      return { orders };
    } catch (error) {
      console.error('Error fetching orders:', error);
      debugLog('Error fetching orders', error);
      return { orders: [] };
    }
  }

  /**
   * Get token balances directly from blockchain (ERC-1155 tokens)
   * This bypasses API limitations and queries on-chain data directly
   */
  async getTokenBalances(walletAddress: string, tokenIds: string[]): Promise<{ tokenId: string; balance: string; marketName?: string }[]> {
    debugLog('getTokenBalances called', { walletAddress, tokenIds: tokenIds.length });

    const results: { tokenId: string; balance: string; marketName?: string }[] = [];

    try {
      // Polymarket uses ERC-1155 tokens through Conditional Tokens Framework (CTF)
      // The main CTF contract on Polygon is: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
      const ctfContractAddress = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

      for (const tokenId of tokenIds) {
        try {
          // Query balance using eth_call to balanceOf(account, id)
          // balanceOf(address account, uint256 id) selector: 0x00fdd58e
          const data = `0x00fdd58e${walletAddress.slice(2).padStart(64, '0')}${BigInt(tokenId).toString(16).padStart(64, '0')}`;

          const response = await fetch(`https://polygon-rpc.com`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_call',
              params: [
                {
                  to: ctfContractAddress,
                  data: data
                },
                'latest'
              ],
              id: 1
            })
          });

          const result = await response.json() as { result?: string };

          if (result.result && result.result !== '0x') {
            const balance = BigInt(result.result).toString();
            debugLog('Token balance found', { tokenId: tokenId.substring(0, 20) + '...', balance });

            // Try to get market name from cache
            const cachedMarket = this.marketCache.get(tokenId);
            const marketName = cachedMarket?.question || undefined;

            results.push({
              tokenId,
              balance,
              marketName
            });
          }
        } catch (error) {
          debugLog('Error querying token balance', { tokenId: tokenId.substring(0, 20) + '...', error });
        }
      }

      debugLog('getTokenBalances complete', { foundBalances: results.length });
      return results;

    } catch (error) {
      console.error('Error in getTokenBalances:', error);
      return [];
    }
  }

  /**
   * Get user's trading history using CLOB client
   * This provides comprehensive historical data including all past trades
   */
  async getTradingHistory(walletAddress: string, options?: {
    market?: string;
    asset_id?: string;
    before?: string;
    after?: string;
    limit?: number;
  }): Promise<Trade[]> {
    debugLog('getTradingHistory called', { walletAddress, options });

    const clob = await this.getClobClient();

    try {
      // Use maker_address to get trades for this wallet
      const tradeParams = {
        maker_address: walletAddress,
        ...options
      };

      const trades = await clob.getTrades(tradeParams, false); // Get all pages
      debugLog('Trading history retrieved', { tradesCount: trades.length });

      return trades;
    } catch (error) {
      console.error('Error getting trading history:', error);
      debugLog('Error getting trading history', error);
      return [];
    }
  }

  /**
   * Get user's earnings history
   * Shows daily earnings and rewards data
   */
  async getUserEarnings(date?: string): Promise<UserEarnings | null> {
    debugLog('getUserEarnings called', { date });

    const clob = await this.getClobClient();

    try {
      const targetDate = date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

      const earnings = await clob.getEarningsForUserForDay(targetDate!);
      const totalEarnings = await clob.getTotalEarningsForUserForDay(targetDate!);

      debugLog('User earnings retrieved', {
        earningsCount: earnings.length,
        totalEarningsCount: totalEarnings.length
      });

      return {
        date: targetDate!,
        earnings,
        totalEarnings
      };
    } catch (error) {
      console.error('Error getting user earnings:', error);
      debugLog('Error getting user earnings', error);
      return null;
    }
  }

  /**
   * Get detailed market trades for a specific condition/market
   * Useful for understanding market activity and price movements
   */
  async getMarketTrades(conditionID: string): Promise<MarketTradeEvent[]> {
    debugLog('getMarketTrades called', { conditionID });

    const clob = await this.getClobClient();

    try {
      const marketTrades = await clob.getMarketTradesEvents(conditionID);
      debugLog('Market trades retrieved', { tradesCount: marketTrades.length });

      return marketTrades;
    } catch (error) {
      console.error('Error getting market trades:', error);
      debugLog('Error getting market trades', error);
      return [];
    }
  }

  /**
   * Get price history for markets
   * Enables historical balance value calculation
   */
  async getPriceHistory(options: {
    market?: string;
    startTs?: number;
    endTs?: number;
    fidelity?: number;
    interval?: string; // '1h', '6h', '1d', '1w', 'max'
  }): Promise<MarketPrice[]> {
    debugLog('getPriceHistory called', { options });

    const clob = await this.getClobClient();

    try {
      const priceHistory = await clob.getPricesHistory(options as PriceHistoryFilterParams);
      debugLog('Price history retrieved', { pointsCount: priceHistory.length });

      return priceHistory;
    } catch (error) {
      console.error('Error getting price history:', error);
      debugLog('Error getting price history', error);
      return [];
    }
  }

  /**
   * Comprehensive wallet analysis - combines all data sources
   * This is the ultimate wallet discovery function using only wallet address
   */
  async getComprehensiveWalletData(walletAddress: string): Promise<ComprehensiveWalletData> {
    debugLog('getComprehensiveWalletData called', { walletAddress });

    try {
      // 1. Get all available markets and token IDs
      const marketsResult = await this.getMarkets({ chainIds: ['137'] });
      const allTokenIds = new Set<string>();
      const marketMap = new Map<string, PerpetualMarket & { side: 'YES' | 'NO' }>();

      for (const market of marketsResult.markets) {
        allTokenIds.add(market.longToken.address);
        allTokenIds.add(market.shortToken.address);
        marketMap.set(market.longToken.address, { ...market, side: 'YES' });
        marketMap.set(market.shortToken.address, { ...market, side: 'NO' });
      }

      // 2. Get current token balances from blockchain
      const currentBalances = await this.getTokenBalances(walletAddress, Array.from(allTokenIds));

      // 3. Get trading history from CLOB
      const tradingHistory = await this.getTradingHistory(walletAddress);

      // 4. Get open orders from CLOB
      const ordersResult = await this.getOrders({ walletAddress });
      const openOrders = ordersResult.orders;

      // 5. Get earnings data
      const earnings = await this.getUserEarnings();

      // 6. Get market activity for markets user has traded in
      const marketActivity: { market: string; trades: MarketTradeEvent[] }[] = [];
      const tradedMarkets = new Set(tradingHistory.map(t => t.market));

      for (const marketId of Array.from(tradedMarkets).slice(0, 5)) { // Limit to first 5
        try {
          const activity = await this.getMarketTrades(marketId);
          marketActivity.push({ market: marketId, trades: activity });
        } catch (_error) {
          // Continue if individual market fails
        }
      }

      // 7. Create summary
      const summary = {
        totalTokensHeld: currentBalances.reduce((sum, b) => sum + parseInt(b.balance), 0) / 1000000,
        totalTrades: tradingHistory.length,
        activeOrders: openOrders.length,
        marketsTraded: tradedMarkets.size,
        lastTradeDate: tradingHistory.length > 0 ? tradingHistory[0]?.match_time : undefined
      };

      debugLog('Comprehensive wallet data compiled', summary);

      return {
        currentBalances,
        tradingHistory,
        openOrders,
        earnings,
        marketActivity,
        summary
      };

    } catch (error) {
      console.error('Error getting comprehensive wallet data:', error);
      debugLog('Error getting comprehensive wallet data', error);

      return {
        currentBalances: [],
        tradingHistory: [],
        openOrders: [],
        earnings: null,
        marketActivity: [],
        summary: {}
      };
    }
  }

  /**
   * Cancel all open orders.
   */
  async cancelAllOrders(): Promise<{ success: boolean; cancelled: number }> {
    debugLog('cancelAllOrders called');
    const clob = await this.getClobClient();

    try {
      const response = (await clob.cancelAll()) as { cancelled?: number };
      debugLog('cancelAll response', response);
      return { success: true, cancelled: response?.cancelled || 0 };
    } catch (error) {
      console.error('Error canceling all orders:', error);
      throw error;
    }
  }
}

