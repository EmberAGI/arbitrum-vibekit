# Manual Testing Guide for Allora Price Prediction Agent

This guide provides instructions for manually testing the Allora Price Prediction Agent.

## Prerequisites

1. Agent is running (`pnpm dev`)
2. You have an MCP client or can use curl to test endpoints

## Test Cases

### 1. Basic Health Check

Test that the agent is running:

```bash
curl http://localhost:3007/
```

Expected: JSON response with agent information

### 2. Agent Card

Verify the agent metadata:

```bash
curl http://localhost:3007/.well-known/agent.json
```

Expected: Agent card with name, version, skills, etc.

### 3. Price Prediction Tests

To test the price prediction skill, you'll need an MCP client. Here are example queries to test:

#### Test Case 3.1: BTC Price Prediction

**Input**:

```json
{
  "skill": "pricePrediction",
  "input": {
    "token": "BTC"
  }
}
```

**Expected**: Price prediction for Bitcoin

#### Test Case 3.2: ETH Price Prediction with Timeframe

**Input**:

```json
{
  "skill": "pricePrediction",
  "input": {
    "token": "ETH",
    "timeframe": "8 hours"
  }
}
```

**Expected**: Price prediction for Ethereum with timeframe context

#### Test Case 3.3: Unknown Token

**Input**:

```json
{
  "skill": "pricePrediction",
  "input": {
    "token": "UNKNOWN"
  }
}
```

**Expected**: Error message about no prediction topic found

### 4. Hook Verification

Monitor the console output to verify hooks are working:

1. **Pre-hook (Topic Discovery)**:

   - Look for: `[TopicDiscoveryHook] Looking up topic for token: BTC`
   - Look for: `[TopicDiscoveryHook] Found topic X for token BTC`

2. **Main Tool Execution**:

   - Look for: `[GetPricePrediction] Executing with args:`
   - Look for: `[GetPricePrediction] Received inference data:`

3. **Post-hook (Response Formatting)**:
   - Look for: `[FormatResponseHook] Formatting prediction response`

## Using MCP Inspector

For easier testing, you can use the MCP Inspector:

```bash
pnpm run inspect:npx
```

This will open an interactive UI where you can:

1. Connect to the agent
2. See available skills
3. Execute skills with different inputs
4. View responses in real-time

## Common Issues

1. **"Allora MCP client not available"**

   - Check that ALLORA_API_KEY is set (or using default)
   - Verify the Allora MCP server started correctly

2. **"No prediction topic found for token"**

   - The token might not have a corresponding topic in Allora
   - Check available topics by monitoring the console output

3. **Port conflicts**
   - If port 3007/3008 is in use, set PORT env variable

## Success Criteria

- [ ] Agent starts without errors
- [ ] Health check endpoint responds
- [ ] Agent card is properly formatted
- [ ] Price predictions work for known tokens (BTC, ETH)
- [ ] Error handling works for unknown tokens
- [ ] Hooks execute in correct order
- [ ] Response formatting includes emojis and structure
