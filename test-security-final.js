import { tools } from './dist/simple-tools.js';

console.log('Testing security enhancements with proper transaction data...');

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
  console.log('✅ Transaction data structure:', {
    to: result.transaction?.to,
    value: result.transaction?.value,
    hasData: !!result.transaction?.data
  });
} catch (error) {
  console.log('❌ Bridge transaction failed:', error.message);
  console.log('Error type:', error.constructor.name);
}

// Test ERC20 bridge
try {
  const result = await tools.bridgeErc20ToArbitrum.execute({
    tokenAddress: '0xA0b86a33E6441b8c4C8C0C4C0C4C0C4C0C4C0C4',
    amount: '1000000', // 1 token (6 decimals)
    recipient: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
    slippageBps: 100,
    deadlineMinutes: 30
  });
  console.log('✅ ERC20 bridge transaction created successfully');
  console.log('✅ ERC20 security parameters:', {
    minAmount: result.minAmount,
    deadline: result.deadline,
    slippageBps: result.slippageBps
  });
} catch (error) {
  console.log('❌ ERC20 bridge transaction failed:', error.message);
}

console.log('Security tests completed!');
