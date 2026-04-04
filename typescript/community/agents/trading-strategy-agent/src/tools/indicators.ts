/**
 * Technical analysis indicators for trading signals.
 * Pure functions — no side effects, fully testable.
 */

export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50.0;

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    gains.push(Math.max(0, delta));
    losses.push(Math.max(0, -delta));
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0 && avgGain === 0) return 50.0;
  if (avgLoss === 0) return 100.0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];

  const multiplier = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }
  return ema;
}

export function calculateSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1];
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): { upper: number; middle: number; lower: number; width: number } {
  const sma = calculateSMA(closes, period);
  const slice = closes.slice(-period);
  const variance =
    slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: sma + stdDevMultiplier * stdDev,
    middle: sma,
    lower: sma - stdDevMultiplier * stdDev,
    width: ((sma + stdDevMultiplier * stdDev - (sma - stdDevMultiplier * stdDev)) / sma) * 100,
  };
}

export function calculateVolatility(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 0;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const recentReturns = returns.slice(-period);
  const mean = recentReturns.reduce((a, b) => a + b, 0) / period;
  const variance =
    recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / period;
  return Math.sqrt(variance) * Math.sqrt(365) * 100; // annualized %
}
