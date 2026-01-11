#!/usr/bin/env npx tsx
/**
 * Test Buy Prices Script
 *
 * Fetches and displays BUY prices (best ask) for YES and NO tokens.
 * This is the price you would PAY to buy tokens.
 *
 * IMPORTANT: Polymarket CLOB API 'side' parameter refers to the ORDER's side, NOT user action:
 * - side=buy  -> BID price (orders wanting to BUY = what YOU receive when SELLING)
 * - side=sell -> ASK price (orders wanting to SELL = what YOU pay when BUYING)
 *
 * For cross-arbitrage (buying both YES and NO), use ASK prices (side=sell).
 *
 * Usage:
 *   npx tsx scripts/test-buy-prices.ts
 */

const CLOB_URL = 'https://clob.polymarket.com';
const GAMMA_URL = 'https://gamma-api.polymarket.com';

interface GammaMarket {
  id: string;
  question: string;
  clobTokenIds: string;
  active: boolean;
  closed: boolean;
}

interface PriceResponse {
  price?: string;
}

interface MidpointResponse {
  mid?: string;
}

async function fetchPrice(tokenId: string, side: 'buy' | 'sell'): Promise<number> {
  try {
    const res = await fetch(`${CLOB_URL}/price?token_id=${tokenId}&side=${side}`);
    if (!res.ok) return 0;
    const data = (await res.json()) as PriceResponse;
    return parseFloat(data.price ?? '0');
  } catch {
    return 0;
  }
}

async function fetchMidpoint(tokenId: string): Promise<number> {
  try {
    const res = await fetch(`${CLOB_URL}/midpoint?token_id=${tokenId}`);
    if (!res.ok) return 0;
    const data = (await res.json()) as MidpointResponse;
    return parseFloat(data.mid ?? '0');
  } catch {
    return 0;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  POLYMARKET BUY PRICE VERIFICATION');
  console.log('='.repeat(70));
  console.log();
  console.log('Price Types (API side parameter = order side, not user action):');
  console.log('  side=sell -> ASK = What you PAY to buy tokens');
  console.log('  side=buy  -> BID = What you GET when selling tokens');
  console.log('  Midpoint  = Average of BID and ASK');
  console.log();
  console.log('For ARBITRAGE, you want ASK prices (side=sell) to know what you PAY');
  console.log('='.repeat(70));
  console.log();

  // Fetch some markets
  const res = await fetch(`${GAMMA_URL}/markets?closed=false&limit=5`);
  const markets = (await res.json()) as GammaMarket[];

  for (const market of markets) {
    if (!market.active || market.closed) continue;

    let tokens: { yes: string; no: string };
    try {
      const parsed = JSON.parse(market.clobTokenIds) as string[];
      if (parsed.length < 2) continue;
      tokens = { yes: parsed[0]!, no: parsed[1]! };
    } catch {
      continue;
    }

    console.log(`Market: ${market.question.substring(0, 60)}...`);
    console.log(`  YES Token: ${tokens.yes.substring(0, 25)}...`);
    console.log(`  NO Token:  ${tokens.no.substring(0, 25)}...`);
    console.log();

    // Fetch all prices
    const [yesBuy, yesSell, yesMid, noBuy, noSell, noMid] = await Promise.all([
      fetchPrice(tokens.yes, 'buy'),
      fetchPrice(tokens.yes, 'sell'),
      fetchMidpoint(tokens.yes),
      fetchPrice(tokens.no, 'buy'),
      fetchPrice(tokens.no, 'sell'),
      fetchMidpoint(tokens.no),
    ]);

    console.log('  +----------+----------+----------+----------+');
    console.log('  |  Token   |   BUY    |   SELL   |   MID    |');
    console.log('  +----------+----------+----------+----------+');
    console.log(`  |   YES    |  ${yesBuy.toFixed(4).padStart(6)}  |  ${yesSell.toFixed(4).padStart(6)}  |  ${yesMid.toFixed(4).padStart(6)}  |`);
    console.log(`  |   NO     |  ${noBuy.toFixed(4).padStart(6)}  |  ${noSell.toFixed(4).padStart(6)}  |  ${noMid.toFixed(4).padStart(6)}  |`);
    console.log('  +----------+----------+----------+----------+');
    console.log();

    // Calculate spreads
    const buySpread = 1 - (yesBuy + noBuy);
    const sellSpread = 1 - (yesSell + noSell);
    const midSpread = 1 - (yesMid + noMid);

    console.log('  Spreads (1 - YES - NO):');
    console.log(`    BUY spread:  ${(buySpread * 100).toFixed(2)}% ${buySpread > 0 ? '(profit if you BUY both)' : '(no arbitrage)'}`);
    console.log(`    SELL spread: ${(sellSpread * 100).toFixed(2)}%`);
    console.log(`    MID spread:  ${(midSpread * 100).toFixed(2)}%`);
    console.log();

    // Explain what prices mean
    if (yesBuy === 0) {
      console.log('  NOTE: YES BUY = 0 means NO SELLERS for YES tokens');
    }
    if (noBuy === 0) {
      console.log('  NOTE: NO BUY = 0 means NO SELLERS for NO tokens');
    }

    console.log('-'.repeat(70));
    console.log();
  }

  console.log('='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log();
  console.log('API side parameter semantics:');
  console.log('  side=sell -> ASK price (what you PAY when buying)');
  console.log('  side=buy  -> BID price (what you GET when selling)');
  console.log();
  console.log('fetchMarketPrices() returns (CORRECTED):');
  console.log('  yesBuyPrice  <- from side=sell (ASK)');
  console.log('  yesSellPrice <- from side=buy (BID)');
  console.log('  noBuyPrice   <- from side=sell (ASK)');
  console.log('  noSellPrice  <- from side=buy (BID)');
  console.log();
}

main().catch(console.error);
