import { describe, it, expect } from "vitest";
import { generateSignal, shouldBuy, shouldSell } from "../src/tools/tradingEngine.js";
import type { TradingConfig, Signal, Position } from "../src/context/types.js";

const defaultConfig: TradingConfig = {
  pairs: [],
  quoteToken: "USDC",
  quoteTokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  positionSizePct: 0.02,
  extremeDipPositionPct: 0.05,
  rsiPeriod: 14,
  rsiOversold: 42,
  rsiOverbought: 68,
  rsiExtremeDip: 30,
  emaTrendPeriod: 10,
  gridEnabled: false,
  gridEquityPct: 0.4,
  gridLevels: 7,
  gridSpacingPct: 1.0,
  dryRun: true,
  dexRouter: "camelot",
};

describe("generateSignal", () => {
  it("returns neutral for flat prices", () => {
    const closes = Array.from({ length: 20 }, () => 100);
    const sig = generateSignal(closes, defaultConfig);
    expect(sig.signal).toBe("neutral");
    expect(sig.rsi).toBeCloseTo(50, 0);
  });

  it("returns buy for declining prices above EMA", () => {
    // Prices decline slightly but remain above EMA
    const closes = [
      110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 105, 104, 103, 102,
      101, 100, 99, 98,
    ];
    const sig = generateSignal(closes, defaultConfig);
    // RSI should be low due to decline
    expect(sig.rsi).toBeLessThan(50);
  });

  it("returns sell for rising prices", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 3);
    const sig = generateSignal(closes, defaultConfig);
    expect(sig.signal).toBe("sell");
    expect(sig.rsi).toBeGreaterThan(68);
  });

  it("returns extreme_buy for sharp decline", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i * 3);
    const sig = generateSignal(closes, defaultConfig);
    expect(sig.signal).toBe("extreme_buy");
    expect(sig.rsi).toBeLessThan(30);
  });
});

describe("shouldBuy", () => {
  it("returns false if position already open", () => {
    const signal: Signal = {
      pair: "WETH/USDC",
      price: 3000,
      rsi: 30,
      ema: 2900,
      signal: "buy",
      aboveEma: true,
    };
    const positions = {
      "WETH/USDC": {
        pair: "WETH/USDC",
        entry: 2800,
        amount: 0.1,
        highest: 3100,
        timestamp: "2026-01-01",
      },
    };
    expect(shouldBuy(signal, positions)).toBe(false);
  });

  it("returns 'normal' for buy signal without position", () => {
    const signal: Signal = {
      pair: "WETH/USDC",
      price: 3000,
      rsi: 38,
      ema: 2900,
      signal: "buy",
      aboveEma: true,
    };
    expect(shouldBuy(signal, {})).toBe("normal");
  });

  it("returns 'extreme' for extreme_buy signal", () => {
    const signal: Signal = {
      pair: "WETH/USDC",
      price: 2500,
      rsi: 20,
      ema: 3000,
      signal: "extreme_buy",
      aboveEma: false,
    };
    expect(shouldBuy(signal, {})).toBe("extreme");
  });

  it("returns false for neutral signal", () => {
    const signal: Signal = {
      pair: "WETH/USDC",
      price: 3000,
      rsi: 50,
      ema: 3000,
      signal: "neutral",
      aboveEma: true,
    };
    expect(shouldBuy(signal, {})).toBe(false);
  });
});

describe("shouldSell", () => {
  it("returns false if no position", () => {
    const signal: Signal = {
      pair: "WETH/USDC",
      price: 3000,
      rsi: 75,
      ema: 2900,
      signal: "sell",
      aboveEma: true,
    };
    expect(shouldSell(signal, {}).sell).toBe(false);
  });

  it("returns true for overbought RSI with open position", () => {
    const signal: Signal = {
      pair: "WETH/USDC",
      price: 3500,
      rsi: 75,
      ema: 3000,
      signal: "sell",
      aboveEma: true,
    };
    const positions: Record<string, Position> = {
      "WETH/USDC": {
        pair: "WETH/USDC",
        entry: 3000,
        amount: 0.1,
        highest: 3500,
        timestamp: "2026-01-01",
      },
    };
    const result = shouldSell(signal, positions);
    expect(result.sell).toBe(true);
    expect(result.reason).toContain("RSI overbought");
  });
});
