export interface TradingConfig {
  pairs: TradingPair[];
  quoteToken: string;
  quoteTokenAddress: `0x${string}`;
  positionSizePct: number;
  extremeDipPositionPct: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  rsiExtremeDip: number;
  emaTrendPeriod: number;
  gridEnabled: boolean;
  gridEquityPct: number;
  gridLevels: number;
  gridSpacingPct: number;
  dryRun: boolean;
  dexRouter: "camelot" | "uniswap-v3" | "odos";
}

export interface TradingPair {
  base: string;
  quote: string;
  baseAddress: `0x${string}`;
  quoteAddress: `0x${string}`;
  symbol: string;
}

export interface Position {
  pair: string;
  entry: number;
  amount: number;
  highest: number;
  timestamp: string;
}

export interface Signal {
  pair: string;
  price: number;
  rsi: number;
  ema: number;
  signal: "extreme_buy" | "buy" | "sell" | "neutral";
  aboveEma: boolean;
}

export interface TradeAction {
  pair: string;
  action: "buy" | "sell" | "hold";
  reason: string;
  price?: number;
  amount?: number;
}

export interface TradingState {
  positions: Record<string, Position>;
  lastTrade: string | null;
  equity: number;
  signals: Record<string, Signal>;
}

export interface GridLevel {
  level: number;
  price: number;
  amount: number;
  filled: boolean;
}

export interface CycleResult {
  mode: "dry-run" | "live";
  equity: number;
  actions: TradeAction[];
  signals: Record<string, Signal>;
  positions: Record<string, Position>;
  timestamp: string;
}
