# Agent Configuration Examples

This document provides comprehensive examples of agent configuration using the config-driven composition system with ERC-8004 integration.

## Table of Contents

- [Complete Agent Configuration](#complete-agent-configuration)
- [AI Configuration](#ai-configuration)
- [Routing Configuration](#routing-configuration)
- [ERC-8004 Configuration](#erc-8004-configuration)
- [Skill Overrides](#skill-overrides)
- [Composed Agent Card with ERC-8004 Extension](#composed-agent-card-with-erc-8004-extension)

---

## Complete Agent Configuration

### Basic Agent with ERC-8004 Support

```yaml
---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'DeFi Trading Agent'
  description: 'An AI agent specialized in DeFi trading operations on Arbitrum'
  url: 'https://agents.example.com/a2a'
  version: '1.2.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'Example AI Lab'
    url: 'https://example.com'
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json', 'text/plain']

# Agent-level AI configuration (default for all skills)
ai:
  modelProvider: openrouter
  model: anthropic/claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: low

# Agent Card hosting configuration
routing:
  agentCardPath: '/.well-known/agent-card.json'
  # agentCardOrigin: 'https://cdn.example.com' # optional origin override

# ERC-8004 agent registration configuration
erc8004:
  enabled: true
  canonical:
    chainId: 42161  # Arbitrum One
    operatorAddress: '0x1234567890123456789012345678901234567890'
  mirrors:
    - { chainId: 1 }      # Ethereum Mainnet
    - { chainId: 8453 }   # Base
  identityRegistries:
    '1': '0x0000000000000000000000000000000000000000'       # Ethereum (placeholder)
    '8453': '0x0000000000000000000000000000000000000000'   # Base (placeholder)
    '11155111': '0x8004a6090Cd10A7288092483047B097295Fb8847'  # Sepolia (deployed)
    '42161': '0x0000000000000000000000000000000000000000' # Arbitrum (placeholder)
  registrations:
    '42161':
      agentId: 123
      registrationUri: 'ipfs://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX'
    '1':
      agentId: 456
      registrationUri: 'ipfs://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxY'
  supportedTrust:
    - 'https://example.com/trust/verified-traders'
    - 'https://example.com/trust/security-audited'
  image: 'https://example.com/agent-avatar.png'
  version: '1.2.0'
---

You are a DeFi trading agent specialized in providing insights and executing trades on Arbitrum-based protocols.

## Core Competencies

- Analyzing DeFi protocols and market conditions
- Executing token swaps and liquidity operations
- Risk assessment and portfolio management
- Real-time market monitoring and alerts

## Trading Guidelines

- Always verify transaction parameters before execution
- Provide clear risk assessments for suggested trades
- Monitor gas prices and optimize for user costs
- Respect user-defined risk limits and slippage tolerances

## Communication Style

- Be precise and data-driven in your analysis
- Explain complex DeFi concepts in accessible terms
- Proactively warn about risks and market conditions
- Maintain transparency about limitations and uncertainties
```

---

## AI Configuration

### OpenRouter Provider

```yaml
ai:
  modelProvider: openrouter
  model: anthropic/claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: low
```

### Anthropic Provider

```yaml
ai:
  modelProvider: anthropic
  model: claude-sonnet-4.5
  params:
    temperature: 0.8
    maxTokens: 8192
    reasoning: medium
```

### OpenAI Provider

```yaml
ai:
  modelProvider: openai
  model: gpt-4o
  params:
    temperature: 0.6
    maxTokens: 4096
    presencePenalty: 0.1
    frequencyPenalty: 0.1
```

---

## Routing Configuration

### Default Configuration

```yaml
routing:
  agentCardPath: '/.well-known/agent-card.json'
```

### Custom Path

```yaml
routing:
  agentCardPath: '/api/v1/.well-known/agent-card.json'
```

### Custom Origin (CDN Hosting)

```yaml
routing:
  agentCardPath: '/.well-known/agent-card.json'
  agentCardOrigin: 'https://cdn.example.com'
```

### Multi-Tenant Prefix

```yaml
routing:
  agentCardPath: '/agents/defi-trader/.well-known/agent-card.json'
```

---

## ERC-8004 Configuration

### Minimal Configuration (Testnet)

```yaml
erc8004:
  enabled: true
  canonical:
    chainId: 11155111  # Ethereum Sepolia
    operatorAddress: '0x1234567890123456789012345678901234567890'
  mirrors: []  # No mirrors for testnet
  identityRegistries:
    '11155111': '0x8004a6090Cd10A7288092483047B097295Fb8847'
```

### Production Configuration (Arbitrum Canonical)

```yaml
erc8004:
  enabled: true
  canonical:
    chainId: 42161  # Arbitrum One
    operatorAddress: '0x1234567890123456789012345678901234567890'
  mirrors:
    - { chainId: 1 }      # Ethereum Mainnet
    - { chainId: 8453 }   # Base
  identityRegistries:
    '1': '0x0000000000000000000000000000000000000000'
    '8453': '0x0000000000000000000000000000000000000000'
    '42161': '0x0000000000000000000000000000000000000000'
  registrations:
    '42161':
      agentId: 789
      registrationUri: 'ipfs://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxZ'
  supportedTrust:
    - 'https://example.com/trust/verified-agents'
  image: 'https://example.com/agent-avatar.png'
```

### Production Configuration (Ethereum Canonical)

```yaml
erc8004:
  enabled: true
  canonical:
    chainId: 1  # Ethereum Mainnet
    operatorAddress: '0x1234567890123456789012345678901234567890'
  mirrors:
    - { chainId: 42161 }  # Arbitrum One
    - { chainId: 8453 }   # Base
  identityRegistries:
    '1': '0x0000000000000000000000000000000000000000'
    '8453': '0x0000000000000000000000000000000000000000'
    '42161': '0x0000000000000000000000000000000000000000'
```

### Configuration Without Operator Address

```yaml
erc8004:
  enabled: true
  canonical:
    chainId: 42161
    # operatorAddress omitted - CAIP-10 will not be included in extension
  mirrors:
    - { chainId: 1 }
    - { chainId: 8453 }
  identityRegistries:
    '1': '0x0000000000000000000000000000000000000000'
    '8453': '0x0000000000000000000000000000000000000000'
    '42161': '0x0000000000000000000000000000000000000000'
```

**Note**: `doctor` command will warn if `operatorAddress` is missing, as it prevents CAIP-10 computation.

### Disabled ERC-8004

```yaml
erc8004:
  enabled: false
```

Or omit the `erc8004` block entirely.

---

## Skill Overrides

### Skill with AI Model Override

```yaml
---
skill:
  id: defi-analyst
  name: DeFi Analyst
  description: 'Analyzes DeFi protocols and market conditions'
  tags: [defi, analysis, market]
  examples:
    - 'Analyze the liquidity depth of Uniswap V3 USDC/ETH pool'
    - 'What are the current yields on Aave lending markets?'
  inputModes: ['text/plain', 'application/json']
  outputModes: ['text/plain', 'application/json']

# MCP server integration
mcp:
  servers:
    - name: defi_data
      allowedTools: [getPoolData, getLendingRates, getTokenPrices]

# Override AI configuration for this skill
ai:
  modelProvider: openrouter
  model: anthropic/claude-opus-4  # Use more powerful model for analysis
  params:
    temperature: 0.5  # Lower temperature for analytical tasks
    maxTokens: 8192
    reasoning: high   # Enable extended reasoning for complex analysis
---

You are the DeFi Analyst skill, specialized in analyzing decentralized finance protocols...
```

### Skill Using Agent-Level AI Config

```yaml
---
skill:
  id: simple-assistant
  name: Simple Assistant
  description: 'General-purpose assistant for basic queries'
  tags: [general, assistant]
  examples:
    - 'What is the current gas price?'
    - 'Explain how Uniswap works'
  inputModes: ['text/plain']
  outputModes: ['text/plain']

# No ai block - uses agent-level configuration
---

You are a simple assistant skill...
```

---

## Composed Agent Card with ERC-8004 Extension

When an agent with the above configuration is composed, the resulting Agent Card includes the ERC-8004 extension:

```json
{
  "version": "0.3.0",
  "name": "DeFi Trading Agent",
  "description": "An AI agent specialized in DeFi trading operations on Arbitrum",
  "url": "https://agents.example.com/a2a",
  "version": "1.2.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "extensions": [
      {
        "uri": "https://eips.ethereum.org/EIPS/eip-8004",
        "description": "ERC-8004 discovery/trust",
        "required": false,
        "params": {
          "canonicalCaip10": "eip155:42161:0x1234567890123456789012345678901234567890",
          "identityRegistry": "eip155:42161:0x0000000000000000000000000000000000000000",
          "registrationUri": "ipfs://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX",
          "supportedTrust": [
            "https://example.com/trust/verified-traders",
            "https://example.com/trust/security-audited"
          ]
        }
      }
    ]
  },
  "provider": {
    "name": "Example AI Lab",
    "url": "https://example.com"
  },
  "defaultInputModes": ["text/plain", "application/json"],
  "defaultOutputModes": ["application/json", "text/plain"]
}
```

### Extension Parameters

The ERC-8004 extension includes the following computed and configured parameters:

- **`canonicalCaip10`**: Computed at compose-time from `erc8004.canonical.chainId` and `erc8004.canonical.operatorAddress`
  - Format: `eip155:<chainId>:<operatorAddress>`
  - Example: `eip155:42161:0x1234567890123456789012345678901234567890`
  - Only included if `operatorAddress` is configured

- **`identityRegistry`**: Computed from `erc8004.canonical.chainId` and `erc8004.identityRegistries[chainId]`
  - Format: `eip155:<chainId>:<registryAddress>`
  - Example: `eip155:42161:0x0000000000000000000000000000000000000000`

- **`registrationUri`**: IPFS URI from `erc8004.registrations[canonicalChainId].registrationUri`
  - Only included if registration exists for canonical chain
  - Automatically populated by `register` and `update-registry` commands

- **`supportedTrust`**: Array from `erc8004.supportedTrust`
  - Optional, only included if configured
  - Count included in `print-config` summary

---

## Common Configuration Patterns

### Development Agent (Local, No ERC-8004)

```yaml
---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'Dev Agent'
  description: 'Development agent for testing'
  url: 'http://localhost:3000/a2a'
  version: '0.1.0'
  capabilities:
    streaming: true
    pushNotifications: false
  defaultInputModes: ['text/plain']
  defaultOutputModes: ['text/plain']

ai:
  modelProvider: openrouter
  model: anthropic/claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096

routing:
  agentCardPath: '/.well-known/agent-card.json'

# ERC-8004 disabled for local development
erc8004:
  enabled: false
---

Development agent instructions...
```

### Testnet Agent (Sepolia Only)

```yaml
---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'Test Agent'
  description: 'Testnet agent for staging'
  url: 'https://staging.example.com/a2a'
  version: '0.5.0'
  capabilities:
    streaming: true
    pushNotifications: false
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json', 'text/plain']

ai:
  modelProvider: openrouter
  model: anthropic/claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096

routing:
  agentCardPath: '/.well-known/agent-card.json'

erc8004:
  enabled: true
  canonical:
    chainId: 11155111  # Ethereum Sepolia
    operatorAddress: '0x1234567890123456789012345678901234567890'
  mirrors: []  # No mirrors for testnet
  identityRegistries:
    '11155111': '0x8004a6090Cd10A7288092483047B097295Fb8847'
  registrations:
    '11155111':
      agentId: 42
      registrationUri: 'ipfs://QmTestRegistrationUri'
---

Test agent instructions...
```

### Production Multi-Chain Agent

```yaml
---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'Production Agent'
  description: 'Production-ready multi-chain agent'
  url: 'https://api.example.com/a2a'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: true
  provider:
    name: 'Example AI'
    url: 'https://example.com'
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json', 'text/plain']

ai:
  modelProvider: openrouter
  model: anthropic/claude-sonnet-4.5
  params:
    temperature: 0.7
    maxTokens: 4096
    reasoning: low

routing:
  agentCardPath: '/.well-known/agent-card.json'
  agentCardOrigin: 'https://cdn.example.com'  # Use CDN for Agent Card

erc8004:
  enabled: true
  canonical:
    chainId: 42161  # Arbitrum One
    operatorAddress: '0x1234567890123456789012345678901234567890'
  mirrors:
    - { chainId: 1 }
    - { chainId: 8453 }
  identityRegistries:
    '1': '0x0000000000000000000000000000000000000000'
    '8453': '0x0000000000000000000000000000000000000000'
    '42161': '0x0000000000000000000000000000000000000000'
  registrations:
    '42161':
      agentId: 100
      registrationUri: 'ipfs://QmProdArbitrumRegistration'
    '1':
      agentId: 200
      registrationUri: 'ipfs://QmProdEthereumRegistration'
    '8453':
      agentId: 300
      registrationUri: 'ipfs://QmProdBaseRegistration'
  supportedTrust:
    - 'https://example.com/trust/production-verified'
    - 'https://example.com/trust/security-audited-2024'
  image: 'https://cdn.example.com/agent-avatar.png'
  version: '1.0.0'
---

Production agent instructions...
```

---

## Validation with `doctor` Command

Use the `doctor` command to validate your configuration:

```bash
npx -y @emberai/agent-node doctor
```

### Example Output

```
✓ Agent base validated
✓ 2 skills validated
✓ MCP registry validated
✓ Workflow registry validated

ERC-8004 Configuration:
  Status: Enabled
  Canonical Chain: 42161 (Arbitrum One)
  Operator Address: 0x1234567890123456789012345678901234567890
  Mirrors: 2 chains (1, 8453)

  ⚠ Warning: Zero-address registry for chain 1 (Ethereum Mainnet)
  ⚠ Warning: Zero-address registry for chain 8453 (Base)
  ⚠ Warning: Zero-address registry for chain 42161 (Arbitrum One)

Routing Configuration:
  Agent Card Path: /.well-known/agent-card.json

ERC-8004 Extension in Agent Card:
  Present: Yes
  Canonical CAIP-10: eip155:42161:0x1234567890123456789012345678901234567890
  Identity Registry: eip155:42161:0x0000000000000000000000000000000000000000
  Registration URI: ipfs://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX
  Supported Trust: 2 entries

No errors found. Configuration is valid.
```

---

## Print Configuration

Use the `print-config` command to view the fully composed configuration:

```bash
npx -y @emberai/agent-node print-config
```

The output includes an ERC-8004 summary section:

```json
{
  "summary": {
    "skills": 2,
    "mcpServers": 1,
    "workflows": 1,
    "promptMode": "compose",
    "erc8004": {
      "enabled": true,
      "canonicalCaip10": "eip155:42161:0x1234567890123456789012345678901234567890",
      "identityRegistry": "eip155:42161:0x0000000000000000000000000000000000000000",
      "registrationUri": "ipfs://QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX",
      "supportedTrustCount": 2
    }
  },
  "agentCard": { /* ... */ },
  "systemPrompt": "...",
  "skills": [ /* ... */ ]
}
```

---

## See Also

- [ERC-8004 Specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Architectural Decisions](../rationales.md)
- [Agent Node README](../../typescript/lib/agent-node/README.md)
