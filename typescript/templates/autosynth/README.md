# TriggerX Agent

Automated job scheduling agent with time, event, and condition-based triggers using the TriggerX platform.

> See also: VibeKit + TriggerX prompt guide — create jobs from chat without opening TriggerX UI: `VibeKit-Prompt-to-TriggerX.md`

## Features

- **Time-based Jobs**: Schedule tasks using intervals, cron expressions, or specific times
- **Event-based Jobs**: Trigger automation when smart contract events occur
- **Condition-based Jobs**: Execute when API or contract conditions are met
- **Multi-chain Support**: Works across EVM-compatible blockchains
- **Dynamic Arguments**: Fetch execution parameters from external scripts (IPFS)
- **Job Management**: Create, list, monitor, and delete automated jobs

## Quick Start

1. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

2. **Install Dependencies**
```bash
pnpm install
```

3. **Start Development**
```bash
pnpm dev
```

## Configuration

### Environment Variables

#### Required Variables

```env
# TriggerX SDK
NEXT_PUBLIC_TRIGGERX_API_KEY =your_triggerx_api_key
TRIGGERX_API_URL=https://api.triggerx.com  # Optional: defaults to https://api.triggerx.com

# Blockchain
RPC_URL=https://sepolia.arbitrum.io
PRIVATE_KEY=your_private_key

# AI Provider (at least one required)
OPENROUTER_API_KEY=your_openrouter_key
OPENAI_API_KEY=your_openai_key
XAI_API_KEY=your_xai_key
```

#### Optional Variables

```env
# TriggerX API URL (defaults to https://api.triggerx.com)
TRIGGERX_API_URL=https://api.triggerx.com

# Agent Configuration
AGENT_NAME=TriggerX Agent
AGENT_VERSION=1.0.0
AI_PROVIDER=openrouter
AI_MODEL=x-ai/grok-3-mini

# Server Configuration
PORT=3041
ENABLE_CORS=true
BASE_PATH=/api/v1

# Supported Chains (comma-separated, defaults to Arbitrum Sepolia)
SUPPORTED_CHAINS=421614,1,137
```

### API URL Configuration

The `TRIGGERX_API_URL` environment variable allows you to specify which TriggerX API endpoint to use. The agent will automatically set `API_URL` (which the SDK reads) to this value:

- **Production**: `https://api.triggerx.com` (default)
- **Development**: `http://localhost:9002` (for local development)
- **Custom**: Any other URL you want to use

If not specified, the agent will default to the production API URL. The SDK internally uses `process.env.API_URL` for configuration.

## Job Types

### 1. Time-based Jobs

Schedule jobs to run at specific intervals or times:

```typescript
// Interval-based (every hour)
{
  jobType: 'time',
  scheduleTypes: ['interval'],
  timeInterval: 3600, // seconds
  recurring: true
}

// Cron-based (weekdays at 9 AM)
{
  jobType: 'time',
  scheduleTypes: ['cron'],
  cronExpression: '0 9 * * 1-5',
  recurring: true
}

// One-time execution
{
  jobType: 'time',
  scheduleTypes: ['specific'],
  specificSchedule: '2024-12-31 23:59:59',
  recurring: false
}

// Note: Only use ONE schedule type per job to avoid conflicts
// Multiple schedule types in the same job are not supported
```

### 2. Event-based Jobs

Trigger jobs when smart contract events are emitted:

```typescript
{
  jobType: 'event',
  triggerContractAddress: '0x...',
  triggerEvent: 'Transfer',
  triggerChainId: '421614', // Arbitrum Sepolia
  recurring: true
}
```

### 3. Condition-based Jobs

Execute when external conditions are met:

```typescript
{
  jobType: 'condition',
  conditionType: 'greaterThan',
  upperLimit: 3000,
  valueSourceType: 'api',
  valueSourceUrl: 'https://api.example.com/eth-price',
  recurring: false
}
```

## Usage Examples

### Create a Time-based Job

```bash
# Single schedule type
{
  "skill": "jobManagement",
  "input": {
    "operation": "create",
    "jobType": "time",
    "jobDetails": {
      "jobTitle": "Daily Token Swap",
      "scheduleTypes": ["interval"],
      "timeInterval": 86400,
      "targetContractAddress": "0x1234...",
      "targetFunction": "swap",
      "abi": "[...]",
      "arguments": ["1000"]
    }
  }
}

# Multiple schedule types (interval + cron + specific)
{
  "skill": "jobManagement",
  "input": {
    "operation": "create",
    "jobType": "time",
    "jobDetails": {
      "jobTitle": "SDK Test Time Job",
      "scheduleTypes": ["interval", "cron", "specific"],
      "timeInterval": 33,
      "timeFrame": 36,
      "cronExpression": "0 0 * * *",
      "specificSchedule": "2025-01-01 00:00:00",
      "timezone": "Asia/Calcutta",
      "targetContractAddress": "0xDE85FE97A73B891f12CbBF1210cc225AF332C90B",
      "targetChainId": "421614",
      "targetFunction": "helloWorld",
      "arguments": ["3"],
      "abi": "[{\"inputs\":[],\"name\":\"count\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[],\"name\":\"getCount\",\"outputs\":[{\"internalType\":\"uint256\",\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\",\"type\":\"function\"},{\"inputs\":[{\"internalType\":\"uint256\",\"name\":\"_cnt\",\"type\":\"uint256\"}],\"name\":\"helloWorld\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"}]"
    }
  }
}
```

### List All Jobs

```bash
{
  "skill": "jobManagement",
  "input": {
    "operation": "list"
  }
}
```

### Get Scheduling Help

```bash
{
  "skill": "scheduleAssistant",
  "input": {
    "query": "How do I create a cron job that runs every Monday at 9 AM?"
  }
}
```

## API Reference

### Skills

- **jobManagement**: Create, list, get, and delete automated jobs
- **scheduleAssistant**: Get help with scheduling patterns and automation

### Tools

- **createTimeJob**: Create time-based scheduled jobs
- **createEventJob**: Create event-triggered jobs
- **createConditionJob**: Create condition-based jobs
- **getJobs**: Retrieve all jobs or specific job by ID
- **deleteJob**: Delete a job by ID
- **getUserData**: Get user statistics and job count

## Cost Structure

- Time-based jobs: ~0.1 ETH per execution
- Event-based jobs: ~0.2 ETH per execution
- Condition-based jobs: ~0.3 ETH per execution

## Supported Chains

- Arbitrum Sepolia (421614) - Primary testnet
- Additional EVM chains coming soon

## Development

```bash
# Development mode
pnpm dev

# Build
pnpm build

# Production
pnpm start

# Test
pnpm test
```

## Docker

```bash
# Build
docker build -t triggerx-agent .

# Run
docker run -p 3041:3041 --env-file .env autosynth
```

## Integration Notes

This agent integrates with:
- TriggerX SDK for job management
- Ethereum-compatible blockchains via ethers.js
- MCP protocol for tool orchestration
- Vibekit v2 framework for agent structure

## Support

For issues or questions:
- Check the TriggerX documentation
- Review the agent logs for debugging
- Ensure all environment variables are set correctly