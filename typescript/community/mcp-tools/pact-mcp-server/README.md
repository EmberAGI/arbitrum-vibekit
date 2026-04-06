# PACT Protocol MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that enables AI agents to interact with [PACT Protocol](https://dopeasset.com) — trustless escrow agreements and payment channels for autonomous agents on Arbitrum.

## What is PACT?

PACT is agent-native infrastructure for on-chain commerce:

- **PactEscrowV2**: Lock PACT tokens for a task. Recipient submits work, creator approves or disputes. Optional arbitration. No self-verified mode — all releases require creator approval or timeout.
- **PactPaymentChannel**: Bidirectional PACT payment channels. Two on-chain transactions enable unlimited off-chain micropayments with EIP-712 signed state updates.

Contracts are live on Arbitrum One (chainId 42161):

| Contract | Address |
|---|---|
| PACT Token | `0x809c2540358E2cF37050cCE41A610cb6CE66Abe1` |
| PactEscrowV2 | `0x220B97972d6028Acd70221890771E275e7734BFB` |
| PactPaymentChannel | `0x5a9D124c05B425CD90613326577E03B3eBd1F891` |

## Tools Available

### Query Tools (read-only, no wallet needed)

| Tool | Description |
|---|---|
| `pact_get_info` | Protocol overview, contract addresses, live stats |
| `pact_get_escrow` | Read escrow pact by ID — creator, recipient, amount, status, deadline |
| `pact_get_channel` | Read payment channel by ID — agents, balances, state |
| `pact_get_balance` | Get PACT token balance of any address |

### Transaction Builder Tools (returns unsigned calldata)

These tools return transaction plans — unsigned calldata your agent signs and submits. No private keys touch this server.

| Tool | Description |
|---|---|
| `pact_build_approve_token` | Approve PACT spend for escrow or channel contract |
| `pact_build_create_escrow` | Create an escrow (includes approve + create steps) |
| `pact_build_submit_work` | Submit work evidence as a bytes32 hash |
| `pact_build_approve_escrow` | Creator approves work, releases tokens to recipient |
| `pact_build_dispute_escrow` | Creator disputes submitted work |
| `pact_build_release_escrow` | Anyone releases funds after dispute window expires |
| `pact_build_reclaim_escrow` | Creator reclaims PACT after deadline passes with no work |
| `pact_build_open_channel` | Open a payment channel (includes approve + open steps) |
| `pact_build_fund_channel` | AgentB funds an existing channel (includes approve + fund steps) |

## Transaction Plan Format

Builder tools return a JSON object:

```json
{
  "chainId": 42161,
  "to": "0x220B97972d6028Acd70221890771E275e7734BFB",
  "data": "0x...",
  "value": "0",
  "description": "Create escrow: 500 PACT to 0xRecipient, deadline in 72h",
  "steps": [
    {
      "to": "0x809c2540358E2cF37050cCE41A610cb6CE66Abe1",
      "data": "0x...",
      "description": "Step 1: Approve 500 PACT for PactEscrowV2"
    },
    {
      "to": "0x220B97972d6028Acd70221890771E275e7734BFB",
      "data": "0x...",
      "description": "Step 2: Create escrow for 500 PACT"
    }
  ]
}
```

When `steps` is present, submit each step sequentially.

## Installation

```bash
cd arbitrum-vibekit/typescript/community/mcp-tools/pact-mcp-server
pnpm install
pnpm build
```

## Usage

### HTTP Server

```bash
pnpm start
# PACT MCP Server running on port 3012
# MCP endpoint: http://localhost:3012/mcp
```

Set environment variables:

```bash
PORT=3012                                    # HTTP port (default: 3012)
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc  # Arbitrum RPC (default: public)
```

### Stdio (Claude Desktop)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pact": {
      "command": "node",
      "args": ["/path/to/pact-mcp-server/dist/index.js"],
      "env": {}
    }
  }
}
```

## Typical Workflows

### Create an Escrow (as a creator)

```
1. pact_get_balance          — check your PACT balance
2. pact_build_create_escrow  — get approve + create calldata
3. Submit step 1 (approve)
4. Submit step 2 (create)
5. pact_get_escrow           — verify pact created
```

### Complete an Escrow (as a recipient)

```
1. pact_get_escrow           — check pact status and deadline
2. [do the work off-chain]
3. pact_build_submit_work    — compute SHA256 of your evidence, submit
4. pact_get_escrow           — confirm status = WorkSubmitted
5. [wait for creator to approve, or dispute window to expire]
6. pact_build_release_escrow — trigger release once window expires
```

### Open a Payment Channel

```
1. pact_build_open_channel   — get approve + open calldata
2. Submit step 1 (approve)
3. Submit step 2 (open)
4. Share channelId with agentB
5. agentB: pact_build_fund_channel → submit approve + fund
6. Both parties sign payment state updates off-chain
7. Either party can initiate close on-chain
```

## Microgrants

PACT Protocol funds builders. Up to 10,000 PACT for integrations. Apply at [dopeasset.com/grants](https://dopeasset.com/grants).

## License

MIT
