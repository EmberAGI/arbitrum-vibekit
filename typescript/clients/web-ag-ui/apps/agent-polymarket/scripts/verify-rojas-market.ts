#!/usr/bin/env npx tsx
/**
 * Verify Rojas Market Prices
 *
 * This script fetches prices for "Rojas guilty in Texas illegal abortion case?"
 * to verify BUY vs SELL prices.
 */

const CLOB_URL = 'https://clob.polymarket.com';
const GAMMA_URL = 'https://gamma-api.polymarket.com';

async function main() {
  console.log('Searching for "Rojas guilty" market...\n');

  // Search for the market
  const res = await fetch(`${GAMMA_URL}/markets?closed=false&limit=100`);
  const markets = await res.json() as any[];

  const rojasMarket = markets.find(m =>
    m.question?.toLowerCase().includes('rojas') &&
    m.question?.toLowerCase().includes('guilty')
  );

  if (!rojasMarket) {
    console.log('Market not found. Searching all markets for "rojas"...');
    const allMarkets = markets.filter(m =>
      m.question?.toLowerCase().includes('rojas') ||
      m.question?.toLowerCase().includes('abortion')
    );
    console.log('Found markets:', allMarkets.map(m => m.question));
    return;
  }

  console.log('Found market:', rojasMarket.question);
  console.log('Market ID:', rojasMarket.id);
  console.log();

  // Parse token IDs
  const tokens = JSON.parse(rojasMarket.clobTokenIds) as string[];
  const yesToken = tokens[0];
  const noToken = tokens[1];

  console.log('YES Token:', yesToken);
  console.log('NO Token:', noToken);
  console.log();

  // Fetch all prices
  const [yesBuyRes, yesSellRes, noBuyRes, noSellRes] = await Promise.all([
    fetch(`${CLOB_URL}/price?token_id=${yesToken}&side=buy`),
    fetch(`${CLOB_URL}/price?token_id=${yesToken}&side=sell`),
    fetch(`${CLOB_URL}/price?token_id=${noToken}&side=buy`),
    fetch(`${CLOB_URL}/price?token_id=${noToken}&side=sell`),
  ]);

  const yesBuy = (await yesBuyRes.json() as any).price || '0';
  const yesSell = (await yesSellRes.json() as any).price || '0';
  const noBuy = (await noBuyRes.json() as any).price || '0';
  const noSell = (await noSellRes.json() as any).price || '0';

  console.log('='.repeat(60));
  console.log('PRICE COMPARISON');
  console.log('='.repeat(60));
  console.log();
  // NOTE: API 'side' parameter refers to the ORDER's side, not user action:
  // - side=buy  -> BID price (orders wanting to buy = what YOU GET when selling)
  // - side=sell -> ASK price (orders wanting to sell = what YOU PAY when buying)
  console.log('From Polymarket CLOB API:');
  console.log();
  console.log('  YES Token:');
  console.log(`    side=buy  (BID):  $${parseFloat(yesBuy).toFixed(3)} <- What you GET selling YES`);
  console.log(`    side=sell (ASK):  $${parseFloat(yesSell).toFixed(3)} <- What you PAY to buy YES`);
  console.log();
  console.log('  NO Token:');
  console.log(`    side=buy  (BID):  $${parseFloat(noBuy).toFixed(3)} <- What you GET selling NO`);
  console.log(`    side=sell (ASK):  $${parseFloat(noSell).toFixed(3)} <- What you PAY to buy NO`);
  console.log();
  console.log('='.repeat(60));
  console.log('VERIFICATION');
  console.log('='.repeat(60));
  console.log();
  console.log('Polymarket UI BUY tab shows:');
  console.log('  YES: 62¢ ($0.62)');
  console.log('  NO:  74¢ ($0.74)');
  console.log();
  console.log('For cross-arbitrage, agent needs BUY prices (ASK = side=sell):');
  console.log(`  yesBuyPrice (ASK): $${parseFloat(yesSell).toFixed(3)}`);
  console.log(`  noBuyPrice (ASK):  $${parseFloat(noSell).toFixed(3)}`);
  console.log();

  // Verify ASK prices match UI's BUY tab
  const askYes = parseFloat(yesSell);
  const askNo = parseFloat(noSell);

  if (Math.abs(askYes - 0.62) < 0.05 && Math.abs(askNo - 0.74) < 0.05) {
    console.log('✓ SUCCESS: ASK prices (side=sell) match Polymarket UI BUY tab!');
    console.log('  Agent should use side=sell for BUY prices.');
  } else {
    console.log('NOTE: Prices may have changed since UI screenshot was taken.');
  }
  console.log();
}

main().catch(console.error);
