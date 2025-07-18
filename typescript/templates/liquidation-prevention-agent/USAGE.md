# Liquidation Prevention Agent - Usage Guide

## Quick Setup & Usage

### 1. **Environment Configuration**

Create a `.env` file in the agent directory with these **required** variables:

```env
# REQUIRED
OPENROUTER_API_KEY=your_openrouter_api_key_here
EMBER_ENDPOINT=http://api.emberai.xyz/mcp
USER_PRIVATE_KEY=0x1234567890abcdef...  # Your wallet's private key
QUICKNODE_SUBDOMAIN=your_quicknode_subdomain
QUICKNODE_API_KEY=your_quicknode_api_key

# OPTIONAL (with defaults)
PORT=3010
HEALTH_FACTOR_WARNING=1.5
HEALTH_FACTOR_DANGER=1.2
HEALTH_FACTOR_CRITICAL=1.05
MONITORING_INTERVAL=900000  # 15 minutes in milliseconds
```

### 2. **Run the Agent**

```bash
# From the typescript/ directory
pnpm --filter liquidation-prevention-agent dev
```

The agent will start on port 3010 (or your configured PORT) and display:
```
🚀 Liquidation Prevention Agent running on port 3010
📍 Base URL: http://localhost:3010
🤖 Agent Card: http://localhost:3010/.well-known/agent.json
🔌 MCP SSE: http://localhost:3010/sse
```

### 3. **Use the Agent**

Connect to the agent via MCP-compatible chat interface and send a prompt like:

```
Prevent my liquidation automatically with health factor 1.2 and check my position every 15 min
```

**That's it!** The agent will:
- Start monitoring your position every 15 minutes
- Automatically prevent liquidation if health factor ≤ 1.2
- Run continuously in the background

## How It Works

### **Automatic Monitoring & Prevention Flow:**

1. **User sends prompt** → Agent parses preferences (health factor threshold, interval)
2. **Monitoring starts** → Background timer checks position every N minutes
3. **Health factor check** → Fetches current position data via Aave
4. **Risk detection** → If HF ≤ threshold, triggers prevention automatically
5. **Prevention execution** → Intelligent strategy selection (supply/repay/both)
6. **Continues monitoring** → Keeps running until stopped

### **Example User Flow:**

```
User: "Prevent my liquidation automatically with health factor 1.2 and check my position every 15 min"

Agent: 🤖 Automatic liquidation prevention activated! 
       Monitoring 0x1234... every 15 minutes. 
       Will prevent liquidation if health factor ≤ 1.2. 
       Current HF: 1.45

[15 minutes later - automatic background check]
Agent: 🔄 [10:30:15] Performing automated health check for 0x1234...
       📊 Health Factor: 1.25 > 1.2 ✅ Health Factor OK

[30 minutes later - health factor drops]
Agent: 🔄 [10:45:15] Performing automated health check for 0x1234...
       📊 Health Factor: 1.15 ≤ 1.2 
       🚨 LIQUIDATION RISK DETECTED!
       ⚡ EXECUTING AUTOMATIC LIQUIDATION PREVENTION
       🎯 Selected strategy: supply - Supply USDC collateral (500 USD available)
       ✅ Automatic prevention executed successfully
```

## Example Prompts

### **Basic Setup:**
```
Prevent my liquidation automatically when my health factor becomes 1.1 or less and check my position every 15 min
```

### **Custom Thresholds:**
```
Monitor my position every 10 minutes and prevent liquidation if health factor drops below 1.3
```

### **Conservative Approach:**
```
Set up automatic liquidation prevention with health factor 1.5, check every 5 minutes, conservative strategy
```

### **Aggressive Settings:**
```
Prevent liquidation at health factor 1.05, monitor every 30 minutes, max $2000 transactions
```

## Configuration Options

The agent supports these preferences via natural language:

| Setting | Example Phrases | Default |
|---------|----------------|---------|
| **Health Factor Threshold** | "health factor 1.2", "when HF drops below 1.3" | 1.1 |
| **Monitoring Interval** | "every 15 min", "check every 10 minutes" | 15 minutes |
| **Strategy** | "conservative", "supply only", "repay debt" | auto |
| **Max Transaction** | "max $1000", "limit transactions to $500" | $10,000 |
| **Risk Tolerance** | "conservative", "moderate", "aggressive" | moderate |

## Environment Variables Reference

### **Required:**
- `OPENROUTER_API_KEY` - OpenRouter API key for LLM
- `EMBER_ENDPOINT` - Ember MCP endpoint for Aave operations
- `USER_PRIVATE_KEY` - Your wallet's private key (keep secure!)
- `QUICKNODE_SUBDOMAIN` - QuickNode subdomain
- `QUICKNODE_API_KEY` - QuickNode API key

### **Optional:**
- `PORT=3010` - Agent server port
- `HEALTH_FACTOR_WARNING=1.5` - Warning threshold
- `HEALTH_FACTOR_DANGER=1.2` - Danger threshold  
- `HEALTH_FACTOR_CRITICAL=1.05` - Critical threshold
- `MONITORING_INTERVAL=900000` - Check interval (ms)
- `DEFAULT_STRATEGY=auto` - Default prevention strategy
- `MIN_SUPPLY_BALANCE_USD=100` - Minimum balance for supply
- `MAX_TRANSACTION_USD=10000` - Maximum transaction amount

## Safety Features

- **Intelligent Strategy Selection** - Automatically chooses optimal prevention (supply/repay/both)
- **Balance Validation** - Only acts if sufficient funds available
- **Gas Optimization** - Configurable gas price multipliers
- **Error Recovery** - Continues monitoring even if individual checks fail
- **Graceful Shutdown** - Stops all monitoring sessions cleanly

## Troubleshooting

### **Agent won't start:**
- Check all required environment variables are set
- Verify OPENROUTER_API_KEY is valid
- Ensure EMBER_ENDPOINT is accessible

### **Monitoring not working:**
- Check USER_PRIVATE_KEY format (starts with 0x)
- Verify QUICKNODE credentials are correct
- Confirm wallet has Aave positions to monitor

### **Prevention not triggering:**
- Ensure wallet has sufficient token balances
- Check if health factor actually dropped below threshold
- Verify transaction execution isn't failing due to gas/slippage

## Security Notes

- **Private Key Security**: Store USER_PRIVATE_KEY securely, never commit to version control
- **Local Execution**: Agent runs locally on your machine for maximum security
- **Transaction Control**: You control the wallet, agent only executes with your private key
- **Open Source**: All code is transparent and auditable

## Support

For issues or questions:
1. Check the console logs for error details
2. Verify environment configuration
3. Test with a small health factor threshold first
4. Review the transaction execution logs 
