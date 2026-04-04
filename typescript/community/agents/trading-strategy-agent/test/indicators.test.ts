import { describe, it, expect } from "vitest";
import {
  calculateRSI,
  calculateEMA,
  calculateSMA,
  calculateBollingerBands,
  calculateVolatility,
} from "../src/tools/indicators.js";

describe("calculateRSI", () => {
  it("returns 50 for insufficient data", () => {
    expect(calculateRSI([100, 101, 102], 14)).toBe(50);
  });

  it("returns 100 for all-gains sequence", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(calculateRSI(closes, 14)).toBe(100);
  });

  it("returns value between 0-100 for mixed data", () => {
    const closes = [
      100, 102, 101, 103, 99, 104, 98, 105, 97, 106, 100, 103, 101, 104, 99,
      105, 98, 103,
    ];
    const rsi = calculateRSI(closes, 14);
    expect(rsi).toBeGreaterThan(0);
    expect(rsi).toBeLessThan(100);
  });

  it("detects oversold conditions", () => {
    // Steadily declining prices
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i * 2);
    const rsi = calculateRSI(closes, 14);
    expect(rsi).toBeLessThan(30);
  });

  it("detects overbought conditions", () => {
    // Steadily rising prices
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
    const rsi = calculateRSI(closes, 14);
    expect(rsi).toBeGreaterThan(70);
  });
});

describe("calculateEMA", () => {
  it("returns last price for insufficient data", () => {
    expect(calculateEMA([100, 101], 50)).toBe(101);
  });

  it("calculates correctly for simple series", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const ema = calculateEMA(closes, 10);
    expect(ema).toBeGreaterThan(100);
    expect(ema).toBeLessThan(120);
  });

  it("tracks recent prices more closely than SMA", () => {
    const closes = [
      ...Array.from({ length: 15 }, () => 100),
      110, 110, 110, 110, 110,
    ];
    const ema = calculateEMA(closes, 10);
    const sma = calculateSMA(closes, 10);
    // EMA should be closer to 110 than SMA for a recent jump
    expect(ema).toBeGreaterThan(sma);
  });
});

describe("calculateBollingerBands", () => {
  it("returns symmetric bands for stable prices", () => {
    const closes = Array.from({ length: 25 }, () => 100);
    const bb = calculateBollingerBands(closes, 20);
    expect(bb.middle).toBe(100);
    expect(bb.upper).toBe(100); // no volatility = no band width
    expect(bb.lower).toBe(100);
  });

  it("widens bands for volatile prices", () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const bb = calculateBollingerBands(closes, 20);
    expect(bb.upper).toBeGreaterThan(bb.middle);
    expect(bb.lower).toBeLessThan(bb.middle);
    expect(bb.width).toBeGreaterThan(0);
  });
});

describe("calculateVolatility", () => {
  it("returns 0 for insufficient data", () => {
    expect(calculateVolatility([100], 14)).toBe(0);
  });

  it("returns 0 for constant prices", () => {
    const closes = Array.from({ length: 20 }, () => 100);
    expect(calculateVolatility(closes, 14)).toBe(0);
  });

  it("returns positive value for volatile prices", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + (i % 2 === 0 ? 10 : -10));
    const vol = calculateVolatility(closes, 14);
    expect(vol).toBeGreaterThan(0);
  });
});
