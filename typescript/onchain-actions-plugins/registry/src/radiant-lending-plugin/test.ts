import { getRadiantEmberPlugin } from './index.js';

async function testRadiantPlugin() {
  try {
    console.log('Testing Radiant Plugin...');
    
    const plugin = await getRadiantEmberPlugin({
      chainId: 42161,
      rpcUrl: 'https://arb1.arbitrum.io/rpc',
    });

    console.log('✅ Plugin created successfully');
    console.log('Plugin ID:', plugin.id);
    console.log('Plugin Type:', plugin.type);
    console.log('Plugin Name:', plugin.name);
    console.log('Actions count:', plugin.actions.length);
    
    // Test fetching markets
    console.log('\nTesting market data...');
    const testAddress = '0x0000000000000000000000000000000000000000';
    const positions = await plugin.queries.getPositions({ walletAddress: testAddress });
    console.log('✅ Position query successful');
    
    console.log('\n🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testRadiantPlugin();
}
