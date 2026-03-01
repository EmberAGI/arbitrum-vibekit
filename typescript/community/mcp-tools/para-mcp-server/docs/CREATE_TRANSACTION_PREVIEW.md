# Create Transaction Preview Tool

## Overview

The `create-transaction-preview` tool generates transaction preview data (txPreview and txPlan) that can be consumed by the frontend UI without executing any transactions. This is useful for showing users what will happen before they sign/execute.

## Purpose

- **Does NOT execute transactions** - only generates preview data
- Returns structured data compatible with `TemplateComponent.tsx`
- Allows AI to construct transaction previews from user prompts
- Provides both display data (txPreview) and raw transaction data (txPlan)

## Parameters

### `transactions` (required)
Array of transaction objects to include in the plan. Each transaction must have:
- `to`: Recipient address
- `value`: Transaction value in wei
- `chainId`: Chain ID ("42161", "421614", "8453", "84532")
- `data`: (optional) Transaction data in hex format
- `gasLimit`: (optional) Gas limit
- `maxFeePerGas`: (optional) Max fee per gas in wei
- `maxPriorityFeePerGas`: (optional) Max priority fee per gas in wei

### `previewData` (required)
Display data for the UI. Must include:
- `fromTokenAmount`: Source token amount for display (e.g., "1.5")
- `fromTokenSymbol`: Source token symbol (e.g., "ETH")
- `fromTokenAddress`: Source token contract address (or "0x0" for native)
- `fromChain`: Source chain name (e.g., "arbitrum")
- `toTokenAmount`: Destination token amount for display (e.g., "2500.00")
- `toTokenSymbol`: Destination token symbol (e.g., "USDC")
- `toTokenAddress`: Destination token contract address
- `toChain`: Destination chain name (e.g., "arbitrum")

## Example Usage

### Simple ETH Transfer

```json
{
  "transactions": [
    {
      "to": "0x7B4C48aa84eDB406f18eF1a1B1021B0E78aB4b25",
      "data": "0x",
      "value": "1000000000000000000",
      "chainId": "84532"
    }
  ],
  "previewData": {
    "fromTokenAmount": "1.0",
    "fromTokenSymbol": "ETH",
    "fromTokenAddress": "0x0000000000000000000000000000000000000000",
    "fromChain": "base-sepolia",
    "toTokenAmount": "1.0",
    "toTokenSymbol": "ETH",
    "toTokenAddress": "0x0000000000000000000000000000000000000000",
    "toChain": "base-sepolia"
  }
}
```

### Token Swap

```json
{
  "transactions": [
    {
      "to": "0xSwapRouterAddress",
      "data": "0x123abc...",
      "value": "1000000000000000000",
      "chainId": "42161",
      "gasLimit": "250000"
    }
  ],
  "previewData": {
    "fromTokenAmount": "1.0",
    "fromTokenSymbol": "ETH",
    "fromTokenAddress": "0x0000000000000000000000000000000000000000",
    "fromChain": "arbitrum",
    "toTokenAmount": "2500.00",
    "toTokenSymbol": "USDC",
    "toTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "toChain": "arbitrum"
  }
}
```

## Response Format

The tool returns the same artifact structure as `create-mock-transaction`:

```json
{
  "artifacts": [
    {
      "name": "transaction-preview",
      "parts": [
        {
          "data": {
            "txPreview": {
              "fromTokenAmount": "1.0",
              "fromTokenSymbol": "ETH",
              "fromTokenAddress": "0x0000000000000000000000000000000000000000",
              "fromChain": "arbitrum",
              "toTokenAmount": "2500.00",
              "toTokenSymbol": "USDC",
              "toTokenAddress": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
              "toChain": "arbitrum"
            },
            "txPlan": [
              {
                "to": "0xSwapRouterAddress",
                "data": "0x123abc...",
                "value": "1000000000000000000",
                "chainId": "42161",
                "gasLimit": "250000"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

## Frontend Integration

The TemplateComponent.tsx automatically consumes this artifact structure:
1. Extracts `txPreview` and displays it using `JsonViewer`
2. Extracts `txPlan` for transaction execution
3. Shows transaction status (pending, success, error)
4. Allows user to execute the transaction when ready

## Tool Naming

- **Standard clients**: `create-transaction-preview`
- **OpenAI clients**: `create-tx-preview` (shorter name for moderation compliance)

## Use Cases

1. **Previewing transfers**: Show users what they're about to send
2. **Token swaps**: Display swap amounts and tokens before execution
3. **Multi-step transactions**: Preview complex transaction sequences
4. **Smart contract interactions**: Show contract calls with decoded data
5. **Testing UI flows**: Generate test data for frontend development

## Differences from execute-pregen-transaction

| Feature | create-transaction-preview | execute-pregen-transaction |
|---------|---------------------------|----------------------------|
| **Executes tx** | ❌ No | ✅ Yes (non-OpenAI only) |
| **Requires wallet** | ❌ No | ✅ Yes |
| **Returns preview** | ✅ Yes | ❌ No |
| **Returns receipt** | ❌ No | ✅ Yes (when executed) |
| **Safe for AI** | ✅ Yes | ⚠️ Validation only for OpenAI |

## Benefits

1. **Safe**: Never executes transactions, only generates preview data
2. **Flexible**: Works with any transaction type
3. **AI-friendly**: AI can construct previews from natural language
4. **UI-ready**: Returns data in exact format needed by frontend
5. **Multi-transaction support**: Can preview transaction sequences

## Chain IDs

- `42161` - Arbitrum One (mainnet)
- `421614` - Arbitrum Sepolia (testnet)
- `8453` - Base (mainnet)
- `84532` - Base Sepolia (testnet)
