/**
 * Trading skill — exposes signal scanning, cycle execution, and position management
 * as Vibekit skill tools for the AI agent.
 */

import { loadConfig } from "../context/provider.js";
import { runSignalScan, runTradingCycle } from "../tools/tradingEngine.js";
import { calculateVolatility, calculateBollingerBands } from "../tools/indicators.js";
import { getCloses, getPrice } from "../tools/priceFeeds.js";
import type { TradingState } from "../context/types.js";

let state: TradingState = {
  positions: {},
  lastTrade: null,
  equity: parseFloat(process.env.INITIAL_EQUITY || "1000"),
  signals: {},
};

const config = loadConfig();

export const tradingSkill = {
  name: "trading",
  description:
    "RSI/EMA mean-reversion trading strategy for Arbitrum DEXes. " +
    "Scans for oversold/overbought conditions, executes entries/exits, " +
    "and manages positions with configurable risk parameters.",

  tools: [
    {
      name: "get_signals",
      description:
        "Scan all configured trading pairs for RSI/EMA signals. " +
        "Returns buy/sell/neutral signal with indicator values for each pair.",
      parameters: {},
      handler: async () => {
        const signals = await runSignalScan(config);
        state.signals = signals;
        return {
          pairs: config.pairs.map((p) => p.symbol),
          signals,
          config: {
            rsiOversold: config.rsiOversold,
            rsiOverbought: config.rsiOverbought,
            rsiExtremeDip: config.rsiExtremeDip,
            emaTrendPeriod: config.emaTrendPeriod,
          },
        };
      },
    },
    {
      name: "run_cycle",
      description:
        "Execute one full trading cycle: scan signals, evaluate positions, " +
        "execute buys/sells based on RSI mean-reversion strategy. " +
        "Dry-run by default — no real trades unless DRY_RUN=false.",
      parameters: {},
      handler: async () => {
        return runTradingCycle(config, state);
      },
    },
    {
      name: "get_positions",
      description:
        "Get all open positions with entry price, current P&L, and risk metrics.",
      parameters: {},
      handler: async () => {
        const positions: Record<string, unknown> = {};
        for (const [sym, pos] of Object.entries(state.positions)) {
          const pair = config.pairs.find((p) => p.symbol === sym);
          if (!pair) continue;
          try {
            const currentPrice = await getPrice(pair);
            const pnlPct = ((currentPrice - pos.entry) / pos.entry) * 100;
            const drawdown = ((pos.highest - currentPrice) / pos.highest) * 100;
            positions[sym] = {
              ...pos,
              currentPrice,
              pnlPct: Math.round(pnlPct * 100) / 100,
              drawdownPct: Math.round(drawdown * 100) / 100,
              value: pos.amount * currentPrice,
            };
          } catch {
            positions[sym] = { ...pos, error: "price fetch failed" };
          }
        }
        return {
          mode: config.dryRun ? "dry-run" : "live",
          equity: state.equity,
          positionCount: Object.keys(state.positions).length,
          positions,
          lastTrade: state.lastTrade,
        };
      },
    },
    {
      name: "get_market_overview",
      description:
        "Get a comprehensive market overview: prices, volatility, Bollinger Bands, " +
        "and trend analysis for all trading pairs.",
      parameters: {},
      handler: async () => {
        const overview: Record<string, unknown> = {};
        for (const pair of config.pairs) {
          try {
            const closes = await getCloses(pair, 100);
            const price = closes[closes.length - 1];
            const volatility = calculateVolatility(closes);
            const bb = calculateBollingerBands(closes);
            overview[pair.symbol] = {
              price: Math.round(price * 100) / 100,
              volatility: Math.round(volatility * 100) / 100,
              bollingerBands: {
                upper: Math.round(bb.upper * 100) / 100,
                middle: Math.round(bb.middle * 100) / 100,
                lower: Math.round(bb.lower * 100) / 100,
                widthPct: Math.round(bb.width * 100) / 100,
              },
              priceVsBB:
                price > bb.upper
                  ? "above_upper"
                  : price < bb.lower
                    ? "below_lower"
                    : "within_bands",
            };
          } catch {
            overview[pair.symbol] = { error: "data fetch failed" };
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        return overview;
      },
    },
    {
      name: "get_status",
      description:
        "Get full agent status: configuration, positions, last signals, and execution mode.",
      parameters: {},
      handler: async () => ({
        mode: config.dryRun ? "dry-run" : "live",
        equity: state.equity,
        pairs: config.pairs.map((p) => p.symbol),
        positionCount: Object.keys(state.positions).length,
        lastTrade: state.lastTrade,
        strategy: {
          rsiPeriod: config.rsiPeriod,
          rsiOversold: config.rsiOversold,
          rsiOverbought: config.rsiOverbought,
          rsiExtremeDip: config.rsiExtremeDip,
          emaTrendPeriod: config.emaTrendPeriod,
          positionSizePct: config.positionSizePct,
          gridEnabled: config.gridEnabled,
          gridLevels: config.gridLevels,
          gridSpacingPct: config.gridSpacingPct,
        },
        dexRouter: config.dexRouter,
      }),
    },
  ],
};
