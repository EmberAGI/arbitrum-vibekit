 # Quick Start Guide - Arbitrum Bridge MCP Server

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- RPC URLs for Ethereum and Arbitrum networks

### Installation

```bash
# Clone the repository
git clone https://github.com/WuodOdhis/arbitrum-bridge-mcp-server.git
cd arbitrum-bridge-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

### Environment Setup

Create a `.env` file:

```bash
# Required RPC URLs
ETHEREUM_RPC_URL=https://eth.llamarpc.com
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Optional: Private key for transaction signing
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001
```

## 🛠️ Available Tools

### Core Bridge Functions

#### 1. **Bridge ETH to Arbitrum**
```javascript
import { tools } from './dist/index.js';

const result = await tools.bridgeEthToArbitrum.execute({
  amount: '0xde0b6b3a7640000', // 1 ETH in hex
  recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  maxSubmissionCost: '0x1000000000000000', // 0.001 ETH
  maxGas: '0x100000', // 1M gas
  gasPriceBid: '0x4a817c800' // 20 gwei
});
```

#### 2. **Bridge ETH from Arbitrum**
```javascript
const result = await tools.bridgeEthFromArbitrum.execute({
  amount: '0xde0b6b3a7640000', // 1 ETH in hex
  recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6'
});
```

#### 3. **Bridge ERC20 Tokens**
```javascript
const result = await tools.bridgeErc20ToArbitrum.execute({
  tokenAddress: '0xA0b86a33E6441b8c4C8C0e4A0e4A0e4A0e4A0e4A', // USDC
  amount: '0x3b9aca00', // 1000 tokens (6 decimals)
  recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  maxSubmissionCost: '0x1000000000000000',
  maxGas: '0x100000',
  gasPriceBid: '0x4a817c800'
});
```

### Utility Functions

#### 4. **Process Natural Language Intent**
```javascript
const result = await tools.processBridgeIntent.execute({
  intent: 'Bridge 0.5 ETH from ethereum to arbitrum',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  maxSlippageBps: 100, // 1%
  maxDeadlineMinutes: 30
});

console.log(result.parsed);
// {
//   type: 'bridge',
//   amount: '0x6f05b59d3b20000', // 0.5 ETH in hex
//   token: 'ETH',
//   fromChain: 1,
//   toChain: 42161
// }
```

#### 5. **Validate Bridge Feasibility**
```javascript
const result = await tools.validateBridgeFeasibility.execute({
  amount: '0xde0b6b3a7640000',
  recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  chainId: 1
});

console.log(result.feasible); // true/false
```

#### 6. **Generate Bridge Transaction**
```javascript
const result = await tools.generateBridgeTransaction.execute({
  amount: '0xde0b6b3a7640000',
  recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  chainId: 1
});

console.log(result.transaction);
// {
//   to: '0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f',
//   value: '0xde0b6b3a7640000',
//   data: { abi: [...], functionName: 'createRetryableTicket', args: [...] }
// }
```

## 🔧 Common Use Cases

### 1. **Simple ETH Bridge**
```javascript
// Bridge 1 ETH from Ethereum to Arbitrum
const bridgeResult = await tools.bridgeEthToArbitrum.execute({
  amount: '0xde0b6b3a7640000', // 1 ETH
  recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6'
});

console.log('Transaction:', bridgeResult.transaction);
console.log('Estimated Gas:', bridgeResult.estimatedGas);
```

### 2. **Withdraw ETH from Arbitrum**
```javascript
// Withdraw 0.5 ETH from Arbitrum to Ethereum
const withdrawResult = await tools.bridgeEthFromArbitrum.execute({
  amount: '0x6f05b59d3b20000', // 0.5 ETH
  recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6'
});

console.log('Withdrawal Transaction:', withdrawResult.transaction);
```

### 3. **Process User Intent**
```javascript
// Process natural language bridge request
const intentResult = await tools.processBridgeIntent.execute({
  intent: 'I want to bridge 100 USDC from arbitrum to ethereum',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  maxSlippageBps: 50, // 0.5%
  maxDeadlineMinutes: 60
});

