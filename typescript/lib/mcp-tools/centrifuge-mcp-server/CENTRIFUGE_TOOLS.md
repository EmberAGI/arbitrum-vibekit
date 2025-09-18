# Centrifuge MCP Tools

**MCP Inspector URL:** `http://localhost:6274`

**Configuration:**
```
Command: /Users/griffinsoduol/Desktop/OtherProjects/arbitrum-vibekit/typescript/lib/mcp-tools/centrifuge-mcp-server/run-server-stdio.sh
Arguments: (leave empty)
Transport: stdio
```

## 6 Reliable Tools

### 1. place-investment-order
```json
{
  "investorAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "poolId": "1",
  "trancheType": "Senior",
  "amount": "1000.00",
  "network": "arbitrum",
  "slippageTolerance": 2
}
```

### 2. yield-optimization
```json
{
  "investorAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "riskTolerance": "medium",
  "investmentAmount": "50000",
  "networks": ["arbitrum", "ethereum"]
}
```

### 3. transaction-history
```json
{
  "investorAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "limit": 10,
  "includeFailed": false
}
```

### 4. investment-performance-tracking
```json
{
  "investorAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "period": "30d",
  "includeBenchmarks": true
}
```

### 5. risk-alert-system
```json
{
  "investorAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "alertThresholds": {
    "riskScore": 80,
    "liquidityScore": 20,
    "yieldDeviation": 10
  },
  "notificationChannels": ["email", "push"]
}
```

### 6. yield-comparison-tool
```json
{
  "poolIds": ["1", "2"],
  "comparisonPeriod": "90d",
  "includeRiskAdjusted": true
}
```

## Status
- ✅ Local Ethereum fork (Anvil) running
- ✅ Centrifuge MCP server running
- ✅ MCP Inspector running
- ✅ JSON parsing errors fixed
- ✅ RPC configuration fixed

**Ready to test!**
