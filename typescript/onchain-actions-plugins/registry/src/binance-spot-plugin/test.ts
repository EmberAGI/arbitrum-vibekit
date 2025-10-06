/**
 * Test file for Binance Spot Plugin
 * This is a basic test to verify the plugin structure and basic functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getBinanceSpotPlugin, getBinanceSpotActions } from './index.js';
import { BinanceSpotAdapter } from './adapter.js';
import { mapBinanceError, BinanceError } from './errors.js';

// Mock the Binance SDK
vi.mock('binance', () => ({
  MainClient: vi.fn().mockImplementation(() => ({
    getExchangeInfo: vi.fn().mockResolvedValue({
      symbols: [
        {
          symbol: 'BTCUSDT',
          baseAsset: 'BTC',
          baseAssetPrecision: 8,
          quoteAsset: 'USDT',
          quotePrecision: 8,
          status: 'TRADING',
          isSpotTradingAllowed: true,
          isMarginTradingAllowed: true,
          filters: [],
        },
        {
          symbol: 'ETHUSDT',
          baseAsset: 'ETH',
          baseAssetPrecision: 8,
          quoteAsset: 'USDT',
          quotePrecision: 8,
          status: 'TRADING',
          isSpotTradingAllowed: true,
          isMarginTradingAllowed: true,
          filters: [],
        },
      ],
    }),
    getAccountInfo: vi.fn().mockResolvedValue({
      makerCommission: 0,
      takerCommission: 0,
      buyerCommission: 0,
      sellerCommission: 0,
      canTrade: true,
      canWithdraw: true,
      canDeposit: true,
      updateTime: Date.now(),
      accountType: 'SPOT',
      balances: [
        { asset: 'BTC', free: '1.0', locked: '0.0' },
        { asset: 'USDT', free: '10000.0', locked: '0.0' },
      ],
      permissions: ['SPOT'],
    }),
    getSymbolPriceTicker: vi.fn().mockResolvedValue({
      symbol: 'BTCUSDT',
      price: '50000.00',
    }),
    submitNewOrder: vi.fn().mockResolvedValue({
      symbol: 'BTCUSDT',
      orderId: 12345,
      orderListId: -1,
      clientOrderId: 'test-order',
      price: '0.00000000',
      origQty: '0.00100000',
      executedQty: '0.00100000',
      cummulativeQuoteQty: '50.00000000',
      status: 'FILLED',
      timeInForce: 'GTC',
      type: 'MARKET',
      side: 'BUY',
      stopPrice: '0.00000000',
      icebergQty: '0.00000000',
      time: Date.now(),
      updateTime: Date.now(),
      isWorking: false,
      origQuoteOrderQty: '0.00000000',
    }),
  })),
}));

describe('Binance Spot Plugin', () => {
  const mockParams = {
    apiKey: 'test-api-key',
    apiSecret: 'test-api-secret',
    testnet: true,
  };

  describe('Plugin Creation', () => {
    it('should create a valid plugin', async () => {
      const plugin = await getBinanceSpotPlugin(mockParams);
      
      expect(plugin).toBeDefined();
      expect(plugin.type).toBe('swap');
      expect(plugin.name).toContain('Binance Spot Trading');
      expect(plugin.actions).toBeDefined();
      expect(plugin.queries).toBeDefined();
    });

    it('should have correct plugin metadata', async () => {
      const plugin = await getBinanceSpotPlugin(mockParams);
      
      expect(plugin.id).toBe('BINANCE_SPOT_TESTNET');
      expect(plugin.description).toBe('Binance spot trading protocol for cryptocurrency swaps');
      expect(plugin.website).toBe('https://www.binance.com');
      expect(plugin.x).toBe('https://x.com/binance');
    });
  });

  describe('Actions', () => {
    it('should create swap actions', async () => {
      const adapter = new BinanceSpotAdapter(mockParams);
      const actions = await getBinanceSpotActions(adapter);
      
      expect(actions).toHaveLength(1);
      expect(actions[0].type).toBe('swap');
      expect(actions[0].name).toBe('Binance Spot Trading');
      expect(actions[0].callback).toBeDefined();
    });

    it('should have input and output tokens', async () => {
      const adapter = new BinanceSpotAdapter(mockParams);
      const actions = await getBinanceSpotActions(adapter);
      
      const inputTokens = await actions[0].inputTokens();
      const outputTokens = await actions[0].outputTokens();
      
      expect(inputTokens).toBeDefined();
      expect(outputTokens).toBeDefined();
      expect(inputTokens[0].chainId).toBe('binance-spot');
      expect(outputTokens[0].chainId).toBe('binance-spot');
    });
  });

  describe('Adapter', () => {
    let adapter: BinanceSpotAdapter;

    beforeEach(() => {
      adapter = new BinanceSpotAdapter(mockParams);
    });

    it('should initialize correctly', () => {
      expect(adapter).toBeDefined();
    });

    it('should load exchange info', async () => {
      await adapter.loadExchangeInfo();
      const symbols = await adapter.getAvailableSymbols();
      
      expect(symbols).toHaveLength(2);
      expect(symbols[0].symbol).toBe('BTCUSDT');
      expect(symbols[1].symbol).toBe('ETHUSDT');
    });

    it('should get account info', async () => {
      const accountInfo = await adapter.getAccountInfo();
      
      expect(accountInfo.canTrade).toBe(true);
      expect(accountInfo.balances).toHaveLength(2);
      expect(accountInfo.balances[0].asset).toBe('BTC');
    });

    it('should get current price', async () => {
      const price = await adapter.getCurrentPrice('BTCUSDT');
      
      expect(price.symbol).toBe('BTCUSDT');
      expect(price.price).toBe('50000.00');
    });

    it('should get available tokens', async () => {
      const tokens = await adapter.getAvailableTokens();
      
      expect(tokens).toHaveLength(3); // BTC, ETH, USDT
      expect(tokens.find(t => t.symbol === 'BTC')).toBeDefined();
      expect(tokens.find(t => t.symbol === 'ETH')).toBeDefined();
      expect(tokens.find(t => t.symbol === 'USDT')).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should map Binance errors correctly', () => {
      const error = { code: -2010, msg: 'Account has insufficient balance' };
      const mappedError = mapBinanceError(error);
      
      expect(mappedError).toBeInstanceOf(BinanceError);
      expect(mappedError.code).toBe(-2010);
      expect(mappedError.binanceMsg).toBe('Account has insufficient balance');
    });

    it('should handle unknown errors', () => {
      const error = { code: -9999, msg: 'Unknown error' };
      const mappedError = mapBinanceError(error);
      
      expect(mappedError).toBeInstanceOf(BinanceError);
      expect(mappedError.code).toBe(-9999);
    });
  });
});
