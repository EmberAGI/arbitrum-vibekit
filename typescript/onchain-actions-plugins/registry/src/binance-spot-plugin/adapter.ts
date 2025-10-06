/**
 * Binance Spot Trading Adapter
 * Handles all interactions with Binance Spot API
 */

import { MainClient } from 'binance';
import crypto from 'crypto';
import type {
  SwapTokensRequest,
  SwapTokensResponse,
  Token,
  TransactionPlan,
} from '../core/index.js';
import type {
  BinanceAdapterParams,
  BinanceSymbol,
  BinanceAccountInfo,
  BinanceOrder,
  BinanceOrderRequest,
} from './types.js';
import {
  mapBinanceError,
  isRetryableError,
  BinanceError,
  BinanceInsufficientBalanceError,
  BinanceInvalidSymbolError,
} from './errors.js';
import pRetry, { AbortError } from 'p-retry';

export class BinanceSpotAdapter {
  private client: MainClient;
  private symbols: Map<string, BinanceSymbol> = new Map();
  private symbolsLoaded = false;
  private apiKey: string;
  private apiSecret: string;
  private testnet: boolean;
  private baseUrl: string;

  constructor(params: BinanceAdapterParams) {
    this.apiKey = params.apiKey;
    this.apiSecret = params.apiSecret;
    this.testnet = params.testnet || false;
    this.baseUrl = this.testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
    
    this.client = new MainClient({
      api_key: params.apiKey,
      api_secret: params.apiSecret,
      testnet: params.testnet || false,
      useMMSubdomain: params.useMMSubdomain || false,
    });
  }

  /**
   * Load and cache exchange information including available symbols
   */
  async loadExchangeInfo(): Promise<void> {
    if (this.symbolsLoaded) {
      return;
    }

    try {
      const exchangeInfo = await this.client.getExchangeInfo();
      
      for (const symbol of exchangeInfo.symbols) {
        if (symbol.isSpotTradingAllowed) {
          this.symbols.set(symbol.symbol, symbol);
        }
      }
      
      this.symbolsLoaded = true;
    } catch (error) {
      throw mapBinanceError(error);
    }
  }

  /**
   * Get available trading symbols
   */
  async getAvailableSymbols(): Promise<BinanceSymbol[]> {
    await this.loadExchangeInfo();
    return Array.from(this.symbols.values());
  }

