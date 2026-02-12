import type { PerpetualMarket } from '../clients/onchainActions.js';

type MarketSelectionParams = {
  markets: PerpetualMarket[];
  baseSymbol: string;
  quoteSymbol: string;
};

export function selectGmxPerpetualMarket(
  params: MarketSelectionParams,
): PerpetualMarket | undefined {
  const base = params.baseSymbol.toUpperCase();
  const quote = params.quoteSymbol.toUpperCase();
  const quotes = quote === 'USDC' ? ['USDC', 'USD'] : [quote];

  return params.markets.find((market) => {
    const name = market.name.toUpperCase().replaceAll(' ', '');
    const nameMatches = quotes.some((q) => {
      const patterns = [`${base}/${q}`, `${base}-${q}`, `${base}_${q}`, `${base}${q}`];
      return patterns.some((pattern) => name.includes(pattern));
    });
    if (nameMatches) {
      return true;
    }

    if (!market.indexToken || !market.longToken || !market.shortToken) {
      return false;
    }
    const index = market.indexToken.symbol.toUpperCase();
    const longToken = market.longToken.symbol.toUpperCase();
    const shortToken = market.shortToken.symbol.toUpperCase();
    const matchesSymbols = index === base && (quotes.includes(longToken) || quotes.includes(shortToken));
    // onchain-actions aggregates markets across plugins; GMX market names are not guaranteed
    // to include "GMX" (GMX SDK typically returns names like "BTC/USD").
    return matchesSymbols;
  });
}
