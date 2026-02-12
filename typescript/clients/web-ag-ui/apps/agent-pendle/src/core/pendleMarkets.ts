import type { Token, TokenizedYieldMarket } from '../clients/onchainActions.js';
import type { PendleYieldToken } from '../domain/types.js';

import { rankYieldTokens } from './pendleDecision.js';

const normalizeHex = (value: string): string => value.toLowerCase();

const tokenKey = (token: Token): string =>
  `${token.tokenUid.chainId}:${normalizeHex(token.tokenUid.address)}`;

const readNumeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readApyPct = (details: Record<string, unknown>, key: string): number | undefined => {
  if (!Object.prototype.hasOwnProperty.call(details, key)) {
    return undefined;
  }
  const raw = details[key];
  // The localhost onchain-actions API returns APYs as fractions (e.g. 0.1788 for 17.88%).
  // Older fixtures/tests in this repo use strings that already represent percentages.
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1 ? raw * 100 : raw;
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    // Some APIs may serialize fractions as strings (e.g. "0.1788"). Keep the heuristic
    // aligned with the numeric branch, while preserving percent fixtures like "7.25".
    const trimmed = raw.trim();
    if (parsed < 1 && trimmed.startsWith('0')) {
      return parsed * 100;
    }
    return parsed;
  }
  const parsed = readNumeric(raw);
  return parsed ?? undefined;
};

const resolveApy = (market: TokenizedYieldMarket): number => {
  const details = market.details;
  const keys = [
    'impliedApy',
    'aggregatedApy',
    'pendleApy',
    'underlyingApy',
    'ytFloatingApy',
    'apy',
  ];
  for (const key of keys) {
    const value = readApyPct(details, key);
    if (value !== undefined) {
      return value;
    }
  }
  return 0;
};

export const toYieldToken = (market: TokenizedYieldMarket): PendleYieldToken => ({
  marketAddress: normalizeHex(market.marketIdentifier.address) as `0x${string}`,
  ptAddress: normalizeHex(market.ptToken.tokenUid.address) as `0x${string}`,
  ytAddress: normalizeHex(market.ytToken.tokenUid.address) as `0x${string}`,
  ptSymbol: market.ptToken.symbol,
  ytSymbol: market.ytToken.symbol,
  underlyingSymbol: market.underlyingToken.symbol,
  apy: resolveApy(market),
  impliedApyPct: readApyPct(market.details, 'impliedApy'),
  underlyingApyPct: readApyPct(market.details, 'underlyingApy'),
  pendleApyPct: readApyPct(market.details, 'pendleApy'),
  aggregatedApyPct: readApyPct(market.details, 'aggregatedApy'),
  swapFeeApyPct: readApyPct(market.details, 'swapFeeApy'),
  ytFloatingApyPct: readApyPct(market.details, 'ytFloatingApy'),
  maxBoostedApyPct: readApyPct(market.details, 'maxBoostedApy'),
  maturity: market.expiry,
});

export function buildEligibleYieldTokens(params: {
  markets: readonly TokenizedYieldMarket[];
  supportedTokens: readonly Token[];
  whitelistSymbols: readonly string[];
}): PendleYieldToken[] {
  const supportedTokenKeys = new Set(params.supportedTokens.map(tokenKey));

  const eligible = params.markets.filter((market) => {
    if (!params.whitelistSymbols.includes(market.underlyingToken.symbol)) {
      return false;
    }
    return supportedTokenKeys.has(tokenKey(market.underlyingToken));
  });

  return rankYieldTokens(eligible.map(toYieldToken));
}
