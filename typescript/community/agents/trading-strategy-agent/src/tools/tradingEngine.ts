/**
 * Core trading engine — signal generation, position management, and execution logic.
 * Ported from Clarity One's battle-tested Python trading agent.
 */

import { calculateRSI, calculateEMA, calculateVolatility } from "./indicators.js";
import { getPrice, getCloses } from "./priceFeeds.js";
import type {
  TradingConfig,
  TradingPair,
  TradingState,
  Signal,
  TradeAction,
  Position,
  CycleResult,
} from "../context/types.js";

export function generateSignal(
  closes: number[],
  config: TradingConfig
): Omit<Signal, "pair"> {
  const price = closes[closes.length - 1];
  const rsi = calculateRSI(closes, config.rsiPeriod);
  const ema = calculateEMA(closes, config.emaTrendPeriod);
  const aboveEma = price > ema;

  let signal: Signal["signal"] = "neutral";
  if (rsi < config.rsiExtremeDip) {
    signal = "extreme_buy";
  } else if (rsi < config.rsiOversold && aboveEma) {
    signal = "buy";
  } else if (rsi > config.rsiOverbought) {
    signal = "sell";
  }

  return {
    price: Math.round(price * 100) / 100,
    rsi: Math.round(rsi * 100) / 100,
    ema: Math.round(ema * 100) / 100,
    signal,
    aboveEma,
  };
}

export function shouldBuy(
  signal: Signal,
  positions: Record<string, Position>
): false | "normal" | "extreme" {
  if (positions[signal.pair]) return false;
  if (signal.signal === "extreme_buy") return "extreme";
  if (signal.signal === "buy") return "normal";
  return false;
}

export function shouldSell(
  signal: Signal,
  positions: Record<string, Position>
): { sell: boolean; reason: string } {
  const pos = positions[signal.pair];
  if (!pos) return { sell: false, reason: "" };

  const pnlPct = (signal.price - pos.entry) / pos.entry;
  const highest = Math.max(pos.highest, signal.price);
  const drawdown = (highest - signal.price) / highest;

  if (signal.signal === "sell") {
    return {
      sell: true,
      reason: `RSI overbought (${signal.rsi}), PnL ${(pnlPct * 100).toFixed(1)}%`,
    };
  }

  return { sell: false, reason: "" };
}

export async function runSignalScan(
  config: TradingConfig
): Promise<Record<string, Signal>> {
  const signals: Record<string, Signal> = {};

  for (const pair of config.pairs) {
    try {
      const closes = await getCloses(pair, 100);
      if (closes.length < config.emaTrendPeriod) {
        continue;
      }
      const sig = generateSignal(closes, config);
      signals[pair.symbol] = { pair: pair.symbol, ...sig };
    } catch (e) {
      console.error(`Signal scan failed for ${pair.symbol}:`, e);
    }
    // Rate limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  return signals;
}

export async function runTradingCycle(
  config: TradingConfig,
  state: TradingState
): Promise<CycleResult> {
  const actions: TradeAction[] = [];
  const signals = await runSignalScan(config);

  for (const pair of config.pairs) {
    const signal = signals[pair.symbol];
    if (!signal) {
      actions.push({ pair: pair.symbol, action: "hold", reason: "no signal data" });
      continue;
    }

    // Check sell first
    const sellCheck = shouldSell(signal, state.positions);
    if (sellCheck.sell) {
      const pos = state.positions[pair.symbol];
      if (config.dryRun) {
        console.log(
          `[DRY-RUN] SELL ${pos.amount} ${pair.symbol} @ $${signal.price} — ${sellCheck.reason}`
        );
      }
      delete state.positions[pair.symbol];
      state.lastTrade = new Date().toISOString();
      actions.push({
        pair: pair.symbol,
        action: "sell",
        reason: sellCheck.reason,
        price: signal.price,
        amount: pos.amount,
      });
      continue;
    }

    // Check buy
    const buyCheck = shouldBuy(signal, state.positions);
    if (buyCheck) {
      const pct = buyCheck === "extreme" ? config.extremeDipPositionPct : config.positionSizePct;
      const amount = (state.equity * pct) / signal.price;

      if (config.dryRun) {
        console.log(
          `[DRY-RUN] BUY ${amount.toFixed(6)} ${pair.symbol} @ $${signal.price} — ${buyCheck === "extreme" ? "extreme dip" : "RSI oversold"}`
        );
      }

      state.positions[pair.symbol] = {
        pair: pair.symbol,
        entry: signal.price,
        amount,
        highest: signal.price,
        timestamp: new Date().toISOString(),
      };
      state.lastTrade = new Date().toISOString();
      actions.push({
        pair: pair.symbol,
        action: "buy",
        reason: buyCheck === "extreme" ? "extreme_dip" : "rsi_oversold",
        price: signal.price,
        amount,
      });
      continue;
    }

    actions.push({ pair: pair.symbol, action: "hold", reason: "no trigger" });
  }

  // Update highest prices for open positions
  for (const [sym, pos] of Object.entries(state.positions)) {
    const signal = signals[sym];
    if (signal && signal.price > pos.highest) {
      pos.highest = signal.price;
    }
  }

  state.signals = signals;

  return {
    mode: config.dryRun ? "dry-run" : "live",
    equity: state.equity,
    actions,
    signals,
    positions: state.positions,
    timestamp: new Date().toISOString(),
  };
}
