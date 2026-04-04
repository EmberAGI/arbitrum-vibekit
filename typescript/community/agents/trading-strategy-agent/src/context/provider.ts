import { TradingConfig, TradingPair, TradingState } from "./types.js";

const ARBITRUM_TOKENS: Record<string, `0x${string}`> = {
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  ARB: "0x912CE59144191C1204E64559FE8253a0e49E6548",
  GMX: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
  PENDLE: "0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8",
  LINK: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
  UNI: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
};

function parsePairs(pairsStr: string, quoteAddr: `0x${string}`): TradingPair[] {
  return pairsStr.split(",").map((p) => {
    const [base, quote] = p.trim().split("/");
    return {
      base,
      quote,
      baseAddress: ARBITRUM_TOKENS[base] || ("0x0" as `0x${string}`),
      quoteAddress: quoteAddr,
      symbol: `${base}/${quote}`,
    };
  });
}

export function loadConfig(): TradingConfig {
  const quoteAddr = (process.env.QUOTE_TOKEN_ADDRESS ||
    ARBITRUM_TOKENS.USDC) as `0x${string}`;

  return {
    pairs: parsePairs(
      process.env.TRADING_PAIRS || "WETH/USDC,ARB/USDC,GMX/USDC",
      quoteAddr
    ),
    quoteToken: process.env.QUOTE_TOKEN || "USDC",
    quoteTokenAddress: quoteAddr,
    positionSizePct: parseFloat(process.env.POSITION_SIZE_PCT || "0.02"),
    extremeDipPositionPct: parseFloat(
      process.env.EXTREME_DIP_POSITION_PCT || "0.05"
    ),
    rsiPeriod: parseInt(process.env.RSI_PERIOD || "14"),
    rsiOversold: parseFloat(process.env.RSI_OVERSOLD || "42"),
    rsiOverbought: parseFloat(process.env.RSI_OVERBOUGHT || "68"),
    rsiExtremeDip: parseFloat(process.env.RSI_EXTREME_DIP || "30"),
    emaTrendPeriod: parseInt(process.env.EMA_TREND_PERIOD || "50"),
    gridEnabled: process.env.GRID_ENABLED !== "false",
    gridEquityPct: parseFloat(process.env.GRID_EQUITY_PCT || "0.40"),
    gridLevels: parseInt(process.env.GRID_LEVELS || "7"),
    gridSpacingPct: parseFloat(process.env.GRID_SPACING_PCT || "1.0"),
    dryRun: process.env.DRY_RUN !== "false",
    dexRouter: (process.env.DEX_ROUTER as TradingConfig["dexRouter"]) || "camelot",
  };
}

export function createInitialState(): TradingState {
  return {
    positions: {},
    lastTrade: null,
    equity: 0,
    signals: {},
  };
}
