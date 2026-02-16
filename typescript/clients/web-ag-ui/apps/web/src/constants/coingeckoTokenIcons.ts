import { normalizeSymbolKey } from '../utils/iconResolution';

// Coingecko-hosted token images are fast and cache well in the browser.
// Keep this intentionally small and explicit; expand as we support more protocols.
const RAW_ICON_BY_SYMBOL: Record<string, string> = {
  GMX: 'https://coin-images.coingecko.com/coins/images/18323/large/arbit.png',
  PENDLE: 'https://coin-images.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png',
  GRAIL: 'https://coin-images.coingecko.com/coins/images/28416/large/vj5DIMhP_400x400.jpeg',
  ALLO: 'https://coin-images.coingecko.com/coins/images/70609/large/allo-token.png',
};

export const COINGECKO_TOKEN_ICON_BY_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_ICON_BY_SYMBOL).map(([symbol, uri]) => [normalizeSymbolKey(symbol), uri]),
);

