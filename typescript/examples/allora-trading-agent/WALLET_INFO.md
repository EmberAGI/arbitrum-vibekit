# How to Provide Wallet Information

Since the MCP Inspector doesn't have a dedicated wallet field, you need to include your wallet address directly in your message.

## Format Examples

### For Analysis Only (No Wallet Needed)

```
"Should I buy ETH?"
"Analyze BTC trading opportunity"
"What's the ETH price prediction?"
```

### For Trade Execution (Wallet Required)

```
"Buy 100 USDC worth of ETH. My address is 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD7e"
"Swap 500 USDC to BTC on Arbitrum, wallet: 0x123..."
"Execute ETH trade with $1000. Address: 0xYourWalletAddress"
```

## Common Patterns

1. **End of message**: "... My address is 0x..."
2. **Inline**: "... using wallet 0x..."
3. **Separate line**:
   ```
   Buy ETH with $500
   Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD7e
   ```

## Important Notes

- Wallet address is ONLY needed for actual trade execution
- The agent will tell you if a wallet is required
- Make sure to use a valid Ethereum address (42 characters starting with 0x)
- The agent returns transaction data for you to sign - it doesn't execute trades directly

## Token Name Tips

If you get "No prediction market found", try:

- "Ethereum" instead of "ETH"
- "Bitcoin" instead of "BTC"
- Full token names when abbreviations don't work
