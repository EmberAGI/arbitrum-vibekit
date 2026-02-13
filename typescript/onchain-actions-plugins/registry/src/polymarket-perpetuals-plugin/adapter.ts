import { ClobClient, OrderType, Side, type ApiKeyCreds } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
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
  outcomes: Array<{
    id: string;
    name: string;
    price: string;
    volume: string;
  }>;
  liquidity: string;
  volume: string;
  endDateISO: string;
  image: string | null;
  active: boolean;
  archived: boolean;
  marketMakerAddress: string | null;
  resolutionSource: string | null;
  clobTokenIds: {
    yes: string;
    no: string;
  };
  tickSize: string;
  negRisk: boolean;
}

interface PolymarketMarketResponse {
  markets: PolymarketMarket[];
}

interface PolymarketPosition {
  tokenId: string;
  balance: string;
  marketSlug?: string;
  outcome?: string;
}

interface PolymarketOrder {
  orderId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

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
    if (tokenId && this.marketCache.has(tokenId)) {
      return this.marketCache.get(tokenId) ?? null;
    }

    try {
      const url = tokenId
        ? `${this.gammaApiUrl}/markets?token_ids=${tokenId}`
        : `${this.gammaApiUrl}/markets?active=true&limit=100`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }

      const data = (await response.json()) as PolymarketMarketResponse;
      if (data.markets && data.markets.length > 0) {
        const market = data.markets[0];
        if (market.clobTokenIds?.yes) {
          this.marketCache.set(market.clobTokenIds.yes, market);
        }
        if (market.clobTokenIds?.no) {
          this.marketCache.set(market.clobTokenIds.no, market);
        }
        return market;
      }
    } catch (error) {
      console.error('Error fetching market data:', error);
    }

    return null;
  }

  /**
   * Get market info for a token ID, including tickSize and negRisk.
   */
  private async getMarketInfo(tokenId: string): Promise<{ tickSize: string; negRisk: boolean }> {
    const market = await this.fetchMarketData(tokenId);
    if (market) {
      return {
        tickSize: market.tickSize ?? '0.001',
        negRisk: market.negRisk ?? false,
      };
    }
    return { tickSize: '0.001', negRisk: false };
  }

  /**
   * Get the NO token ID for a given YES token ID.
   */
  private async getNoTokenId(yesTokenId: string): Promise<string | null> {
    const market = await this.fetchMarketData(yesTokenId);
    return market?.clobTokenIds?.no ?? null;
  }

  /**
   * Get all available token addresses for input/output token mapping.
   * Returns USDC (for input) and all YES/NO token addresses (for output).
   */
  async getAvailableTokens(): Promise<{ usdc: string; yesTokens: string[]; noTokens: string[] }> {
    try {
      const url = `${this.gammaApiUrl}/markets?active=true&limit=100`;
      const response = await fetch(url);

      if (!response.ok) {
        return { usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', yesTokens: [], noTokens: [] };
      }

      const data = (await response.json()) as PolymarketMarketResponse;
      const yesTokens: string[] = [];
      const noTokens: string[] = [];

      for (const market of data.markets) {
        if (market.active && market.clobTokenIds?.yes && market.clobTokenIds?.no) {
          yesTokens.push(market.clobTokenIds.yes);
          noTokens.push(market.clobTokenIds.no);
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
        const baseClient = new ClobClient(this.host, this.chainId, this.signer);
        const creds: ApiKeyCreds = await baseClient.createOrDeriveApiKey();
        const client = new ClobClient(
          this.host,
          this.chainId,
          this.signer,
          creds,
          this.signatureType,
          this.funderAddress,
        );
        this.clobClient = client;
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
    const clob = await this.getClobClient();

    // For Polymarket, marketAddress is the YES token ID
    const tokenId = request.marketAddress;
    const size = Number(request.amount);
    const price = request.limitPrice ? Number(request.limitPrice) : undefined;

    if (size > this.maxOrderSize) {
      throw new Error(`Order size ${size} exceeds max allowed ${this.maxOrderSize}`);
    }

    // Get market info to determine tickSize and negRisk
    const { tickSize, negRisk } = await this.getMarketInfo(tokenId);

    // Calculate notional
    const notional = price ? size * price : size * 0.5; // Default to mid-price estimate
    if (notional > this.maxOrderNotional) {
      throw new Error(`Order notional ${notional} exceeds cap ${this.maxOrderNotional}`);
    }

    // Place order via CLOB
    const orderPrice = price ?? 0.5; // Default to 0.5 if no limit price
    const resp = await (clob as unknown as { createAndPostOrder: typeof clob.createAndPostOrder }).createAndPostOrder(
      {
        tokenID: tokenId,
        price: orderPrice,
        side: Side.BUY,
        size,
        feeRateBps: 0,
      },
      { tickSize, negRisk },
      OrderType.GTC,
    );

    // Return transaction plan for on-chain interaction
    // Note: Polymarket CLOB is off-chain, but we return a transaction plan
    // that represents the order placement. In production, this might interact
    // with Polymarket's settlement contracts or a wrapper contract.
    const transaction: TransactionPlan = {
      type: TransactionTypes.EVM_TX,
      to: this.funderAddress, // Placeholder - actual settlement contract address
      data: '0x', // Order data would be encoded here
      value: '0',
      chainId: request.chainId,
    };

    return {
      transactions: [transaction],
    };
  }

  /**
   * Create a short position (BUY NO token or SELL YES token) on a Polymarket market.
   * Maps to perpetuals-short action.
   */
  async createShortPosition(
    request: CreatePerpetualsPositionRequest,
  ): Promise<CreatePerpetualsPositionResponse> {
    const clob = await this.getClobClient();

    // For short, we need the NO token ID
    const yesTokenId = request.marketAddress;
    const noTokenId = await this.getNoTokenId(yesTokenId);

    if (!noTokenId) {
      throw new Error(`Could not find NO token for YES token ${yesTokenId}`);
    }

    const size = Number(request.amount);
    const price = request.limitPrice ? Number(request.limitPrice) : undefined;

    if (size > this.maxOrderSize) {
      throw new Error(`Order size ${size} exceeds max allowed ${this.maxOrderSize}`);
    }

    const { tickSize, negRisk } = await this.getMarketInfo(noTokenId);

    const orderPrice = price ?? 0.5;
    const clobTyped = clob as unknown as { createAndPostOrder: typeof clob.createAndPostOrder };
    await clobTyped.createAndPostOrder(
      {
        tokenID: noTokenId,
        price: orderPrice,
        side: Side.BUY,
        size,
        feeRateBps: 0,
      },
      { tickSize, negRisk },
      OrderType.GTC,
    );

    const transaction: TransactionPlan = {
      type: TransactionTypes.EVM_TX,
      to: this.funderAddress,
      data: '0x',
      value: '0',
      chainId: request.chainId,
    };

    return {
      transactions: [transaction],
    };
  }

  /**
   * Close/cancel orders on Polymarket.
   */
  async closeOrders(
    request: ClosePerpetualsOrdersRequest,
  ): Promise<ClosePerpetualsOrdersResponse> {
    const clob = await this.getClobClient();

    try {
      // Cancel order via CLOB API
      const url = `${this.host}/orders/${request.key}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel order: ${response.status}`);
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
      };
    } catch (error) {
      console.error('Error canceling order:', error);
      throw error;
    }
  }

  /**
   * Get available Polymarket markets.
   */
  async getMarkets(request: GetPerpetualsMarketsRequest): Promise<GetPerpetualsMarketsResponse> {
    // Filter to only Polygon (chain 137)
    if (!request.chainIds.includes('137')) {
      return { markets: [] };
    }

    try {
      const url = `${this.gammaApiUrl}/markets?active=true&limit=100`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }

      const data = (await response.json()) as PolymarketMarketResponse;
      const markets: PerpetualMarket[] = data.markets
        .filter(m => m.active && m.clobTokenIds?.yes && m.clobTokenIds?.no)
        .map(m => {
          // Map Polymarket market to PerpetualMarket format
          const yesToken: TokenIdentifier = {
            chainId: '137',
            address: m.clobTokenIds.yes,
          };
          const noToken: TokenIdentifier = {
            chainId: '137',
            address: m.clobTokenIds.no,
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
        // If data API fails, try CLOB balance endpoint
        return this.getPositionsFromClob(request);
      }

      const data = (await response.json()) as { positions: PolymarketPosition[] };
      const positions: PerpetualsPosition[] = [];

      for (const pos of data.positions) {
        const market = await this.fetchMarketData(pos.tokenId);
        if (!market || !market.clobTokenIds) continue;

        const isYesToken = pos.tokenId === market.clobTokenIds.yes;
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
      return this.getPositionsFromClob(request);
    }
  }

  /**
   * Fallback: Get positions from CLOB balance endpoint.
   */
  private async getPositionsFromClob(
    request: GetPerpetualsMarketsPositionsRequest,
  ): Promise<GetPerpetualsMarketsPositionsResponse> {
    const clob = await this.getClobClient();
    const positions: PerpetualsPosition[] = [];

    // CLOB client doesn't expose a direct balance endpoint in the public API
    // This would need to be implemented via on-chain token balance queries
    // For now, return empty array

    return { positions };
  }

  /**
   * Get pending orders.
   */
  async getOrders(
    request: GetPerpetualsMarketsOrdersRequest,
  ): Promise<GetPerpetualsMarketsOrdersResponse> {
    const clob = await this.getClobClient();

    try {
      // Fetch orders from CLOB ledger API
      const url = `${this.host}/orders?maker=${request.walletAddress}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`CLOB API error: ${response.status}`);
      }

      const data = (await response.json()) as { orders: PolymarketOrder[] };
      const orders: PerpetualsOrder[] = data.orders
        .filter(o => o.status === 'OPEN' || o.status === 'PENDING')
        .map(o => {
          const side = o.side === 'BUY' ? 'long' : 'short';
          return {
            chainId: '137',
            key: o.orderId,
            account: request.walletAddress,
            callbackContract: '0x0000000000000000000000000000000000000000',
            initialCollateralTokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
            marketAddress: o.tokenId, // Token ID represents the market
            decreasePositionSwapType: 'NoSwap',
            receiver: request.walletAddress,
            swapPath: [],
            contractAcceptablePrice: (Number(o.price) * 1e18).toString(), // Convert to wei-like format
            contractTriggerPrice: '0',
            callbackGasLimit: '0',
            executionFee: '0',
            initialCollateralDeltaAmount: (Number(o.size) * Number(o.price) * 1e6).toString(), // USDC has 6 decimals
            minOutputAmount: o.size,
            sizeDeltaUsd: (Number(o.size) * Number(o.price)).toString(),
            updatedAtTime: o.updatedAt,
            isFrozen: false,
            positionSide: side as PositionSide,
            orderType: 'LimitIncrease',
            shouldUnwrapNativeToken: false,
            autoCancel: false,
            uiFeeReceiver: '0x0000000000000000000000000000000000000000',
            validFromTime: o.createdAt,
          };
        });

      return { orders };
    } catch (error) {
      console.error('Error fetching orders:', error);
      return { orders: [] };
    }
  }
}

