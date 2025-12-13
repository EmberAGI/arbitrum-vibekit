# Uniswap MCP Server - Quick Start Guide

This guide will help you quickly get started with the Uniswap MCP Server for agents.

## Prerequisites

- Node.js >= 18.0.0
- pnpm package manager
- RPC endpoints for Ethereum and Arbitrum

## Setup

1. **Install dependencies:**

```bash
cd typescript/lib/mcp-tools/uniswap-mcp-server
pnpm install
```

2. **Configure environment:**

Create a `.env` file:

```env
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
DEFAULT_SLIPPAGE=0.5
```

3. **Build the server:**

```bash
pnpm build
```

## Basic Usage Examples

### Example 1: Get a Swap Quote

```typescript
// Agent calls the MCP tool
const quote = await mcpClient.callTool({
  name: 'getSwapQuote',
  arguments: {
    tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0c3606eB48', // USDC
    amount: '1000000000000000000', // 1 ETH
    chainId: 1,
    slippageTolerance: 0.5
  }
});

console.log(`Expected output: ${quote.expectedAmountOut} USDC`);
console.log(`Price impact: ${quote.priceImpact}%`);
```

### Example 2: Process Natural Language Intent

```typescript
// Agent processes user intent
const swapPlan = await mcpClient.callTool({
  name: 'processSwapIntent',
  arguments: {
    intent: 'Swap 1 ETH to USDC with minimal slippage',
    chainId: 1,
    userAddress: '0x742d35Cc6634C4532895c05b22629ce5b3c28da4'
  }
});

// The tool returns a complete swap plan
console.log('Token in:', swapPlan.tokenIn);
console.log('Token out:', swapPlan.tokenOut);
console.log('Amount:', swapPlan.amount);
console.log('Quote:', swapPlan.quote);
console.log('Transaction:', swapPlan.transaction);
console.log('Validation:', swapPlan.validation);
```

### Example 3: Validate Before Swapping

```typescript
// Always validate before executing
const validation = await mcpClient.callTool({
  name: 'validateSwapFeasibility',
  arguments: {
    tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0c3606eB48',
    amount: '1000000000000000000',
    chainId: 1,
    userAddress: '0x742d35Cc6634C4532895c05b22629ce5b3c28da4',
    slippageTolerance: 0.5
  }
});

if (!validation.isValid) {
  console.error('Swap not feasible:', validation.errors);
  return;
}

if (validation.warnings.length > 0) {
  console.warn('Warnings:', validation.warnings);
}

if (validation.requiresApproval) {
  console.log('Approval needed. Current allowance:', validation.currentAllowance);
}
```

### Example 4: Generate and Execute Transaction

```typescript
// Step 1: Get the best route
const route = await mcpClient.callTool({
  name: 'getBestRoute',
  arguments: {
    tokenIn: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0c3606eB48',
    amount: '1000000000000000000',
    chainId: 1
  }
});

// Step 2: Generate transaction
const tx = await mcpClient.callTool({
  name: 'generateSwapTransaction',
  arguments: {
    route: route.route,
    amountIn: '1000000000000000000',
    slippageTolerance: 0.5,
    recipient: '0x742d35Cc6634C4532895c05b22629ce5b3c28da4',
    chainId: 1
  }
});

// Step 3: Execute transaction (using your wallet provider)
await wallet.sendTransaction({
  to: tx.to,
  data: tx.data,
  value: tx.value,
  gasLimit: tx.gasEstimate
});
```

## Common Token Addresses

### Ethereum Mainnet
- ETH: `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`
- WETH: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`
- USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0c3606eB48`
- USDT: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- DAI: `0x6B175474E89094C44Da98b954EedeAC495271d0F`

### Arbitrum One
- ETH: `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`
- WETH: `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1`
- USDC: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- USDT: `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`
- DAI: `0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1`

## Best Practices

1. **Always validate before executing**: Use `validateSwapFeasibility` to check all conditions
2. **Check price impact**: High price impact (>5%) may indicate low liquidity
3. **Handle approvals**: Check if token approval is needed before swapping
4. **Use appropriate slippage**: Default 0.5% is usually safe, adjust based on volatility
5. **Monitor gas estimates**: Large gas estimates may indicate complex routes

## Troubleshooting

### "No route found"
- Check that both tokens are valid ERC20 contracts
- Verify there's liquidity for the token pair
- Try a smaller amount

### "Insufficient balance"
- Check user's token balance
- For native ETH, ensure sufficient ETH balance

### "Approval required"
- User needs to approve the Universal Router to spend their tokens
- Use the ERC20 `approve` function first

### "High price impact"
- Consider splitting the swap into smaller amounts
- Try a different route or DEX
- Wait for better liquidity conditions

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Explore the source code to understand the implementation
- Integrate into your agent using the MCP client

