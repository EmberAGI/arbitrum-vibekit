/**
 * Portfolio Status Script
 * Fetches and displays complete Polymarket portfolio status
 */

import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';

const WALLET_ADDRESS = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';
const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY']!;

async function main() {
  const adapter = new PolymarketAdapter({
    chainId: 137,
    funderAddress: WALLET_ADDRESS,
    privateKey: PRIVATE_KEY,
  });

  console.log('='.repeat(80));
  console.log('POLYMARKET PORTFOLIO STATUS');
  console.log('='.repeat(80));
  console.log(`Wallet: ${WALLET_ADDRESS}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('='.repeat(80));

  // 1. Get Portfolio Summary
  console.log('\n## PORTFOLIO SUMMARY\n');
  const portfolio = await adapter.getPortfolioSummary(WALLET_ADDRESS);

  console.log(`Total Positions (token holdings): ${portfolio.totalPositions}`);
  console.log(`Total Open Orders: ${portfolio.totalOpenOrders}`);
  console.log(`Markets with Activity: ${portfolio.markets.length}`);

  // 2. Display each market
  console.log('\n## MARKETS WITH ACTIVITY\n');

  for (const market of portfolio.markets) {
    console.log('-'.repeat(80));
    console.log(`Market: ${market.title}`);
    console.log(`Market ID: ${market.marketId}`);
    console.log(`Status: ${market.status.toUpperCase()}`);
    console.log('-'.repeat(80));

    // YES Token
    const yesBalance = parseInt(market.yesToken.balance);
    const yesTokens = yesBalance / 1_000_000;
    console.log('\n  YES TOKEN:');
    console.log(`    Token ID: ${market.yesToken.tokenId.substring(0, 30)}...`);
    console.log(`    Balance: ${yesTokens.toFixed(6)} tokens (raw: ${yesBalance.toLocaleString()})`);
    console.log(`    Current Price: $${market.yesToken.currentPrice}`);
    console.log(`    Pending BUY Orders: ${market.yesToken.pendingBuyOrders}`);
    console.log(`    Pending SELL Orders: ${market.yesToken.pendingSellOrders}`);
    if (yesBalance > 0) {
      const yesValue = yesTokens * parseFloat(market.yesToken.currentPrice);
      console.log(`    Estimated Value: $${yesValue.toFixed(4)}`);
    }

    // NO Token
    const noBalance = parseInt(market.noToken.balance);
    const noTokens = noBalance / 1_000_000;
    console.log('\n  NO TOKEN:');
    console.log(`    Token ID: ${market.noToken.tokenId.substring(0, 30)}...`);
    console.log(`    Balance: ${noTokens.toFixed(6)} tokens (raw: ${noBalance.toLocaleString()})`);
    console.log(`    Current Price: $${market.noToken.currentPrice}`);
    console.log(`    Pending BUY Orders: ${market.noToken.pendingBuyOrders}`);
    console.log(`    Pending SELL Orders: ${market.noToken.pendingSellOrders}`);
    if (noBalance > 0) {
      const noValue = noTokens * parseFloat(market.noToken.currentPrice);
      console.log(`    Estimated Value: $${noValue.toFixed(4)}`);
    }

    console.log('');
  }

  // 3. Get Open Orders Details
  console.log('\n## OPEN ORDERS DETAILS\n');
  const ordersResult = await adapter.getOrders({ walletAddress: WALLET_ADDRESS });

  if (ordersResult.orders.length > 0) {
    for (const order of ordersResult.orders) {
      console.log(`Order ID: ${order.orderId}`);
      console.log(`  Market ID: ${order.marketId}`);
      console.log(`  Token ID: ${order.tokenId?.substring(0, 30)}...`);
      console.log(`  Side: ${order.side.toUpperCase()} ${order.outcomeId.toUpperCase()}`);
      console.log(`  Size: ${order.size} shares @ $${order.price}`);
      console.log(`  Filled: ${order.filledSize || '0'} shares`);
      console.log(`  Status: ${order.status}`);
      console.log(`  Created: ${new Date(Number(order.createdAt) * 1000).toISOString()}`);
      console.log('');
    }
  } else {
    console.log('No open orders.');
  }

  // 4. Get Trading History
  console.log('\n## TRADING HISTORY\n');
  const trades = await adapter.getTradingHistory(WALLET_ADDRESS, { limit: 10 });

  if (trades.length > 0) {
    let totalSpent = 0;
    for (const trade of trades) {
      const tradeValue = parseFloat(trade.size) * parseFloat(trade.price);
      totalSpent += tradeValue;
      console.log(`Trade ID: ${trade.id}`);
      console.log(`  Market: ${trade.market?.substring(0, 40)}...`);
      console.log(`  Side: ${trade.side}`);
      console.log(`  Size: ${trade.size} shares @ $${trade.price}`);
      console.log(`  Value: $${tradeValue.toFixed(4)}`);
      console.log(`  Time: ${new Date(Number(trade.match_time) * 1000).toISOString()}`);
      console.log('');
    }
    console.log(`Total Spent on Trades: $${totalSpent.toFixed(4)}`);
  } else {
    console.log('No trading history.');
  }

  console.log('\n' + '='.repeat(80));
  console.log('END OF PORTFOLIO STATUS');
  console.log('='.repeat(80));
}

main().catch(console.error);
