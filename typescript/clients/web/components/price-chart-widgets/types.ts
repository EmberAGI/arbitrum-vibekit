export interface CoinData {
  id: string;
  name: string;
  symbol: string;
  image: string;
}

export interface WidgetAppearanceOptions {
  lightMode: boolean;
  transparentBackground: boolean;
  outlined: boolean;
}

export interface WidgetType {
  id: string;
  name: string;
  description: string;
  scriptSrc: string;
}

export const WIDGET_TYPES: WidgetType[] = [
  {
    id: 'price-chart',
    name: 'Price Chart',
    description: 'Interactive price chart with historical data',
    scriptSrc: 'https://widgets.coingecko.com/gecko-coin-price-chart-widget.js'
  },
  {
    id: 'coin-heatmap',
    name: 'Coin Heatmap',
    description: 'Top coins by market cap in heatmap format',
    scriptSrc: 'https://widgets.coingecko.com/gecko-coin-heatmap-widget.js'
  },
  {
    id: 'coin-marquee',
    name: 'Coin Price Marquee',
    description: 'Scrolling ticker of coin prices',
    scriptSrc: 'https://widgets.coingecko.com/gecko-coin-price-marquee-widget.js'
  },
  {
    id: 'coin-list',
    name: 'Coin List',
    description: 'List view of selected coins with prices',
    scriptSrc: 'https://widgets.coingecko.com/gecko-coin-list-widget.js'
  },
  {
    id: 'coin-converter',
    name: 'Coin Converter',
    description: 'Convert between different cryptocurrencies',
    scriptSrc: 'https://widgets.coingecko.com/gecko-coin-converter-widget.js'
  },
  {
    id: 'crypto-ticker',
    name: 'Crypto Ticker',
    description: 'Live price ticker for a single cryptocurrency',
    scriptSrc: 'https://widgets.coingecko.com/gecko-coin-ticker-widget.js'
  },
  {
    id: 'coin-compare',
    name: 'Coin Compare Chart',
    description: 'Compare price performance of multiple coins',
    scriptSrc: 'https://widgets.coingecko.com/gecko-coin-compare-chart-widget.js'
  },
  {
    id: 'coin-market-ticker',
    name: 'Coin Market Ticker',
    description: 'Market ticker list for a specific coin',
    scriptSrc: 'https://widgets.coingecko.com/gecko-coin-market-ticker-list-widget.js'
  },
  {
    id: 'random-coin',
    name: 'Random Coin',
    description: 'Displays a random cryptocurrency',
    scriptSrc: 'https://widgets.coingecko.com/gecko-random-coin-widget.js'
  }
];

export const DEFAULT_COINS: CoinData[] = [
  { id: 'arbitrum', name: 'Arbitrum', symbol: 'ARB', image: 'https://assets.coingecko.com/coins/images/16547/large/arb.jpg' },
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', image: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png' },
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', image: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png' },
  { id: 'tether', name: 'Tether', symbol: 'USDT', image: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png' },
  { id: 'binancecoin', name: 'BNB', symbol: 'BNB', image: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png' },
  { id: 'solana', name: 'Solana', symbol: 'SOL', image: 'https://coin-images.coingecko.com/coins/images/4128/large/solana.png' },
  { id: 'usd-coin', name: 'USDC', symbol: 'USDC', image: 'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png' },
  { id: 'xrp', name: 'XRP', symbol: 'XRP', image: 'https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png' },
  { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE', image: 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png' },
  { id: 'cardano', name: 'Cardano', symbol: 'ADA', image: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png' },
  { id: 'avalanche-2', name: 'Avalanche', symbol: 'AVAX', image: 'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png' },
  { id: 'chainlink', name: 'Chainlink', symbol: 'LINK', image: 'https://coin-images.coingecko.com/coins/images/877/large/chainlink-new-logo.png' },
  { id: 'polkadot', name: 'Polkadot', symbol: 'DOT', image: 'https://coin-images.coingecko.com/coins/images/12171/large/polkadot.png' },
  { id: 'polygon', name: 'Polygon', symbol: 'MATIC', image: 'https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png' },
  { id: 'litecoin', name: 'Litecoin', symbol: 'LTC', image: 'https://coin-images.coingecko.com/coins/images/2/large/litecoin.png' },
  { id: 'uniswap', name: 'Uniswap', symbol: 'UNI', image: 'https://coin-images.coingecko.com/coins/images/12504/large/uniswap-uni.png' }
];
