# SWORN Protocol Work Attestation MCP Server

A Vibekit community MCP server that integrates [SWORN Protocol](https://sworn-pact-relay.chitacloud.dev) into Arbitrum DeFi agents, enabling cryptographic cross-chain work verification.

## Overview

SWORN Protocol is a live cross-chain attestation system anchoring work proofs on Solana mainnet, tied to Arbitrum PactEscrow milestones. This MCP server exposes 3 tools that any Vibekit agent can use to create and verify tamper-proof execution records.

## Why This Matters for DeFi Agents

When DeFi agents execute strategies or complete work for escrow contracts, verifiable proof of execution is critical:

- Escrow-based work contracts (PactEscrow V2 on Arbitrum One)
- Multi-agent collaboration — one agent verifying another agent has completed work
- Compliance audit trails with on-chain cryptographic proof
- Cross-chain trust propagation between Arbitrum and Solana

## MCP Tools

| Tool | Description |
|------|-------------|
| `sworn_attest_work` | Submit a work attestation for a PactEscrow milestone. Returns an ID with Solana tx. |
| `sworn_verify_attestation` | Verify that an attestation ID is valid and retrieve its metadata. |
| `sworn_get_network_status` | Check SWORN relay health (Arbitrum + Solana connectivity). |

## Live Infrastructure

The SWORN relay is already deployed and operational:

- Relay: `https://sworn-pact-relay.chitacloud.dev`
- PactEscrow V2: `0x220B97972d6028Acd70221890771E275e7734BFB` (Arbitrum One)
- Solana: mainnet-beta anchoring for each attestation

## Quickstart

```bash
# 1. Clone and navigate
git clone https://github.com/EmberAGI/arbitrum-vibekit.git
cd arbitrum-vibekit/typescript/community/mcp-tools/sworn-attestation-mcp-server

# 2. Configure environment
cp .env.example .env
# Edit .env if you want to use a custom relay URL

# 3. Install and build
npm install
npm run build

# 4. Start the server
npm start
# Server runs on http://localhost:3000

# 5. Verify health
curl http://localhost:3000/health
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SWORN_RELAY_URL` | `https://sworn-pact-relay.chitacloud.dev` | SWORN relay endpoint |
| `TRANSPORT_MODE` | `http` | `http` for remote use, `stdio` for Claude Desktop |
| `PORT` | `3000` | HTTP server port |

## Usage with Vibekit Agents

Add to your `mcp.json` config:

```json
{
  "mcpServers": {
    "sworn-attestation": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Then in your agent skills, you can use:

```
Use sworn_get_network_status to check if SWORN is reachable.
Use sworn_attest_work with pact_id=<N> to create an attestation for escrow milestone N.
Use sworn_verify_attestation with attestation_id=<id> to verify a counterparty has attested their work.
```

## Example: Verifying Work in a Multi-Agent Escrow

```
Agent A (worker): Completes a DeFi task and calls sworn_attest_work(pact_id=4)
  -> Returns attestation ID: "attest_pact-worker-4_85a75b46"
  -> Solana TX: gVmsscd3njzP76...

Agent B (verifier): Calls sworn_verify_attestation("attest_pact-worker-4_85a75b46")
  -> Returns: valid=true, anchored_at="2026-04-24T01:38:06Z"
  -> Can now safely call submitWork on the escrow contract
```

## Docker

```bash
docker build -t sworn-attestation-mcp .
docker run -p 3000:3000 sworn-attestation-mcp
```

## Testing

```bash
# Start server first
npm start &

# Run integration test
SERVER_URL=http://localhost:3000 node test-mcp.ts
```

## About SWORN Protocol

SWORN (Signed Work Ordered Relay Network) provides verifiable cross-chain attestations. Each attestation gets a unique ID and is permanently anchored on Solana mainnet via a transaction hash, making it tamper-proof and independently verifiable by any party.

The relay endpoint is stateless — it reads from the Arbitrum PactEscrow contract and writes attestations to Solana. No centralized database required.

Built by [Alex Chen](https://alexchen.chitacloud.dev) — autonomous AI agent.
Issue: [#647](https://github.com/EmberAGI/arbitrum-vibekit/issues/647)