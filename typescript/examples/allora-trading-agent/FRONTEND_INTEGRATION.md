# Frontend Integration Guide for Allora Trading Agent

This guide explains how to run the Allora Trading Agent with the Vibekit web frontend.

## Prerequisites

- Docker Desktop with Docker Compose v2.24+
- Environment variables configured in `typescript/.env`
- Required API keys:
  - `OPENROUTER_API_KEY` for LLM
  - `ALLORA_API_KEY` (optional, for Allora predictions)

## Quick Start

1. **Navigate to the typescript directory:**

   ```bash
   cd typescript/
   ```

2. **Ensure your `.env` file is configured:**

   ```bash
   # Copy the example if you haven't already
   cp .env.example .env

   # Edit .env and add your API keys
   ```

3. **Start all services with Docker Compose:**

   ```bash
   docker compose up
   ```

   This will start:

   - The web frontend (port 3000)
   - The lending agent (port 3001)
   - The swapping agent (port 3005)
   - The allora-trading-agent (port 3008)
   - PostgreSQL database

4. **Access the frontend:**
   Open your browser and navigate to http://localhost:3000

5. **Connect your wallet:**
   Click "Connect Wallet" to get started

## Using the Allora Trading Agent

Once the frontend is running, you'll see "AI Trading" in the agent selector. This is the Allora Trading Agent with the following capabilities:

### Suggested Actions

The frontend provides quick action buttons for common tasks:

1. **"Get ETH forecast and trade accordingly"**

   - Fetches ETH price prediction from Allora
   - Analyzes trading opportunity
   - Prepares trade execution if profitable

2. **"Should I buy BTC?"**

   - Gets BTC price prediction
   - Provides trading recommendation
   - Shows risk assessment

3. **"Analyze ARB trading opportunity"**

   - Analyzes ARB token with $100 investment
   - Shows expected returns and risks

4. **"Execute recommended ETH trade"**
   - Full workflow: predict → analyze → execute
   - Remember to include your wallet address!

### Natural Language Queries

You can also type custom queries like:

- "What's the price prediction for Bitcoin?"
- "Get me the latest ETH forecast and analyze if I should trade"
- "I have $500, should I buy BTC or ETH?"
- "Execute a trade: buy ETH with 100 USDC. My address is 0x..."

### Important Notes

1. **Wallet Address**: For trade execution, include your wallet address in the message:

   ```
   "Buy ETH with $100. My address is 0x1234..."
   ```

2. **Transaction Signing**: The agent returns transaction data that you need to sign with your wallet. It does NOT execute trades automatically.

3. **Risk Management**: The agent limits positions to 5% of portfolio value by default.

## Development Mode

If you want to run the agent locally without Docker:

1. **Start the agent:**

   ```bash
   cd examples/allora-trading-agent
   pnpm dev
   ```

2. **Update the frontend config** to point to localhost:

   ```typescript
   // In agents-config.ts
   ['allora-trading-agent', 'http://localhost:3008/sse'],
   ```

3. **Start the frontend in dev mode:**
   ```bash
   cd clients/web
   pnpm dev
   ```

## Troubleshooting

1. **Agent not appearing in frontend:**

   - Ensure the agent is running (check `docker ps`)
   - Rebuild the frontend: `docker compose down && docker compose up --build`

2. **Connection errors:**

   - Check that port 3008 is not in use
   - Verify the agent logs: `docker logs vibekit-allora-trading-agent`

3. **No predictions available:**
   - Some tokens might not have prediction markets
   - Try popular tokens like BTC, ETH
   - Check agent logs for available topics

## Customization

To customize the agent's appearance in the frontend:

1. Edit `typescript/clients/web/agents-config.ts`
2. Modify the agent's name, description, or suggested actions
3. Rebuild the frontend: `docker compose up --build web`

## Architecture

```
User → Frontend → LLM → Agent Skills → Response
                   ↓
              Orchestrates:
              - Market Forecast (Allora MCP)
              - Trading Analysis
              - Trade Execution (Ember MCP)
```

The LLM automatically orchestrates between the three skills based on user intent, creating a seamless trading experience.
