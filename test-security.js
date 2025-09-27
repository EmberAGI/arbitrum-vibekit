import { tools } from './dist/simple-tools.js';

console.log('Testing security enhancements...');

// Test 1: Zero address validation
try {
  const result = await tools.bridgeEthToArbitrum.execute({
    amount: '1000000000000000000',
    recipient: '0x0000000000000000000000000000000000000000',
    userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    slippageBps: 100,
    deadlineMinutes: 30
  });
  console.log('❌ Zero address validation failed');
} catch (error) {
  console.log('✅ Zero address validation working:', error.message);
}

// Test 2: Max amount validation
try {
  const result = await tools.bridgeEthToArbitrum.execute({
    amount: '200000000000000000000', // 200 ETH (exceeds 100 ETH limit)
    recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    slippageBps: 100,
    deadlineMinutes: 30
  });
  console.log('❌ Max amount validation failed');
} catch (error) {
  console.log('✅ Max amount validation working:', error.message);
}

// Test 3: Invalid address format
try {
  const result = await tools.bridgeEthToArbitrum.execute({
    amount: '1000000000000000000',
    recipient: 'invalid-address',
    userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    slippageBps: 100,
    deadlineMinutes: 30
  });
  console.log('❌ Address validation failed');
} catch (error) {
  console.log('✅ Address validation working:', error.message);
}

// Test 4: Slippage protection
try {
  const result = await tools.bridgeEthToArbitrum.execute({
    amount: '1000000000000000000',
    recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    slippageBps: 100,
    deadlineMinutes: 30
  });
  console.log('✅ Slippage protection working - minAmount:', result.minAmount);
  console.log('✅ Deadline calculation working - deadline:', result.deadline);
} catch (error) {
  console.log('❌ Slippage protection failed:', error.message);
}

console.log('Security tests completed!');
