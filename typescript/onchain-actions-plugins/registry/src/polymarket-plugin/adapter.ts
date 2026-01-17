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
  PlaceOrderRequest,
  PlaceOrderResponse,
  CancelOrderRequest,
  CancelOrderResponse,
  RedeemRequest,
  RedeemResponse,
  GetMarketsRequest,
  GetMarketsResponse,
  GetPositionsRequest,
  GetPositionsResponse,
  GetOrdersRequest,
  GetOrdersResponse,
  PredictionMarket,
  PredictionPosition,
  PredictionOrder,
  PredictionOutcome,
  TransactionPlan,
} from '../core/index.js';
import { TransactionTypes } from '../core/schemas/enums.js';

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
  openOrders: PredictionOrder[];
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

// Polymarket contract addresses on Polygon
const POLYMARKET_CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
// const POLYMARKET_NEG_RISK_ADAPTER = '0xC5d563A36AE78145C45a50134d48A1215220f80a'; // For negRisk markets (future use)
const POLYMARKET_USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e (bridged USDC)
// Conditional Tokens Framework contract (holds the actual ERC-1155 outcome tokens)
const POLYMARKET_CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

export interface PolymarketAdapterParams {
  host?: string;
  chainId: number;
  funderAddress: string;
  privateKey: string;
  signatureType?: number; // 0 = EOA/raw private key (default), 1 = Magic/email, 2 = browser wallet
  maxOrderSize?: number;
  maxOrderNotional?: number;
  gammaApiUrl?: string; // Gamma API for market data
  dataApiUrl?: string; // Data API for user positions
}

