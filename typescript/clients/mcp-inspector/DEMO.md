# MCP Inspector + Ember Demo Guide

This guide shows you how to run the modified MCP Inspector with Ember's MCP server for demonstration purposes, with authentication disabled to avoid complexity.

## 🚀 Quick Start (Automated)

The fastest way to start both services together:

```bash
cd typescript/clients/mcp-inspector
npm run demo:ember
```

This script will:

- Start the Ember MCP server in the background
- Start the MCP Inspector with authentication disabled
- Automatically open your browser
- Provide connection instructions

## 🔧 Manual Setup (Step by Step)

If you prefer to run each service manually:

### Step 1: Start Ember MCP Server

In Terminal 1:

```bash
cd typescript/lib/mcp-tools/emberai-mcp
pnpm start
```

Keep this terminal open - you should see the Ember MCP server running.

### Step 2: Start MCP Inspector (No Auth)

In Terminal 2:

```bash
cd typescript/clients/mcp-inspector
npm run start:demo
```

This starts the inspector with `DANGEROUSLY_OMIT_AUTH=true` to skip authentication.

### Step 3: Connect in Browser

1. Browser should open automatically at `http://localhost:6274`
2. Click **"Connect to Server"**
3. Fill in the connection details:
   - **Transport**: `stdio`
   - **Command**: `node`
   - **Args**: `../../../lib/mcp-tools/emberai-mcp/dist/index.js`
   - (Or use the full path to the Ember MCP server dist file)
4. Click **"Connect"**

## 🎯 What You Can Demo

Once connected, you'll have access to all of Ember's MCP tools:

### Core DeFi Operations

- **swapTokens**: Exchange cryptocurrencies across DEXs
- **borrow**: Take loans from lending protocols
- **repay**: Pay back outstanding loans
- **supply**: Deposit assets to earn interest
- **withdraw**: Remove deposited assets

### Portfolio & Data

- **getUserPositions**: View wallet holdings across protocols
- **getTokens**: List supported tokens by chain
- **getCapabilities**: See all available Ember features
- **getWalletBalances**: Check token balances
- **getMarketData**: Get real-time market information

### Liquidity Operations

- **supplyLiquidity**: Add liquidity to DEX pools
- **withdrawLiquidity**: Remove liquidity positions
- **getLiquidityPools**: Browse available pools
- **getUserLiquidityPositions**: View LP positions

## 🔍 Demo Tips

### 1. Start with Simple Operations

- Try `getCapabilities` first to see what's available
- Use `getTokens` to explore supported tokens
- Check `getUserPositions` with a wallet address

### 2. Realistic Demo Data

For demonstrations, you can use these example values:

- **Wallet Address**: `0x742d35Cc6634C0532925a3b8D1e745E17b866566` (example)
- **Token Addresses**: Use `getTokens` to find real addresses
- **Chain ID**: `42161` (Arbitrum), `1` (Ethereum), `137` (Polygon)

### 3. Error Handling

The inspector will show you:

- Tool input/output in real-time
- Error messages if something goes wrong
- Network requests and responses

## 🛠 Troubleshooting

### Connection Issues

- **"Failed to connect"**: Make sure Ember MCP server is running
- **"Command not found"**: Check the path to Ember's dist/index.js file
- **"Authentication required"**: Make sure you're using `npm run start:demo`

### Browser Issues

- **Inspector not opening**: Manually go to `http://localhost:6274`
- **Stuck loading**: Refresh the page and try connecting again

### Server Issues

- **Ember server errors**: Check the Ember terminal for error messages
- **Port conflicts**: Change ports using `CLIENT_PORT=6275 npm run start:demo`

## 🔒 Authentication Notes

For demo purposes, we disable authentication using `DANGEROUSLY_OMIT_AUTH=true`. This:

- ✅ Simplifies the demo setup
- ✅ Avoids OAuth complexity
- ✅ Focuses on MCP functionality
- ⚠️ Should NOT be used in production

In production, the inspector supports full OAuth authentication for secure connections.

## 📱 Alternative Connection Methods

You can also connect to:

- **Remote MCP servers** via SSE or HTTP
- **Other local MCP servers** via STDIO
- **WebSocket connections** for real-time updates

## 🎉 What Makes This Special

This modified inspector provides:

- **Enhanced UI** for DeFi operations
- **Better error handling** and user feedback
- **Streamlined workflow** for common tasks
- **Visual improvements** for demo purposes
- **No authentication complexity** during demos

Perfect for showcasing Ember's MCP capabilities! 🚀