  /**
   * Create HMAC signature for authenticated requests
   */
  private createSignature(queryString: string): string {
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  /**
   * Make authenticated HTTP request to Binance API
   */
  private async makeAuthenticatedRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = new URL(endpoint, this.baseUrl);
    
    // Add timestamp and recvWindow for authenticated requests
    params.timestamp = Date.now();
    params.recvWindow = 5000;
    
    // Add parameters to URL
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value.toString());
    });
    
    const signature = this.createSignature(url.searchParams.toString());
    url.searchParams.append('signature', signature);
    
    const headers = {
      'Content-Type': 'application/json',
      'X-MBX-APIKEY': this.apiKey,
    };
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return response.json();
  }

  /**
   * Get account information including balances
   */
  async getAccountInfo(): Promise<BinanceAccountInfo> {
    try {
      // Use direct HTTP call since the SDK has issues with testnet
      return await this.makeAuthenticatedRequest('/api/v3/account');
    } catch (error) {
      console.error('Binance API Error Details:', {
        message: error?.message,
        code: error?.code,
        response: error?.response?.data,
        status: error?.response?.status,
        statusText: error?.response?.statusText,
      });
      throw mapBinanceError(error);
    }
  }

  /**
   * Get order book for a symbol
   */
  async getOrderBook(symbol: string, limit: number = 100): Promise<any> {
    try {
      return await this.client.getOrderBook({ symbol, limit });
    } catch (error) {
      throw mapBinanceError(error);
    }
  }

  /**
   * Get current price for a symbol
   */
  async getCurrentPrice(symbol: string): Promise<{ symbol: string; price: string }> {
    try {
      const result = await this.client.getSymbolPriceTicker({ symbol });
      return result;
    } catch (error) {
      throw mapBinanceError(error);
    }
  }

  /**
   * Create a spot trading order (swap)
   */
  async createSwapTransaction(request: SwapTokensRequest): Promise<SwapTokensResponse> {
    try {
      await this.loadExchangeInfo();

      // Validate the trading pair
      const symbol = this.getSymbolFromTokens(request.fromToken, request.toToken);
      if (!symbol) {
        throw new BinanceInvalidSymbolError(`${request.fromToken.symbol}/${request.toToken.symbol}`);
      }

      // Get current price for estimation
      const currentPrice = await this.getCurrentPrice(symbol);
      const price = parseFloat(currentPrice.price);

      // Determine order side and quantity
      // For USDT -> BTC, we need to sell USDT and buy BTC
      // The symbol format is BTCUSDT, so we're buying BTC with USDT
      const side = 'BUY'; // We're buying the toToken with fromToken
      
      // For market orders, we need to specify the quote order quantity (how much USDT to spend)
      // instead of the base quantity (how much BTC to buy)
      const quoteOrderQty = this.formatQuantity(request.amount, request.fromToken.decimals);

      // Create market order for immediate execution
      const orderRequest: BinanceOrderRequest = {
        symbol,
        side,
        type: 'MARKET',
        quoteOrderQty, // Use quote order quantity for market orders
        timestamp: Date.now(),
      };

      // Execute the order
      const order = await this.executeOrderWithRetry(orderRequest);

      // Calculate actual amounts
      const executedQty = parseFloat(order.executedQty);
      const cummulativeQuoteQty = parseFloat(order.cummulativeQuoteQty);

      // Create transaction plan (Binance orders are executed immediately, so this is more of a record)
      const transactionPlan: TransactionPlan = {
        type: 'SWAP',
        to: 'binance-spot-api',
        data: JSON.stringify({
          orderId: order.orderId,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          executedQty: order.executedQty,
          cummulativeQuoteQty: order.cummulativeQuoteQty,
          status: order.status,
        }),
        value: '0',
        chainId: 'binance-spot',
      };

      return {
        fromToken: request.fromToken,
        toToken: request.toToken,
        exactFromAmount: cummulativeQuoteQty.toString(),
        displayFromAmount: cummulativeQuoteQty.toFixed(8),
        exactToAmount: executedQty.toString(),
        displayToAmount: executedQty.toFixed(8),
        transactions: [transactionPlan],
        feeBreakdown: {
          serviceFee: '0.001', // Binance spot trading fee (0.1%)
          slippageCost: '0',
          total: '0.001',
          feeDenomination: request.toToken.symbol,
        },
        estimation: {
          effectivePrice: price.toString(),
          timeEstimate: 'immediate',
          expiration: new Date(Date.now() + 60000).toISOString(), // 1 minute
        },
        providerTracking: {
          requestId: order.orderId.toString(),
          providerName: 'Binance Spot',
          explorerUrl: `https://www.binance.com/en/trade/${symbol}`,
        },
      };
    } catch (error) {
      throw mapBinanceError(error);
    }
  }

  /**
   * Execute order with retry logic for rate limiting
   */
  private async executeOrderWithRetry(orderRequest: BinanceOrderRequest): Promise<BinanceOrder> {
    return pRetry(
      async () => {
        try {
          return await this.client.submitNewOrder(orderRequest);
        } catch (error) {
          
          if (isRetryableError(error)) {
            throw error; // This will trigger a retry
          }
          throw new AbortError(error as Error);
        }
      },
      {
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        randomize: true,
        onFailedAttempt: (error) => {
          console.error(
            `Binance order attempt ${error.attemptNumber} failed (${error.retriesLeft} retries left): ${error.message}`
          );
        },
      }
    );
  }

  /**
   * Get symbol from token pair
   */
  private getSymbolFromTokens(fromToken: Token, toToken: Token): string | null {
    const symbol = `${fromToken.symbol}${toToken.symbol}`;
    const reverseSymbol = `${toToken.symbol}${fromToken.symbol}`;
    
    if (this.symbols.has(symbol)) {
      return symbol;
    } else if (this.symbols.has(reverseSymbol)) {
      return reverseSymbol;
    }
    
    return null;
  }

  /**
   * Format quantity according to symbol precision
   */
  private formatQuantity(amount: bigint, decimals: number): string {
    const divisor = BigInt(10 ** decimals);
    const wholePart = amount / divisor;
    const fractionalPart = amount % divisor;
    
    if (fractionalPart === 0n) {
      return wholePart.toString();
    }
    
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    return `${wholePart}.${fractionalStr}`;
  }

  /**
   * Get user's trading positions (balances)
   */
  async getUserSummary(walletAddress: string): Promise<any> {
    try {
      const accountInfo = await this.getAccountInfo();
      
      // Filter out zero balances
      const nonZeroBalances = accountInfo.balances.filter(
        balance => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
      );

      return {
        walletAddress,
        balances: nonZeroBalances.map(balance => ({
          asset: balance.asset,
          free: balance.free,
          locked: balance.locked,
          total: (parseFloat(balance.free) + parseFloat(balance.locked)).toString(),
        })),
        canTrade: accountInfo.canTrade,
        canWithdraw: accountInfo.canWithdraw,
        canDeposit: accountInfo.canDeposit,
        accountType: accountInfo.accountType,
        updateTime: accountInfo.updateTime,
      };
    } catch (error) {
      throw mapBinanceError(error);
    }
  }

  /**
   * Get available tokens for trading
   */
  async getAvailableTokens(): Promise<Token[]> {
    await this.loadExchangeInfo();
    
    const tokens = new Map<string, Token>();
    
    for (const symbol of this.symbols.values()) {
      // Add base asset
      if (!tokens.has(symbol.baseAsset)) {
        tokens.set(symbol.baseAsset, {
          tokenUid: {
            chainId: 'binance-spot',
            address: symbol.baseAsset,
          },
          name: symbol.baseAsset,
          symbol: symbol.baseAsset,
          isNative: symbol.baseAsset === 'BNB',
          decimals: symbol.baseAssetPrecision,
          iconUri: `https://cryptoicons.org/api/icon/${symbol.baseAsset.toLowerCase()}`,
          isVetted: true,
        });
      }
      
      // Add quote asset
      if (!tokens.has(symbol.quoteAsset)) {
        tokens.set(symbol.quoteAsset, {
          tokenUid: {
            chainId: 'binance-spot',
            address: symbol.quoteAsset,
          },
          name: symbol.quoteAsset,
          symbol: symbol.quoteAsset,
          isNative: symbol.quoteAsset === 'BNB',
          decimals: symbol.quotePrecision,
          iconUri: `https://cryptoicons.org/api/icon/${symbol.quoteAsset.toLowerCase()}`,
          isVetted: true,
        });
      }
    }
    
    return Array.from(tokens.values());
  }
}
