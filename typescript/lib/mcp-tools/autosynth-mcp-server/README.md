# AutoSynth MCP Server

MCP server for TriggerX automated job scheduling - create time-based, event-based, and condition-based blockchain automation jobs.

## Quick Start

```bash
# Docker
docker run -p 3002:3002 -e NEXT_PUBLIC_TRIGGERX_API_KEY=your_api_key vibekit/autosynth-mcp-server

# Node.js
npm install && npm run build && npm start

# Development
npm run dev
```

## Environment Setup

```env
NEXT_PUBLIC_TRIGGERX_API_KEY=your_triggerx_api_key
RPC_URL=https://sepolia.arbitrum.io
PRIVATE_KEY=your_private_key
PORT=3002
```

## MCP Connection

Connect your MCP client to: `http://localhost:3002/sse`

## Tools

| Tool | Purpose | Required Parameters | Optional Parameters |
|------|---------|-------------------|-------------------|
| `createTimeJob` | Schedule recurring/one-time blockchain calls | `jobTitle`, `targetContractAddress`, `targetFunction`, `abi`, `scheduleType`, `userAddress` | `timeInterval`, `cronExpression`, `specificSchedule`, `arguments`, `chainId` |
| `createEventJob` | Auto-trigger on smart contract events | `jobTitle`, `triggerEvent`, `eventContractAddress`, `eventAbi`, `targetContractAddress`, `targetFunction`, `targetAbi`, `userAddress` | `arguments`, `recurring`, `timeFrame`, `targetChainId` |
| `createConditionJob` | Execute when API/contract conditions are met | `jobTitle`, `conditionType`, `valueSourceType`, `operator`, `targetValue`, `targetContractAddress`, `targetFunction`, `abi`, `userAddress` | `valueSourceUrl`, `valueSourceContractAddress`, `arguments`, `recurring` |
| `getJobs` | Retrieve user's automation jobs | - | `jobId` |
| `deleteJob` | Cancel/remove automation job | `jobId` | `chainId` |
| `getUserData` | Get user statistics and job count | - | `userAddress` |

## Tool Integration & Flow

### Architecture Flow
**MCP Client → AutoSynth Server → TriggerX Platform → Blockchain**

### 1. Tool Execution Flow
```
MCP Client Request → SSE/Stdio Transport → Tool Handler → Validation → TriggerX SDK → Job Creation
```

**Step-by-step:**
1. **MCP Client** sends tool request via `/sse` endpoint or stdio
2. **AutoSynth Server** receives request through MCP transport layer
3. **Parameter Validation** using Zod schemas ensures data integrity
4. **Tool Handler** processes the validated request
5. **TriggerX SDK** communicates with TriggerX platform API
6. **Job Creation** returns transaction artifact for user signing

### 2. Job Execution Flow
```
Trigger Condition → TriggerX Monitor → Job Execution → Blockchain Transaction
```

**Trigger Types:**
- **Time-based**: Cron scheduler or interval timer triggers job
- **Event-based**: Blockchain event listener detects contract events
- **Condition-based**: API/contract value monitor checks conditions

### 3. Integration Points

| Component | Purpose | Technology |
|-----------|---------|------------|
| **MCP Protocol** | Standardized AI tool interface | Server-Sent Events / Stdio |
| **Express Server** | HTTP endpoints and middleware | Node.js/Express |
| **TriggerX SDK** | Job management and blockchain interaction | TypeScript SDK |
| **Zod Validation** | Parameter validation and type safety | Schema validation |
| **Ethers.js** | Blockchain operations (job deletion) | Ethereum library |

## Example Tool Call

```json
{
  "tool": "createTimeJob",
  "parameters": {
    "jobTitle": "Daily Swap",
    "targetContractAddress": "0x1234...",
    "targetFunction": "swap",
    "abi": "[{\"inputs\":[],\"name\":\"swap\",\"type\":\"function\"}]",
    "scheduleType": "interval",
    "timeInterval": 86400,
    "userAddress": "0xabcd..."
  }
}
```

## Testing Tools

```bash
npm run inspect  # Opens MCP Inspector for interactive testing
```
