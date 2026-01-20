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
import { ethers } from 'ethers';
import { logInfo } from '../workflow/context.js';
import { POLYGON_CONTRACTS, CONTRACT_ABIS } from '../constants/contracts.js';

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Parse and clean error messages for display.
 * Handles HTML responses, Cloudflare blocks, and long error strings.
 */
function parseErrorMessage(error: unknown): string {
  const errorStr = String(error);

  // Check for Cloudflare block
  if (errorStr.includes('Cloudflare') || errorStr.includes('cf-error') || errorStr.includes('cf-wrapper')) {
    return 'Cloudflare block - IP rate limited. Wait before retrying.';
  }

  // Check for HTML response (generic)
  if (errorStr.includes('<!DOCTYPE') || errorStr.includes('<html')) {
    // Try to extract meaningful text
    if (errorStr.includes('blocked')) {
      return 'Request blocked by security. Wait and retry.';
    }
    return 'API returned error page - likely rate limited.';
  }

  // Check for common HTTP errors
  if (errorStr.includes('403') || errorStr.includes('Forbidden')) {
    return 'Access forbidden (403) - check API credentials.';
  }
  if (errorStr.includes('429') || errorStr.includes('Too Many')) {
    return 'Rate limited (429) - too many requests.';
  }
  if (errorStr.includes('500') || errorStr.includes('Internal Server')) {
    return 'Server error (500) - Polymarket API issue.';
  }
  if (errorStr.includes('timeout') || errorStr.includes('ETIMEDOUT')) {
    return 'Request timeout - network issue.';
  }

  // Truncate long errors
  if (errorStr.length > 150) {
    return errorStr.substring(0, 150) + '...';
  }

  return errorStr;
}

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
  outcomeName?: string;
  tokenId: string;
  size: string;
  currentPrice?: string;
  avgPrice?: string;
  pnl?: string;
  pnlPercent?: string;
}

/**
 * Trading history item from Polymarket Data API.
 */
export interface TradingHistoryItem {
  id: string;
  market: string;
  marketTitle: string;
  side: string;
  outcome: string;
  size: string;
  price: string;
  matchTime: string;
  transactionHash?: string;
  usdcSize?: string;
}

/**
 * Full adapter interface for cross-arbitrage trading.
 */
export interface IPolymarketAdapter {
  // Queries
  getMarkets(request: {
    chainIds: string[];
    status?: 'active' | 'resolved';  // Filter by market status
    offset?: number;  // Pagination offset for rotating through markets
  }): Promise<GetMarketsResponse>;
  getPositions(walletAddress: string): Promise<{ positions: UserPosition[] }>;
  getTradingHistoryWithDetails(walletAddress: string, options?: { limit?: number }): Promise<TradingHistoryItem[]>;

  // Trading - unified order placement for buy/sell YES/NO
  placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResponse>;

  // Convenience methods (deprecated - use placeOrder instead)
  createLongPosition(request: CreatePositionRequest): Promise<CreatePositionResponse>;
  createShortPosition(request: CreatePositionRequest): Promise<CreatePositionResponse>;

  // Balance and order status
  getUSDCBalance(walletAddress: string): Promise<number>;
  getOrderStatus(orderId: string): Promise<{
    status: 'open' | 'filled' | 'partially_filled' | 'cancelled';
    sizeFilled: string;
    sizeRemaining: string;
  }>;

  // Market resolution and redemption
  /**
   * Check if a market has resolved and get the winning outcome.
   *
   * @param tokenId - The CLOB token ID (decimal string like '38429637...')
   */
  getMarketResolution(tokenId: string): Promise<{
    resolved: boolean;
    winningOutcome?: 'yes' | 'no';
    resolutionDate?: string;
  }>;