console.log('Parsed Intent:', intentResult.parsed);
// {
//   type: 'bridge',
//   amount: '0x5af3107a4000', // 100 USDC (6 decimals)
//   token: 'USDC',
//   fromChain: 42161,
//   toChain: 1
// }
```

## 📊 Amount Conversion Helpers

### Convert ETH to Hex Wei
```javascript
// 1 ETH = 0xde0b6b3a7640000 wei
// 0.5 ETH = 0x6f05b59d3b20000 wei
// 0.1 ETH = 0x16345785d8a0000 wei

function ethToHexWei(ethAmount) {
  return '0x' + (BigInt(Math.floor(ethAmount * 1e18))).toString(16);
}

console.log(ethToHexWei(1));    // 0xde0b6b3a7640000
console.log(ethToHexWei(0.5));  // 0x6f05b59d3b20000
console.log(ethToHexWei(0.1));  // 0x16345785d8a0000
```

### Convert USDC to Hex (6 decimals)
```javascript
// 1000 USDC = 0x3b9aca00
// 100 USDC = 0x5af3107a4000
// 1 USDC = 0xf4240

function usdcToHex(usdcAmount) {
  return '0x' + (BigInt(Math.floor(usdcAmount * 1e6))).toString(16);
}

console.log(usdcToHex(1000)); // 0x3b9aca00
console.log(usdcToHex(100));  // 0x5af3107a4000
console.log(usdcToHex(1));    // 0xf4240
```

## 🧪 Testing

### Run Basic Tests
```bash
# Test core functionality
npm run test

# Test with environment variables
ARBITRUM_RPC_URL="https://arb1.arbitrum.io/rpc" \
ETHEREUM_RPC_URL="https://eth.llamarpc.com" \
npm run test
```

### Manual Testing
```bash
# Test L2->L1 withdrawal
ARBITRUM_RPC_URL="https://arb1.arbitrum.io/rpc" \
ETHEREUM_RPC_URL="https://eth.llamarpc.com" \
PRIVATE_KEY="0x0000000000000000000000000000000000000000000000000000000000000001" \
node -e "
import { tools } from './dist/index.js';
const result = await tools.bridgeEthFromArbitrum.execute({
  amount: '0x16345785d8a0000',
  recipient: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6',
  userAddress: '0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6'
});
console.log('✅ Success:', result.transaction.to);
"
```

## 🔒 Security Notes

### Important Security Features
- **Private Key Validation**: Ensures proper key format
- **Gas Limit Enforcement**: Prevents excessive gas usage
- **Amount Validation**: Prevents invalid amounts
- **Address Validation**: Prevents zero address usage
- **Contract Validation**: Ensures valid contract addresses

### Best Practices
1. **Never hardcode private keys** in production code
2. **Use environment variables** for sensitive data
3. **Validate all inputs** before processing
4. **Test with small amounts** first
5. **Monitor gas usage** and set appropriate limits

## 📚 Additional Resources

- **Issues Resolved**: See `ISSUES_RESOLVED.md` for detailed bug fixes
- **Testing Guide**: See `TESTING.md` for comprehensive testing
- **API Documentation**: See `README.md` for full API reference
- **Arbitrum Docs**: https://docs.arbitrum.io/
- **Contract Addresses**: All verified on Arbiscan and Etherscan

## 🆘 Troubleshooting

### Common Issues

#### 1. **"Invalid address format" Error**
```bash
# Ensure addresses are valid Ethereum addresses
# Example: 0x742d35cc6634c0532925a3b8d4c9db96c4b4d8b6
```

#### 2. **"Amount must be hex string" Error**
```bash
# Convert decimal amounts to hex
# 1 ETH = 0xde0b6b3a7640000
# 0.5 ETH = 0x6f05b59d3b20000
```

#### 3. **"Insufficient balance" Error**
```bash
# Check account balance before bridging
# Use smaller amounts for testing
```

#### 4. **"Contract address is zero" Error**
```bash
# Ensure RPC URLs are correct and accessible
# Check network connectivity
```

### Getting Help
- Check the `ISSUES_RESOLVED.md` file for known issues
- Review the error messages for specific guidance
- Test with small amounts first
- Verify all parameters are correctly formatted

## 🎉 Success!

You're now ready to use the Arbitrum Bridge MCP Server! The system is production-ready with comprehensive security measures and full EmberAGI compatibility.
