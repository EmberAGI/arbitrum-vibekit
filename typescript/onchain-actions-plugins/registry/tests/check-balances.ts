import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';

const adapter = new PolymarketAdapter({
  chainId: 137,
  funderAddress: '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5',
  privateKey: process.env['POLYMARKET_PRIVATE_KEY']!,
});

// YES token from the trade
const yesTokenId = '2853768819561879023657600399360829876689515906714535926781067187993853038980';
const noTokenId = '57878493050148425637822780001963685814731344602319345842647239312888833935027';

async function main() {
  console.log('Checking token balances on CTF contract...');
  console.log('CTF Contract: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045');
  console.log('Wallet: 0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5');
  console.log('YES Token ID:', yesTokenId);
  console.log('NO Token ID:', noTokenId);
  console.log('');

  const balances = await adapter.getTokenBalances('0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5', [yesTokenId, noTokenId]);
  console.log('Balances found:', balances.length);
  for (const b of balances) {
    console.log(`  Token ${b.tokenId.substring(0, 20)}... = ${b.balance}`);
  }

  // Also check trading history to confirm the trade
  console.log('\nChecking trading history...');
  const trades = await adapter.getTradingHistory('0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5', { limit: 5 });
  console.log('Recent trades:', trades.length);
  for (const trade of trades) {
    const assetId = trade.asset_id ? trade.asset_id.substring(0, 20) : 'N/A';
    console.log(`  - ${trade.side} ${trade.size} shares @ $${trade.price} (asset: ${assetId}...)`);
  }
}

main().catch(console.error);