  /**
   * Redeem a winning position for USDC after market resolution.
   *
   * @param tokenId - The CLOB token ID (decimal string like '38429637...')
   * @param outcomeId - The outcome held ('yes' or 'no')
   * @returns Transaction result with hash on success
   */
  redeemPosition(
    tokenId: string,
    outcomeId: 'yes' | 'no',
  ): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }>;
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
    offset?: number;
  }): Promise<GetMarketsResponse> {
    if (!request.chainIds.includes('137')) return { markets: [] };

    try {
      // Get offset from request or env (with rotation)
      const baseOffset = request.offset ?? parseInt(process.env.POLY_MARKET_OFFSET || '0', 10);
      const limit = parseInt(process.env.POLY_MARKET_FETCH_LIMIT || '100', 10);

      // Build URL with status filter, offset, and sort by volume for better liquidity
      let url = `${this.gammaApiUrl}/markets?limit=${limit}&offset=${baseOffset}`;
      if (request.status === 'active') {
        url += '&closed=false&active=true';
      } else if (request.status === 'resolved') {
        url += '&closed=true';
      } else {
        // Default to active markets only
        url += '&closed=false&active=true';
      }
      // Sort by volume descending to get high-liquidity markets first
      url += '&order=volume&ascending=false';

      logInfo('Fetching markets from Gamma API', { url: url.substring(0, 80), offset: baseOffset, limit });

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
      const cleanError = parseErrorMessage(error);
      logInfo('Order failed', { error: cleanError });
      return {
        transactions: [],
        success: false,
        error: cleanError,
      };
    }
  }

  /**
   * Get user positions from the CLOB API.
   */
  async getPositions(walletAddress: string): Promise<{ positions: UserPosition[] }> {
    try {
      // Use new Data API positions endpoint - much better data with PnL!
      const url = `https://data-api.polymarket.com/positions?sizeThreshold=0&limit=100&sortBy=TOKENS&sortDirection=DESC&user=${walletAddress}`;

      logInfo('Fetching positions from Data API', { walletAddress: walletAddress.substring(0, 10) + '...' });

      const response = await fetch(url);
      if (!response.ok) {
        logInfo('Positions API returned error', { status: response.status });
        logInfo('Falling back to blockchain query...');
        return await this.getPositionsFromBlockchain(walletAddress);
      }

      const data = (await response.json()) as Array<{
        asset: string;
        conditionId: string;
        size: number;
        avgPrice: number;
        currentValue: number;
        curPrice: number;
        cashPnl: number;
        percentPnl: number;
        title: string;
        outcome: string;
        slug: string;
      }>;

      const positions: UserPosition[] = data.map((pos) => ({
        marketId: pos.conditionId,
        marketTitle: pos.title,
        outcomeId: pos.outcome.toLowerCase() as 'yes' | 'no',
        outcomeName: pos.outcome,
        tokenId: pos.asset,
        size: (pos.size * 1_000_000).toString(), // Convert to raw units (6 decimals)
        currentPrice: pos.curPrice.toString(),
        avgPrice: pos.avgPrice.toString(),
        pnl: pos.cashPnl.toString(),
        pnlPercent: pos.percentPnl.toString(),
      }));

      logInfo('Positions fetched from Data API', { count: positions.length });
      return { positions };
    } catch (error) {
      logInfo('Error fetching positions', { error: String(error) });
      logInfo('Falling back to blockchain query...');
      return await this.getPositionsFromBlockchain(walletAddress);
    }
  }

  /**
   * Fallback: Get positions by querying blockchain directly for token balances.
   * Strategy: Use trading history to identify markets where user has traded,
   * then only check balances for those specific markets.
   */
  private async getPositionsFromBlockchain(walletAddress: string): Promise<{ positions: UserPosition[] }> {
    logInfo('getPositionsFromBlockchain called', { walletAddress: walletAddress.substring(0, 10) + '...' });

    try {
      const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
      const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
      const positions: UserPosition[] = [];

      // Step 1: Get trading history to find markets where user has traded
      const clob = await this.getClobClient();
      const trades = await clob.getTrades({ maker_address: walletAddress }, false);

      if (trades.length === 0) {
        logInfo('No trading history found, no positions to check');
        return { positions: [] };
      }

      // Step 2: Extract unique token IDs from trading history
      const tradeTokenIds = new Set<string>();
      for (const trade of trades) {
        tradeTokenIds.add(trade.asset_id); // The actual token ID that was traded
      }

      logInfo(`Found ${tradeTokenIds.size} unique token IDs from trading history`);

      // Step 3: For each token ID, check balance and fetch market details
      for (const tokenId of tradeTokenIds) {
        try {
          logInfo('Processing token', { tokenId: tokenId.substring(0, 20) });

          // Query balance for this token
          const balanceData = `0x00fdd58e${walletAddress.slice(2).padStart(64, '0')}${BigInt(tokenId).toString(16).padStart(64, '0')}`;
          const balanceRes = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_call',
              params: [{ to: CTF_CONTRACT, data: balanceData }, 'latest'],
              id: 1,
            }),
          });
          const balanceResult = (await balanceRes.json()) as { result?: string };

          if (!balanceResult.result || balanceResult.result === '0x' || BigInt(balanceResult.result) === 0n) {
            logInfo('No balance for token', { tokenId: tokenId.substring(0, 20) });
            continue;
          }

          const balance = BigInt(balanceResult.result);
          logInfo('Found balance', { tokenId: tokenId.substring(0, 20), balance: balance.toString() });

          // Fetch market details from Gamma API using clob_token_ids
          const url = `${this.gammaApiUrl}/markets?clob_token_ids=${tokenId}`;
          const res = await fetch(url);
          if (!res.ok) {
            logInfo('Failed to fetch market for token', { tokenId: tokenId.substring(0, 20), status: res.status });
            continue;
          }

          const data = (await res.json()) as GammaMarket[];
          const market = data[0];
          if (!market) {
            logInfo('No market found for token', { tokenId: tokenId.substring(0, 20) });
            continue;
          }

          // Cache the market
          this.marketCache.set(market.id, market);

          const tokens = parseClobTokenIds(market.clobTokenIds);
          if (!tokens) continue;

          const isYes = tokenId === tokens.yes;
          const otherTokenId = isYes ? tokens.no : tokens.yes;

          // Fetch current price
          const prices = await fetchMarketPrices(tokens.yes, tokens.no);

          positions.push({
            marketId: market.id,
            marketTitle: market.question,
            outcomeId: isYes ? 'yes' : 'no',
            outcomeName: isYes ? 'Yes' : 'No',
            tokenId: tokenId,
            size: balance.toString(),
            currentPrice: (isYes ? prices.yesMidpoint : prices.noMidpoint).toString(),
          });
        } catch (error) {
          logInfo('Error processing token', { tokenId: tokenId.substring(0, 20), error: String(error) });
        }
      }

      logInfo('Positions found via blockchain', { count: positions.length });
      return { positions };
    } catch (error) {
      logInfo('Error getting positions from blockchain', { error: String(error) });
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

  /**
   * Get USDC balance for a wallet address.
   * Uses RPC call to USDC.e contract on Polygon.
   *
   * @param walletAddress - Wallet address to check
   * @returns USDC balance in USD (6 decimals)
   */
  async getUSDCBalance(walletAddress: string): Promise<number> {
    try {
      const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
      const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

      // balanceOf(address) selector: 0x70a08231
      const data = `0x70a08231${walletAddress.slice(2).padStart(64, '0')}`;

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: USDC_ADDRESS, data }, 'latest'],
          id: 1,
        }),
      });

      const result = (await response.json()) as { result?: string };
      if (result.result && result.result !== '0x') {
        // USDC has 6 decimals
        const balanceWei = BigInt(result.result);
        return Number(balanceWei) / 1_000_000;
      }
      return 0;
    } catch (error) {
      logInfo('Error fetching USDC balance', { error: String(error) });
      return 0;
    }
  }

  /**
   * Get order status from CLOB API.
   *
   * @param orderId - Order ID returned from placeOrder
   * @returns Order status details
   */
  async getOrderStatus(orderId: string): Promise<{
    status: 'open' | 'filled' | 'partially_filled' | 'cancelled';
    sizeFilled: string;
    sizeRemaining: string;
  }> {
    try {
      const clob = await this.getClobClient();
      const order = await clob.getOrder(orderId);

      if (!order) {
        return { status: 'cancelled', sizeFilled: '0', sizeRemaining: '0' };
      }

      const sizeFilled = order.size_matched || '0';
      const sizeRemaining = (
        parseFloat(order.original_size) - parseFloat(sizeFilled)
      ).toString();

      if (sizeRemaining === '0' || parseFloat(sizeRemaining) <= 0) {
        return { status: 'filled', sizeFilled, sizeRemaining: '0' };
      }

      if (parseFloat(sizeFilled) > 0) {
        return { status: 'partially_filled', sizeFilled, sizeRemaining };
      }

      return { status: 'open', sizeFilled: '0', sizeRemaining: order.original_size };
    } catch (error) {
      logInfo('Error fetching order status', { error: String(error) });
      return { status: 'cancelled', sizeFilled: '0', sizeRemaining: '0' };
    }
  }

  /**
   * Get open orders from CLOB API.
   */
  async getOrders(walletAddress: string): Promise<{
    orders: Array<{
      orderId: string;
      marketId: string;
      outcomeId: string;
      side: 'buy' | 'sell';
      price: string;
      size: string;
      filledSize: string;
      status: string;
      createdAt: string;
    }>;
  }> {
    try {
      const clob = await this.getClobClient();
      const openOrders = await clob.getOpenOrders();

      const orders = Array.isArray(openOrders) ? openOrders : [];

      return {
        orders: orders.map((o: any) => ({
          orderId: o.id,
          marketId: o.asset_id,
          outcomeId: 'unknown',
          side: o.side === 'BUY' ? 'buy' : 'sell',
          price: o.price || '0',
          size: o.original_size || '0',
          filledSize: o.size_matched || '0',
          status: 'open',
          createdAt: o.created_at?.toString() || new Date().toISOString(),
        })),
      };
    } catch (error) {
      logInfo('Error fetching orders', { error: String(error) });
      return { orders: [] };
    }
  }

  /**
   * Get trading history from Data API with market details.
   * Uses the /activity endpoint which has all data pre-enriched.
   */
  async getTradingHistoryWithDetails(
    walletAddress: string,
    options?: { limit?: number },
  ): Promise<Array<{
    id: string;
    market: string;
    marketTitle: string;
    side: string;
    outcome: string;
    size: string;
    price: string;
    matchTime: string;
    transactionHash?: string;
    usdcSize?: string;
  }>> {
    try {
      const limit = options?.limit || 100;
      const url = `https://data-api.polymarket.com/activity?limit=${limit}&sortBy=TIMESTAMP&sortDirection=DESC&user=${walletAddress}`;

      logInfo('Fetching activity from Data API', { limit });

      const response = await fetch(url);
      if (!response.ok) {
        logInfo('Activity API returned error', { status: response.status });
        return [];
      }

      const data = (await response.json()) as Array<{
        proxyWallet: string;
        timestamp: number;
        conditionId: string;
        type: string;
        size: number;
        usdcSize: number;
        transactionHash: string;
        price: number;
        asset: string;
        side: string;
        outcomeIndex: number;
        title: string;
        slug: string;
        outcome: string;
      }>;

      // Filter only TRADE type and map to our format
      const trades = data
        .filter((activity) => activity.type === 'TRADE')
        .map((activity) => ({
          id: activity.transactionHash,
          market: activity.conditionId,
          marketTitle: activity.title,
          side: activity.side,
          outcome: activity.outcome,
          size: activity.size.toString(),
          price: activity.price.toString(),
          matchTime: activity.timestamp.toString(),
          transactionHash: activity.transactionHash,
          usdcSize: activity.usdcSize.toString(),
        }));

      logInfo('Activity fetched from Data API', { count: trades.length });
      return trades;
    } catch (error) {
      logInfo('Error fetching trading history', { error: String(error) });
      return [];
    }
  }

  /**
   * Check if a market has resolved and get the winning outcome.
   * Uses the Gamma API clob_token_ids parameter for accurate lookup.
   *
   * @param tokenId - The CLOB token ID (decimal string like '38429637...')
   */
  async getMarketResolution(tokenId: string): Promise<{
    resolved: boolean;
    winningOutcome?: 'yes' | 'no';
    resolutionDate?: string;
  }> {
    try {
      // Use clob_token_ids for reliable market lookup
      // This returns the exact market for the given token
      const url = `${this.gammaApiUrl}/markets?clob_token_ids=${tokenId}`;

      logInfo('Fetching market resolution', { tokenId: tokenId.substring(0, 20) });

      const response = await fetch(url);
      if (!response.ok) {
        logInfo('Market resolution API error', { status: response.status });
        return { resolved: false };
      }

      const rawData = await response.json();
      const data = Array.isArray(rawData) ? rawData[0] : rawData;

      if (!data) {
        logInfo('No market found for token ID', { tokenId: tokenId.substring(0, 20) });
        return { resolved: false };
      }

      // Market is resolved if it's closed and has an outcome
      const resolved = data.closed === true && !!data.outcome;

      if (!resolved) {
        logInfo('Market not yet resolved', {
          market: data.question?.substring(0, 40),
          closed: data.closed,
        });
        return { resolved: false };
      }

      // Parse outcome (usually '0' for NO, '1' for YES)
      const winningOutcome = data.outcome === '1' ? ('yes' as const) : ('no' as const);

      logInfo('Market resolved', {
        market: data.question?.substring(0, 40),
        winningOutcome,
      });

      return {
        resolved: true,
        winningOutcome,
        resolutionDate: data.closed_time,
      };
    } catch (error) {
      logInfo('Error checking market resolution', { error: String(error) });
      return { resolved: false };
    }
  }

  /**
   * Redeem a winning position for USDC after market resolution.
   *
   * Calls the CTF Contract's redeemPositions function directly.
   * Reference: registry/polymarket-plugin/adapter.ts redeem function
   *
   * @param tokenId - The CLOB token ID (decimal string like '38429637...')
   * @param outcomeId - The outcome held ('yes' or 'no')
   */
  async redeemPosition(
    tokenId: string,
    outcomeId: 'yes' | 'no',
  ): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    try {
      logInfo('Redeeming position', {
        tokenId: tokenId.substring(0, 20),
        outcomeId,
      });

      // 1. Fetch market data using clob_token_ids for reliable lookup
      const url = `${this.gammaApiUrl}/markets?clob_token_ids=${tokenId}`;

      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch market data: ${response.status}`,
        };
      }

      const rawData = await response.json();
      const market = (Array.isArray(rawData) ? rawData[0] : rawData) as GammaMarket & {
        conditionId?: string; // camelCase from Gamma API
      };

      if (!market) {
        return {
          success: false,
          error: `Market not found for token ID: ${tokenId.substring(0, 20)}`,
        };
      }

      // 2. Verify market is closed (resolved)
      if (!market.closed) {
        return {
          success: false,
          error: 'Market is not resolved yet. Cannot redeem until market closes.',
        };
      }

      // 3. Determine which contract to use based on negRisk flag
      // negRisk markets use NEG_RISK_ADAPTER, regular markets use CTF_EXCHANGE
      const operatorAddress = market.negRisk
        ? POLYGON_CONTRACTS.NEG_RISK_ADAPTER
        : POLYGON_CONTRACTS.CTF_EXCHANGE;

      logInfo('Redemption contract selected', {
        negRisk: market.negRisk,
        operator: operatorAddress.substring(0, 10) + '...',
      });

      // 4. Determine index sets based on outcome
      // For binary markets: YES = 1, NO = 2
      const indexSets = outcomeId === 'yes' ? [1] : [2];

      // 5. Get condition ID from market data - this is required for the contract call
      // Gamma API returns conditionId (camelCase)
      const conditionId = market.conditionId ?? market.id;
      if (!conditionId) {
        return {
          success: false,
          error: 'Market data missing conditionId - cannot redeem',
        };
      }

      // 6. Set up provider and wallet
      const rpcUrl = process.env['POLYGON_RPC_URL'] ?? 'https://polygon-rpc.com';
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(this.signer.privateKey, provider);

      // 7. Create CTF contract instance
      const ctfContract = new ethers.Contract(
        POLYGON_CONTRACTS.CTF_CONTRACT,
        CONTRACT_ABIS.CTF_CONTRACT,
        wallet,
      );

      // 8. Check if we have approval for the operator
      const isApproved = await ctfContract.isApprovedForAll(
        wallet.address,
        operatorAddress,
      );

      if (!isApproved) {
        logInfo('Setting approval for redemption operator', {
          operator: operatorAddress.substring(0, 10) + '...',
        });

        // Set approval for the operator
        const approvalTx = await ctfContract.setApprovalForAll(operatorAddress, true);
        const approvalReceipt = await approvalTx.wait();

        if (!approvalReceipt || approvalReceipt.status !== 1) {
          return {
            success: false,
            error: 'Failed to set approval for redemption',
          };
        }

        logInfo('✅ Approval set for redemption operator', {
          txHash: approvalTx.hash,
        });
      }

      // 9. Prepare conditionId as bytes32
      // The conditionId might be a hex string that needs padding
      const conditionIdBytes32 = conditionId.startsWith('0x')
        ? ethers.zeroPadValue(conditionId, 32)
        : ethers.zeroPadValue(`0x${conditionId}`, 32);

      // 10. Call redeemPositions
      logInfo('Calling redeemPositions', {
        collateral: POLYGON_CONTRACTS.USDC_E.substring(0, 10) + '...',
        conditionId: conditionIdBytes32.substring(0, 18) + '...',
        indexSets,
      });

      const tx = await ctfContract.redeemPositions(
        POLYGON_CONTRACTS.USDC_E, // collateralToken
        ethers.ZeroHash, // parentCollectionId = bytes32(0)
        conditionIdBytes32, // conditionId
        indexSets, // indexSets
      );

      logInfo('Redemption transaction sent', { hash: tx.hash });

      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        logInfo('✅ Position redeemed successfully', {
          txHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
        });

        return {
          success: true,
          txHash: tx.hash,
        };
      } else {
        return {
          success: false,
          error: 'Redemption transaction failed',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logInfo('Error redeeming position', { error: errorMessage });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let cachedAdapter: IPolymarketAdapter | null = null;

export async function createAdapterFromEnv(): Promise<IPolymarketAdapter | null> {
  if (cachedAdapter) return cachedAdapter;

  const privateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];

  if (!privateKey) {
    logInfo('Missing A2A_TEST_AGENT_NODE_PRIVATE_KEY');
    return null;
  }

  try {
    // Derive funderAddress from private key
    const wallet = new Wallet(privateKey);
    const funderAddress = wallet.address;

    logInfo('Creating PolymarketAdapter...', {
      funderAddress: funderAddress.substring(0, 10) + '...'
    });

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
    // closed=false ensures market is not resolved/closed
    // active=true ensures market is currently accepting orders
    // archived=false ensures market is not archived
    const url = `${gammaApiUrl}/markets?closed=false&active=true&archived=false&limit=${limit}`;
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

// ============================================================================
// Order Book Info (includes min_order_size)
// ============================================================================

/**
 * Order book information from CLOB API.
 */
export interface OrderBookInfo {
  /** Minimum order size in shares (e.g., "5") */
  minOrderSize: number;
  /** Tick size for price increments (e.g., "0.001") */
  tickSize: number;
  /** Token ID */
  assetId: string;
}

/**
 * Fetch order book info from CLOB API.
 * This includes min_order_size which is required for order validation.
 *
 * @param tokenId - The token ID (YES or NO token)
 * @returns Order book info with min_order_size, or default values on error
 */
export async function fetchOrderBookInfo(tokenId: string): Promise<OrderBookInfo> {
  const clobUrl = process.env['POLYMARKET_CLOB_API'] ?? 'https://clob.polymarket.com';

  try {
    const response = await fetch(`${clobUrl}/book?token_id=${tokenId}`);

    if (!response.ok) {
      logInfo('Failed to fetch order book info', {
        tokenId: tokenId.substring(0, 20) + '...',
        status: response.status,
      });
      return { minOrderSize: 5, tickSize: 0.001, assetId: tokenId };
    }

    const data = (await response.json()) as {
      min_order_size?: string | null;
      tick_size?: string | null;
      asset_id?: string | null;
    };

    const minOrderSize = data.min_order_size ? parseFloat(data.min_order_size) : 5;
    const tickSize = data.tick_size ? parseFloat(data.tick_size) : 0.001;

    logInfo('Fetched order book info', {
      tokenId: tokenId.substring(0, 20) + '...',
      minOrderSize,
      tickSize,
    });

    return {
      minOrderSize: isNaN(minOrderSize) ? 5 : minOrderSize,
      tickSize: isNaN(tickSize) ? 0.001 : tickSize,
      assetId: data.asset_id ?? tokenId,
    };
  } catch (error) {
    logInfo('Error fetching order book info', {
      tokenId: tokenId.substring(0, 20) + '...',
      error: String(error),
    });
    // Return safe defaults
    return { minOrderSize: 5, tickSize: 0.001, assetId: tokenId };
  }
}
