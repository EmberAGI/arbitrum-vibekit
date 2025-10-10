# AutoSynth MCP Server

This is a Model Context Protocol (MCP) server implementation for the AutoSynth agent, providing access to TriggerX automated job scheduling through the Model Context Protocol.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

The AutoSynth MCP server allows AI systems and applications to access TriggerX automation capabilities through the standardized Model Context Protocol (MCP), enabling seamless integration of automated job scheduling into AI workflows. This server provides direct access to time-based, event-based, and condition-based job creation and management.

## Prerequisites

- Node.js 18+ or Docker
- A TriggerX API key (sign up at [TriggerX](https://triggerx.com))
- Supported blockchain network access (Arbitrum Sepolia by default)

## Quickstart

### Docker:
```bash
docker run -p 3002:3002 -e PORT=3002 -e NEXT_PUBLIC_TRIGGERX_API_KEY=your_api_key vibekit/autosynth-mcp-server

# Or with environment variables in a file:
docker run -p 3002:3002 --env-file .env vibekit/autosynth-mcp-server
```

### Docker Compose:
```bash
docker-compose up
```

### Node.js:
```bash
npm install
npm run build
npm start
```

### Development:
```bash
npm run dev
```

## Configuration

### Environment Variables

#### Required Variables

```env
# TriggerX SDK
NEXT_PUBLIC_TRIGGERX_API_KEY=your_triggerx_api_key
TRIGGERX_API_URL=https://api.triggerx.com  # Optional: defaults to https://api.triggerx.com

# Blockchain
RPC_URL=https://sepolia.arbitrum.io
PRIVATE_KEY=your_private_key

# Server Configuration
PORT=3002
ENABLE_CORS=true

# Supported Chains (comma-separated, defaults to Arbitrum Sepolia)
SUPPORTED_CHAINS=421614,1,137
```

## API

Once the server is running, you can interact with it using any MCP client. The server exposes the following endpoints:

- `GET /sse` - SSE connection endpoint for MCP communications
- `POST /messages` - Message endpoint for MCP communications

Point your LLM/tooling at http://localhost:3002/sse to start using the server.

### Available Tools

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `createTimeJob` | Create time-based scheduled jobs (interval, cron, specific) | `jobTitle`, `targetContractAddress`, `targetFunction`, `abi`, `scheduleType`, `timeInterval`/`cronExpression`/`specificSchedule`, `userAddress` |
| `createEventJob` | Create event-triggered jobs | `jobTitle`, `triggerEvent`, `eventContractAddress`, `eventAbi`, `targetContractAddress`, `targetFunction`, `targetAbi`, `userAddress` |
| `createConditionJob` | Create condition-based jobs | `jobTitle`, `conditionType`, `valueSourceType`, `operator`, `targetValue`, `targetContractAddress`, `targetFunction`, `abi`, `userAddress` |
| `getJobs` | Retrieve all jobs or specific job by ID | `jobId` (optional) |
| `deleteJob` | Delete a job by ID | `jobId` |
| `getUserData` | Get user statistics and job count | `userAddress` (optional) |

## Usage Examples

### Create a Time-based Job

```json
{
  "tool": "createTimeJob",
  "parameters": {
    "jobTitle": "Daily Token Swap",
    "targetContractAddress": "0x1234...",
    "targetFunction": "swap",
    "abi": "[{\"inputs\":[],\"name\":\"swap\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"}]",
    "scheduleType": "interval",
    "timeInterval": 86400,
    "userAddress": "0xabcd..."
  }
}
```

### Create an Event-based Job

```json
{
  "tool": "createEventJob",
  "parameters": {
    "jobTitle": "Transfer Monitor",
    "triggerEvent": "Transfer(address,address,uint256)",
    "eventContractAddress": "0x1234...",
    "eventAbi": "[{\"anonymous\":false,\"inputs\":[{\"indexed\":true,\"name\":\"from\",\"type\":\"address\"},{\"indexed\":true,\"name\":\"to\",\"type\":\"address\"},{\"indexed\":false,\"name\":\"value\",\"type\":\"uint256\"}],\"name\":\"Transfer\",\"type\":\"event\"}]",
    "targetContractAddress": "0x5678...",
    "targetFunction": "processTransfer",
    "targetAbi": "[{\"inputs\":[],\"name\":\"processTransfer\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"}]",
    "userAddress": "0xabcd..."
  }
}
```

### Create a Condition-based Job

```json
{
  "tool": "createConditionJob",
  "parameters": {
    "jobTitle": "Price Alert",
    "conditionType": "value",
    "valueSourceType": "api",
    "valueSourceUrl": "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    "operator": ">",
    "targetValue": "3000",
    "targetContractAddress": "0x5678...",
    "targetFunction": "sendAlert",
    "abi": "[{\"inputs\":[],\"name\":\"sendAlert\",\"outputs\":[],\"stateMutability\":\"nonpayable\",\"type\":\"function\"}]",
    "userAddress": "0xabcd..."
  }
}
```

### List All Jobs

```json
{
  "tool": "getJobs",
  "parameters": {}
}
```

### Get User Data

```json
{
  "tool": "getUserData",
  "parameters": {
    "userAddress": "0xabcd..."
  }
}
```

## Job Types

### 1. Time-based Jobs

Schedule jobs to run at specific intervals or times:

- **Interval-based**: Run every X seconds
- **Cron-based**: Run on cron schedule
- **Specific time**: Run once at a specific datetime

### 2. Event-based Jobs

Trigger jobs when smart contract events are emitted:

- Monitor specific contract events
- Execute actions when events occur
- Support for all EVM-compatible chains

### 3. Condition-based Jobs

Execute when external conditions are met:

- API-based conditions
- Contract-based conditions
- Custom comparison operators

## Cost Structure

- Time-based jobs: ~0.1 ETH per execution
- Event-based jobs: ~0.2 ETH per execution
- Condition-based jobs: ~0.3 ETH per execution

## Supported Chains

- Arbitrum Sepolia (421614) - Primary testnet
- Ethereum Mainnet (1)
- Polygon (137)
- Additional EVM chains supported

## Development

```bash
# Development mode
npm run dev

# Build
npm run build

# Production
npm start

# Test with MCP Inspector
npm run inspect
```

## Docker

```bash
# Build
docker build -t autosynth-mcp-server .

# Run
docker run -p 3002:3002 --env-file .env autosynth-mcp-server
```

## Integration Notes

This MCP server integrates with:
- TriggerX SDK for job management
- Ethereum-compatible blockchains via ethers.js
- MCP protocol for tool orchestration
- Vibekit framework for agent structure

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues or questions:
- Check the TriggerX documentation
- Review the server logs for debugging
- Ensure all environment variables are set correctly
- Verify blockchain network connectivity
