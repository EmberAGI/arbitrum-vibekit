# Testing Guide for Allora Trading Agent

## How to Test with MCP Inspector

1. **Start the Inspector**:

   ```bash
   DANGEROUSLY_OMIT_AUTH=true pnpm run inspect:npx
   ```

2. **Connect to the Agent**:
   - Open http://localhost:6274 in your browser
   - You should see the MCP Inspector interface

## Test Scenarios

### 1. Simple Price Prediction

**Query**: "What is the BTC price prediction?"

- This will use the `market-forecast` skill
- No wallet address needed

### 2. Trading Analysis (No Wallet Needed)

**Query**: "Should I buy ETH based on current predictions?"

- This will get the prediction and analyze it
- Uses default $100 investment amount
- No wallet address needed for analysis

### 3. Trading Analysis with Custom Amount

**Query**: "Analyze ETH trading opportunity with $500"

- Specifies custom investment amount
- Still no wallet needed for just analysis

### 4. Full Workflow with Wallet Address

**Query**: "Get BTC prediction and analyze if I should buy with $1000. My address is 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD7e"

- Includes wallet address for potential execution
- Will analyze but NOT execute (autoExecute is false by default)

### 5. Execute Trade (Requires Wallet)

**Query**: "Buy 100 USDC worth of ETH on Arbitrum. My address is 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD7e"

- Direct trade execution request
- Requires wallet address
- Will return transaction data for signing

## Important Notes

1. **Wallet Address**:

   - Required only for trade execution
   - Include it in your message like: "My address is 0x..."
   - Not needed for predictions or analysis

2. **Default Values**:

   - Trade amount: $100 (if not specified)
   - Chain: Arbitrum (chain ID 42161)
   - Target token: USDC (for swaps)
   - Auto-execute: false (manual approval required)

3. **Supported Tokens**:

   - BTC/WBTC
   - ETH/WETH
   - USDC
   - ARB
   - DAI
   - USDT

4. **Error Messages**:
   - If you see "userAddress is required", include your wallet address
   - If you see "No prediction market found", try using full token names (Bitcoin instead of BTC)

## Example Conversation Flow

1. User: "What's the BTC price prediction?"

   - Agent: Returns price prediction from Allora

2. User: "Should I buy some?"

   - Agent: Analyzes the prediction and gives recommendation

3. User: "Ok, buy $200 worth. My address is 0x123..."
   - Agent: Prepares the trade and returns transaction data

## Troubleshooting

- **Hanging requests**: The agent needs time to communicate with MCP servers
- **No prediction found**: Try different token names or check Allora has data for that token
- **Invalid address**: Make sure to provide a valid Ethereum address (starts with 0x, 42 characters)
