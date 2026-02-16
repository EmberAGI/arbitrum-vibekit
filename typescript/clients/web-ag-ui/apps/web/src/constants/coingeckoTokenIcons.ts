import { normalizeSymbolKey } from '../utils/iconResolution';

// Coingecko-hosted token images are fast and cache well in the browser.
// Keep this intentionally small and explicit; expand as we support more protocols.
const RAW_ICON_BY_SYMBOL: Record<string, string> = {
  GMX: 'https://coin-images.coingecko.com/coins/images/18323/large/arbit.png',
  PENDLE: 'https://coin-images.coingecko.com/coins/images/15069/large/Pendle_Logo_Normal-03.png',
  GRAIL: 'https://coin-images.coingecko.com/coins/images/28416/large/vj5DIMhP_400x400.jpeg',
  ALLO: 'https://coin-images.coingecko.com/coins/images/70609/large/allo-token.png',
  USDC: 'https://raw.githubusercontent.com/0xsquid/assets/main/images/tokens/usdc.svg',
  WETH: 'https://raw.githubusercontent.com/axelarnetwork/axelar-configs/main/images/tokens/weth.svg',
  WBTC: 'https://raw.githubusercontent.com/0xsquid/assets/main/images/tokens/wbtc.svg',
  USDAI:
    'https://ugc.production.linktr.ee/a1498c83-3943-498b-a48f-4813ce5be806_939bf430-31eb-4fc6-8e0a-9b1e6dd56a40.jpeg?io=true&size=avatar-v3_0',
  SUSDAI: 'https://coin-images.coingecko.com/coins/images/55861/large/sUSDai_Token_Full_Glyph.png',
};

export const COINGECKO_TOKEN_ICON_BY_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(RAW_ICON_BY_SYMBOL).map(([symbol, uri]) => [normalizeSymbolKey(symbol), uri]),
);