interface PolymarketMarketRaw {
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
  outcomePrices?: string; // JSON string like '["0.5", "0.5"]'
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

/**
 * Parse outcome prices from JSON string.
 */
function parseOutcomePrices(outcomePrices: string | undefined): { yes: string; no: string } | null {
  if (!outcomePrices) return null;
  try {
    const parsed = JSON.parse(outcomePrices) as string[];
    if (Array.isArray(parsed) && parsed.length >= 2) {
      return {
        yes: parsed[0] ?? '0.5',
        no: parsed[1] ?? '0.5',
      };
    }
    return null;
  } catch {
    return null;
  }
}

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
 *
 * @param yesTokenId - The YES token ID
 * @param noTokenId - The NO token ID
 * @param clobUrl - Optional CLOB API URL (defaults to https://clob.polymarket.com)
 */
export async function fetchMarketPrices(
  yesTokenId: string,
  noTokenId: string,
  clobUrl = 'https://clob.polymarket.com',
): Promise<MarketPrices> {
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

interface PolymarketPositionRaw {
  tokenId: string;
  balance: string;
  marketSlug?: string;
  outcome?: string;
}

/**
 * PolymarketAdapter wraps the Polymarket CLOB client for prediction market trading.
 * Uses proper prediction markets semantics with marketId and outcomeId separation.
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
  private marketCache: Map<string, PolymarketMarketRaw> = new Map();
  // Map from tokenId to marketId for quick lookups
  private tokenToMarketMap: Map<string, string> = new Map();

  constructor(params: PolymarketAdapterParams) {
    this.host = params.host ?? 'https://clob.polymarket.com';
    this.chainId = params.chainId;
    this.funderAddress = params.funderAddress;
    this.signer = new Wallet(params.privateKey);
    this.signatureType = params.signatureType ?? 0; // 0 = EOA (raw private key), 1 = Magic/email, 2 = browser wallet
    this.maxOrderSize = params.maxOrderSize ?? 100;
    this.maxOrderNotional = params.maxOrderNotional ?? 500;
    this.gammaApiUrl = params.gammaApiUrl ?? 'https://gamma-api.polymarket.com';
    this.dataApiUrl = params.dataApiUrl ?? 'https://data-api.polymarket.com';
  }

  /**
   * Fetch market data from Gamma API and cache it.
   * Supports lookup by:
   * - clob token ID (large decimal string)
   * - condition ID (hex string starting with 0x)
   * - market ID (numeric string)
   */
  private async fetchMarketData(identifier?: string): Promise<PolymarketMarketRaw | null> {
    debugLog('fetchMarketData called', { identifier });

    if (identifier && this.marketCache.has(identifier)) {
      debugLog('Returning cached market', { identifier });
      return this.marketCache.get(identifier) ?? null;
    }

    try {
      let url: string;

      if (!identifier) {
        // No identifier - fetch recent markets
        url = `${this.gammaApiUrl}/markets?closed=false&limit=100`;
      } else if (identifier.startsWith('0x')) {
        // Condition ID (hex string) - use condition_id parameter
        url = `${this.gammaApiUrl}/markets?condition_id=${identifier}`;
      } else if (/^\d+$/.test(identifier) && identifier.length < 20) {
        // Short numeric ID - use id parameter
        url = `${this.gammaApiUrl}/markets?id=${identifier}`;
      } else {
        // Long numeric string - clob token ID
        url = `${this.gammaApiUrl}/markets?clob_token_ids=${identifier}`;
      }

      debugLog('Fetching from URL', { url });

      const response = await fetch(url);
      if (!response.ok) {
        // Try alternative lookup for condition IDs
        if (identifier?.startsWith('0x')) {
          debugLog('Condition ID lookup failed, trying slug search');
          // Try searching by the condition ID as a fallback
          const searchUrl = `${this.gammaApiUrl}/markets?limit=500`;
          const searchResponse = await fetch(searchUrl);
          if (searchResponse.ok) {
            const allMarkets = (await searchResponse.json()) as PolymarketMarketRaw[];
            // Search for market by id match (the market.id is the condition ID)
            const found = allMarkets.find((m) => m.id === identifier);
            if (found) {
              this.cacheMarket(found);
              return found;
            }
          }
        }
        throw new Error(`Gamma API error: ${response.status}`);
      }

      // API returns array directly, not { markets: [...] }
      const data = (await response.json()) as PolymarketMarketRaw[];
      debugLog('Gamma API returned', { count: data.length });

      if (data.length === 0) {
        debugLog('No markets found');
        return null;
      }

      const market = data[0];
      if (market) {
        this.cacheMarket(market);
        return market;
      }
    } catch (error) {
      console.error('Error fetching market data:', error);
      debugLog('Error fetching market data', error);
    }

    return null;
  }

  /**
   * Cache a market and update token-to-market mapping.
   */
  private cacheMarket(market: PolymarketMarketRaw): void {
    const tokens = parseClobTokenIds(market.clobTokenIds);
    if (tokens) {
      // Cache by market ID
      this.marketCache.set(market.id, market);
      // Also cache by token IDs for backward compatibility
      this.marketCache.set(tokens.yes, market);
      this.marketCache.set(tokens.no, market);
      // Update token-to-market mapping
      this.tokenToMarketMap.set(tokens.yes, market.id);
      this.tokenToMarketMap.set(tokens.no, market.id);
    }
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
   * Resolve outcomeId to actual token ID.
   * outcomeId can be 'yes', 'no', or the actual token ID.
   */
  private async resolveOutcomeToTokenId(
    marketId: string,
    outcomeId: string,
  ): Promise<{ tokenId: string; isYes: boolean } | null> {
    // First, try to get market by ID
    let market: PolymarketMarketRaw | null | undefined = this.marketCache.get(marketId);
    if (!market) {
      market = await this.fetchMarketData(marketId);
    }

    if (!market) {
      debugLog('Market not found', { marketId });
      return null;
    }

    const tokens = parseClobTokenIds(market.clobTokenIds);
    if (!tokens) return null;

    // Handle named outcomes
    const normalizedOutcome = outcomeId.toLowerCase();
    if (normalizedOutcome === 'yes' || normalizedOutcome === '0') {
      return { tokenId: tokens.yes, isYes: true };
    }
    if (normalizedOutcome === 'no' || normalizedOutcome === '1') {
      return { tokenId: tokens.no, isYes: false };
    }

    // Check if outcomeId is a direct token ID
    if (outcomeId === tokens.yes) {
      return { tokenId: tokens.yes, isYes: true };
    }
    if (outcomeId === tokens.no) {
      return { tokenId: tokens.no, isYes: false };
    }

    debugLog('Could not resolve outcome', { marketId, outcomeId });
    return null;
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
        return { usdc: POLYMARKET_USDC_ADDRESS, yesTokens: [], noTokens: [] };
      }

      // API returns array directly, not { markets: [...] }
      const data = (await response.json()) as PolymarketMarketRaw[];
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
        usdc: POLYMARKET_USDC_ADDRESS, // USDC.e on Polygon
        yesTokens,
        noTokens,
      };
    } catch (error) {
      console.error('Error fetching available tokens:', error);
      return { usdc: POLYMARKET_USDC_ADDRESS, yesTokens: [], noTokens: [] };
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

  // ============================================================================
  // Prediction Markets Actions
  // ============================================================================

  /**
   * Place an order in a prediction market.
   * Supports both buy and sell orders for any outcome.
   */
  async placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    debugLog('placeOrder called', {
      marketId: request.marketId,
      outcomeId: request.outcomeId,
      side: request.side,
      size: request.size,
      price: request.price,
    });

    const clob = await this.getClobClient();

    // Resolve the outcome to a token ID
    const resolved = await this.resolveOutcomeToTokenId(request.marketId, request.outcomeId);
    if (!resolved) {
      return {
        transactions: [],
        success: false,
        error: `Could not resolve outcome ${request.outcomeId} for market ${request.marketId}`,
      };
    }

    const { tokenId } = resolved;
    const size = Number(request.size);
    const price = request.price ? Number(request.price) : undefined;

    debugLog('Order params', { tokenId, size, price, side: request.side });

    if (size > this.maxOrderSize) {
      return {
        transactions: [],
        success: false,
        error: `Order size ${size} exceeds max allowed ${this.maxOrderSize}`,
      };
    }

    // Get market info to determine tickSize and negRisk
    // Use marketId (not tokenId) for reliable lookup
    const { tickSize, negRisk } = await this.getMarketInfo(request.marketId);
    debugLog('Market info', { tickSize, negRisk });

    // Calculate notional
    const notional = price ? size * price : size * 0.5;
    if (notional > this.maxOrderNotional) {
      return {
        transactions: [],
        success: false,
        error: `Order notional ${notional} exceeds cap ${this.maxOrderNotional}`,
      };
    }

    // Map our side to CLOB side
    const clobSide = request.side === 'buy' ? Side.BUY : Side.SELL;
    const orderPrice = price ?? 0.5;

    debugLog('Placing order', { tokenId, orderPrice, size, tickSize, negRisk, side: clobSide });

    try {
      const response = (await clob.createAndPostOrder(
        {
          tokenID: tokenId,
          price: orderPrice,
          side: clobSide,
          size,
          feeRateBps: 0,
        },
        { tickSize, negRisk },
        OrderType.GTC,
      )) as ClobOrderResponse;

      debugLog('CLOB response', response);

      const orderId = response?.orderID || response?.id || response?.order?.id;
      if (!orderId && !response?.success) {
        const errorMsg = response?.error || response?.message || 'Unknown error placing order';
        return {
          transactions: [],
          success: false,
          error: errorMsg,
        };
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
        orderId,
        success: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        transactions: [],
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Cancel an order in a prediction market.
   * @param request - Contains the order ID or 'all' to cancel all orders
   */
  async cancelOrder(request: CancelOrderRequest): Promise<CancelOrderResponse> {
    debugLog('cancelOrder called', { orderId: request.orderId });

    const clob = await this.getClobClient();

    try {
      let cancelledCount = 0;

      if (request.orderId === 'all') {
        // Cancel all orders
        debugLog('Canceling all orders');
        const response = (await clob.cancelAll()) as { cancelled?: number };
        debugLog('cancelAll response', response);
        cancelledCount = response?.cancelled || 0;
      } else {
        // Cancel specific order by ID
        debugLog('Canceling order', { orderId: request.orderId });

        // Get the order first to verify it exists
        const order = await clob.getOrder(request.orderId);
        debugLog('Order details', order);

        if (!order) {
          return {
            transactions: [],
            success: false,
          };
        }

        // Cancel the order
        await clob.cancelOrder({ orderID: request.orderId });
        debugLog('cancelOrder completed');
        cancelledCount = 1;
      }

      // Return transaction plan (off-chain cancellation, but we return a plan for consistency)
      const transaction: TransactionPlan = {
        type: TransactionTypes.EVM_TX,
        to: this.funderAddress,
        data: '0x',
        value: '0',
        chainId: request.chainId,
      };

      return {
        transactions: [transaction],
        success: true,
        cancelledCount,
      };
    } catch (error) {
      console.error('Error canceling order:', error);
      return {
        transactions: [],
        success: false,
      };
    }
  }

  /**
   * Redeem winnings from a resolved market.
   * Note: Polymarket redemption is handled on-chain through the CTF contract.
   *
   * The redeemPositions function signature:
   * function redeemPositions(
   *   address collateralToken,    // USDC address
   *   bytes32 parentCollectionId, // bytes32(0) for root
   *   bytes32 conditionId,        // Market condition ID
   *   uint256[] indexSets         // [1] for YES, [2] for NO, [1, 2] for both
   * )
   */
  async redeem(request: RedeemRequest): Promise<RedeemResponse> {
    debugLog('redeem called', {
      marketId: request.marketId,
      outcomeId: request.outcomeId,
      amount: request.amount,
    });

    try {
      // 1. Get market data to find condition ID and check resolution status
      const market = await this.fetchMarketData(request.marketId);

      if (!market) {
        console.error(`Redeem failed: Market not found: ${request.marketId}`);
        return {
          transactions: [],
          success: false,
        };
      }

      // 2. Check if market is resolved
      if (!market.closed) {
        console.error('Redeem failed: Market is not resolved yet. Cannot redeem until market closes.');
        return {
          transactions: [],
          success: false,
        };
      }

      // 3. Determine which contract to use
      // negRisk markets use the Neg Risk Adapter, regular markets use CTF Exchange
      const ctfContractAddress = market.negRisk
        ? '0xC5d563A36AE78145C45a50134d48A1215220f80a' // POLYMARKET_NEG_RISK_ADAPTER
        : POLYMARKET_CTF_EXCHANGE;

      // 4. Determine index sets based on outcome
      // For binary markets: YES = 1, NO = 2
      // If no specific outcome, redeem both
      let indexSets: number[];
      if (request.outcomeId === 'yes') {
        indexSets = [1];
      } else if (request.outcomeId === 'no') {
        indexSets = [2];
      } else {
        // Redeem all outcomes
        indexSets = [1, 2];
      }

      // 5. Get the condition ID from the market
      // The condition ID is typically derived from the market's question ID
      // For Polymarket, this is part of the market data
      const conditionId = market.id; // This is the condition ID

      // 6. Encode the redeemPositions function call
      // Function selector for redeemPositions(address,bytes32,bytes32,uint256[])
      // keccak256("redeemPositions(address,bytes32,bytes32,uint256[])") = 0x38e2e1c1
      const functionSelector = '0x38e2e1c1';

      // Encode parameters
      const collateralTokenPadded = POLYMARKET_USDC_ADDRESS.slice(2).padStart(64, '0');
      const parentCollectionId = '0'.repeat(64); // bytes32(0)
      const conditionIdPadded = conditionId.replace('0x', '').padStart(64, '0');

      // Encode dynamic array (indexSets)
      const arrayOffset = (32 * 4).toString(16).padStart(64, '0'); // Offset to array data (4 * 32 bytes)
      const arrayLength = indexSets.length.toString(16).padStart(64, '0');
      const arrayElements = indexSets.map((i) => i.toString(16).padStart(64, '0')).join('');

      const data =
        functionSelector +
        collateralTokenPadded +
        parentCollectionId +
        conditionIdPadded +
        arrayOffset +
        arrayLength +
        arrayElements;

      debugLog('Redemption transaction built', {
        contract: ctfContractAddress,
        conditionId,
        indexSets,
        negRisk: market.negRisk,
      });

      const transaction: TransactionPlan = {
        type: TransactionTypes.EVM_TX,
        to: ctfContractAddress,
        data: data,
        value: '0',
        chainId: request.chainId,
      };

      debugLog('Redemption transaction prepared', {
        market: market.question,
        outcomeId: request.outcomeId || 'all',
        note: 'This transaction requires gas (POL) to execute on-chain.',
      });

      return {
        transactions: [transaction],
        success: true,
      };
    } catch (error) {
      debugLog('Error building redemption transaction', error);
      console.error(`Failed to build redemption transaction: ${error instanceof Error ? error.message : String(error)}`);
      return {
        transactions: [],
        success: false,
      };
    }
  }

  // ============================================================================
  // Prediction Markets Queries
  // ============================================================================

  /**
   * Get available prediction markets.
   */
  async getMarkets(request: GetMarketsRequest): Promise<GetMarketsResponse> {
    debugLog('getMarkets called', { chainIds: request.chainIds });

    // Filter to only Polygon (chain 137)
    if (!request.chainIds.includes('137')) {
      return { markets: [] };
    }

    try {
      let url = `${this.gammaApiUrl}/markets?limit=${request.limit || 100}`;

      // Add offset for pagination
      if (request.offset !== undefined && request.offset > 0) {
        url += `&offset=${request.offset}`;
      }

      // Apply filters
      if (request.status === 'active') {
        url += '&closed=false&active=true';
      } else if (request.status === 'resolved') {
        url += '&closed=true';
      }

      if (request.searchQuery) {
        url += `&q=${encodeURIComponent(request.searchQuery)}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }

      // API returns array directly
      const data = (await response.json()) as PolymarketMarketRaw[];
      debugLog('Fetched markets from Gamma API', { count: data.length });

      const markets: PredictionMarket[] = data
        .filter((m) => {
          const tokens = parseClobTokenIds(m.clobTokenIds);
          return tokens !== null;
        })
        .map((m) => {
          // Cache the market
          this.cacheMarket(m);

          const tokens = parseClobTokenIds(m.clobTokenIds)!;
          const prices = parseOutcomePrices(m.outcomePrices);

          // Parse outcomes from JSON string
          let outcomeNames: string[] = ['Yes', 'No'];
          try {
            const parsed = JSON.parse(m.outcomes || '["Yes", "No"]') as string[];
            if (Array.isArray(parsed) && parsed.length >= 2) {
              outcomeNames = parsed;
            }
          } catch {
            // Use defaults
          }

          // Build outcomes array
          const outcomes: PredictionOutcome[] = [
            {
              outcomeId: 'yes',
              name: outcomeNames[0] ?? 'Yes',
              tokenId: tokens.yes,
              price: prices?.yes ?? '0.5',
              probability: prices?.yes,
            },
            {
              outcomeId: 'no',
              name: outcomeNames[1] ?? 'No',
              tokenId: tokens.no,
              price: prices?.no ?? '0.5',
              probability: prices?.no,
            },
          ];

          // Determine status
          let status: 'active' | 'resolved' | 'voided' | 'paused' = 'active';
          if (m.closed) {
            status = 'resolved';
          } else if (!m.active) {
            status = 'paused';
          }

          return {
            marketId: m.id,
            chainId: '137',
            title: m.question,
            status,
            endTime: m.endDateIso || m.endDate,
            resolutionOutcome: null, // Would need additional API call
            oracle: m.resolutionSource || undefined,
            outcomes,
            volume: m.volume,
            liquidity: m.liquidity,
            imageUrl: m.image || undefined,
            slug: m.slug,
            quoteTokenAddress: POLYMARKET_USDC_ADDRESS, // USDC.e
            tickSize: m.tickSize,
            negRisk: m.negRisk,
          };
        });

      debugLog('Mapped markets', { count: markets.length });

      return { markets };
    } catch (error) {
      console.error('Error fetching markets:', error);
      return { markets: [] };
    }
  }

  /**
   * Get user positions (YES/NO token holdings).
   * Uses the improved Data API /positions endpoint with PnL data.
   */
  async getPositions(request: GetPositionsRequest): Promise<GetPositionsResponse> {
    debugLog('getPositions called', { walletAddress: request.walletAddress });

    try {
      // Use new Data API positions endpoint - much better data with PnL!
      const url = `https://data-api.polymarket.com/positions?sizeThreshold=0&limit=100&sortBy=TOKENS&sortDirection=DESC&user=${request.walletAddress}`;
      const response = await fetch(url);

      if (!response.ok) {
        debugLog('Positions API returned error', { status: response.status });
        // If data API fails, use blockchain fallback directly
        return await this.getPositionsFromBlockchain(request);
      }

      const data = (await response.json()) as Array<{
        asset: string;
        conditionId: string;
        size: number;
        avgPrice: number;
        initialValue: number;
        currentValue: number;
        curPrice: number;
        cashPnl: number;
        percentPnl: number;
        title: string;
        outcome: string;
        slug: string;
      }>;

      const positions: PredictionPosition[] = data.map((pos) => ({
        marketId: pos.conditionId,
        outcomeId: pos.outcome.toLowerCase(),
        tokenId: pos.asset,
        chainId: '137',
        walletAddress: request.walletAddress,
        size: (pos.size * 1_000_000).toString(), // Convert to raw units (6 decimals)
        avgPrice: pos.avgPrice.toString(),
        cost: pos.initialValue.toString(),
        pnl: pos.cashPnl.toString(),
        currentPrice: pos.curPrice.toString(),
        currentValue: pos.currentValue.toString(),
        quoteTokenAddress: POLYMARKET_USDC_ADDRESS,
        marketTitle: pos.title,
        outcomeName: pos.outcome,
      }));

      debugLog('Positions fetched from Data API', { count: positions.length });
      return { positions };
    } catch (error) {
      console.error('Error fetching positions:', error);
      debugLog('Falling back to blockchain query', { error });
      return await this.getPositionsFromBlockchain(request);
    }
  }

  /**
   * Get positions by querying blockchain directly for token balances.
   */
  private async getPositionsFromBlockchain(
    request: GetPositionsRequest,
  ): Promise<GetPositionsResponse> {
    debugLog('getPositionsFromBlockchain called', { walletAddress: request.walletAddress });

    try {
      // Get markets to extract token IDs
      const markets = await this.getMarkets({ chainIds: ['137'] });
      const tokenIds: string[] = [];

      // Collect all YES/NO token IDs from first 50 markets
      for (const market of markets.markets.slice(0, 50)) {
        for (const outcome of market.outcomes) {
          if (outcome.tokenId) {
            tokenIds.push(outcome.tokenId);
          }
        }
      }

      // Query blockchain for actual balances
      const balances = await this.getTokenBalances(request.walletAddress, tokenIds);
      const positions: PredictionPosition[] = [];

      // Convert non-zero balances to position objects
      for (const balance of balances) {
        const balanceNum = parseInt(balance.balance);
        if (balanceNum === 0) continue;

        // Find the market for this token
        const market = markets.markets.find((m) =>
          m.outcomes.some((o) => o.tokenId === balance.tokenId),
        );

        if (!market) continue;

        const outcome = market.outcomes.find((o) => o.tokenId === balance.tokenId);
        if (!outcome) continue;

        positions.push({
          marketId: market.marketId,
          outcomeId: outcome.outcomeId,
          tokenId: balance.tokenId,
          chainId: '137',
          walletAddress: request.walletAddress,
          size: balance.balance,
          quoteTokenAddress: POLYMARKET_USDC_ADDRESS,
          marketTitle: market.title,
          outcomeName: outcome.name,
          currentPrice: outcome.price,
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
  async getOrders(request: GetOrdersRequest): Promise<GetOrdersResponse> {
    debugLog('getOrders called', { walletAddress: request.walletAddress });

    const clob = await this.getClobClient();

    try {
      // Use CLOB client to get open orders
      const openOrdersResponse = await clob.getOpenOrders();
      debugLog('getOpenOrders response', openOrdersResponse);

      // OpenOrdersResponse is OpenOrder[]
      const openOrders: OpenOrder[] = Array.isArray(openOrdersResponse) ? openOrdersResponse : [];

      debugLog('Open orders count', openOrders.length);

      const orders: PredictionOrder[] = openOrders.map((o: OpenOrder) => {
        // Get market ID from token
        const marketId = this.tokenToMarketMap.get(o.asset_id) || o.asset_id;

        // Determine if this is a YES or NO token
        const cachedMarket = this.marketCache.get(o.asset_id);
        let outcomeId = 'unknown';
        if (cachedMarket) {
          const tokens = parseClobTokenIds(cachedMarket.clobTokenIds);
          if (tokens) {
            outcomeId = o.asset_id === tokens.yes ? 'yes' : 'no';
          }
        }

        return {
          orderId: o.id,
          marketId,
          outcomeId,
          tokenId: o.asset_id,
          chainId: '137',
          side: o.side === 'BUY' ? ('buy' as const) : ('sell' as const),
          price: o.price || '0',
          size: o.original_size || '0',
          filledSize: o.size_matched || '0',
          status: 'open' as const,
          createdAt: o.created_at.toString(),
          walletAddress: request.walletAddress,
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

  // ============================================================================
  // Additional Helper Methods (kept for backward compatibility)
  // ============================================================================

  /**
   * Get token balances directly from blockchain (ERC-1155 tokens)
   */
  async getTokenBalances(
    walletAddress: string,
    tokenIds: string[],
  ): Promise<{ tokenId: string; balance: string; marketName?: string }[]> {
    debugLog('getTokenBalances called', { walletAddress, tokenIds: tokenIds.length });

    const results: { tokenId: string; balance: string; marketName?: string }[] = [];

    try {
      // Polymarket uses ERC-1155 tokens through Conditional Tokens Framework (CTF)
      // The actual token balances are on the CTF contract, NOT the CTF Exchange
      const ctfContractAddress = POLYMARKET_CTF_CONTRACT;

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
                  data: data,
                },
                'latest',
              ],
              id: 1,
            }),
          });

          const result = (await response.json()) as { result?: string };

          if (result.result && result.result !== '0x') {
            const balance = BigInt(result.result).toString();
            debugLog('Token balance found', {
              tokenId: tokenId.substring(0, 20) + '...',
              balance,
            });

            // Try to get market name from cache
            const cachedMarket = this.marketCache.get(tokenId);
            const marketName = cachedMarket?.question || undefined;

            results.push({
              tokenId,
              balance,
              marketName,
            });
          }
        } catch (error) {
          debugLog('Error querying token balance', {
            tokenId: tokenId.substring(0, 20) + '...',
            error,
          });
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
   */
  async getTradingHistory(
    walletAddress: string,
    options?: {
      market?: string;
      asset_id?: string;
      before?: string;
      after?: string;
      limit?: number;
    },
  ): Promise<Trade[]> {
    debugLog('getTradingHistory called', { walletAddress, options });

    const clob = await this.getClobClient();

    try {
      const tradeParams = {
        maker_address: walletAddress,
        ...options,
      };

      const trades = await clob.getTrades(tradeParams, false);
      debugLog('Trading history retrieved', { tradesCount: trades.length });

      return trades;
    } catch (error) {
      console.error('Error getting trading history:', error);
      debugLog('Error getting trading history', error);
      return [];
    }
  }

  /**
   * Get user's trading history with market descriptions.
   * Uses the improved Data API /activity endpoint with all data pre-enriched.
   */
  async getTradingHistoryWithDetails(
    walletAddress: string,
    options?: {
      market?: string;
      asset_id?: string;
      before?: string;
      after?: string;
      limit?: number;
    },
  ): Promise<{
    id: string;
    market: string;
    marketTitle: string;
    marketDescription?: string;
    marketSlug?: string;
    side: string;
    outcome: string;
    size: string;
    price: string;
    matchTime: string;
    fee_rate_bps?: string;
    transactionHash?: string;
    usdcSize?: string;
  }[]> {
    debugLog('getTradingHistoryWithDetails called', { walletAddress, options });

    try {
      const limit = options?.limit || 100;
      const url = `https://data-api.polymarket.com/activity?limit=${limit}&sortBy=TIMESTAMP&sortDirection=DESC&user=${walletAddress}`;

      debugLog('Fetching activity from Data API', { limit });

      const response = await fetch(url);
      if (!response.ok) {
        debugLog('Activity API returned error', { status: response.status });
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
          marketDescription: activity.slug,
          marketSlug: activity.slug,
          side: activity.side,
          outcome: activity.outcome,
          size: activity.size.toString(),
          price: activity.price.toString(),
          matchTime: activity.timestamp.toString(),
          transactionHash: activity.transactionHash,
          usdcSize: activity.usdcSize.toString(),
        }));

      debugLog('Activity fetched from Data API', { count: trades.length });
      return trades;
    } catch (error) {
      console.error('Error fetching trading history:', error);
      debugLog('Error fetching trading history', error);
      return [];
    }
  }

  /**
   * Get user's earnings history
   */
  async getUserEarnings(date?: string): Promise<UserEarnings | null> {
    debugLog('getUserEarnings called', { date });

    const clob = await this.getClobClient();

    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      const earnings = await clob.getEarningsForUserForDay(targetDate!);
      const totalEarnings = await clob.getTotalEarningsForUserForDay(targetDate!);

      debugLog('User earnings retrieved', {
        earningsCount: earnings.length,
        totalEarningsCount: totalEarnings.length,
      });

      return {
        date: targetDate!,
        earnings,
        totalEarnings,
      };
    } catch (error) {
      console.error('Error getting user earnings:', error);
      debugLog('Error getting user earnings', error);
      return null;
    }
  }

  /**
   * Get detailed market trades for a specific condition/market
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
   */
  async getPriceHistory(options: {
    market?: string;
    startTs?: number;
    endTs?: number;
    fidelity?: number;
    interval?: string;
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
   */
  async getComprehensiveWalletData(walletAddress: string): Promise<ComprehensiveWalletData> {
    debugLog('getComprehensiveWalletData called', { walletAddress });

    try {
      // 1. Get all available markets and token IDs
      const marketsResult = await this.getMarkets({ chainIds: ['137'] });
      const allTokenIds = new Set<string>();

      for (const market of marketsResult.markets) {
        for (const outcome of market.outcomes) {
          if (outcome.tokenId) {
            allTokenIds.add(outcome.tokenId);
          }
        }
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
      const tradedMarkets = new Set(tradingHistory.map((t) => t.market));

      for (const marketId of Array.from(tradedMarkets).slice(0, 5)) {
        try {
          const activity = await this.getMarketTrades(marketId);
          marketActivity.push({ market: marketId, trades: activity });
        } catch {
          // Continue if individual market fails
        }
      }

      // 7. Create summary
      const summary = {
        totalTokensHeld: currentBalances.reduce((sum, b) => sum + parseInt(b.balance), 0) / 1000000,
        totalTrades: tradingHistory.length,
        activeOrders: openOrders.length,
        marketsTraded: tradedMarkets.size,
        lastTradeDate: tradingHistory.length > 0 ? tradingHistory[0]?.match_time : undefined,
      };

      debugLog('Comprehensive wallet data compiled', summary);

      return {
        currentBalances,
        tradingHistory,
        openOrders,
        earnings,
        marketActivity,
        summary,
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
        summary: {},
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

  /**
   * Get a consolidated portfolio summary showing all positions and pending orders
   * grouped by market with YES/NO token details.
   */
  async getPortfolioSummary(walletAddress: string): Promise<{
    markets: {
      marketId: string;
      title: string;
      status: string;
      yesToken: {
        tokenId: string;
        balance: string;
        pendingBuyOrders: number;
        pendingSellOrders: number;
        currentPrice: string;
      };
      noToken: {
        tokenId: string;
        balance: string;
        pendingBuyOrders: number;
        pendingSellOrders: number;
        currentPrice: string;
      };
    }[];
    totalPositions: number;
    totalOpenOrders: number;
  }> {
    debugLog('getPortfolioSummary called', { walletAddress });

    // Get all markets to build token mappings
    const marketsResult = await this.getMarkets({ chainIds: ['137'], limit: 100 });
    const marketMap = new Map<
      string,
      {
        marketId: string;
        title: string;
        status: string;
        yesTokenId: string;
        noTokenId: string;
        yesPrice: string;
        noPrice: string;
      }
    >();

    // Build market lookup maps
    for (const market of marketsResult.markets) {
      const yesOutcome = market.outcomes.find((o) => o.outcomeId === 'yes');
      const noOutcome = market.outcomes.find((o) => o.outcomeId === 'no');
      if (yesOutcome?.tokenId && noOutcome?.tokenId) {
        const marketData = {
          marketId: market.marketId,
          title: market.title,
          status: market.status,
          yesTokenId: yesOutcome.tokenId,
          noTokenId: noOutcome.tokenId,
          yesPrice: yesOutcome.price ?? '0.5',
          noPrice: noOutcome.price ?? '0.5',
        };
        marketMap.set(market.marketId, marketData);
        // Also index by token IDs for quick lookup
        marketMap.set(yesOutcome.tokenId, marketData);
        marketMap.set(noOutcome.tokenId, marketData);
      }
    }

    // Get open orders first so we can include their tokens in balance check
    const ordersResult = await this.getOrders({ walletAddress });

    // Collect token IDs from orders that might not be in the market cache
    const orderTokenIds = new Set<string>();
    for (const order of ordersResult.orders) {
      if (order.tokenId) {
        orderTokenIds.add(order.tokenId);
        // Fetch market data for this token to get both YES and NO token IDs
        const market = await this.fetchMarketData(order.tokenId);
        if (market) {
          const tokens = parseClobTokenIds(market.clobTokenIds);
          if (tokens) {
            orderTokenIds.add(tokens.yes);
            orderTokenIds.add(tokens.no);
          }
        }
      }
    }

    // Get all token IDs we need to check (from markets + orders)
    const allTokenIds = new Set<string>();
    for (const market of marketsResult.markets) {
      for (const outcome of market.outcomes) {
        if (outcome.tokenId) {
          allTokenIds.add(outcome.tokenId);
        }
      }
    }
    // Add tokens from orders
    for (const tokenId of orderTokenIds) {
      allTokenIds.add(tokenId);
    }

    // Get token balances from blockchain
    const balances = await this.getTokenBalances(walletAddress, Array.from(allTokenIds));

    // Build portfolio summary by market
    const portfolioByMarket = new Map<
      string,
      {
        marketId: string;
        title: string;
        status: string;
        yesToken: {
          tokenId: string;
          balance: string;
          pendingBuyOrders: number;
          pendingSellOrders: number;
          currentPrice: string;
        };
        noToken: {
          tokenId: string;
          balance: string;
          pendingBuyOrders: number;
          pendingSellOrders: number;
          currentPrice: string;
        };
      }
    >();

    // Process balances
    for (const balance of balances) {
      if (parseInt(balance.balance) === 0) continue;

      const marketData = marketMap.get(balance.tokenId);
      if (!marketData) continue;

      if (!portfolioByMarket.has(marketData.marketId)) {
        portfolioByMarket.set(marketData.marketId, {
          marketId: marketData.marketId,
          title: marketData.title,
          status: marketData.status,
          yesToken: {
            tokenId: marketData.yesTokenId,
            balance: '0',
            pendingBuyOrders: 0,
            pendingSellOrders: 0,
            currentPrice: marketData.yesPrice,
          },
          noToken: {
            tokenId: marketData.noTokenId,
            balance: '0',
            pendingBuyOrders: 0,
            pendingSellOrders: 0,
            currentPrice: marketData.noPrice,
          },
        });
      }

      const portfolio = portfolioByMarket.get(marketData.marketId)!;
      if (balance.tokenId === marketData.yesTokenId) {
        portfolio.yesToken.balance = balance.balance;
      } else if (balance.tokenId === marketData.noTokenId) {
        portfolio.noToken.balance = balance.balance;
      }
    }

    // Process open orders
    for (const order of ordersResult.orders) {
      if (!order.tokenId) continue;
      let marketData = marketMap.get(order.tokenId);

      // If market not in cache, try to fetch it by token ID
      if (!marketData) {
        debugLog('Order token not in cache, fetching market', { tokenId: order.tokenId });
        const fetchedMarket = await this.fetchMarketData(order.tokenId);
        if (fetchedMarket) {
          const tokens = parseClobTokenIds(fetchedMarket.clobTokenIds);
          const prices = parseOutcomePrices(fetchedMarket.outcomePrices);
          if (tokens) {
            marketData = {
              marketId: fetchedMarket.id,
              title: fetchedMarket.question,
              status: fetchedMarket.closed ? 'resolved' : fetchedMarket.active ? 'active' : 'paused',
              yesTokenId: tokens.yes,
              noTokenId: tokens.no,
              yesPrice: prices?.yes ?? '0.5',
              noPrice: prices?.no ?? '0.5',
            };
            marketMap.set(order.tokenId, marketData);
            marketMap.set(fetchedMarket.id, marketData);
          }
        }
      }

      if (!marketData) continue;

      if (!portfolioByMarket.has(marketData.marketId)) {
        portfolioByMarket.set(marketData.marketId, {
          marketId: marketData.marketId,
          title: marketData.title,
          status: marketData.status,
          yesToken: {
            tokenId: marketData.yesTokenId,
            balance: '0',
            pendingBuyOrders: 0,
            pendingSellOrders: 0,
            currentPrice: marketData.yesPrice,
          },
          noToken: {
            tokenId: marketData.noTokenId,
            balance: '0',
            pendingBuyOrders: 0,
            pendingSellOrders: 0,
            currentPrice: marketData.noPrice,
          },
        });
      }

      const portfolio = portfolioByMarket.get(marketData.marketId)!;
      const isYes = order.tokenId === marketData.yesTokenId;
      const token = isYes ? portfolio.yesToken : portfolio.noToken;

      if (order.side === 'buy') {
        token.pendingBuyOrders++;
      } else {
        token.pendingSellOrders++;
      }
    }

    const markets = Array.from(portfolioByMarket.values());
    const totalPositions = markets.reduce(
      (sum, m) =>
        sum + (parseInt(m.yesToken.balance) > 0 ? 1 : 0) + (parseInt(m.noToken.balance) > 0 ? 1 : 0),
      0,
    );

    debugLog('Portfolio summary complete', {
      marketsWithActivity: markets.length,
      totalPositions,
      totalOpenOrders: ordersResult.orders.length,
    });

    return {
      markets,
      totalPositions,
      totalOpenOrders: ordersResult.orders.length,
    };
  }
}
