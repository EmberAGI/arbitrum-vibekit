/**
 * Binance-specific types and interfaces for spot trading
 */

export interface BinanceAdapterParams {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
  useMMSubdomain?: boolean;
}

export interface BinanceSymbol {
  symbol: string;
  baseAsset: string;
  baseAssetPrecision: number;
  quoteAsset: string;
  quotePrecision: number;
  status: string;
  isSpotTradingAllowed: boolean;
  isMarginTradingAllowed: boolean;
  filters: Array<{
    filterType: string;
    [key: string]: any;
  }>;
}

export interface BinanceOrderBook {
  lastUpdateId: number;
  bids: Array<[string, string]>;
  asks: Array<[string, string]>;
}

export interface BinanceAccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
  permissions: string[];
}

export interface BinanceOrder {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice: string;
  icebergQty: string;
  time: number;
  updateTime: number;
  isWorking: boolean;
  origQuoteOrderQty: string;
}

export interface BinanceOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET' | 'STOP_LOSS' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT' | 'LIMIT_MAKER';
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  quantity?: string;
  quoteOrderQty?: string;
  price?: string;
  newClientOrderId?: string;
  stopPrice?: string;
  icebergQty?: string;
  newOrderRespType?: 'ACK' | 'RESULT' | 'FULL';
  recvWindow?: number;
  timestamp: number;
}

export interface BinanceError {
  code: number;
  msg: string;
}

export interface BinanceRateLimit {
  rateLimitType: string;
  interval: string;
  intervalNum: number;
  limit: number;
  count: number;
}
