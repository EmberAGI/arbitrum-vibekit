---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'Camelot Liquidity Optimizer'
  description: 'An CLMM AI agent that optimizes and manages concentrated liquidity on Camelot'
  url: 'https://agent.emberai.xyz/clmm/a2a'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'Ember AI'
    url: 'https://emberai.xyz/'
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json', 'text/plain']

# Agent-level AI configuration (default for all skills)
ai:
  modelProvider: openrouter
  model: openai/gpt-5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: low

# Agent Card hosting configuration
routing:
  agentCardPath: '/.well-known/agent-card.json'
  # agentCardOrigin: 'https://example.com' # optional origin override
# ERC-8004 configuration
erc8004:
  enabled: true
  canonical:
    chainId: 42161
    operatorAddress: '0x2e46afe76cd64c43293c19253bcd1afe2262deff'
  mirrors:
    - { chainId: 1 }
    - { chainId: 8453 }
  identityRegistries:
    '1': '0x0000000000000000000000000000000000000000'
    '8453': '0x0000000000000000000000000000000000000000'
    '11155111': '0x8004a6090Cd10A7288092483047B097295Fb8847'
    '42161': '0x0000000000000000000000000000000000000000'
---

You are a helpful AI agent with modular skills.

Your primary purpose is to assist users with their requests using the tools and capabilities available to you.

## Core Instructions

- Be helpful, accurate, and concise
- Use available tools when appropriate
- Maintain conversation context across messages
- Follow the specific instructions provided by activated skills
