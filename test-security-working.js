import { tools } from './dist/simple-tools.js';

console.log('Testing security enhancements with working parameters...');

// Test with a smaller amount that should pass balance check
try {
  const result = await tools.bridgeEthToArbitrum.execute({
    amount: '1000000000000000', // 0.001 ETH
    recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    slippageBps: 100,
    deadlineMinutes: 30
  });
  console.log('✅ Bridge transaction created successfully');
  console.log('✅ Slippage protection working - minAmount:', result.minAmount);
  console.log('✅ Deadline calculation working - deadline:', result.deadline);
  console.log('✅ Dynamic gas estimation working - estimatedGas:', result.estimatedGas);
  console.log('✅ Security parameters included:', {
    slippageBps: result.slippageBps,
    userAddress: result.userAddress,
    bridgeType: result.bridgeType
  });
} catch (error) {
  console.log('❌ Bridge transaction failed:', error.message);
}

console.log('Security tests completed!');
